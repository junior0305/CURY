// Compromissos da aba Estratégia: nascem do "Combinar ação", aparecem em "Minhas tarefas" de quem executa
// e são lembrados no WhatsApp (véspera, dia, cobrança, sobe ao chefe) pela edge lembrar-compromissos.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { hojeSP } from "@/hooks/usePlano";

export type Lembrete = "vespera_dia" | "dia" | "nenhum";
export interface Aviso { tipo: "vespera" | "dia" | "cobranca" | "subiu" | "manual"; em: string; whats: boolean }
export interface Compromisso {
  id: string; criado_por: string | null; responsavel_id: string; titulo: string; sobre: string | null;
  pergunta: number | null; prazo: string; lembrete: Lembrete; status: "aberto" | "feito" | "cancelado";
  resultado: string | null; feito_em: string | null; pediu_prazo_em: string | null; avisos: Aviso[]; criado_em: string;
  responsavel?: string; criador?: string;
}

export const vencido = (c: Compromisso) => c.status === "aberto" && c.prazo < hojeSP();

const SEL = "id,criado_por,responsavel_id,titulo,sobre,pergunta,prazo,lembrete,status,resultado,feito_em,pediu_prazo_em,avisos,criado_em";

async function comNomes(rows: Compromisso[]) {
  const ids = [...new Set(rows.flatMap((c) => [c.responsavel_id, c.criado_por]).filter(Boolean))] as string[];
  const nomes = new Map<string, string>();
  if (ids.length) {
    const { data } = await supabase.from("profiles").select("id,first_name").in("id", ids);
    for (const p of (data ?? []) as any[]) nomes.set(p.id, String(p.first_name ?? "—"));
  }
  return rows.map((c) => ({ ...c, avisos: Array.isArray(c.avisos) ? c.avisos : [],
    responsavel: nomes.get(c.responsavel_id) ?? "—", criador: c.criado_por ? nomes.get(c.criado_por) ?? "—" : "—" }));
}

/** Compromissos visíveis (RLS: os meus, os que criei, os da minha estrutura) dos últimos 30 dias + todos abertos. */
export function useCompromissos() {
  return useQuery({
    queryKey: ["compromissos"],
    staleTime: 30_000,
    queryFn: async () => {
      const desde = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const { data, error } = await supabase.from("compromissos" as any).select(SEL)
        .or(`status.eq.aberto,prazo.gte.${desde}`).neq("status", "cancelado").order("prazo");
      if (error) throw error;
      return comNomes((data ?? []) as unknown as Compromisso[]);
    },
  });
}

/** Só os que estão comigo — o card "Minhas tarefas". */
export function useMinhasTarefas(meuId: string | undefined) {
  return useQuery({
    queryKey: ["compromissos", "meus", meuId],
    enabled: !!meuId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("compromissos" as any).select(SEL)
        .eq("responsavel_id", meuId!).eq("status", "aberto").order("prazo");
      if (error) throw error;
      return comNomes((data ?? []) as unknown as Compromisso[]);
    },
  });
}

export function useCompromissoAcoes() {
  const qc = useQueryClient();
  const recarregar = () => { qc.invalidateQueries({ queryKey: ["compromissos"] }); qc.invalidateQueries({ queryKey: ["diretoria"] }); };
  const run = async (p: PromiseLike<{ error: any }>, ok?: string) => {
    const { error } = await p;
    if (error) { toast.error(error.message?.includes("row-level") ? "Você só combina com quem está na sua estrutura." : error.message); return false; }
    if (ok) toast.success(ok);
    recarregar();
    return true;
  };
  return {
    criar: (v: Partial<Compromisso>) => run(supabase.from("compromissos" as any).insert(v as any), "Combinado. Aparece no painel do responsável e o lembrete fica agendado."),
    alterar: (id: string, v: Partial<Compromisso>, ok?: string) => run(supabase.from("compromissos" as any).update(v as any).eq("id", id), ok),
    apagar: (id: string) => run(supabase.from("compromissos" as any).delete().eq("id", id), "Compromisso removido"),
    avisar: async (id: string, tipo: "lembrar" | "subir") => {
      const { data, error } = await supabase.functions.invoke("lembrar-compromissos", { body: { compromisso_id: id, tipo } });
      if (error || (data as any)?.error) { toast.error((data as any)?.error || error?.message || "Não consegui avisar"); return; }
      const d = data as { ok: boolean; para: string | null };
      if (d.ok) toast.success(`${tipo === "subir" ? "Avisei" : "Lembrei"} ${d.para ?? ""} no WhatsApp`);
      else toast.warning(`Não consegui mandar no WhatsApp para ${d.para ?? "a pessoa"} (sem telefone ou sem chip). Ficou registrado no painel.`);
      recarregar();
    },
  };
}
