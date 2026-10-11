// O consolidado do superintendente: uma linha por gerente, com TODAS as fontes
// da operação lado a lado — sem precisar entrar em painel por painel.
//
//   Plantão e visita  ← C2S   (cury_metricas_diarias escopo gerente, enchida por /root/econ/metricas.py)
//   Venda e VGV       ← Junix (junix_vendas.data_venda: contrato, ou assinatura do cliente enquanto não há contrato)
//   Pastas            ← Junix (junix_pastas, o kanban de agora — dono pela Pesquisa de Proposta)
//   Anúncio           ← Facebook (conta de cada gerente, fb-conta-gerente)
//   Leads por origem  ← Comandra (leads)
//
// O que o Junix registra para a superintendência sem gerente no Comandra (ex.: o
// Jhonny do Metlicz) entra numa linha "outros" — o total do super não pode encolher
// por falta de cadastro.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type OrigemLead = "anuncio" | "disparo" | "pescados" | "outros";

export interface LinhaConsolidado {
  id: string;            // profile do gerente; "super" = conta/leads do próprio super; "outros" = só Junix
  nome: string;
  plantaoDias: number;   // corretor-dia com ponto no plantão (C2S)
  visitas: number;       // cliente atendido no estande (C2S)
  vendas: number;        // Junix
  vgv: number;           // Junix
  pastas: number;        // Junix, abertas agora
  pastasTravadas: number;
  gasto: number | null;  // Facebook; null = sem conta
  leadsFb: number | null;
  leads: Record<OrigemLead, number>;
  nuncaFalaram: number;  // carteira ativa sem nenhum toque do corretor
  fbErro?: string | null;
}

