// ManagerV3 — Cockpit do Gestor "Jarvis" (porte do protótipo manager-jarvis.html).
// Página self-contained: CSS do protótipo escopado em #mv3, dados reais via useTeamData.
// Rota: /manager-v3 (ver App.tsx). NÃO substitui /manager (ManagerV2).

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

// ─────────────────────────────────────────────────────────────────────────────
// Hook de dados do time — COPIADO de ManagerV2 (mesmas queries Supabase reais)
// ─────────────────────────────────────────────────────────────────────────────
function useTeamData(managerId: string | undefined) {
  return useQuery({
    queryKey: ["v3-team-data", managerId],
    enabled: !!managerId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [{ data: managerProfile }, { data: brokers }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, first_name, last_name, bot_instance_id, team_id")
          .eq("id", managerId!)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("id, first_name, last_name, phone, bot_instance_id, lead_assignment_enabled")
          .eq("manager_id", managerId!)
          .eq("role", "BROKER"),
      ]);

      const brokerIds = (brokers || []).map((b: any) => b.id);
      let leads: any[] = [];
      if (brokerIds.length > 0) {
        const { data } = await supabase
          .from("leads")
          .select(
            "id, name, phone, status, broker_id, manager_id, created_at, last_interaction_at, last_lead_response_at, last_broker_whatsapp_at, contact_attempts, no_redistribute, negotiating_since, tag, welcome_template_id, welcome_responded_at, followup_started_at, ai_qualification_attempts, ai_qualified_at, lost_reason"
          )
          .in("broker_id", brokerIds)
          .order("created_at", { ascending: false })
          .limit(500);
        leads = data || [];
      }

      const sinCorretor = await supabase
        .from("leads")
        .select("id, name, phone, status, broker_id, manager_id, created_at, last_interaction_at, tag")
        .is("broker_id", null)
        .eq("manager_id", managerId!)
        .order("created_at", { ascending: false })
        .limit(50);

      let monthlyGoal: number | null = null;
      let monthlySales = 0;
      if (managerProfile?.team_id) {
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          .toISOString().slice(0, 10);
        const { data: goalRows } = await supabase
          .from("team_goals")
          .select("sales_target")
          .eq("team_id", managerProfile.team_id)
          .eq("goal_type", "monthly")
          .gte("month", monthStart)
          .order("created_at", { ascending: false })
          .limit(1);
        monthlyGoal = (goalRows as any)?.[0]?.sales_target ?? null;
      }
      if (brokerIds.length > 0) {
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
        const { count } = await supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .in("broker_id", brokerIds)
          .eq("status", "CONCLUDED")
          .gte("last_interaction_at", monthStart);
        monthlySales = count || 0;
      }

      return {
        manager: managerProfile,
        brokers: brokers || [],
        leads,
        unassigned: sinCorretor.data || [],
        monthlyGoal,
        monthlySales,
      };
    },
  });
}

// ─── Coach: última análise por corretor (ai_coach_analysis) ──────────────────
function useCoachData(brokerIds: string[]) {
  return useQuery({
    queryKey: ["v3-coach", brokerIds],
    enabled: brokerIds.length > 0,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_coach_analysis")
        .select("broker_id, quality_score, severity, summary, suggestion, created_at")
        .in("broker_id", brokerIds)
        .order("created_at", { ascending: false })
        .limit(300);
      // Última análise por corretor
      const latest: Record<string, any> = {};
      for (const row of (data as any[]) || []) {
        if (!latest[row.broker_id]) latest[row.broker_id] = row;
      }
      return latest;
    },
  });
}

