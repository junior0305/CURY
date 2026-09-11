// Dados do painel do gerente v10.
//
// O protótipo roda em cima de mock. Este hook é a tradução dele pro que o banco
// realmente tem hoje — e a diferença entre as duas coisas é grande o bastante
// pra estar escrita aqui em vez de escondida:
//
//   · VISITA (a métrica-norte do v10) não existe em `leads`: visit_scheduled_at
//     tem 0 linhas e visita_confirmada idem. O que existe é o evento
//     `funnel_history.VISIT_SCHEDULED` (~109 em 5 meses) e os lançamentos da
//     secretária (`secretary_quick_entries.entry_type='visita'`, que pararam em
//     08/08). Usamos os dois somados e marcamos a origem, porque um número de
//     visita subalimentado mentindo de confiante é pior do que um número honesto.
//   · DINHEIRO por lead não existe em `leads` (commission_value: 6 linhas em 5.720),
//     mas não precisa existir. A conta se fecha por fora:
//       – CUSTO: `capi_effect_snapshots` é um snapshot SEMANAL vivo (todo domingo,
//         9 contas) com gasto e leads_fb por conta de anúncio; `fb_team_map` liga
//         manager_id → account_id. Dá CPL REAL por gerente. Ele varia de R$17 a
//         R$29 entre equipes — usar uma constante única apagaria justamente essa
//         diferença, que é uma das leituras do painel.
//       – RETORNO: ticket médio × percentual de comissão, definidos pelo negócio.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/* Parâmetros do negócio (Junior, 10/09/2026). Ficam aqui como default e podem
   ser sobrescritos em `system_settings` sem tocar no código.
   O protótipo chutava CPL R$38 e comissão R$9.500 — os dois estavam errados. */
export const V10_NEGOCIO = {
  /** R$ — ticket médio de venda. */
  ticketMedio: 300_000,
  /** % do ticket que fica com o CORRETOR. 2,25% de 300k = R$ 6.750. */
  pctCorretor: 2.25,
  /** % do ticket que fica com o GERENTE. 0,97% de 300k = R$ 2.910. */
  pctGerente: 0.97,
  /** R$ — só entra em cena se a equipe não tiver snapshot de gasto nenhum. */
  custoLeadFallback: 25,
};

export interface V10Broker {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  bot_instance_id: string | null;
  lead_assignment_enabled: boolean | null;
  last_seen_at: string | null;
}

export interface V10Lead {
  id: string;
  name: string | null;
  phone: string | null;
  status: string | null;
  broker_id: string | null;
  created_at: string;
  last_interaction_at: string | null;
  last_lead_response_at: string | null;
  last_broker_whatsapp_at: string | null;
  contact_attempts: number | null;
  tag: string | null;
  source: string | null;
  fb_campaign: string | null;
  lead_temperature: string | null;
}

function monthStart() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1);
}

/** Dias ÚTEIS restantes no mês (seg–sex), contando de hoje inclusive.
 *  O ritmo do v10 é por dia útil: dividir por dia corrido inventa capacidade
 *  em fim de semana e faz a meta parecer mais fácil do que é. */
export function diasUteisRestantes(from = new Date()) {
  const end = new Date(from.getFullYear(), from.getMonth() + 1, 0);
  let n = 0;
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (d <= end) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) n++;
    d.setDate(d.getDate() + 1);
  }
  return Math.max(1, n);
}

