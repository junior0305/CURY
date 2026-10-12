// Planejamento estratégico: planos (diretor → super), ações e gastos do mês.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type Foco = "lancamento" | "estoque" | "geral";
export type StatusAcao = "a_fazer" | "fazendo" | "feito" | "cancelada";
export interface Acao {
  id: string; plano_id: string; titulo: string; entregavel: string | null; responsavel_id: string | null;
  prazo: string | null; custo_previsto: number | null; status: StatusAcao; concluida_em: string | null; nota: string | null;
}
export interface Plano {
  id: string; mes: string; dono_id: string; pai_id: string | null; titulo: string; foco: Foco; empreendimento: string | null;
  objetivo: string | null; meta_vendas: number | null; prioridade: number; status: "ativo" | "concluido" | "cancelado";
  acoes: Acao[];
}
export interface Pessoa { id: string; nome: string; papel: string; chefe: string | null }
export interface Categoria { id: string; nome: string; automatica: boolean; ordem: number }
export interface Gasto {
  id: string; mes: string; dono_id: string; categoria_id: string; descricao: string | null;
  planejado: number; realizado: number; acao_id: string | null;
}
export interface Estoque { cod_empreendimento: number; empreendimento: string; disponiveis: number; em_andamento: number; vendidas: number; total: number }

export const hojeSP = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
export const atrasada = (a: Acao) => !!a.prazo && a.prazo < hojeSP() && (a.status === "a_fazer" || a.status === "fazendo");

/** Pessoas da estrutura de `raiz` (supers, gerentes, corretores) — para responsável e dono. */
export function useEstrutura(raiz: string | null | undefined) {
  return useQuery({
    queryKey: ["estrutura", raiz],
    enabled: !!raiz,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const out: Pessoa[] = [];
      const { data: eu } = await supabase.from("profiles").select("id,first_name,role,manager_id").eq("id", raiz!).maybeSingle();
      if (eu) out.push({ id: eu.id, nome: eu.first_name ?? "—", papel: eu.role as string, chefe: eu.manager_id });
      let nivel = [raiz!];
      for (let i = 0; i < 3 && nivel.length; i++) {
        const { data } = await supabase.from("profiles").select("id,first_name,role,manager_id")
          .in("manager_id", nivel).eq("is_active", true).in("role", ["SUPERINTENDENT", "MANAGER", "BROKER"]).order("first_name");
        const ps = ((data ?? []) as any[]).map((p) => ({ id: p.id, nome: p.first_name ?? "—", papel: p.role, chefe: p.manager_id }));
        out.push(...ps);
        nivel = ps.filter((p) => p.papel !== "BROKER").map((p) => p.id);
      }
      return out;
    },
  });
}

/** Planos do mês visíveis para quem está logado (RLS: o próprio, a árvore, os chefes). */
export function usePlanos(mes: string) {
  return useQuery({
    queryKey: ["planos", mes],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("planos" as any)
        .select("id,mes,dono_id,pai_id,titulo,foco,empreendimento,objetivo,meta_vendas,prioridade,status, acoes:plano_acoes(id,plano_id,titulo,entregavel,responsavel_id,prazo,custo_previsto,status,concluida_em,nota)")
        .eq("mes", mes).neq("status", "cancelado").order("prioridade").order("criado_em");
      if (error) throw error;
      return ((data ?? []) as unknown as Plano[]).map((p) => ({
        ...p, acoes: [...(p.acoes ?? [])].sort((a, b) => (a.prazo ?? "9").localeCompare(b.prazo ?? "9")) }));
    },
  });
}

export function useEstoque() {
  return useQuery({
    queryKey: ["estoque-disponivel"],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("estoque_disponivel" as any).select("*").gt("disponiveis", 0).order("disponiveis", { ascending: false });
      return (data ?? []) as unknown as Estoque[];
    },
  });
}

export function useCategorias() {
  return useQuery({
    queryKey: ["gasto-categorias"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("gasto_categorias" as any).select("id,nome,automatica,ordem").eq("ativa", true).order("ordem").order("nome");
      return (data ?? []) as unknown as Categoria[];
    },
  });
}

export function useGastos(mes: string) {
  return useQuery({
    queryKey: ["gastos", mes],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("gastos" as any).select("id,mes,dono_id,categoria_id,descricao,planejado,realizado,acao_id")
        .eq("mes", mes).order("criado_em");
      if (error) throw error;
      return ((data ?? []) as any[]).map((g) => ({ ...g, planejado: Number(g.planejado), realizado: Number(g.realizado) })) as Gasto[];
    },
  });
}

/** Gravações com aviso de erro e recarga. */
export function usePlanoAcoes() {
  const qc = useQueryClient();
  const run = async (p: PromiseLike<{ error: any }>, ok?: string, chaves: string[] = ["planos"]) => {
    const { error } = await p;
    if (error) { toast.error(error.message?.includes("row-level") ? "Você não pode mexer nesse item." : error.message); return false; }
    if (ok) toast.success(ok);
    chaves.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    return true;
  };
  return {
    criarPlano: (v: Partial<Plano>) => run(supabase.from("planos" as any).insert(v as any), "Plano criado"),
    alterarPlano: (id: string, v: Partial<Plano>) => run(supabase.from("planos" as any).update(v as any).eq("id", id)),
    criarAcao: (v: Partial<Acao>) => run(supabase.from("plano_acoes" as any).insert(v as any), "Ação criada"),
    alterarAcao: (id: string, v: Partial<Acao>) => run(supabase.from("plano_acoes" as any).update(v as any).eq("id", id)),
    apagarAcao: (id: string) => run(supabase.from("plano_acoes" as any).delete().eq("id", id), "Ação removida"),
    criarGasto: (v: Partial<Gasto>) => run(supabase.from("gastos" as any).insert(v as any), "Gasto lançado", ["gastos"]),
    alterarGasto: (id: string, v: Partial<Gasto>) => run(supabase.from("gastos" as any).update(v as any).eq("id", id), undefined, ["gastos"]),
    apagarGasto: (id: string) => run(supabase.from("gastos" as any).delete().eq("id", id), "Gasto removido", ["gastos"]),
    criarCategoria: (nome: string) => run(supabase.from("gasto_categorias" as any).insert({ nome } as any), `Categoria "${nome}" criada`, ["gasto-categorias"]),
    cobrar: async (acaoId: string, forcar = false) => {
      const { data, error } = await supabase.functions.invoke("cobrar-acao", { body: { acao_id: acaoId, forcar } });
      if (error || (data as any)?.error) { toast.error((data as any)?.error || error?.message || "Não consegui cobrar"); return null; }
      qc.invalidateQueries({ queryKey: ["diretoria"] });
      return data as { cobrados: { responsavel: string; avisado_no_whats: boolean }[]; ja_cobrados: { responsavel: string; quando: string; respondeu: boolean }[] };
    },
  };
}
