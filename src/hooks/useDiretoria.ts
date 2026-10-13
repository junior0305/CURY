// A empresa inteira para a tela do diretor: superintendências → gerentes → corretores.
//   Estrutura, plantão de hoje, online   ← superintendente_rollup de cada super
//   Plantão sem login                    ← c2s_plantao de hoje sem corretor no Comandra
//   Pastas                               ← junix_pastas (super/gerente/corretor pelo nome)
//   Meta                                 ← metas_painel do diretor
//   Cobranças                            ← cobrancas dos últimos 7 dias
// Venda, VGV, Facebook e leads por origem vêm do useConsolidadoSuper(diretor).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buscarPlantao } from "@/utils/c2sMatching";
import type { GerenteRollup, SuperRollup } from "@/hooks/useSuperintendente";

export const chaveNome = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .replace(/\bBN\b/g, "").replace(/[^A-Z ]/g, " ").trim().split(/\s+/)[0] ?? "";
const APELIDO: Record<string, string> = { OTAVIONETO: "JAGUAR" };
export const chaveGerente = (s: string | null | undefined) => {
  const k = (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
  return APELIDO[k] ?? chaveNome(s);
};
const colado = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
const diaSP = (ms: number) => new Date(ms - 3 * 3600 * 1000).toISOString().slice(0, 10);

export interface PastaJunix {
  proposta_id: string; cliente: string | null; etapa: string | null; dias: number | null;
  corretor: string | null; gerente: string | null; superintendente: string | null; empreendimento: string | null;
}
export interface SuperDiretoria {
  id: string; nome: string; tokens: string[];
  phone?: string | null;
  gerentes: GerenteRollup[];
  logadosHoje: Record<string, boolean>;         // corretor id → entrou hoje
  plantaoSemLogin: Record<string, string[]>;    // gerente id → nomes no plantão sem login
}
export interface Cobranca {
  id: string; de: string; para: string; motivo: string; enviada_em: string; respondida_em: string | null; resposta: string | null;
  de_id: string; para_id: string; para_ativo: boolean;
  leads: number; atendidos: number;   // leads da cobrança e quantos foram mexidos depois dela
  para_ainda_tem: boolean;            // o cobrado ainda é dono de algum desses leads
}
export interface PessoaMeta { id: string; nome: string; papel: string; meta: number | null; realizado: number; pode_editar: boolean }

export function useDiretorId(role: string | null | undefined, meuId: string | undefined) {
  return useQuery({
    queryKey: ["perfil-diretor", role, meuId],
    enabled: !!role,
    staleTime: Infinity,
    queryFn: async () => {
      if (role === "DIRECTOR") return meuId ?? null;
      const { data } = await supabase.from("profiles").select("id").eq("role", "DIRECTOR").eq("is_active", true)
        .order("created_at").limit(1).maybeSingle();
      return (data?.id as string | undefined) ?? null;
    },
  });
}

export function useDiretoria(diretorId: string | null | undefined, dias: number) {
  return useQuery({
    queryKey: ["diretoria", diretorId, dias],
    placeholderData: (ant: any, q: any) => (q?.queryKey?.[1] === diretorId ? ant : undefined),
    enabled: !!diretorId,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const hoje = diaSP(Date.now());
      const { data: subs } = await supabase.from("profiles").select("id,first_name,last_name,phone")
        .eq("manager_id", diretorId!).eq("role", "SUPERINTENDENT").eq("is_active", true).order("first_name");
      const supersBase = ((subs ?? []) as any[]).map((s) => ({
        id: s.id as string, nome: String(s.first_name ?? "—"),
        phone: (s.phone ? String(s.phone) : null) as string | null,
        tokens: [...String(s.first_name ?? "").split(/\s+/), ...String(s.last_name ?? "").split(/\s+/)].map(colado).filter((t) => t.length >= 4),
      }));

      const [rollups, plantao, pastasR, cobR] = await Promise.all([
        Promise.all(supersBase.map(async (s) => {
          const { data } = await supabase.rpc("superintendente_rollup" as any, { p_super: s.id, p_dias: dias });
          return ((data as unknown as SuperRollup | null)?.gerentes ?? []) as GerenteRollup[];
        })),
        buscarPlantao(`${hoje}T03:00:00Z`).catch(() => []),
        supabase.from("junix_pastas" as any).select("proposta_id,cliente,etapa,dias,corretor,gerente,superintendente,empreendimento"),
        supabase.from("cobrancas" as any).select("id,de_id,para_id,motivo,enviada_em,respondida_em,resposta,lead_ids")
          .gte("enviada_em", new Date(Date.now() - 7 * 864e5).toISOString()).order("enviada_em", { ascending: false }).limit(40),
      ]);

      // quem entrou hoje (last_seen_at) — o rollup só diz "online agora"
      const idsCor = rollups.flat().flatMap((g) => g.corretores_lista.map((c) => c.id));
      const logados = new Set<string>();
      for (let i = 0; i < idsCor.length; i += 200) {
        const { data } = await supabase.from("profiles").select("id,last_seen_at").in("id", idsCor.slice(i, i + 200))
          .gte("last_seen_at", `${hoje}T03:00:00Z`);
        for (const r of (data ?? []) as any[]) logados.add(r.id);
      }

      // plantão de hoje sem login: nome do C2S que não bate com nenhum corretor da equipe
      const supers: SuperDiretoria[] = supersBase.map((s, i) => {
        const gerentes = rollups[i];
        const logadosHoje: Record<string, boolean> = {};
        const plantaoSemLogin: Record<string, string[]> = {};
        for (const g of gerentes) {
          for (const c of g.corretores_lista) logadosHoje[c.id] = logados.has(c.id);
          const nomes = new Set(g.corretores_lista.map((c) => chaveNome(c.nome)));
          const sem = new Set<string>();
          for (const r of plantao) {
            if (chaveGerente(r.gerente) !== chaveGerente(g.nome)) continue;
            if (!nomes.has(chaveNome(r.corretor))) sem.add(String(r.corretor ?? "").trim());
          }
          plantaoSemLogin[g.id] = [...sem].filter(Boolean).sort();
        }
        return { ...s, gerentes, logadosHoje, plantaoSemLogin };
      });

      const pastas = ((pastasR as any).data ?? []) as PastaJunix[];

      const cobs = ((cobR as any).data ?? []) as any[];
      const pids = [...new Set(cobs.flatMap((c) => [c.de_id, c.para_id]))];
      const nomes = new Map<string, string>();
      const ativo = new Map<string, boolean>();
      if (pids.length) {
        const { data } = await supabase.from("profiles").select("id,first_name,is_active").in("id", pids);
        for (const p of (data ?? []) as any[]) { nomes.set(p.id, p.first_name ?? "—"); ativo.set(p.id, p.is_active !== false); }
      }
      // efeito da cobrança: lead que andou (status) ou teve interação depois dela
      const lids = [...new Set(cobs.flatMap((c) => (c.lead_ids ?? []) as string[]))];
      const lead = new Map<string, { status: string; ult: string | null; dono: string | null }>();
      for (let i = 0; i < lids.length; i += 200) {
        const { data } = await supabase.from("leads").select("id,status,last_interaction_at,broker_id").in("id", lids.slice(i, i + 200));
        for (const l of (data ?? []) as any[]) lead.set(l.id, { status: l.status, ult: l.last_interaction_at, dono: l.broker_id });
      }
      const cobrancas: Cobranca[] = cobs.map((c) => {
        const ls = ((c.lead_ids ?? []) as string[]).map((id) => lead.get(id)).filter(Boolean) as { status: string; ult: string | null; dono: string | null }[];
        return { id: c.id, de: nomes.get(c.de_id) ?? "—", para: nomes.get(c.para_id) ?? "—", de_id: c.de_id, para_id: c.para_id,
          para_ativo: ativo.get(c.para_id) ?? true, motivo: c.motivo, enviada_em: c.enviada_em, respondida_em: c.respondida_em, resposta: c.resposta,
          para_ainda_tem: ls.some((l) => l.dono === c.para_id), leads: ls.length, atendidos: ls.filter((l) => l.status !== "NEW" || (l.ult != null && l.ult > c.enviada_em)).length };
      });

      const plantaoHojeTotal = new Set(plantao.map((r) => `${chaveGerente(r.gerente)}|${chaveNome(r.corretor)}`)).size;
      return { supers, pastas, cobrancas, plantaoHojeTotal };
    },
  });
}