// ─── Helpers de data/derivação ───────────────────────────────────────────────
const DEAD = new Set(["EXCLUDED", "ABANDONED", "LOST"]);
const PT_MON = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function hoursSince(d?: string | null): number {
  if (!d) return Infinity;
  return (Date.now() - new Date(d).getTime()) / 3_600_000;
}
function isToday(d?: string | null): boolean {
  if (!d) return false;
  const x = new Date(d);
  const n = new Date();
  return x.getDate() === n.getDate() && x.getMonth() === n.getMonth() && x.getFullYear() === n.getFullYear();
}
// Lead "parado": quente (lead respondeu) há +2h e o corretor não respondeu depois
function isStalled(l: any): boolean {
  if (DEAD.has(l.status) || l.status === "CONCLUDED") return false;
  const respH = hoursSince(l.last_lead_response_at);
  if (respH < 2 || respH > 72) return false;
  const brokerH = hoursSince(l.last_broker_whatsapp_at);
  return brokerH > respH;
}
// Segunda-feira 00:00 da semana ISO atual + offset semanas
function mondayOf(offsetWeeks = 0): Date {
  const n = new Date();
  const day = (n.getDay() + 6) % 7; // 0 = segunda
  const mon = new Date(n.getFullYear(), n.getMonth(), n.getDate() - day);
  mon.setDate(mon.getDate() + offsetWeeks * 7);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

// Estágio do funil por status (peso crescente)
function stageRank(status: string): number {
  switch (status) {
    case "CONCLUDED": return 4;
    case "DOCS_REQUESTED": return 3;
    case "VISITA_REALIZADA":
    case "VISIT_SCHEDULED": return 2;
    default: return 1;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────────────────────
export default function ManagerV3() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const { data, isLoading } = useTeamData(userId);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const brokers: any[] = data?.brokers || [];
  const leads: any[] = data?.leads || [];
  const brokerIds = useMemo(() => brokers.map((b) => b.id), [brokers]);
  const { data: coachMap } = useCoachData(brokerIds);

  // ── Estado de UI ────────────────────────────────────────────────────────
  const [period, setPeriod] = useState<"semana" | "mes">("semana");
  const [weekOffset, setWeekOffset] = useState(0);
  const [filaFilter, setFilaFilter] = useState<string | null>(null);
  const [filaOverride, setFilaOverride] = useState<Record<string, boolean>>({});
  const [savedGold, setSavedGold] = useState<Record<string, boolean>>({});
  const [capOpen, setCapOpen] = useState(false);
  const [cmd, setCmd] = useState("");
  const [drawer, setDrawer] = useState<null | "dec" | "log">(null);
  const [voiceIdx, setVoiceIdx] = useState(0);
  const [voiceHtml, setVoiceHtml] = useState<string | null>(null); // resposta do comando sobrescreve o rodízio
  const [orbThink, setOrbThink] = useState(false);
  const [logEntries, setLogEntries] = useState<{ id: number; when: string; html: string }[]>([
    // TODO(ledger de movimento): "Já fiz" hoje deveria vir de um ledger de ações reais do Jarvis.
    { id: 1, when: "há 8min", html: 'Cobrei o <b>Datti</b>: <span class="em">2 leads quentes</span> sem resposta +2h' },
    { id: 2, when: "há 22min", html: 'Redistribui 1 lead órfão → <b>Giorge</b>' },
    { id: 3, when: "há 41min", html: 'Silenciei follow-up de <b>3 leads</b> (opt-out)' },
  ]);
  const logSeq = useRef(100);

  // Throttle de cobrança (proteção do chip do gerente) — igual ManagerV2
  const chargeRef = useRef<{ globalAt: number; perBroker: Map<string, number> }>({ globalAt: 0, perBroker: new Map() });
  const GLOBAL_COOLDOWN_S = 30;
  const BROKER_COOLDOWN_S = 120;

  // Fonte Google (Bricolage / Instrument Sans / JetBrains Mono) — injeta uma vez
  useEffect(() => {
    if (document.querySelector("link[data-mv3-fonts]")) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Instrument+Sans:ital,wght@0,400..700;1,400..600&family=JetBrains+Mono:wght@400;500;700&display=swap";
    link.setAttribute("data-mv3-fonts", "true");
    document.head.appendChild(link);
  }, []);

  // ── Derivações por corretor ──────────────────────────────────────────────
  const enabledOf = (b: any): boolean =>
    filaOverride[b.id] !== undefined ? filaOverride[b.id] : !!b.lead_assignment_enabled;

  const perBroker = useMemo(() => {
    return brokers.map((b) => {
      const mine = leads.filter((l) => l.broker_id === b.id);
      const recebidos = mine.filter((l) => isToday(l.created_at)).length;
      const parados = mine.filter(isStalled).length;
      const lastBrokerActivityH = Math.min(
        ...mine.map((l) => hoursSince(l.last_broker_whatsapp_at)),
        Infinity
      );
      const working = lastBrokerActivityH <= 3;
      return { broker: b, recebidos, parados, working, lastBrokerActivityH, enabled: enabledOf(b) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brokers, leads, filaOverride]);

  // ── KPIs de topo ─────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const recebidosHoje = leads.filter((l) => isToday(l.created_at)).length;
    const parados = leads.filter(isStalled).length;
    const naFila = perBroker.filter((p) => p.enabled).length;
    const vazando = perBroker.filter((p) => p.enabled && !p.working).length;
    return { recebidosHoje, parados, naFila, total: brokers.length, vazando };
  }, [leads, perBroker, brokers.length]);
  // TODO(pool frio): sem fonte fácil no escopo do time; placeholder até ligar cold pool.
  const POOL_FRIO_STUB = 312;
  const POOL_PUXADOS_STUB = 18;

  // ── Ouro apodrecendo (Ana qualificou + parado) ───────────────────────────
  // NOTE: o protótipo usa handoffReason==='ana_gold'. Esse campo não está no select;
  // usamos ai_qualified_at (lead qualificado pela Ana) como sinal de "ouro da Ana".
  const goldLeads = useMemo(() => {
    return leads
      .filter((l) => l.ai_qualified_at && isStalled(l))
      .sort((a, b) => hoursSince(b.last_lead_response_at) - hoursSince(a.last_lead_response_at))
      .slice(0, 4);
  }, [leads]);

  // ── Funil por período (dados reais dos leads carregados) ─────────────────
  const funnel = useMemo(() => {
    let start: Date, end: Date;
    if (period === "semana") {
      start = mondayOf(weekOffset);
      end = new Date(start);
      end.setDate(end.getDate() + 7);
    } else {
      const n = new Date();
      start = new Date(n.getFullYear(), n.getMonth(), 1);
      end = new Date(n.getFullYear(), n.getMonth() + 1, 1);
    }
    const inRange = (d?: string | null) => {
      if (!d) return false;
      const t = new Date(d).getTime();
      return t >= start.getTime() && t < end.getTime();
    };
    const pool = leads.filter((l) => inRange(l.created_at) && !DEAD.has(l.status));
    const leadsN = pool.length;
    const vis = pool.filter((l) => stageRank(l.status) >= 2).length;
    const doc = pool.filter((l) => stageRank(l.status) >= 3).length;
    const vend = pool.filter((l) => l.status === "CONCLUDED").length;
    const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
    return {
      leadsN, vis, doc, vend,
      wLeads: 100,
      wVis: leadsN > 0 ? Math.max(12, Math.round((vis / leadsN) * 100)) : 12,
      wDoc: leadsN > 0 ? Math.max(10, Math.round((doc / leadsN) * 100)) : 10,
      wVend: leadsN > 0 ? Math.max(8, Math.round((vend / leadsN) * 100)) : 8,
      c1: pct(vis, leadsN), c2: pct(doc, vis), c3: pct(vend, doc),
      start, end,
    };
  }, [leads, period, weekOffset]);

  // ── Meta / termômetro ────────────────────────────────────────────────────
  const meta = useMemo(() => {
    if (period === "mes") {
      const done = data?.monthlySales ?? 0;
      const tgt = data?.monthlyGoal ?? 0;
      const falta = Math.max(0, tgt - done);
      const fill = tgt > 0 ? Math.min(100, Math.round((done / tgt) * 100)) : 0;
      return {
        scope: "do mês", done, tgt, falta, fill,
        fcHtml: `faltam <b style="color:var(--text)">${falta}</b> · forecast <b class="warn">${done}</b> 🟡`,
        sub: `${fill}% da meta do mês · dados reais (leads CONCLUDED no mês)`,
      };
    }
    // TODO(meta semanal): números STUB — falta query team_goals goal_type='weekly' da semana ISO.
    const doneW = funnel.vend; // usa vendas reais da semana do funil como aproximação
    const tgtW = 7; // STUB
    const falta = Math.max(0, tgtW - doneW);
    const fill = tgtW > 0 ? Math.min(100, Math.round((doneW / tgtW) * 100)) : 0;
    return {
      scope: "da semana", done: doneW, tgt: tgtW, falta, fill,
      fcHtml: `faltam <b style="color:var(--text)">${falta}</b> · forecast <b class="warn">${doneW}</b> 🟡 <span style="color:var(--faint)">(meta semanal STUB)</span>`,
      sub: `${fill}% da meta da semana · foco nos quentes até domingo`,
    };
  }, [period, funnel.vend, data?.monthlySales, data?.monthlyGoal]);

  const periodLabel = useMemo(() => {
    if (period === "mes") return PT_MON[new Date().getMonth()];
    const s = funnel.start, e = new Date(funnel.end);
    e.setDate(e.getDate() - 1);
    return `${s.getDate()}–${e.getDate()} ${PT_MON[e.getMonth()]}`;
  }, [period, funnel.start, funnel.end]);

  // ── Voz rotativa do Jarvis (derivada) ────────────────────────────────────
  const voiceLines = useMemo(() => {
    const trab = perBroker.filter((p) => p.working).length;
    const vaz = kpi.vazando;
    const nm0 = perBroker.find((p) => p.enabled && !p.working)?.broker?.first_name;
    return [
      `<span class="em">${kpi.naFila} corretores recebendo, só ${trab} trabalhando</span> — ${vaz} caixa${vaz === 1 ? "" : "s"} comendo lead pago à toa.`,
      nm0
        ? `A <span class="hot">${nm0}</span> recebe lead e não abre o painel. Tira da fila?`
        : `Fila equilibrada por enquanto — todo mundo recebendo está trabalhando.`,
      goldLeads.length
        ? `<span class="g">${goldLeads.length} ouro${goldLeads.length === 1 ? "" : "s"} da Ana</span> apodrecendo — cobra quem está sentado neles.`
        : `Nenhum ouro da Ana esfriando agora. 🙌`,
      `Hoje ${kpi.parados} lead${kpi.parados === 1 ? "" : "s"} parado${kpi.parados === 1 ? "" : "s"} +2h. Foco nos quentes.`,
    ];
  }, [perBroker, kpi, goldLeads.length]);

  useEffect(() => {
    const t = setInterval(() => {
      if (voiceHtml) return; // pausa o rodízio enquanto exibe resposta de comando
      setVoiceIdx((i) => (i + 1) % Math.max(1, voiceLines.length));
    }, 5200);
    return () => clearInterval(t);
  }, [voiceHtml, voiceLines.length]);

  const currentVoice = voiceHtml ?? voiceLines[voiceIdx % voiceLines.length] ?? "";

  function jarvisSay(html: string) {
    setOrbThink(true);
    setVoiceHtml(html);
    setTimeout(() => setOrbThink(false), 500);
    // volta ao rodízio após 9s
    window.clearTimeout((jarvisSay as any)._t);
    (jarvisSay as any)._t = window.setTimeout(() => setVoiceHtml(null), 9000);
  }

  // ── Log ("Já fiz") ────────────────────────────────────────────────────────
  function logAction(html: string) {
    setLogEntries((prev) => [{ id: ++logSeq.current, when: "agora", html: `<span class="em">✓</span> ${html}` }, ...prev]);
  }

  // ── Ações reais ───────────────────────────────────────────────────────────
  async function chargeBroker(rawLead: any, customMessage?: string) {
    const broker = brokers.find((b) => b.id === rawLead.broker_id);
    if (!broker) { toast.error("Lead sem corretor"); return; }

    const now = Date.now();
    const globalGap = (now - chargeRef.current.globalAt) / 1000;
    if (globalGap < GLOBAL_COOLDOWN_S) {
      toast.warning(`⏳ Aguarde ${Math.ceil(GLOBAL_COOLDOWN_S - globalGap)}s antes da próxima cobrança (proteção do seu chip)`);
      return;
    }
    const lastForBroker = chargeRef.current.perBroker.get(broker.id) || 0;
    const brokerGap = (now - lastForBroker) / 1000;
    if (brokerGap < BROKER_COOLDOWN_S) {
      toast.warning(`⏳ ${broker.first_name} foi cobrado há pouco. Espere ${Math.ceil(BROKER_COOLDOWN_S - brokerGap)}s.`);
      return;
    }

    const leadName = rawLead.name || rawLead.phone || "Lead";
    await supabase.from("internal_notifications").insert({
      to_id: broker.id,
      from_id: userId,
      type: "MANAGER_NUDGE",
      message: customMessage || `🚨 Atenção em ${leadName} — abra agora.`,
    });
    if (data?.manager?.bot_instance_id && broker.phone) {
      const rawDigits = String(broker.phone).replace(/\D/g, "");
      const phoneNormalized = /^[1-9][1-9][0-9]{8,9}$/.test(rawDigits) ? `55${rawDigits}` : rawDigits;
      try {
        await supabase.functions.invoke("send_whatsapp_message", {
          body: {
            botId: data.manager.bot_instance_id,
            phone: phoneNormalized,
            message: customMessage ||
              `🚨 *Cobrança do gerente*\n\nO lead *${leadName}* (${rawLead.phone}) precisa de você AGORA. Atende, por favor.`,
          },
        });
      } catch { /* notif in-app já garante o aviso */ }
    }
    chargeRef.current.globalAt = Date.now();
    chargeRef.current.perBroker.set(broker.id, Date.now());
    toast.success(`✅ ${broker.first_name} foi cobrado`);
  }

  // Cobra um corretor pelo id (usa um lead parado dele, senão qualquer lead, senão sintético)
  function chargeBrokerById(brokerId: string, customMessage?: string) {
    const mine = leads.filter((l) => l.broker_id === brokerId);
    const target = mine.find(isStalled) || mine[0] || { broker_id: brokerId, name: "", phone: "" };
    return chargeBroker(target, customMessage);
  }

  async function toggleFila(brokerId: string, name: string) {
    const cur = enabledOf({ id: brokerId, lead_assignment_enabled: brokers.find((b) => b.id === brokerId)?.lead_assignment_enabled });
    const next = !cur;
    setFilaOverride((o) => ({ ...o, [brokerId]: next })); // otimista
    const { error } = await supabase.from("profiles").update({ lead_assignment_enabled: next }).eq("id", brokerId);
    if (error) {
      setFilaOverride((o) => ({ ...o, [brokerId]: cur })); // rollback
      toast.error(error.message);
      return;
    }
    if (next) { logAction(`${name} <b>voltou pra fila</b>`); toast.success(`${name} voltou pra fila`); }
    else { logAction(`${name} <b>fora da fila</b>`); toast.warning(`${name} saiu da fila — não recebe mais lead`); }
    queryClient.invalidateQueries({ queryKey: ["v3-team-data"] });
  }

  function saveGold(lead: any) {
    if (savedGold[lead.id]) return;
    setSavedGold((s) => ({ ...s, [lead.id]: true }));
    chargeBrokerById(lead.broker_id, `🥇 *Ouro da Ana esfriando* — o lead *${lead.name || lead.phone}* está qualificado e parado. Atende AGORA.`);
    logAction(`Cobrei em <b>${lead.name || "ouro"}</b> (ouro da Ana esfriando)`);
  }

  // KPI click → filtra fila
  function filterFila(type: string) {
    setFilaFilter((cur) => (cur === type ? null : type));
  }

  // ── Comando por linguagem livre (NLU client-side, sem LLM) ────────────────
  function findBrokerByName(t: string): any | null {
    return brokers.find((b) => {
      const fn = (b.first_name || "").toLowerCase();
      return fn && t.includes(fn);
    }) || null;
  }

  function runCmd(rawInput?: string) {
    const raw = (rawInput ?? cmd).trim();
    if (!raw) return;
    const t = raw.toLowerCase();
    setCmd("");
    setCapOpen(false);
    const b = findBrokerByName(t);
    const nm = b?.first_name || null;

    // AÇÕES
    if (/(cobr|aperta|chama)/.test(t) && b) {
      jarvisSay(`Feito. Mandei a cobrança pra <b>${nm}</b> pelo seu chip e registrei no "Já fiz".`);
      logAction(`Cobrei <b>${nm}</b> (comando)`);
      chargeBrokerById(b.id);
      return;
    }
    if (/(tira|remov|fora|pausa|desativa|tirar)/.test(t) && b) {
      jarvisSay(`Tirei <b>${nm}</b> da fila — não recebe novos leads até você reativar.`);
      if (enabledOf(b)) toggleFila(b.id, nm!);
      return;
    }
    if (/(volta|coloca|ativa|reativa|p[õo]e|bota)/.test(t) && b) {
      jarvisSay(`<b>${nm}</b> voltou pra fila e já pode receber lead.`);
      if (!enabledOf(b)) toggleFila(b.id, nm!);
      return;
    }
    if (/frio/.test(t) && /(solt|distribu|manda|libera)/.test(t)) {
      jarvisSay("Distribuir frios ainda não está ligado nesta tela — o pool frio vive no /cold-pool. (não implementado aqui)");
      return;
    }
    if (/(redistribu|passa|realoc)/.test(t) && b) {
      jarvisSay(`Redistribuição em massa pede confirmação e não está ligada neste console ainda. Use os cards de "Preciso de você".`);
      return;
    }

    // COACH
    if (/(trein|coach|gargalo|perde|onde|raio|melhor|desenvolv|ensina)/.test(t) && b) {
      jarvisSay(`Abri o raio-x do <b>${nm}</b> — leia a última análise do coach.`);
      navigate(`/manager/coach/${b.id}`);
      return;
    }
    if (/(trein|coach|desenvolv|ensina|quem treinar)/.test(t)) {
      const worst = coachRank[0];
      if (worst) {
        jarvisSay(`Hoje treina o <b style="color:var(--violet)">${worst.name}</b> (menor score). Abri o raio-x.`);
        navigate(`/manager/coach/${worst.brokerId}`);
      } else jarvisSay("Sem análises de coach ainda pra priorizar treino.");
      return;
    }

    // PERGUNTAS (respondidas de dados reais derivados)
    if (/(vend|fech|meta)/.test(t)) {
      jarvisSay(`No mês: <b>${data?.monthlySales ?? 0}${data?.monthlyGoal ? " de " + data.monthlyGoal : ""}</b>. Nesta ${period === "mes" ? "visão" : "semana"} o funil marca <b>${funnel.vend}</b> venda(s).`);
      return;
    }
    if (/parad/.test(t)) {
      jarvisSay(`<b class="hot">${kpi.parados} leads parados</b> +2h agora. Veja a fila abaixo — os que vazam concentram os parados.`);
      return;
    }
    if (/(quem.*trabalh|trabalh.*quem|quem.*ativ|pulso)/.test(t)) {
      const trab = perBroker.filter((p) => p.working).map((p) => p.broker.first_name).filter(Boolean);
      const vaz = perBroker.filter((p) => p.enabled && !p.working).map((p) => p.broker.first_name).filter(Boolean);
      jarvisSay(`No ritmo: <b>${trab.join(", ") || "ninguém ainda"}</b>. ${vaz.length ? `Parados/vazando: <b class="hot">${vaz.join(", ")}</b>.` : ""}`);
      return;
    }
    if (/pool/.test(t)) {
      jarvisSay(`Pool de frios ainda é STUB nesta tela (~${POOL_FRIO_STUB}). Fonte real fica no /cold-pool.`);
      return;
    }
    if (b) {
      const c = coachMap?.[b.id];
      jarvisSay(`<b>${nm}</b>: ${c?.quality_score != null ? `score ${c.quality_score}` : "sem score do coach ainda"}. ${c?.summary || "Abrindo o raio-x."}`);
      navigate(`/manager/coach/${b.id}`);
      return;
    }

    jarvisSay(`Entendi <i>"${raw}"</i>, mas isso ainda não está ligado neste console. Sei: cobrar, tirar/pôr na fila, treinar e perguntas de vendas/parados/pulso.`);
  }

  // ── Coach ranking (pior primeiro) ────────────────────────────────────────
  const coachRank = useMemo(() => {
    return brokers
      .map((b) => {
        const c = coachMap?.[b.id];
        return {
          brokerId: b.id,
          name: b.first_name || "—",
          // TODO(coach): quando não há ai_coach_analysis, score STUB=null; gargalo/prob/train STUB.
          q: c?.quality_score ?? null,
          gap: c?.severity || "sem análise",
          prob: c?.summary || "Sem análise do coach ainda para este corretor.",
          train: c?.suggestion || "Rodar o processador de coach para gerar sugestão.",
        };
      })
      .sort((a, b) => (a.q ?? -1) - (b.q ?? -1));
  }, [brokers, coachMap]);

  function qColor(q: number | null): string {
    if (q == null) return "var(--faint)";
    return q >= 80 ? "var(--done)" : q >= 65 ? "var(--gold)" : q >= 52 ? "var(--decision)" : "var(--danger)";
  }
  function gapClass(gap: string): string {
    const g = (gap || "").toLowerCase();
    if (g.includes("bank") || g.includes("doc")) return "g-bank";
    if (g.includes("close") || g.includes("visit")) return "g-close";
    if (g.includes("qual")) return "g-qual";
    if (g.includes("top") || g.includes("bench")) return "g-top";
    return "g-open";
  }

  // Decisões "Preciso de você" — derivadas de sinais reais
  const decisions = useMemo(() => {
    const out: { id: string; kind: string; tags: string[]; body: string; why: string }[] = [];
    const vazando = perBroker.filter((p) => p.enabled && !p.working);
    if (vazando.length > 0) {
      const nomes = vazando.map((p) => p.broker.first_name).filter(Boolean).join(", ");
      out.push({
        id: "d-vaz", kind: "k-broker", tags: ["🩸 vazamento", "capacidade"],
        body: `<b>${vazando.length} corretor(es) recebem lead e não trabalham</b> (${nomes}). Tudo que entra pra eles morre.`,
        why: "Sem toque recente do corretor (chip parado/offline). Cada lead parado é dinheiro pago apodrecendo.",
      });
    }
    if (goldLeads.length > 0) {
      const g = goldLeads[0];
      const bk = brokers.find((b) => b.id === g.broker_id);
      out.push({
        id: "d-gold", kind: "k-gold", tags: ["🥇 ouro da ana", `esfriando · ${Math.round(hoursSince(g.last_lead_response_at))}h`],
        body: `<b class="g">${g.name || "Lead"}</b> (qualificado pela Ana) parado com <b>${bk?.first_name || "corretor"}</b>.`,
        why: "Ouro da Ana converte mais e perde valor a cada hora sem toque.",
      });
    }
    if ((data?.monthlyGoal ?? 0) > (data?.monthlySales ?? 0)) {
      out.push({
        id: "d-meta", kind: "k-meta", tags: ["🎯 meta em risco"],
        body: `Faltam <b>${(data!.monthlyGoal! - (data!.monthlySales || 0))} vendas</b> no mês. Ritmo atual: <b class="h">${data?.monthlySales ?? 0}</b>.`,
        why: "Priorizando os quentes + cobrando quem senta neles, o forecast sobe.",
      });
    }
    return out;
  }, [perBroker, goldLeads, brokers, data]);

  const pillNeed = decisions.length;

  // ── Loading ────────────────────────────────────────────────────────────────
  if (!userId || isLoading || !data) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#06090F", color: "#8B93A7", fontFamily: "system-ui" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
          <Sparkles className="w-4 h-4 animate-pulse" /> carregando cockpit…
        </div>
      </div>
    );
  }

  const teamName = `${data.manager?.first_name || "Equipe"}`;
  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR", { weekday: "short" }) + " · " +
    now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  // Filtro da fila aplicado
  const filaRows = perBroker.filter((p) => {
    if (!filaFilter) return true;
    if (filaFilter === "parados") return p.parados > 0;
    if (filaFilter === "vazando") return p.enabled && !p.working;
    if (filaFilter === "fila") return p.enabled;
    if (filaFilter === "recebidos") return p.recebidos > 0;
    return true;
  });

  const funnelStages = [
    { cls: "s1", fn: "Leads", fv: funnel.leadsN, w: funnel.wLeads },
    { cls: "s2", fn: "Visitas", fv: funnel.vis, w: funnel.wVis },
    { cls: "s3", fn: "Documentação", fv: funnel.doc, w: funnel.wDoc },
    { cls: "s4", fn: "Vendas", fv: funnel.vend, w: funnel.wVend },
  ];

  return (
    <div id="mv3">
      <style>{MV3_CSS}</style>

      <div className="bg-layers" />
      <div className="grid-lines" />
      <div className="grain" />

      {/* ── Header ── */}
      <header>
        <div className="head-in">
          <div className="brandline">
            <div className="logo">comandra<b>.</b></div>
            <span className="gov"><span className="live" /> governando · ao vivo</span>
          </div>
          <div className="head-r">
            <div className="metastat">Equipe <b>{teamName}</b> · {brokers.length} corretores<br />{dateStr}</div>
            <ThemeToggle compact />
            <div className="avatar">{(teamName[0] || "G").toUpperCase()}</div>
          </div>
        </div>
      </header>

      <div className="wrap">
        {/* ── BRAIN CONSOLE ── */}
        <div className="brainbar rv" style={{ animationDelay: ".04s" }}>
          <div className="bb-top">
            <div className={"orb-mini" + (orbThink ? " think" : "")}>
              <div className="ring" /><div className="ring r2" /><div className="core" />
            </div>
            <div className="bb-voice">
              <div className="lbl">comandra · segundo cérebro</div>
              <div className="txt" dangerouslySetInnerHTML={{ __html: currentVoice }} />
            </div>
            <div className="bb-pills">
              <button className="pill need" onClick={() => setDrawer("dec")}><span className="b">{pillNeed}</span> Preciso de você</button>
              <button className="pill done" onClick={() => setDrawer("log")}><span className="b">{logEntries.length}</span> Já fiz</button>
            </div>
          </div>
          <div className="bb-cmd">
            <div className="cmdfield">
              <span className="arrow">▸</span>
              <input
                value={cmd}
                onChange={(e) => setCmd(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") runCmd(); }}
                autoComplete="off"
                placeholder={'Pergunte ou mande: "cobra a Luciene", "quantas vendas hoje?", "tira o Datti da fila", "o que treinar hoje?"'}
              />
            </div>
            <button className="cmd-menu-btn" onClick={(e) => { e.stopPropagation(); setCapOpen((v) => !v); }}>⌘ como ajudo ▾</button>
            <button className="cmd-send" onClick={() => runCmd()}>➤</button>

            <div className={"capmenu" + (capOpen ? " open" : "")}>
              <div className="capgrid">
                <div className="capcol ask">
                  <h4>📊 Perguntar</h4>
                  <button onClick={() => runCmd("quantas vendas hoje?")}><b>Quantas vendas</b> hoje / no mês?</button>
                  <button onClick={() => runCmd("quem está parado?")}><b>Quem está parado</b> agora?</button>
                  <button onClick={() => runCmd("quem está trabalhando?")}><b>Pulso</b> do time</button>
                  <button onClick={() => runCmd("quanto tem no pool de frios?")}>Quanto tem no <b>pool de frios</b>?</button>
                </div>
                <div className="capcol act">
                  <h4>⚡ Mandar fazer</h4>
                  <button onClick={() => setCmd("cobra a ")}><b>Cobrar</b> um corretor</button>
                  <button onClick={() => setCmd("tira o ")}><b>Tirar/pôr</b> alguém na fila</button>
                  <button onClick={() => runCmd("solta frios pra quem trabalha")}><b>Soltar frios</b> pra quem trabalha</button>
                  <button onClick={() => setCmd("redistribui os leads da ")}><b>Redistribuir</b> leads parados</button>
                </div>
                <div className="capcol coach">
                  <h4>🎓 Coach</h4>
                  <button onClick={() => runCmd("o que treinar hoje?")}><b>O que treinar</b> hoje?</button>
                  <button onClick={() => setCmd("onde o ")}><b>Onde perde</b> no funil?</button>
                  <button onClick={() => runCmd("quem é meu melhor corretor?")}>Quem é meu <b>benchmark</b>?</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── KPI ── */}
        <div className="kpis rv" style={{ animationDelay: ".10s" }}>
          <div className={"kpi" + (filaFilter === "recebidos" ? " active" : "")} onClick={() => filterFila("recebidos")}>
            <div className="k-lbl">📥 recebidos hoje</div><div className="k-val">{kpi.recebidosHoje}</div><div className="k-sub">no dia</div>
          </div>
          <div className={"kpi" + (filaFilter === "parados" ? " active" : "")} onClick={() => filterFila("parados")}>
            <div className="k-lbl">⏸ parados</div><div className="k-val">{kpi.parados}</div><div className="k-sub down">+2h sem toque</div>
          </div>
          <div className={"kpi" + (filaFilter === "fila" ? " active" : "")} onClick={() => filterFila("fila")}>
            <div className="k-lbl">🟢 na fila</div><div className="k-val">{kpi.naFila}<small>/{kpi.total}</small></div><div className="k-sub">recebendo lead</div>
          </div>
          <div className={"kpi leak" + (filaFilter === "vazando" ? " active" : "")} onClick={() => filterFila("vazando")}>
            <div className="k-lbl">🩸 vazando</div><div className="k-val">{kpi.vazando}</div><div className="k-sub down">recebem mas param</div>
          </div>
          {/* TODO(pool frio): número real do cold pool */}
          <div className="kpi" onClick={() => toast(`${POOL_FRIO_STUB} frios no pool (STUB) — role até o card Pool de leads frios`)}>
            <div className="k-lbl">🧊 pool frio</div><div className="k-val">{POOL_FRIO_STUB}</div><div className="k-sub">{POOL_PUXADOS_STUB} puxados hoje · STUB</div>
          </div>
        </div>

        {/* ── RESULTADOS ── */}
        <div className="results rv" style={{ animationDelay: ".11s" }}>
          <div className="res-head">
            <div className="res-title">📊 Resultados</div>
            <div className="period">
              <button className={"pbtn" + (period === "semana" ? " active" : "")} onClick={() => setPeriod("semana")}>Semana · Seg–Dom</button>
              <button className={"pbtn" + (period === "mes" ? " active" : "")} onClick={() => setPeriod("mes")}>Mês</button>
            </div>
            <div className="res-when">
              <span className={"navw" + (period === "mes" ? " hidden" : "")} onClick={() => setWeekOffset((w) => w - 1)}>‹</span>
              <span>{periodLabel}</span>
              <span className={"navw" + (period === "mes" ? " hidden" : "")} onClick={() => setWeekOffset((w) => Math.min(0, w + 1))}>›</span>
            </div>
          </div>
          <div className="meta-hero big-hero">
            <div className="mh-top">
              <div><div className="mh-lbl">🎯 Meta <span>{meta.scope}</span></div><div className="mh-big">{meta.done}<small>/{meta.tgt}</small></div></div>
              <div className="mh-fc" dangerouslySetInnerHTML={{ __html: meta.fcHtml }} />
            </div>
            <div className="mh-thermo"><div className="mh-fill" style={{ width: meta.fill + "%" }} /></div>
            <div className="mh-sub">{meta.sub}</div>
          </div>
        </div>

        {/* ── OPERAÇÃO: funil | fila ── */}
        <div className="oprow rv" style={{ animationDelay: ".13s" }}>
          <div className="funnel-col">
            <div className="panel">
              <div className="ph"><h3>Funil de vendas · <span>{period === "mes" ? "mês" : "semana"}</span></h3><span className="n">conversão</span></div>
              <div className="funnel">
                {funnelStages.map((s, i) => (
                  <div key={s.cls}>
                    <div className="fstage"><div className={"fbar " + s.cls} style={{ width: s.w + "%" }}><span className="fn">{s.fn}</span><span className="fv">{s.fv}</span></div></div>
                    {i === 0 && <div className="fconv">{funnel.c1}% viram visita</div>}
                    {i === 1 && <div className="fconv">{funnel.c2}% entregam documento</div>}
                    {i === 2 && <div className="fconv">{funnel.c3}% fecham</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="sec-h rv" style={{ animationDelay: ".16s" }}>
              <h2>Fila de recebimento · quem está trabalhando</h2><div className="rule" />
              <span className="count">{kpi.naFila} na fila</span>
            </div>
            {filaFilter && (
              <div className="filterchip" style={{ display: "inline-flex" }}>
                filtrando por <b style={{ color: "var(--text)" }}>{filaFilter}</b> · {filaRows.length} corretor{filaRows.length === 1 ? "" : "es"}
                <span style={{ cursor: "pointer", color: "var(--faint)", border: "1px solid var(--border)", borderRadius: 5, padding: "1px 7px", marginLeft: 6 }} onClick={() => setFilaFilter(null)}>✕ limpar</span>
              </div>
            )}
            <div className="fila rv" style={{ animationDelay: ".2s" }}>
              <div className="frow head"><span>status</span><span>corretor</span><span>hoje</span><span>parados</span><span style={{ textAlign: "right" }}>na fila</span></div>
              {filaRows.map((p) => {
                const enabled = p.enabled;
                const dot = !enabled ? "paused" : p.working ? "on" : (p.parados > 0 ? "slow" : "off");
                const leak = enabled && !p.working;
                let stTxt = "trabalhando", stWarn = false;
                if (!enabled) { stTxt = "fora da fila"; }
                else if (!p.working) { stTxt = `🩸 recebe mas não trabalha${p.parados ? ` · ${p.parados} parado${p.parados === 1 ? "" : "s"}` : ""}`; stWarn = true; }
                else if (p.parados > 0) { stTxt = `lento · ${p.parados} quente${p.parados === 1 ? "" : "s"} parado${p.parados === 1 ? "" : "s"}`; stWarn = true; }
                const name = p.broker.first_name || "—";
                return (
                  <div key={p.broker.id} className={"frow" + (leak ? " leak-row" : "") + (!enabled ? " paused" : "")}>
                    <div className="who-cell"><span className={"sdot " + dot} /></div>
                    <div className="who-cell"><div><div className="nm">{name}</div><div className={"st" + (stWarn ? " warn" : "")}>{stTxt}</div></div></div>
                    <div className="fcell"><b>{p.recebidos}</b><small>recebidos</small></div>
                    <div className={"fcell" + (p.parados > 0 ? " warn" : "")}><b>{p.parados}</b><small>parado{p.parados === 1 ? "" : "s"}</small></div>
                    <div style={{ textAlign: "right" }}>
                      <span className={"tgl" + (!enabled ? " out" : "")} onClick={() => toggleFila(p.broker.id, name)}>
                        <span className="tlbl">{enabled ? "recebendo" : "fora"}</span>
                        <span className="track"><span className="knob" /></span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 9 }}>
              <button className="btn primary sm" onClick={() => {
                const vaz = perBroker.filter((p) => p.enabled && !p.working);
                vaz.forEach((p) => toggleFila(p.broker.id, p.broker.first_name || "—"));
                if (vaz.length) toast.warning(`${vaz.length} caixa(s) vazando fora da fila`);
                else toast("Ninguém vazando agora");
              }}>Tirar da fila quem vaza</button>
            </div>
          </div>
        </div>

        {/* ── EFETIVIDADE (STUB) ── */}
        {/* TODO(ledger de movimento): substituir por dados reais — não existe ledger de quem moveu o funil hoje. */}
        <div className="efband rv" style={{ animationDelay: ".16s" }}>
          <div className="efbox">
            <h3>O que andou hoje <span className="tot">STUB · sem ledger de movimento</span></h3>
            <div className="movbar">
              <span className="m-jarvis" style={{ flex: 14 }} title="Jarvis">14</span>
              <span className="m-brk" style={{ flex: 9 }} title="Corretor">9</span>
              <span className="m-ana" style={{ flex: 6 }} title="Ana">6</span>
            </div>
            <div className="movleg">
              <div className="lg"><span className="sw" style={{ background: "var(--brain)" }} />Jarvis moveu <b style={{ color: "var(--text)" }}>14</b> — STUB</div>
              <div className="lg"><span className="sw" style={{ background: "#6E9BFF" }} />Corretor moveu <b style={{ color: "var(--text)" }}>9</b> — STUB</div>
              <div className="lg"><span className="sw" style={{ background: "var(--gold)" }} />Ana moveu <b style={{ color: "var(--text)" }}>6</b> — STUB</div>
            </div>
          </div>
          <div className="efbox guarantee">
            {/* TODO(ledger de movimento): "contato garantido" precisa do ledger real. */}
            <h3>Contato garantido <span className="tot">STUB</span></h3>
            <div className="gbig">{kpi.recebidosHoje}<small>/{kpi.recebidosHoje}</small></div>
            <div className="gnote">recebidos hoje (real). <b>Cobertura por Jarvis/Ana</b> = STUB até haver ledger.</div>
          </div>
        </div>

        {/* ── NÚMEROS: pool frio | ouro apodrecendo ── */}
        <div className="sec-h rv" style={{ animationDelay: ".22s" }}><h2>Números que sustentam a operação</h2><div className="rule" /><span className="count">frios · ouro</span></div>
        <div className="trio duo">
          {/* Pool frio — STUB */}
          <div className="panel rv" style={{ animationDelay: ".24s" }}>
            <div className="ph"><h3><span className="dotc frio" /> Pool de leads frios</h3><span className="n">STUB</span></div>
            <div className="pool-top"><div className="big">{POOL_FRIO_STUB}</div><div className="lb">no pool · <b>{POOL_PUXADOS_STUB}</b> puxados hoje<br /><span style={{ color: "var(--faint)" }}>TODO: ligar cold pool real</span></div></div>
            <ul className="pool" style={{ listStyle: "none" }}>
              <li><span className="rank">—</span><div><div className="pn" style={{ color: "var(--muted)" }}>Ranking de quem puxa frio <small>STUB — sem fonte no escopo do time</small></div></div><span className="pv zero">0</span></li>
            </ul>
            <div style={{ marginTop: 12 }}><button className="btn brain wide sm" onClick={() => toast("Distribuição de frios vive no /cold-pool (não ligada aqui)")}>Soltar frios pra quem trabalha</button></div>
          </div>

          {/* Ouro apodrecendo — REAL (ai_qualified_at + parado) */}
          <div className="panel rv" style={{ animationDelay: ".28s" }}>
            <div className="ph"><h3><span className="dotc gold" /> Ouro apodrecendo</h3><span className="n">{goldLeads.length} lead(s)</span></div>
            {goldLeads.length === 0 && <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", padding: "10px 0" }}>Nenhum ouro da Ana esfriando agora. 🙌</div>}
            {goldLeads.map((g) => {
              const bk = brokers.find((b) => b.id === g.broker_id);
              const h = Math.round(hoursSince(g.last_lead_response_at));
              const decay = Math.min(90, h * 6); // quanto mais horas, mais apodrece
              const saved = savedGold[g.id];
              return (
                <div key={g.id} className={"ouro-mini" + (saved ? " saved" : "")}>
                  <div className="on">{g.name || "Lead"} <span className="goldbadge">OURO ANA</span></div>
                  <div className="ov">{g.phone || ""}</div>
                  <div className="om">com <b>{bk?.first_name || "corretor"}</b> · <span className="h">{h}h</span> sem toque</div>
                  <div className="odecay"><div className="lv" style={{ width: (saved ? 100 : 100 - decay) + "%" }} /></div>
                  <div className="obtn"><button className="btn gold sm" disabled={saved} style={saved ? { opacity: 0.4, pointerEvents: "none" } : undefined} onClick={() => saveGold(g)}>{saved ? "✓ cobrado" : `Cobrar ${bk?.first_name || ""}`}</button></div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── COACH ── */}
        <div className="sec-h rv" style={{ animationDelay: ".2s" }}><h2>Quem treinar hoje · o Jarvis leu as conversas</h2><div className="rule" /><span className="count coach">por gargalo</span></div>
        <div className="coachstrip rv" style={{ animationDelay: ".24s" }}>
          {coachRank.map((c) => {
            const gc = gapClass(c.gap);
            const col = qColor(c.q);
            return (
              <div key={c.brokerId} className={"ccard " + gc} onClick={() => navigate(`/manager/coach/${c.brokerId}`)}>
                <div className="ch">
                  <div className="cn">{c.name}</div>
                  <div className="qring" style={{ width: 38, height: 38, background: `conic-gradient(${col} ${c.q ?? 0}%,rgba(255,255,255,.07) 0)`, color: col }}>
                    <span style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--card-solid)", display: "grid", placeItems: "center" }}>{c.q ?? "—"}</span>
                  </div>
                </div>
                <span className={"gap " + gc}>{c.gap}</span>
                <div className="prob">{c.prob}</div>
                <div className="train"><span className="tl">treina:</span><span>{c.train}</span></div>
              </div>
            );
          })}
        </div>

        {/* ── MOTOR (STUB) ── */}
        {/* TODO: mapear pra tabelas reais (welcome_responded_at, ai_qualification, disparos, follow-up, broker_kit). */}
        <div className="sec-h rv" style={{ animationDelay: ".2s" }}><h2>Motor rodando · está funcionando?</h2><div className="rule" /><span className="count">agentes · STUB</span></div>
        <div className="autostrip rv" style={{ animationDelay: ".24s" }}>
          <div className="acard">
            <div className="ah"><div className="an">🤖 Ana <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--faint)" }}>SDR</span></div><span className="status on"><span className="dotc done" />rodando</span></div>
            <div className="abig">6<small> qualificados</small></div><div className="asub">STUB — ligar ai_qualified_at do dia</div>
          </div>
          <div className="acard">
            <div className="ah"><div className="an">📣 Disparos</div><span className="status on"><span className="dotc done" />rodando</span></div>
            <div className="abig">18<small> voltaram</small></div><div className="asub">STUB</div>
          </div>
          <div className="acard">
            <div className="ah"><div className="an">👋 Boas-vindas</div><span className="status on"><span className="dotc done" />rodando</span></div>
            <div className="abig">61%<small> resposta</small></div><div className="asub">STUB — welcome_responded_at</div><div className="abar"><i style={{ width: "61%" }} /></div>
          </div>
          <div className="acard">
            <div className="ah"><div className="an">🔁 Follow-up</div><span className="status on"><span className="dotc done" />rodando</span></div>
            <div className="abig">47<small> disparados</small></div><div className="asub">STUB — followup_started_at</div><div className="abar"><i style={{ width: "26%" }} /></div>
          </div>
          <div className="acard">
            <div className="ah"><div className="an">🎤 Setup corretor</div><span className="status warn">STUB</span></div>
            <div className="abig">4<small>/6 kits</small></div><div className="asub">STUB — comandra_broker_kit</div>
          </div>
        </div>

        <div className="protonote">Cockpit do Gestor v3 · dados reais (fila, funil, meta mês, ouro, coach) + seções STUB marcadas</div>
      </div>

      {/* ── DRAWERS ── */}
      <div className={"scrim" + (drawer ? " open" : "")} onClick={() => setDrawer(null)} />

      <div className={"drawer" + (drawer === "dec" ? " open" : "")}>
        <div className="dh"><h3>⚠ Preciso de você <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>{pillNeed}</span></h3><div className="x" onClick={() => setDrawer(null)}>×</div></div>
        <div className="dbody">
          {decisions.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)", padding: 12 }}>Nada pendente agora. 🙌</div>}
          {decisions.map((d) => (
            <div key={d.id} className={"dcard " + d.kind}>
              <div className="tagrow">{d.tags.map((t, i) => <span key={i} className={"chip " + (i === 0 ? d.kind.replace("k-", "") : "ghost")}>{t}</span>)}</div>
              <div className="body" dangerouslySetInnerHTML={{ __html: d.body }} />
              <div className="why"><span className="lbl">por quê:</span> {d.why}</div>
              <div className="acts">
                {d.id === "d-vaz" && <button className="btn primary sm" onClick={() => { perBroker.filter((p) => p.enabled && !p.working).forEach((p) => toggleFila(p.broker.id, p.broker.first_name || "—")); setDrawer(null); }}>Tirar da fila</button>}
                {d.id === "d-gold" && <button className="btn gold sm" onClick={() => { if (goldLeads[0]) saveGold(goldLeads[0]); setDrawer(null); }}>Cobrar</button>}
                {d.id === "d-meta" && <button className="btn brain sm" onClick={() => { toast("Priorização de quentes: use os cards de fila/ouro"); setDrawer(null); }}>Ver plano</button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={"drawer" + (drawer === "log" ? " open" : "")}>
        <div className="dh"><h3><span className="dotc done" /> Já fiz por você <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>{logEntries.length} hoje</span></h3><div className="x" onClick={() => setDrawer(null)}>×</div></div>
        <div className="dbody"><ul className="log">
          {logEntries.map((e) => (
            <li key={e.id}><span className="when">{e.when}</span><span className="act" dangerouslySetInnerHTML={{ __html: e.html }} /></li>
          ))}
        </ul></div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS do protótipo — TODO escopado em #mv3. Vars em #mv3 (não :root).
// Light theme: :root[data-theme="light"] #mv3 ... (app seta data-theme no <html>).
// Keyframes renomeados com prefixo mv3 pra evitar colisão global.
// ─────────────────────────────────────────────────────────────────────────────
const MV3_CSS = `
#mv3{
  --bg:#06090F;--bg2:#0A0E1A;
  --surface:rgba(255,255,255,.028);--surface-2:rgba(255,255,255,.05);
  --border:rgba(255,255,255,.075);--border-2:rgba(255,255,255,.13);
  --text:#EAEEF6;--muted:#8B93A7;--faint:#575F73;
  --brain:#37E0D0;--brain-dim:#1a8a80;--decision:#6E9BFF;
  --gold:#F4C63A;--gold-hi:#FFE595;--rust:#9C4A22;--rust-deep:#5E2A11;
  --danger:#FF6A57;--done:#38D6A0;--violet:#B990FF;
  --card-solid:#0b1120;
  --sans:"Instrument Sans",system-ui,sans-serif;
  --disp:"Bricolage Grotesque",system-ui,sans-serif;
  --mono:"JetBrains Mono",ui-monospace,monospace;
  position:relative;font-family:var(--sans);color:var(--text);background:var(--bg);min-height:100vh;overflow-x:hidden;-webkit-font-smoothing:antialiased;line-height:1.45
}
:root[data-theme="light"] #mv3{
  --bg:#EDF1F8;--bg2:#E2E8F2;
  --surface:rgba(18,28,48,.045);--surface-2:rgba(18,28,48,.08);
  --border:rgba(18,28,48,.12);--border-2:rgba(18,28,48,.2);
  --text:#131B28;--muted:#57617A;--faint:#949EB2;
  --brain:#0E9E90;--brain-dim:#0a6d63;--decision:#3B6FE0;
  --gold:#C4870C;--gold-hi:#8A6300;
  --danger:#DE3A27;--done:#12A576;--violet:#7C4DD6;
  --card-solid:#ffffff;
}
:root[data-theme="light"] #mv3 .bg-layers::before{background:radial-gradient(ellipse 70% 50% at 22% -5%,rgba(14,158,144,.10),transparent 60%),radial-gradient(ellipse 60% 55% at 92% 6%,rgba(59,111,224,.09),transparent 62%),linear-gradient(180deg,#EDF1F8,#E6ECF5 60%,#EDF1F8)}
:root[data-theme="light"] #mv3 .grid-lines{background-image:linear-gradient(rgba(18,28,48,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(18,28,48,.035) 1px,transparent 1px)}
:root[data-theme="light"] #mv3 .grain{opacity:.018}
:root[data-theme="light"] #mv3 header{background:linear-gradient(180deg,rgba(237,241,248,.92),rgba(237,241,248,.55))}
:root[data-theme="light"] #mv3 .cmdfield{background:rgba(255,255,255,.8)}
:root[data-theme="light"] #mv3 .period{background:rgba(255,255,255,.7)}
:root[data-theme="light"] #mv3 .mh-thermo,:root[data-theme="light"] #mv3 .thermo,:root[data-theme="light"] #mv3 .abar,:root[data-theme="light"] #mv3 .barmini{background:rgba(18,28,48,.09)}
:root[data-theme="light"] #mv3 .tgl.out .track{background:rgba(18,28,48,.09)}
:root[data-theme="light"] #mv3 .bub.lead{background:rgba(18,28,48,.06)}
:root[data-theme="light"] #mv3 .avatar{background:linear-gradient(135deg,#dfe7f2,#cdd8e8);color:#0E9E90}
:root[data-theme="light"] #mv3 .fbar.s2{color:#04231f}
:root[data-theme="light"] #mv3 .pill.need{color:#c02a19}
:root[data-theme="light"] #mv3 .pill.done{color:#0a7355}
:root[data-theme="light"] #mv3 .bb-voice .txt .em{color:var(--brain-dim)}
:root[data-theme="light"] #mv3 .gap.g-qual{color:#2c5bd0}
:root[data-theme="light"] #mv3 .gap.g-close{color:#c0301c}
:root[data-theme="light"] #mv3 .gap.g-bank{color:#6b3fc0}
:root[data-theme="light"] #mv3 .gap.g-top{color:#0a7355}
:root[data-theme="light"] #mv3 .goldbadge{color:#3a2a00}
#mv3 *{box-sizing:border-box;margin:0;padding:0}
#mv3 .bg-layers{position:fixed;inset:0;z-index:-2;pointer-events:none}
#mv3 .bg-layers::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse 70% 50% at 22% -5%,rgba(55,224,208,.09),transparent 60%),radial-gradient(ellipse 60% 55% at 92% 6%,rgba(110,155,255,.07),transparent 62%),linear-gradient(180deg,#06090F 0%,#0A0E1A 46%,#070B14 100%)}
#mv3 .grain{position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.045;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
#mv3 .grid-lines{position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.4;background-image:linear-gradient(rgba(255,255,255,.016) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.016) 1px,transparent 1px);background-size:64px 64px;mask-image:radial-gradient(ellipse 80% 60% at 50% 10%,#000,transparent 85%)}
#mv3 .wrap{max-width:1280px;margin:0 auto;padding:0 22px 90px}

#mv3 header{position:sticky;top:0;z-index:40;backdrop-filter:blur(18px);background:linear-gradient(180deg,rgba(6,9,15,.9),rgba(6,9,15,.6));border-bottom:1px solid var(--border)}
#mv3 .head-in{max-width:1280px;margin:0 auto;padding:12px 22px;display:flex;align-items:center;justify-content:space-between;gap:18px}
#mv3 .brandline{display:flex;align-items:center;gap:13px}
#mv3 .logo{font-family:var(--disp);font-weight:800;font-size:19px;letter-spacing:-.02em}#mv3 .logo b{color:var(--brain)}
#mv3 .gov{display:inline-flex;align-items:center;gap:7px;font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--brain);background:rgba(55,224,208,.08);border:1px solid rgba(55,224,208,.25);padding:5px 10px;border-radius:999px}
#mv3 .gov .live{width:6px;height:6px;border-radius:50%;background:var(--brain);animation:mv3pulse 2.4s infinite}
@keyframes mv3pulse{0%{box-shadow:0 0 0 0 rgba(55,224,208,.5)}70%{box-shadow:0 0 0 7px rgba(55,224,208,0)}100%{box-shadow:0 0 0 0 rgba(55,224,208,0)}}
#mv3 .head-r{display:flex;align-items:center;gap:16px}
#mv3 .metastat{text-align:right;font-family:var(--mono);font-size:11px;color:var(--muted);line-height:1.35}#mv3 .metastat b{color:var(--text)}
#mv3 .avatar{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;font-family:var(--disp);font-weight:700;font-size:15px;background:linear-gradient(135deg,#122033,#1c2f47);border:1px solid var(--border-2);color:var(--brain)}

#mv3 .brainbar{margin:18px 0 4px;border:1px solid var(--border);border-radius:16px;background:linear-gradient(180deg,rgba(55,224,208,.05),rgba(6,9,15,0) 60%);position:relative;overflow:visible;z-index:20}
#mv3 .brainbar::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(180deg,var(--brain),var(--decision));border-radius:3px 0 0 3px}
#mv3 .bb-top{display:flex;align-items:center;gap:16px;padding:13px 16px 11px}
#mv3 .orb-mini{position:relative;width:40px;height:40px;flex:none}
#mv3 .orb-mini .ring{position:absolute;inset:0;border-radius:50%;border:1px solid rgba(55,224,208,.3)}
#mv3 .orb-mini .ring.r2{inset:6px;border-color:rgba(110,155,255,.25);animation:mv3spin 8s linear infinite}
@keyframes mv3spin{to{transform:rotate(360deg)}}
#mv3 .orb-mini .core{position:absolute;inset:13px;border-radius:50%;background:radial-gradient(circle at 38% 32%,#8ff6ec,#37E0D0 45%,#0c8a7f);box-shadow:0 0 16px rgba(55,224,208,.6);animation:mv3breathe 3.4s ease-in-out infinite}
#mv3 .orb-mini.think .core{animation:mv3breathe 1.1s ease-in-out infinite}
@keyframes mv3breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.09);filter:brightness(1.15)}}
#mv3 .bb-voice{flex:1;min-width:0}
#mv3 .bb-voice .lbl{font-family:var(--mono);font-size:9.5px;letter-spacing:.15em;text-transform:uppercase;color:var(--brain);margin-bottom:3px}
#mv3 .bb-voice .txt{font-family:var(--disp);font-weight:600;font-size:15.5px;letter-spacing:-.01em;line-height:1.3;transition:opacity .4s}
#mv3 .bb-voice .txt .em{color:var(--brain)}#mv3 .bb-voice .txt .hot{color:var(--danger)}#mv3 .bb-voice .txt .g{color:var(--gold-hi)}#mv3 .bb-voice .txt b{font-weight:700}
#mv3 .bb-pills{display:flex;gap:9px;flex:none}
#mv3 .pill{font-family:var(--sans);font-weight:700;font-size:12px;padding:9px 13px;border-radius:10px;cursor:pointer;border:1px solid var(--border-2);transition:.18s;display:inline-flex;align-items:center;gap:8px;background:transparent;color:var(--text)}
#mv3 .pill .b{font-family:var(--mono);font-size:11px;min-width:18px;height:18px;border-radius:6px;display:grid;place-items:center;font-weight:700}
#mv3 .pill.need{border-color:rgba(255,106,87,.35);color:#ffd9d2}#mv3 .pill.need .b{background:var(--danger);color:#1a0805}
#mv3 .pill.need:hover{background:rgba(255,106,87,.08);border-color:var(--danger)}
#mv3 .pill.done{border-color:rgba(56,214,160,.3);color:#bff3df}#mv3 .pill.done .b{background:var(--done);color:#032b28}
#mv3 .pill.done:hover{background:rgba(56,214,160,.07);border-color:var(--done)}
#mv3 .bb-cmd{display:flex;align-items:center;gap:10px;padding:0 16px 14px;position:relative}
#mv3 .cmdfield{flex:1;display:flex;align-items:center;gap:10px;background:rgba(3,7,14,.6);border:1px solid var(--border-2);border-radius:12px;padding:11px 14px;transition:.2s}
#mv3 .cmdfield:focus-within{border-color:var(--brain);box-shadow:0 0 0 3px rgba(55,224,208,.1)}
#mv3 .cmdfield .arrow{font-family:var(--mono);color:var(--brain);font-size:14px}
#mv3 .cmdfield input{flex:1;background:transparent;border:0;outline:0;color:var(--text);font-family:var(--sans);font-size:14px}
#mv3 .cmdfield input::placeholder{color:var(--faint)}
#mv3 .cmd-send{background:var(--brain);color:#032b28;border:0;width:38px;height:38px;border-radius:11px;cursor:pointer;display:grid;place-items:center;font-size:16px;transition:.15s;flex:none}
#mv3 .cmd-send:hover{filter:brightness(1.08)}
#mv3 .cmd-menu-btn{background:transparent;border:1px solid var(--border-2);color:var(--muted);height:38px;padding:0 12px;border-radius:11px;cursor:pointer;font-family:var(--mono);font-size:11px;letter-spacing:.05em;transition:.15s;flex:none;display:inline-flex;align-items:center;gap:6px}
#mv3 .cmd-menu-btn:hover{color:var(--text);border-color:var(--brain)}
#mv3 .capmenu{position:absolute;left:16px;right:16px;top:calc(100% - 4px);z-index:50;background:var(--card-solid);border:1px solid var(--border-2);border-radius:14px;padding:14px;box-shadow:0 24px 60px rgba(0,0,0,.55);opacity:0;transform:translateY(-8px);pointer-events:none;transition:.22s}
#mv3 .capmenu.open{opacity:1;transform:none;pointer-events:auto}
#mv3 .capgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
#mv3 .capcol h4{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;margin-bottom:9px;display:flex;align-items:center;gap:6px}
#mv3 .capcol.ask h4{color:var(--decision)}#mv3 .capcol.act h4{color:var(--danger)}#mv3 .capcol.coach h4{color:var(--violet)}
#mv3 .capcol button{display:block;width:100%;text-align:left;background:transparent;border:1px solid var(--border);border-radius:9px;padding:8px 10px;margin-bottom:7px;color:var(--muted);font-family:var(--sans);font-size:12px;cursor:pointer;transition:.14s}
#mv3 .capcol button:hover{color:var(--text);border-color:var(--border-2);background:var(--surface)}
#mv3 .capcol button b{color:var(--text);font-weight:600}

#mv3 .kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:16px 0 6px}
#mv3 .kpi{border:1px solid var(--border);border-radius:14px;padding:14px 15px;background:var(--surface);cursor:pointer;transition:.18s;position:relative;overflow:hidden}
#mv3 .kpi:hover{border-color:var(--border-2);transform:translateY(-2px)}
#mv3 .kpi .k-lbl{font-family:var(--mono);font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);display:flex;align-items:center;gap:6px}
#mv3 .kpi .k-val{font-family:var(--disp);font-weight:800;font-size:30px;letter-spacing:-.02em;margin-top:6px;line-height:1}
#mv3 .kpi .k-val small{font-size:14px;color:var(--muted);font-weight:600}
#mv3 .kpi .k-sub{font-family:var(--mono);font-size:10.5px;margin-top:6px;color:var(--faint)}
#mv3 .kpi .k-sub.up{color:var(--done)}#mv3 .kpi .k-sub.down{color:var(--danger)}
#mv3 .kpi.leak{background:linear-gradient(180deg,rgba(255,106,87,.08),transparent);border-color:rgba(255,106,87,.28)}
#mv3 .kpi.leak .k-val{color:var(--danger)}
#mv3 .kpi.leak::after{content:"";position:absolute;right:-20px;top:-20px;width:60px;height:60px;border-radius:50%;background:radial-gradient(circle,rgba(255,106,87,.25),transparent 70%);animation:mv3breathe 2.4s ease-in-out infinite}
#mv3 .kpi.active{border-color:var(--brain);box-shadow:0 0 0 2px rgba(55,224,208,.22)}
#mv3 .kpi.leak.active{border-color:var(--danger);box-shadow:0 0 0 2px rgba(255,106,87,.25)}

#mv3 .sec-h{display:flex;align-items:baseline;gap:12px;margin:26px 0 13px}
#mv3 .sec-h .idx{font-family:var(--mono);font-size:11px;color:var(--faint)}
#mv3 .sec-h h2{font-family:var(--disp);font-weight:700;font-size:15px;letter-spacing:.01em;text-transform:uppercase}
#mv3 .sec-h .rule{flex:1;height:1px;background:linear-gradient(90deg,var(--border),transparent)}
#mv3 .sec-h .count{font-family:var(--mono);font-size:11px;color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:2px 9px}
#mv3 .sec-h .count.coach{color:var(--violet);border-color:rgba(185,144,255,.3)}

#mv3 .cols{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);gap:24px;align-items:start}
#mv3 .trio{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:start;margin-top:2px}
#mv3 .trio.duo{grid-template-columns:repeat(2,minmax(0,1fr))}
@media(max-width:1000px){#mv3 .trio{grid-template-columns:1fr}}
#mv3 .oprow{display:grid;grid-template-columns:minmax(0,.92fr) minmax(0,1.6fr);gap:20px;align-items:start;margin-top:8px}
#mv3 .funnel-col{display:flex;flex-direction:column;gap:14px}
#mv3 .funnel{display:flex;flex-direction:column;align-items:center;padding:4px 0 2px}
#mv3 .fstage{width:100%;display:flex;justify-content:center}
#mv3 .fbar{height:44px;border-radius:9px;display:flex;align-items:center;justify-content:space-between;padding:0 15px;min-width:130px;box-shadow:0 5px 16px rgba(0,0,0,.28);transition:width 1s cubic-bezier(.2,.8,.2,1)}
#mv3 .fbar .fn{font-family:var(--disp);font-weight:700;font-size:12.5px}
#mv3 .fbar .fv{font-family:var(--disp);font-weight:800;font-size:19px}
#mv3 .fbar.s1{background:linear-gradient(90deg,#6E9BFF,#4a6fd0);color:#fff}
#mv3 .fbar.s2{background:linear-gradient(90deg,var(--brain),var(--brain-dim));color:#04110f}
#mv3 .fbar.s3{background:linear-gradient(90deg,var(--violet),#7d54c9);color:#fff}
#mv3 .fbar.s4{background:linear-gradient(90deg,var(--gold),#e0a92a);color:#241a02}
#mv3 .fconv{font-family:var(--mono);font-size:9.5px;color:var(--faint);padding:5px 0}
#mv3 .fconv::before{content:"▼ ";font-size:7px;color:var(--faint)}
#mv3 .meta-hero{background:linear-gradient(135deg,rgba(244,198,58,.08),transparent 70%);border-color:rgba(244,198,58,.2)}
#mv3 .mh-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px}
#mv3 .mh-lbl{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
#mv3 .mh-big{font-family:var(--disp);font-weight:800;font-size:38px;line-height:1;letter-spacing:-.02em;margin-top:5px}
#mv3 .mh-big small{font-size:17px;color:var(--muted)}
#mv3 .mh-fc{font-family:var(--mono);font-size:10px;color:var(--muted);text-align:right;line-height:1.6}
#mv3 .mh-fc .warn{color:var(--danger)}
#mv3 .mh-thermo{height:12px;border-radius:99px;background:rgba(255,255,255,.06);overflow:hidden;position:relative;margin:2px 0 8px}
#mv3 .mh-fill{position:absolute;inset:0;width:0;border-radius:99px;background:linear-gradient(90deg,var(--gold),var(--danger));transition:width 1.4s cubic-bezier(.2,.8,.2,1)}
#mv3 .mh-sub{font-family:var(--mono);font-size:10px;color:var(--muted)}
#mv3 .results{margin-top:14px;border:1px solid var(--border);border-radius:16px;padding:15px 17px;background:linear-gradient(135deg,rgba(244,198,58,.07),transparent 60%)}
#mv3 .res-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:13px}
#mv3 .res-title{font-family:var(--disp);font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.04em}
#mv3 .period{display:inline-flex;background:rgba(3,7,14,.5);border:1px solid var(--border-2);border-radius:11px;padding:3px}
#mv3 .pbtn{font-family:var(--sans);font-weight:600;font-size:12px;padding:7px 13px;border-radius:8px;cursor:pointer;border:0;background:transparent;color:var(--muted);transition:.15s}
#mv3 .pbtn.active{background:var(--brain);color:#032b28}
#mv3 .res-when{display:inline-flex;align-items:center;gap:11px;font-family:var(--mono);font-size:12.5px;color:var(--text);font-weight:500}
#mv3 .navw{cursor:pointer;color:var(--muted);font-size:15px;width:24px;height:24px;display:grid;place-items:center;border:1px solid var(--border);border-radius:7px;transition:.15s}
#mv3 .navw:hover{color:var(--brain);border-color:var(--brain)}
#mv3 .navw.hidden{visibility:hidden}
#mv3 .big-hero{border:0;padding:0;background:transparent}
#mv3 .big-hero .mh-big{font-size:46px}
#mv3 .big-hero .mh-big small{font-size:20px}
#mv3 .filterchip{font-family:var(--mono);font-size:10.5px;color:var(--brain);background:rgba(55,224,208,.08);border:1px solid rgba(55,224,208,.25);border-radius:8px;padding:6px 11px;margin-bottom:10px;align-items:center;gap:10px;display:inline-flex}
@media(max-width:1000px){#mv3 .oprow{grid-template-columns:1fr}}
@media(max-width:680px){#mv3 .brainbar .bb-top{flex-wrap:wrap}#mv3 .bb-pills{width:100%;justify-content:stretch}#mv3 .bb-pills .pill{flex:1;justify-content:center}#mv3 .bb-cmd{flex-wrap:wrap}#mv3 .cmd-menu-btn{order:2}#mv3 .fbar .fn{font-size:11px}}

#mv3 .fila{border:1px solid var(--border);border-radius:16px;overflow:hidden;background:var(--surface)}
#mv3 .fila .frow{display:grid;grid-template-columns:auto 1.3fr .8fr .8fr auto;gap:14px;align-items:center;padding:13px 16px;border-bottom:1px solid var(--border);transition:.2s}
#mv3 .fila .frow:last-child{border-bottom:0}
#mv3 .fila .frow.head{background:rgba(255,255,255,.02)}
#mv3 .fila .frow.head span{font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint)}
#mv3 .fila .frow.leak-row{background:linear-gradient(90deg,rgba(255,106,87,.06),transparent 70%)}
#mv3 .fila .frow.paused{opacity:.5}
#mv3 .who-cell{display:flex;align-items:center;gap:11px}
#mv3 .sdot{width:9px;height:9px;border-radius:50%;flex:none}
#mv3 .sdot.on{background:var(--done);box-shadow:0 0 8px var(--done)}#mv3 .sdot.slow{background:var(--gold)}
#mv3 .sdot.off{background:var(--danger);box-shadow:0 0 8px rgba(255,106,87,.55)}#mv3 .sdot.paused{background:var(--faint)}
#mv3 .who-cell .nm{font-family:var(--disp);font-weight:700;font-size:14.5px}
#mv3 .who-cell .st{font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:1px}
#mv3 .who-cell .st.warn{color:var(--danger)}
#mv3 .fcell{font-family:var(--mono);font-size:13px}
#mv3 .fcell b{font-family:var(--disp);font-weight:700;font-size:17px}
#mv3 .fcell.warn b{color:var(--danger)}
#mv3 .fcell small{color:var(--faint);font-size:10px;display:block;text-transform:uppercase;letter-spacing:.08em;margin-top:1px}
#mv3 .tgl{display:inline-flex;align-items:center;gap:9px;cursor:pointer;user-select:none}
#mv3 .tgl .track{width:44px;height:24px;border-radius:99px;background:rgba(56,214,160,.2);border:1px solid rgba(56,214,160,.45);position:relative;transition:.22s}
#mv3 .tgl .knob{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:var(--done);transition:.22s;box-shadow:0 2px 6px rgba(0,0,0,.4)}
#mv3 .tgl.out .track{background:rgba(255,255,255,.06);border-color:var(--border-2)}
#mv3 .tgl.out .knob{left:22px;background:var(--faint)}
#mv3 .tgl .tlbl{font-family:var(--mono);font-size:10px;letter-spacing:.06em;text-transform:uppercase;width:66px;color:var(--done);font-weight:700}
#mv3 .tgl.out .tlbl{color:var(--muted)}

#mv3 .rail{display:flex;flex-direction:column;gap:15px}
#mv3 .panel{border:1px solid var(--border);border-radius:16px;padding:15px;background:var(--surface)}
#mv3 .panel .ph{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
#mv3 .panel .ph h3{font-family:var(--disp);font-weight:700;font-size:12.5px;letter-spacing:.04em;text-transform:uppercase;display:flex;align-items:center;gap:8px}
#mv3 .panel .ph .n{font-family:var(--mono);font-size:10px;color:var(--muted)}
#mv3 .dotc{width:7px;height:7px;border-radius:50%}
#mv3 .dotc.frio{background:var(--decision);box-shadow:0 0 8px var(--decision)}
#mv3 .dotc.gold{background:var(--gold);box-shadow:0 0 8px var(--gold)}
#mv3 .dotc.done{background:var(--done);box-shadow:0 0 8px var(--done)}

#mv3 .pool-top{display:flex;align-items:baseline;gap:10px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border)}
#mv3 .pool-top .big{font-family:var(--disp);font-weight:800;font-size:32px;letter-spacing:-.02em}
#mv3 .pool-top .lb{font-family:var(--mono);font-size:10.5px;color:var(--muted);line-height:1.35}#mv3 .pool-top .lb b{color:var(--done)}
#mv3 .pool li{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)}
#mv3 .pool li:last-child{border-bottom:0}
#mv3 .pool .rank{font-family:var(--mono);font-size:10px;color:var(--faint);width:16px}
#mv3 .pool .pn{font-family:var(--disp);font-weight:600;font-size:13px}
#mv3 .pool .pn small{font-family:var(--mono);font-weight:400;font-size:10px;color:var(--muted);display:block}
#mv3 .pool .pv{font-family:var(--mono);font-size:12px;text-align:right;font-weight:700}
#mv3 .pool .pv.zero{color:var(--danger)}#mv3 .pool .pv.hot{color:var(--done)}
#mv3 .pool .barmini{height:4px;border-radius:99px;background:rgba(255,255,255,.06);margin-top:4px;overflow:hidden}
#mv3 .pool .barmini i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--decision),var(--brain))}
#mv3 .btn{font-family:var(--sans);font-weight:600;font-size:12px;padding:9px 14px;border-radius:10px;cursor:pointer;border:1px solid transparent;transition:.18s;display:inline-flex;align-items:center;gap:7px}
#mv3 .btn:active{transform:translateY(1px)}
#mv3 .btn.brain{background:var(--brain);color:#032b28}#mv3 .btn.brain:hover{filter:brightness(1.07)}
#mv3 .btn.gold{background:linear-gradient(120deg,var(--gold),#e0a92a);color:#241a02}#mv3 .btn.gold:hover{filter:brightness(1.06)}
#mv3 .btn.primary{background:var(--danger);color:#1a0805}#mv3 .btn.primary:hover{filter:brightness(1.08)}
#mv3 .btn.violet{background:var(--violet);color:#1f1030}#mv3 .btn.violet:hover{filter:brightness(1.07)}
#mv3 .btn.ghost{background:transparent;color:var(--muted);border-color:var(--border-2)}#mv3 .btn.ghost:hover{color:var(--text);border-color:var(--brain);background:rgba(55,224,208,.06)}
#mv3 .btn.wide{width:100%;justify-content:center}#mv3 .btn.sm{font-size:11px;padding:7px 11px}

#mv3 .ouro-mini{display:grid;grid-template-columns:1fr auto;gap:4px 10px;padding:9px 0;border-bottom:1px solid var(--border);align-items:center}
#mv3 .ouro-mini:last-of-type{border-bottom:0}#mv3 .ouro-mini.saved{opacity:.55}
#mv3 .ouro-mini .on{font-family:var(--disp);font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px}
#mv3 .ouro-mini .om{font-family:var(--mono);font-size:10px;color:var(--muted)}#mv3 .ouro-mini .om .h{color:var(--danger)}
#mv3 .ouro-mini .ov{font-family:var(--mono);font-size:12px;color:var(--gold-hi);font-weight:700;text-align:right}
#mv3 .ouro-mini .odecay{grid-column:1/-1;height:5px;border-radius:99px;overflow:hidden;background:var(--rust-deep);position:relative;margin-top:2px}
#mv3 .ouro-mini .odecay .lv{position:absolute;inset:0;background:linear-gradient(90deg,var(--gold-hi),var(--gold));transition:width 1s linear}
#mv3 .ouro-mini .obtn{grid-column:1/-1;margin-top:7px}
#mv3 .goldbadge{font-family:var(--mono);font-size:8px;letter-spacing:.08em;background:linear-gradient(120deg,var(--gold-hi),var(--gold));color:#241a02;padding:2px 5px;border-radius:4px;font-weight:700}
#mv3 .meta-p .thermo{height:9px;border-radius:99px;background:rgba(255,255,255,.06);overflow:hidden;position:relative;margin:8px 0}
#mv3 .meta-p .thermo .fill{position:absolute;inset:0;width:0;border-radius:99px;background:linear-gradient(90deg,var(--gold),var(--danger));transition:width 1.4s cubic-bezier(.2,.8,.2,1)}
#mv3 .meta-p .nums{display:flex;justify-content:space-between;align-items:baseline}
#mv3 .meta-p .big{font-family:var(--disp);font-weight:800;font-size:24px}#mv3 .meta-p .big small{font-size:13px;color:var(--muted)}
#mv3 .meta-p .fc{font-family:var(--mono);font-size:10px;color:var(--danger);text-align:right;line-height:1.4}

#mv3 .coachstrip{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}
@media(max-width:1100px){#mv3 .coachstrip{grid-template-columns:repeat(3,1fr)}}
@media(max-width:640px){#mv3 .coachstrip{grid-template-columns:repeat(2,1fr)}}
#mv3 .ccard{border:1px solid var(--border);border-radius:14px;padding:14px;background:linear-gradient(180deg,var(--surface),transparent);cursor:pointer;transition:.2s;position:relative;overflow:hidden}
#mv3 .ccard:hover{border-color:var(--violet);transform:translateY(-3px)}
#mv3 .ccard::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px}
#mv3 .ccard.g-open::before{background:var(--gold)}#mv3 .ccard.g-qual::before{background:var(--decision)}
#mv3 .ccard.g-close::before{background:var(--danger)}#mv3 .ccard.g-bank::before{background:var(--violet)}#mv3 .ccard.g-top::before{background:var(--done)}
#mv3 .ccard .ch{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px}
#mv3 .ccard .cn{font-family:var(--disp);font-weight:700;font-size:15px}
#mv3 .qring{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font-family:var(--mono);font-size:11px;font-weight:700;flex:none}
#mv3 .ccard .gap{font-family:var(--mono);font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:3px 7px;border-radius:6px;display:inline-block;margin-bottom:8px;font-weight:700}
#mv3 .gap.g-open{background:rgba(244,198,58,.13);color:var(--gold-hi)}
#mv3 .gap.g-qual{background:rgba(110,155,255,.13);color:#bcd0ff}
#mv3 .gap.g-close{background:rgba(255,106,87,.13);color:#ffd0c8}
#mv3 .gap.g-bank{background:rgba(185,144,255,.13);color:#e0ccff}
#mv3 .gap.g-top{background:rgba(56,214,160,.13);color:#bff3df}
#mv3 .ccard .prob{font-size:12.5px;line-height:1.45;color:var(--text)}
#mv3 .ccard .train{margin-top:9px;font-family:var(--mono);font-size:10.5px;color:var(--violet);line-height:1.5;display:flex;gap:6px}
#mv3 .ccard .train .tl{color:var(--faint);flex:none}

#mv3 .scrim{position:fixed;inset:0;z-index:60;background:rgba(3,6,12,.65);backdrop-filter:blur(3px);opacity:0;pointer-events:none;transition:.3s}
#mv3 .scrim.open{opacity:1;pointer-events:auto}
#mv3 .drawer{position:fixed;top:0;right:0;bottom:0;width:min(460px,94vw);z-index:70;background:var(--card-solid);border-left:1px solid var(--border-2);transform:translateX(100%);transition:.36s cubic-bezier(.2,.8,.2,1);display:flex;flex-direction:column;box-shadow:-30px 0 60px rgba(0,0,0,.5)}
#mv3 .drawer.open{transform:none}
#mv3 .drawer .dh{padding:18px 18px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between}
#mv3 .drawer .dh h3{font-family:var(--disp);font-weight:700;font-size:16px;display:flex;align-items:center;gap:9px}
#mv3 .drawer .dh .x{cursor:pointer;color:var(--muted);font-size:20px;line-height:1;border:1px solid var(--border);border-radius:8px;width:30px;height:30px;display:grid;place-items:center;transition:.15s}
#mv3 .drawer .dh .x:hover{color:var(--text);border-color:var(--border-2)}
#mv3 .drawer .dbody{padding:16px;overflow-y:auto;flex:1}
#mv3 .dcard{position:relative;border:1px solid var(--border);border-radius:14px;padding:15px;margin-bottom:12px;overflow:hidden;background:linear-gradient(180deg,var(--surface),transparent);transition:.45s cubic-bezier(.2,.7,.2,1)}
#mv3 .dcard::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--decision)}
#mv3 .dcard.k-gold::before{background:linear-gradient(180deg,var(--gold),var(--rust))}#mv3 .dcard.k-broker::before{background:var(--danger)}#mv3 .dcard.k-meta::before{background:var(--brain)}
#mv3 .dcard .tagrow{display:flex;gap:8px;margin-bottom:8px}
#mv3 .chip{font-family:var(--mono);font-size:9px;letter-spacing:.12em;text-transform:uppercase;padding:4px 7px;border-radius:6px;font-weight:700}
#mv3 .chip.gold{background:rgba(244,198,58,.13);color:var(--gold-hi);border:1px solid rgba(244,198,58,.32)}
#mv3 .chip.broker{background:rgba(255,106,87,.12);color:var(--danger);border:1px solid rgba(255,106,87,.3)}
#mv3 .chip.meta{background:rgba(55,224,208,.1);color:var(--brain);border:1px solid rgba(55,224,208,.28)}
#mv3 .chip.ghost{background:transparent;color:var(--faint);border:1px solid var(--border)}
#mv3 .dcard .body{font-size:14px;line-height:1.5}#mv3 .dcard .body b{font-weight:700}#mv3 .dcard .body .g{color:var(--gold-hi)}#mv3 .dcard .body .h{color:var(--danger)}
#mv3 .dcard .why{font-family:var(--mono);font-size:10.5px;color:var(--muted);margin-top:8px;padding-left:11px;border-left:2px solid var(--border-2);line-height:1.55}
#mv3 .dcard .why .lbl{color:var(--brain)}
#mv3 .acts{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
#mv3 .log{list-style:none;display:flex;flex-direction:column;gap:2px}
#mv3 .log li{display:grid;grid-template-columns:auto 1fr auto;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);align-items:start}
#mv3 .log li:last-child{border-bottom:0}#mv3 .log li.fresh{animation:mv3slidein .5s ease}
@keyframes mv3slidein{from{opacity:0;transform:translateY(-6px)}to{opacity:1}}
#mv3 .log .when{font-family:var(--mono);font-size:9.5px;color:var(--faint);white-space:nowrap;min-width:50px;padding-top:2px}
#mv3 .log .act{font-size:12.5px;line-height:1.4}#mv3 .log .act b{font-weight:700}#mv3 .log .act .em{color:var(--done)}

#mv3 .efband{display:grid;grid-template-columns:1.6fr 1fr;gap:14px;margin:16px 0 6px}
#mv3 .efbox{border:1px solid var(--border);border-radius:14px;padding:15px;background:var(--surface)}
#mv3 .efbox h3{font-family:var(--disp);font-weight:700;font-size:12.5px;text-transform:uppercase;letter-spacing:.03em;margin-bottom:12px;display:flex;justify-content:space-between;align-items:baseline;gap:8px}
#mv3 .efbox h3 .tot{font-family:var(--mono);font-size:10.5px;color:var(--muted);font-weight:400;text-transform:none;letter-spacing:0}
#mv3 .movbar{display:flex;height:34px;border-radius:9px;overflow:hidden;margin-bottom:11px;gap:2px}
#mv3 .movbar span{display:grid;place-items:center;font-family:var(--mono);font-size:12px;font-weight:700}
#mv3 .movbar .m-jarvis{background:linear-gradient(90deg,var(--brain),var(--brain-dim));color:#04110f}
#mv3 .movbar .m-brk{background:linear-gradient(90deg,#6E9BFF,#4a6fd0);color:#071022}
#mv3 .movbar .m-ana{background:linear-gradient(90deg,var(--gold),#d69a1e);color:#241a02}
#mv3 .movleg{display:flex;gap:14px;flex-wrap:wrap;font-family:var(--mono);font-size:10.5px;color:var(--muted)}
#mv3 .movleg .lg{display:flex;align-items:center;gap:6px}#mv3 .movleg .sw{width:9px;height:9px;border-radius:3px}
#mv3 .efbox.guarantee{display:flex;flex-direction:column;justify-content:center}
#mv3 .efbox.guarantee .gbig{font-family:var(--disp);font-weight:800;font-size:32px;color:var(--done);line-height:1}
#mv3 .efbox.guarantee .gbig small{font-size:15px;color:var(--muted)}
#mv3 .efbox.guarantee .gnote{font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:7px;line-height:1.55}
#mv3 .efbox.guarantee .gnote b{color:var(--brain)}
#mv3 .autostrip{display:grid;grid-template-columns:repeat(auto-fill,minmax(212px,1fr));gap:12px}
#mv3 .acard{border:1px solid var(--border);border-radius:14px;padding:14px;background:var(--surface);transition:.2s}
#mv3 .acard:hover{border-color:var(--border-2)}
#mv3 .acard .ah{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
#mv3 .acard .an{font-family:var(--disp);font-weight:700;font-size:13.5px;display:flex;align-items:center;gap:7px}
#mv3 .acard .status{font-family:var(--mono);font-size:8.5px;letter-spacing:.08em;text-transform:uppercase;padding:4px 8px;border-radius:99px;display:inline-flex;align-items:center;gap:5px}
#mv3 .acard .status.on{color:var(--done);background:rgba(56,214,160,.1)}
#mv3 .acard .status.warn{color:var(--gold-hi);background:rgba(244,198,58,.12)}
#mv3 .acard .abig{font-family:var(--disp);font-weight:800;font-size:26px;letter-spacing:-.02em;line-height:1}
#mv3 .acard .abig small{font-size:12px;color:var(--muted);font-weight:600}
#mv3 .acard .asub{font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:5px;line-height:1.5}
#mv3 .acard .asub .up{color:var(--done)}#mv3 .acard .asub .dn{color:var(--danger)}
#mv3 .acard .abar{height:5px;border-radius:99px;background:rgba(255,255,255,.06);margin-top:9px;overflow:hidden}
#mv3 .acard .abar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--done),var(--brain))}
#mv3 .acard .aact{margin-top:10px}
@media(max-width:1000px){#mv3 .efband{grid-template-columns:1fr}}
@media(max-width:1000px){#mv3 .cols{grid-template-columns:1fr}#mv3 .kpis{grid-template-columns:repeat(2,1fr)}#mv3 .capgrid{grid-template-columns:1fr}#mv3 .bb-top{flex-wrap:wrap}}

#mv3 .protonote{text-align:center;margin-top:40px;font-family:var(--mono);font-size:10.5px;color:var(--faint);letter-spacing:.06em}
#mv3 .rv{opacity:0;transform:translateY(12px);animation:mv3rise .6s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes mv3rise{to{opacity:1;transform:none}}
`;