const chave = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .replace(/\bBN\b/g, "").replace(/[^A-Z ]/g, " ").trim().split(/\s+/)[0] ?? "";
const APELIDO: Record<string, string> = { OTAVIONETO: "JAGUAR" };
const chaveGer = (s: string | null | undefined) => {
  const k = (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
  return APELIDO[k] ?? chave(s);
};
const diaSP = (ms: number) => new Date(ms - 3 * 3600 * 1000).toISOString().slice(0, 10);

function origemDe(l: any): OrigemLead {
  const src = String(l.source ?? "").toLowerCase();
  if (src === "cold_pool" || l.original_broker_id) return "pescados";
  if (src.startsWith("facebook") || l.fb_page_id || l.fb_campaign_id) return "anuncio";
  if (src === "wa_oficial" || src === "campaign" || src.includes("disparo")) return "disparo";
  return "outros";
}

async function todas<T>(q: (de: number, ate: number) => PromiseLike<{ data: unknown; error: any }>) {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await q(de, de + 999);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

export function useConsolidadoSuper(superId: string | undefined, dias: number) {
  return useQuery({
    queryKey: ["super-consolidado", superId, dias],
    enabled: !!superId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const ate = diaSP(Date.now());
      const de = diaSP(Date.now() - (dias - 1) * 864e5);
      const deIso = `${de}T03:00:00Z`;

      const [{ data: eu }, { data: gers }] = await Promise.all([
        supabase.from("profiles").select("first_name,last_name").eq("id", superId!).maybeSingle(),
        supabase.from("profiles").select("id,first_name").eq("manager_id", superId!).eq("role", "MANAGER")
          .eq("is_active", true).order("first_name"),
      ]);
      const gerentes = (gers ?? []) as { id: string; first_name: string | null }[];
      const meusTokens = [chave((eu as any)?.first_name), chave((eu as any)?.last_name)].filter((t) => t.length >= 3);
      const daMinhaSuper = (s: string | null) => {
        const k = (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
        return meusTokens.some((t) => k.includes(t));
      };
      const ids = gerentes.map((g) => g.id);
      const porChave = new Map(gerentes.map((g) => [chaveGer(g.first_name), g.id]));

      const linhas = new Map<string, LinhaConsolidado>();
      const nova = (id: string, nome: string): LinhaConsolidado => ({
        id, nome, plantaoDias: 0, visitas: 0, vendas: 0, vgv: 0, pastas: 0, pastasTravadas: 0,
        gasto: null, leadsFb: null, leads: { anuncio: 0, disparo: 0, pescados: 0, outros: 0 }, nuncaFalaram: 0 });
      for (const g of gerentes) linhas.set(g.id, nova(g.id, g.first_name || "—"));
      const linha = (id: string, nome: string) => linhas.get(id) ?? (linhas.set(id, nova(id, nome)), linhas.get(id)!);

      const [c2s, vendas, pastas, leads, contas, corretores] = await Promise.all([
        ids.length ? supabase.from("cury_metricas_diarias").select("profile_id,checkins,atendimentos")
          .eq("escopo", "gerente").in("profile_id", ids).gte("data", de).lte("data", ate) : Promise.resolve({ data: [] }),
        supabase.from("junix_vendas" as any).select("gerente,superintendente,vgv,qtd")
          .eq("ativo", true).gte("data_venda", de).lte("data_venda", ate),
        supabase.from("junix_pastas" as any).select("gerente,superintendente,dias"),
        ids.length ? todas<any>((a, b) => supabase.from("leads")
          .select("manager_id,source,original_broker_id,fb_page_id,fb_campaign_id")
          .in("manager_id", [superId!, ...ids]).gte("created_at", deIso).range(a, b)) : Promise.resolve([]),
        supabase.rpc("fb_contas_gerentes" as any, { p_de: de }),
        supabase.from("profiles").select("id,manager_id").in("manager_id", [superId!, ...ids]).eq("role", "BROKER"),
      ]);

      for (const r of ((c2s as any).data ?? []) as any[]) {
        const l = linhas.get(r.profile_id); if (!l) continue;
        l.plantaoDias += r.checkins ?? 0; l.visitas += r.atendimentos ?? 0;
      }
      for (const v of ((vendas as any).data ?? []) as any[]) {
        const gid = porChave.get(chaveGer(v.gerente));
        if (!gid && !daMinhaSuper(v.superintendente)) continue;
        const l = gid ? linhas.get(gid)! : linha("outros", "Outros no Junix");
        l.vendas += Number(v.qtd ?? 1); l.vgv += Number(v.vgv ?? 0);
      }
      for (const p of ((pastas as any).data ?? []) as any[]) {
        const gid = porChave.get(chaveGer(p.gerente));
        if (!gid && !daMinhaSuper(p.superintendente)) continue;
        const l = gid ? linhas.get(gid)! : linha("outros", "Outros no Junix");
        l.pastas += 1; if ((p.dias ?? 0) >= 7) l.pastasTravadas += 1;
      }
      for (const ld of leads as any[]) {
        const l = ld.manager_id === superId ? linha("super", "Direto com você") : linhas.get(ld.manager_id);
        if (l) l.leads[origemDe(ld)] += 1;
      }

      // carteira ativa sem nenhum toque — o "lead pago parado na mão", por gerente
      await Promise.all(ids.map(async (gid) => {
        const { count } = await supabase.from("leads").select("id", { count: "exact", head: true })
          .eq("manager_id", gid).not("status", "in", "(CONCLUDED,EXCLUDED,ABANDONED)")
          .is("last_broker_whatsapp_at", null).or("contact_attempts.is.null,contact_attempts.eq.0");
        linhas.get(gid)!.nuncaFalaram = count ?? 0;
      }));

      // Facebook: a conta de cada gerente e a do próprio super
      const minhasContas = (((contas as any).data ?? []) as any[])
        .filter((c) => c.owner_id === superId || ids.includes(c.owner_id));
      await Promise.all(minhasContas.map(async (c) => {
        const { data: r, error } = await supabase.functions.invoke("fb-conta-gerente", { body: { owner_id: c.owner_id, de, ate } });
        const l = c.owner_id === superId ? linha("super", "Direto com você") : linhas.get(c.owner_id)!;
        const fb = (r ?? {}) as any;
        if (error || fb.error || fb.semConta) { l.fbErro = error?.message || fb.motivo || fb.error || "sem acesso"; return; }
        l.gasto = (l.gasto ?? 0) + Number(fb.gasto ?? 0);
        l.leadsFb = (l.leadsFb ?? 0) + Number(fb.leads ?? 0);
      }));

      const ordem = (x: LinhaConsolidado) => (x.id === "super" ? 1 : x.id === "outros" ? 2 : 0);
      const lista = [...linhas.values()].sort((a, b) => ordem(a) - ordem(b) || b.vendas - a.vendas || b.visitas - a.visitas);
      const soma = (f: (x: LinhaConsolidado) => number) => lista.reduce((a, x) => a + f(x), 0);
      const total = {
        corretores: ((corretores as any).data ?? []).length,
        plantaoDias: soma((x) => x.plantaoDias), visitas: soma((x) => x.visitas),
        vendas: soma((x) => x.vendas), vgv: soma((x) => x.vgv),
        pastas: soma((x) => x.pastas), pastasTravadas: soma((x) => x.pastasTravadas),
        gasto: soma((x) => x.gasto ?? 0), leadsFb: soma((x) => x.leadsFb ?? 0),
        leads: { anuncio: soma((x) => x.leads.anuncio), disparo: soma((x) => x.leads.disparo),
          pescados: soma((x) => x.leads.pescados), outros: soma((x) => x.leads.outros) },
        nuncaFalaram: soma((x) => x.nuncaFalaram),
      };
      return { de, ate, linhas: lista, total };
    },
  });
}