export function useManagerV10(managerId: string | undefined) {
  return useQuery({
    queryKey: ["v10", managerId],
    enabled: !!managerId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const ms = monthStart().toISOString();
      const msDate = monthStart().toISOString().slice(0, 10);

      const [{ data: manager }, { data: brokersRaw }, { data: settings }, { data: teamMap }] = await Promise.all([
        supabase.from("profiles")
          .select("id, first_name, last_name, bot_instance_id, team_id")
          .eq("id", managerId!).maybeSingle(),
        supabase.from("profiles")
          .select("id, first_name, last_name, phone, bot_instance_id, lead_assignment_enabled, last_seen_at")
          .eq("manager_id", managerId!).eq("role", "BROKER"),
        supabase.from("system_settings")
          .select("key, value")
          .in("key", ["manager_ticket_medio", "manager_pct_corretor", "manager_pct_gerente"]),
        supabase.from("fb_team_map")
          .select("account_id, name").eq("manager_id", managerId!).maybeSingle(),
      ]);

      const brokers = (brokersRaw || []) as V10Broker[];
      const brokerIds = brokers.map((b) => b.id);

      const num = (k: string, fb: number) => {
        const raw = (settings || []).find((s: any) => s.key === k)?.value;
        const n = Number(typeof raw === "string" ? raw.replace(/"/g, "") : raw);
        return Number.isFinite(n) && n > 0 ? n : fb;
      };
      const ticket = num("manager_ticket_medio", V10_NEGOCIO.ticketMedio);
      const pctCorretor = num("manager_pct_corretor", V10_NEGOCIO.pctCorretor);
      const pctGerente = num("manager_pct_gerente", V10_NEGOCIO.pctGerente);

      // CPL real desta equipe. Janela de 42 dias porque o snapshot é SEMANAL:
      // com 30 dias uma semana atrasada derruba a média sem motivo.
      const desde42 = new Date(Date.now() - 42 * 864e5).toISOString().slice(0, 10);
      const accountId = (teamMap as any)?.account_id as string | undefined;
      const snapRes = accountId
        ? await supabase.from("capi_effect_snapshots")
            .select("gasto, leads_fb").eq("account_id", accountId).gte("snapshot_date", desde42)
        : { data: null };
      const snaps = (snapRes.data || []) as { gasto: number | null; leads_fb: number | null }[];
      const gastoTotal = snaps.reduce((a, r) => a + (Number(r.gasto) || 0), 0);
      const leadsFb = snaps.reduce((a, r) => a + (Number(r.leads_fb) || 0), 0);
      const cplReal = leadsFb > 0 ? gastoTotal / leadsFb : null;

      const dinheiro = {
        ticket,
        pctCorretor,
        pctGerente,
        /** R$ que o corretor leva por venda. */
        comissaoCorretor: ticket * (pctCorretor / 100),
        /** R$ que o gerente leva por venda. */
        comissaoGerente: ticket * (pctGerente / 100),
        custoLead: cplReal ?? V10_NEGOCIO.custoLeadFallback,
        /** De onde veio o custo — a tela precisa poder dizer isso. */
        custoLeadFonte: (cplReal ? "meta" : "estimado") as "meta" | "estimado",
        custoLeadJanela: { gasto: gastoTotal, leads: leadsFb, desde: desde42 },
        equipeAds: (teamMap as any)?.name ?? null,
      };

      if (brokerIds.length === 0) {
        return {
          manager, brokers, leads: [] as V10Lead[], dinheiro,
          metaMes: null as number | null,
          vendasMes: 0, vendasSecretaria: 0,
          visitasMes: 0, visitasOrigem: { funil: 0, secretaria: 0 },
          docsMes: 0, leadsMes: 0,
        };
      }

      const [leadsRes, metaRes, vendasSecRes, funilRes, visitaSecRes] = await Promise.all([
        supabase.from("leads")
          .select("id, name, phone, status, broker_id, created_at, last_interaction_at, last_lead_response_at, last_broker_whatsapp_at, contact_attempts, tag, source, fb_campaign, lead_temperature")
          .in("broker_id", brokerIds)
          .order("created_at", { ascending: false })
          .limit(1000),
        manager?.team_id
          ? supabase.from("team_goals").select("sales_target")
              .eq("team_id", manager.team_id).eq("goal_type", "monthly")
              .gte("month", msDate).order("created_at", { ascending: false }).limit(1)
          : Promise.resolve({ data: null } as any),
        // Venda é CONCLUDED + lançamento da secretária: é a definição canônica
        // da casa, e as funções de FUNIL de propósito contam só CONCLUDED.
        supabase.from("secretary_quick_entries")
          .select("quantity, entry_type")
          .in("broker_id", brokerIds).eq("entry_type", "venda").gte("entry_date", msDate),
        supabase.from("funnel_history")
          .select("stage, broker_id").in("broker_id", brokerIds).gte("created_at", ms),
        supabase.from("secretary_quick_entries")
          .select("quantity").in("broker_id", brokerIds)
          .eq("entry_type", "visita").gte("entry_date", msDate),
      ]);

      const leads = (leadsRes.data || []) as V10Lead[];
      const stages = (funilRes.data || []) as { stage: string; broker_id: string | null }[];
      const somaQtd = (rows: any[] | null) =>
        (rows || []).reduce((a, r) => a + (Number(r.quantity) || 1), 0);

      const visitasFunil = stages.filter((s) => s.stage === "VISIT_SCHEDULED").length;
      const visitasSec = somaQtd(visitaSecRes.data);

      // Visitas por corretor: só a parte que tem dono. Os lançamentos da
      // secretária também têm broker_id, mas pararam em 08/08 — somar os dois
      // por corretor misturaria duas janelas de tempo diferentes no mesmo número.
      const visitasPorCorretor = new Map<string, number>();
      stages.forEach((st) => {
        if (st.stage !== "VISIT_SCHEDULED" || !st.broker_id) return;
        visitasPorCorretor.set(st.broker_id, (visitasPorCorretor.get(st.broker_id) || 0) + 1);
      });

      return {
        manager,
        brokers,
        leads,
        dinheiro,
        metaMes: ((metaRes as any)?.data?.[0]?.sales_target ?? null) as number | null,
        vendasMes: leads.filter(
          (l) => l.status === "CONCLUDED" && (l.last_interaction_at || l.created_at) >= ms
        ).length,
        vendasSecretaria: somaQtd(vendasSecRes.data),
        visitasMes: visitasFunil + visitasSec,
        visitasOrigem: { funil: visitasFunil, secretaria: visitasSec },
        docsMes: stages.filter((s) => s.stage === "DOCS_REQUESTED").length,
        visitasPorCorretor,
        leadsMes: leads.filter((l) => l.created_at >= ms).length,
      };
    },
  });
}