// O Junix às vezes grava como "superintendente" um gerente da superintendência (ex.: SNOW UV é equipe da Adajes).
const APELIDO_SUPER: Record<string, string> = { SNOWUV: "ADAJES" };
export const superJunix = (s: string | null | undefined) => APELIDO_SUPER[colado(s)] ?? (s ?? "");

// a qual super (e gerente) pertence uma linha do Junix
export function donoJunix(supers: SuperDiretoria[], superintendente: string | null, gerente: string | null) {
  const kg = chaveGerente(gerente);
  for (const s of supers) {
    const g = s.gerentes.find((x) => chaveGerente(x.nome) === kg);
    if (g) return { superId: s.id, gerenteId: g.id };
  }
  const ks = colado(superJunix(superintendente));
  const s = supers.find((x) => x.tokens.some((t) => ks.includes(t)));
  return { superId: s?.id ?? "fora", gerenteId: null as string | null };
}

export function useMetasDiretoria(diretorId: string | null | undefined, mes: string) {
  return useQuery({
    queryKey: ["metas-painel", mes, diretorId],
    enabled: !!diretorId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("metas_painel" as any, { p_mes: mes, p_dono: diretorId });
      if (error) throw error;
      return data as unknown as { mes: string; dono: PessoaMeta; filhos: PessoaMeta[] };
    },
  });
}
