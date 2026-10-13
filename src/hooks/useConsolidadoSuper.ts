// O consolidado do superintendente: uma linha por gerente, com TODAS as fontes
// da operação lado a lado — sem precisar entrar em painel por painel.
//
//   Plantão e visita  ← C2S   (cury_metricas_diarias escopo gerente, enchida por /root/econ/metricas.py)
//   Venda e VGV       ← Junix (junix_vendas.data_venda: assinatura do cliente; contrato só se faltar a assinatura)
//   Pastas            ← Junix (junix_pastas, o kanban de agora — dono pela Pesquisa de Proposta)
//   Anúncio           ← Facebook (conta de cada gerente, fb-conta-gerente)
//   Leads por origem  ← Comandra (leads)
//
// O que o Junix registra para a superintendência sem gerente no Comandra (ex.: o
// Jhonny do Metlicz) entra numa linha "outros" — o total do super não pode encolher
// por falta de cadastro.

import { superJunix } from "@/hooks/useDiretoria";
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
    // trocar o período mantém os números anteriores na tela até os novos chegarem (a consulta leva ~8s)
    placeholderData: (ant: any, q: any) => (q?.queryKey?.[1] === superId ? ant : undefined),
    enabled: !!superId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const ate = diaSP(Date.now());
      const de = diaSP(Date.now() - (dias - 1) * 864e5);
      const deIso = `${de}T03:00:00Z`;

      // diretor: os supers abaixo dele também são "chefes" — a linha vira a empresa inteira
      const [{ data: eu }, { data: subs }] = await Promise.all([
        supabase.from("profiles").select("first_name,last_name,role").eq("id", superId!).maybeSingle(),
        supabase.from("profiles").select("id,first_name,last_name").eq("manager_id", superId!).eq("role", "SUPERINTENDENT").eq("is_active", true),
      ]);
      const ehDiretor = (eu as any)?.role === "DIRECTOR";
      const subIds = ((subs ?? []) as { id: string }[]).map((x) => x.id);
      // diretor: o que o Junix tem sem gerente no Comandra vai para o super certo pelo nome
      const tokensSub = ((subs ?? []) as any[]).map((x) => ({ id: x.id as string,
        t: [chave(x.first_name), chave(x.last_name), ...String(x.first_name ?? "").split(/\s+/).slice(1).map(chave)].filter((t) => t.length >= 4) }));
      const outrosDe = (sup: string | null) => {
        const k = superJunix(sup).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
        const s2 = ehDiretor ? tokensSub.find((x) => x.t.some((t) => k.includes(t))) : undefined;
        return s2 ? linha(`outros:${s2.id}`, "Sem gerente no Comandra") : linha("outros", "Outros no Junix");
      };
      const { data: gers } = await supabase.from("profiles").select("id,first_name")
        .in("manager_id", [superId!, ...subIds]).eq("role", "MANAGER")
        .eq("is_active", true).order("first_name");
      const gerentes = (gers ?? []) as { id: string; first_name: string | null }[];
      const meusTokens = [chave((eu as any)?.first_name), chave((eu as any)?.last_name)].filter((t) => t.length >= 3);
      const daMinhaSuper = (s: string | null) => {
        if (ehDiretor) return true;
        const k = superJunix(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
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
        supabase.from("junix_vendas" as any).select("gerente,superintendente,vgv,qtd,fora_do_placar")
          .eq("ativo", true).gte("data_venda", de).lte("data_venda", ate),
        supabase.from("junix_pastas" as any).select("gerente,superintendente,dias"),
        ids.length ? todas<any>((a, b) => supabase.from("leads")
          .select("manager_id,source,original_broker_id,fb_page_id,fb_campaign_id")
          .in("manager_id", [superId!, ...subIds, ...ids]).gte("created_at", deIso).range(a, b)) : Promise.resolve([]),
        supabase.rpc("fb_contas_gerentes" as any, { p_de: de }),
        supabase.from("profiles").select("id,manager_id").in("manager_id", [superId!, ...ids]).eq("role", "BROKER"),
      ]);

      for (const r of ((c2s as any).data ?? []) as any[]) {
        const l = linhas.get(r.profile_id); if (!l) continue;
        l.plantaoDias += r.checkins ?? 0; l.visitas += r.atendimentos ?? 0;
      }
      for (const v of ((vendas as any).data ?? []) as any[]) {
        // venda de antes de a super entrar na diretoria (ex.: Adajes antes de 12/10) é do diretor antigo:
        // fica no painel dela, não no placar da diretoria
        if (ehDiretor && v.fora_do_placar) continue;
        const gid = porChave.get(chaveGer(v.gerente));
        if (!gid && !daMinhaSuper(v.superintendente)) continue;
        const l = gid ? linhas.get(gid)! : outrosDe(v.superintendente);
        l.vendas += Number(v.qtd ?? 1); l.vgv += Number(v.vgv ?? 0);
      }
      for (const p of ((pastas as any).data ?? []) as any[]) {
        const gid = porChave.get(chaveGer(p.gerente));
        if (!gid && !daMinhaSuper(p.superintendente)) continue;
        const l = gid ? linhas.get(gid)! : outrosDe(p.superintendente);
        l.pastas += 1; if ((p.dias ?? 0) >= 7) l.pastasTravadas += 1;
      }
      for (const ld of leads as any[]) {
        const l = ld.manager_id === superId ? linha("super", "Direto com você")
          : subIds.includes(ld.manager_id) ? linha(ld.manager_id, "Direto com o super") : linhas.get(ld.manager_id);
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
        .filter((c) => c.owner_id === superId || subIds.includes(c.owner_id) || ids.includes(c.owner_id));
      await Promise.all(minhasContas.map(async (c) => {
        const { data: r, error } = await supabase.functions.invoke("fb-conta-gerente", { body: { owner_id: c.owner_id, de, ate } });
        const l = c.owner_id === superId ? linha("super", "Direto com você")
          : subIds.includes(c.owner_id) ? linha(c.owner_id, "Direto com o super") : linhas.get(c.owner_id)!;
        const fb = (r ?? {}) as any;
        if (error || fb.error || fb.semConta) { l.fbErro = error?.message || fb.motivo || fb.error || "sem acesso"; return; }
        l.gasto = (l.gasto ?? 0) + Number(fb.gasto ?? 0);
        l.leadsFb = (l.leadsFb ?? 0) + Number(fb.leads ?? 0);
      }));

      const ordem = (x: LinhaConsolidado) => (x.id === "super" || subIds.includes(x.id) ? 1 : x.id.startsWith("outros") ? 2 : 0);
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
