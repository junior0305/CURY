// Números do superintendente por gerente, num período qualquer (de/até, dias em SP) — o que o
// useConsolidadoSuper faz em "últimos N dias", aqui com início e fim, para o seletor único de datas.
//   Leads, atendidos, sem toque ← leads (manager_id do gerente, criados no período)
//   Plantão / visita            ← cury_metricas_diarias (C2S, escopo gerente)
//   Vendas / VGV                ← junix_vendas (data_venda no período), pelo CORRETOR do Comandra; senão pelo gerente
//   Pastas novas                ← junix_pastas cadastradas no período (já ligadas pelo corretor em escopo.ts)
//   Gasto / leads do Facebook   ← edge fb-conta-gerente (conta de cada gerente e a do próprio super)
//   Carteira sem toque (agora)  ← leads ativos sem nenhum contato, hoje
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { chaveGerente, type SuperDiretoria, type PastaJunix } from "@/hooks/useDiretoria";

const sb = supabase as any;
export type Canal = "anuncio" | "disparo" | "pescados" | "outros";
export interface LinhaSuper {
  id: string; nome: string;
  leads: Record<Canal, number>; leadsTot: number; atendidos: number; avancaram: number;
  plantaoDias: number; visitas: number; vendas: number; vgv: number; pastasNovas: number;
  gasto: number | null; leadsFb: number | null; conversasFb: number | null; carteiraSemToque: number;
}
const chaveNome = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z ]/g, " ").trim().split(/\s+/).filter(Boolean);
export function canalDe(l: any): Canal {
  const src = String(l.source ?? "").toLowerCase();
  if (src === "cold_pool" || l.original_broker_id) return "pescados";
  if (src.startsWith("facebook") || l.fb_page_id || l.fb_campaign_id) return "anuncio";
  if (src === "wa_oficial" || src === "campaign" || src.includes("disparo")) return "disparo";
  return "outros";
}
// regra única de "atendido" para todas as telas: src/lib/situacaoLead.ts
export { atendido } from "@/lib/situacaoLead";
const AVANCOU = ["VISIT_SCHEDULED", "VISITA_REALIZADA", "DOCS_REQUESTED", "CONCLUDED"];

