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
import { empresa } from "@/lib/empresa";

export const chaveNome = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .replace(/\bBN\b/g, "").replace(/[^A-Z ]/g, " ").trim().split(/\s+/)[0] ?? "";
export const chaveGerente = (s: string | null | undefined) => {
  const k = (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
  return empresa().apelidos_gerente[k] ?? chaveNome(s);
};
export const colado = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
export const diaSP = (ms: number) => new Date(ms - 3 * 3600 * 1000).toISOString().slice(0, 10);
export const gerenteC2S = (s: string | null | undefined) =>
  String(s ?? "Sem gerente").replace(/^Gerente\s+/i, "").replace(/\+$/, "").trim() || "Sem gerente";
export const nomesSuperC2S = (nome: string) => [`Superintendente ${nome}`, `Superintendencia ${nome}`, `Superintendência ${nome}`];

export interface PastaJunix {
  proposta_id: string; cliente: string | null; etapa: string | null; dias: number | null;
  corretor: string | null; gerente: string | null; superintendente: string | null; empreendimento: string | null;
  status_texto?: string | null; cadastrada_em?: string | null;
}
export interface SuperDiretoria {
  id: string; nome: string; tokens: string[];
  phone?: string | null;
  gerentes: GerenteRollup[];
  logadosHoje: Record<string, boolean>;         // corretor id → entrou hoje
  plantaoSemLogin: Record<string, string[]>;    // gerente id → nomes no plantão sem login
  // super sem gerente no Comandra (ex.: Adajes, Silva — no C2S ainda estão na diretoria antiga):
  // plantão lido direto do C2S pelo nome exato da superintendência
  // corretores = quem bateu ponto no período; corretores30 = base de 30 dias (denominador da presença)
  c2s?: { dias: number; hoje: number; gerentes: { nome: string; dias: number; hoje: number; corretores: number; corretores30: number }[] };
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
      if (meuId) {
        const { data: meuPerfil } = await supabase.from("profiles").select("manager_id").eq("id", meuId).maybeSingle();
        if (meuPerfil?.manager_id) return meuPerfil.manager_id as string;
      }
      const { data } = await supabase.from("profiles").select("id").eq("role", "DIRECTOR").eq("is_active", true)
        .order("created_at").limit(1).maybeSingle();
      return (data?.id as string | undefined) ?? "ca9b6ab4-d90c-4d3d-b5b5-0f8689eb0bea";
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
        supabase.from("junix_pastas" as any).select("proposta_id,cliente,etapa,dias,corretor,gerente,superintendente,empreendimento,status_texto,cadastrada_em"),
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
      // super sem corretor no Comandra (sem gerente, ou gerentes recém-cadastrados ainda sem time, como o Silva em 14/10):
      // plantão direto do C2S (nome exato; "Silva" não pode pegar "Silvano")
      const de = diaSP(Date.now() - (dias - 1) * 864e5);
      const de30 = diaSP(Date.now() - (Math.max(dias, 30) - 1) * 864e5);
      for (const s of supers) {
        if (s.gerentes.some((g) => g.corretores > 0)) continue;
        const nomes = nomesSuperC2S(s.nome);
        const rows: any[] = [];
        for (let a = 0; ; a += 1000) {
          const { data } = await supabase.from("c2s_plantao" as any).select("dia,corretor,gerente").in("superintendente", nomes).gte("dia", de30).range(a, a + 999);
          rows.push(...((data ?? []) as any[])); if (!data || data.length < 1000) break;
        }
        if (!rows.length) continue;
        const porG = new Map<string, { dias: Set<string>; hoje: Set<string>; cor: Set<string>; cor30: Set<string> }>();
        for (const r of rows) {
          const g = gerenteC2S(r.gerente);
          const k = chaveNome(r.corretor);
          const x = porG.get(g) ?? { dias: new Set<string>(), hoje: new Set<string>(), cor: new Set<string>(), cor30: new Set<string>() };
          x.cor30.add(k);
          if (r.dia >= de) { x.dias.add(`${r.dia}|${k}`); x.cor.add(k); }
          if (r.dia === hoje) x.hoje.add(k);
          porG.set(g, x);
        }
        const gerentes = [...porG.entries()].map(([nome, x]) => ({ nome, dias: x.dias.size, hoje: x.hoje.size, corretores: x.cor.size, corretores30: x.cor30.size }))
          .sort((a, b) => b.dias - a.dias);
        s.c2s = { dias: gerentes.reduce((a, g) => a + g.dias, 0), hoje: gerentes.reduce((a, g) => a + g.hoje, 0), gerentes };
      }

      return { supers, pastas, cobrancas, plantaoHojeTotal };
    },
  });
}

// O Junix às vezes grava como "superintendente" um gerente da superintendência (ex.: SNOW UV é equipe da Adajes).
export const superJunix = (s: string | null | undefined) => empresa().apelidos_super[colado(s)] ?? (s ?? "");

// a qual super (e gerente) pertence uma linha do Junix
export function donoJunix(supers: SuperDiretoria[], superintendente: string | null, gerente: string | null) {
  const kg = chaveGerente(gerente);
  for (const s of supers) {
    const g = s.gerentes.find((x) => chaveGerente(x.nome) === kg);
    if (g) return { superId: s.id, gerenteId: g.id };
  }
  // o gerente no Junix pode ser o próprio super (Adajes, quando era gerente direto do diretor): comparação exata
  const kgc = colado(gerente);
  const ks = colado(superJunix(superintendente));
  const s = (kgc.length >= 4 ? supers.find((x) => x.tokens.includes(kgc)) : undefined)
    ?? supers.find((x) => x.tokens.some((t) => ks.includes(t)));
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