export function useNumerosSuper(supers: SuperDiretoria[], pastas: PastaJunix[], de: string, ate: string) {
  const gerentes = supers.flatMap((s) => s.gerentes).filter((g) => !/revisor/i.test(g.nome));
  const ids = gerentes.map((g) => g.id);
  return useQuery({
    queryKey: ["s2-numeros", ids.join(","), de, ate, pastas.length],
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    placeholderData: (ant: any) => ant,
    queryFn: async () => {
      const ini = `${de}T03:00:00Z`;
      const fim = new Date(new Date(`${ate}T03:00:00Z`).getTime() + 86400e3).toISOString();
      const linhas = new Map<string, LinhaSuper>(gerentes.map((g) => [g.id, {
        id: g.id, nome: g.nome, leads: { anuncio: 0, disparo: 0, pescados: 0, outros: 0 }, leadsTot: 0, atendidos: 0, avancaram: 0,
        plantaoDias: 0, visitas: 0, vendas: 0, vgv: 0, pastasNovas: 0, gasto: null, leadsFb: null, conversasFb: null, carteiraSemToque: 0,
      }]));
      // corretor do Comandra → gerente (para a venda do Junix, que tem outra árvore)
      const porCorretor: { p: string; u: string; g: string }[] = [];
      for (const g of gerentes) for (const c of g.corretores_lista ?? []) { const t = chaveNome(c.nome); if (t.length) porCorretor.push({ p: t[0], u: t[t.length - 1], g: g.id }); }
      const gerDoCorretor = (nome: string | null) => {
        const t = chaveNome(nome); if (!t.length) return null;
        return porCorretor.find((x) => x.p === t[0] && (t.length === 1 || x.u === t[t.length - 1] || x.p === x.u))?.g ?? null;
      };
      const porNomeGer = new Map(gerentes.map((g) => [chaveGerente(g.nome), g.id]));

      const leads: any[] = [];
      for (let a = 0; ; a += 1000) {
        const { data, error } = await sb.from("leads")
          .select("manager_id,source,original_broker_id,fb_page_id,fb_campaign_id,status,contact_attempts,last_broker_whatsapp_at,last_interaction_at,created_at")
          .in("manager_id", ids).gte("created_at", ini).lt("created_at", fim).range(a, a + 999);
        if (error) throw error;
        leads.push(...(data ?? [])); if (!data || data.length < 1000) break;
      }
      for (const l of leads) {
        const x = linhas.get(l.manager_id); if (!x) continue;
        x.leads[canalDe(l)]++; x.leadsTot++;
        if (atendido(l)) x.atendidos++;
        if (AVANCOU.includes(l.status)) x.avancaram++;
      }

      const [c2s, vendas] = await Promise.all([
        sb.from("cury_metricas_diarias").select("profile_id,checkins,atendimentos").eq("escopo", "gerente").in("profile_id", ids).gte("data", de).lte("data", ate),
        sb.from("junix_vendas").select("gerente,corretor,vgv,qtd").eq("ativo", true).gte("data_venda", de).lte("data_venda", ate),
      ]);
      for (const r of c2s.data ?? []) { const x = linhas.get(r.profile_id); if (x) { x.plantaoDias += r.checkins ?? 0; x.visitas += r.atendimentos ?? 0; } }
      for (const v of vendas.data ?? []) {
        const gid = gerDoCorretor(v.corretor) ?? porNomeGer.get(chaveGerente(v.gerente)) ?? null;
        const x = gid ? linhas.get(gid) : null; if (!x) continue;
        x.vendas += Number(v.qtd ?? 1); x.vgv += Number(v.vgv ?? 0);
      }
      for (const p of pastas) {
        const d = String(p.cadastrada_em || "").slice(0, 10);
        if (!d || d < de || d > ate) continue;
        const gid = porNomeGer.get(chaveGerente(p.gerente)); const x = gid ? linhas.get(gid) : null;
        if (x) x.pastasNovas++;
      }
      await Promise.all(ids.map(async (gid) => {
        const { count } = await sb.from("leads").select("id", { count: "exact", head: true })
          .eq("manager_id", gid).not("status", "in", "(CONCLUDED,EXCLUDED,ABANDONED)")
          .is("last_broker_whatsapp_at", null).or("contact_attempts.is.null,contact_attempts.eq.0").eq("status", "NEW");
        linhas.get(gid)!.carteiraSemToque = count ?? 0;
      }));
      // Facebook: conta de cada gerente (a do super fica no total)
      let gastoSuper = 0, leadsSuper = 0, convSuper = 0;
      await Promise.all([...supers.map((s) => s.id), ...ids].map(async (dono) => {
        const { data } = await supabase.functions.invoke("fb-conta-gerente", { body: { owner_id: dono, de, ate } });
        const r = data as any; if (!r || r.semConta || r.error) return;
        const conv = (r.campanhas ?? []).reduce((a: number, c: any) => a + Number(c.conversas || 0), 0);
        const x = linhas.get(dono);
        if (x) { x.gasto = Number(r.gasto || 0); x.leadsFb = Number(r.leads || 0); x.conversasFb = conv; }
        else { gastoSuper += Number(r.gasto || 0); leadsSuper += Number(r.leads || 0); convSuper += conv; }
      }));
      const lista = [...linhas.values()];
      const soma = (f: (x: LinhaSuper) => number) => lista.reduce((a, x) => a + f(x), 0);
      const total = {
        leadsTot: soma((x) => x.leadsTot), atendidos: soma((x) => x.atendidos), avancaram: soma((x) => x.avancaram),
        plantaoDias: soma((x) => x.plantaoDias), visitas: soma((x) => x.visitas), vendas: soma((x) => x.vendas), vgv: soma((x) => x.vgv),
        pastasNovas: soma((x) => x.pastasNovas), carteiraSemToque: soma((x) => x.carteiraSemToque),
        gasto: soma((x) => x.gasto ?? 0) + gastoSuper, leadsFb: soma((x) => x.leadsFb ?? 0) + leadsSuper, conversasFb: soma((x) => x.conversasFb ?? 0) + convSuper,
        leads: { anuncio: soma((x) => x.leads.anuncio), disparo: soma((x) => x.leads.disparo), pescados: soma((x) => x.leads.pescados), outros: soma((x) => x.leads.outros) },
      };
      return { linhas: lista, total };
    },
  });
}
