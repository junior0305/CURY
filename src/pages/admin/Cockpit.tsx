import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  Activity, AlertTriangle, Users, Bot, RefreshCw,
  TrendingUp, Clock, UserX, CheckCircle2, XCircle, PhoneOff, Target,
  Timer, Shield, BarChart2, Cpu,
} from "lucide-react";
import { formatDistanceToNow, subDays, startOfDay, subHours } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PipelineStats {
  total_active: number;
  never_touched: number;
  cooling: number;
  concluded_month: number;
  conversion_rate: number;
  no_broker: number;
}

interface FunnelStage {
  status: string;
  label: string;
  count: number;
  avg_days: number;
  color: string;
  neon: string;
}

interface BrokerPerf {
  id: string;
  name: string;
  received: number;
  contacted: number;
  contact_rate: number;
  avg_first_contact_h: number | null;
  auto_followups: number;
  sentinela_count: number;
  converted: number;
  traffic_light: "green" | "yellow" | "red";
}

interface AiStats {
  campaigns_active: number;
  prospects_sent: number;
  prospects_qualified: number;
  sentinela_sessions: number;
  sentinela_messages: number;
  followup_auto: number;
  followup_responded: number;
}

interface SpeedBucket {
  label: string;
  count: number;
  color: string;
  neon: string;
}

interface TrendDay {
  date: string;
  received: number;
  concluded: number;
}

type Period = "7d" | "30d";

// ─── Animated Counter ────────────────────────────────────────────────────────

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (ref.current) clearInterval(ref.current);
    const start = display;
    const end = value;
    const diff = end - start;
    if (diff === 0) return;
    const steps = 20;
    let step = 0;
    ref.current = setInterval(() => {
      step++;
      setDisplay(Math.round(start + diff * (step / steps)));
      if (step >= steps) { clearInterval(ref.current!); setDisplay(end); }
    }, 20);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [value]);

  return <>{display}</>;
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

const CARD_THEMES = {
  cyan:    { border: "#00D4FF", glow: "rgba(0,212,255,0.15)", text: "#00D4FF",   bg: "rgba(0,212,255,0.05)" },
  red:     { border: "#EF4444", glow: "rgba(239,68,68,0.18)",  text: "#F87171",   bg: "rgba(239,68,68,0.06)" },
  amber:   { border: "#F59E0B", glow: "rgba(245,158,11,0.15)", text: "#FCD34D",   bg: "rgba(245,158,11,0.05)" },
  emerald: { border: "#10B981", glow: "rgba(16,185,129,0.15)", text: "#34D399",   bg: "rgba(16,185,129,0.05)" },
  purple:  { border: "#7C3AED", glow: "rgba(124,58,237,0.18)", text: "#A78BFA",   bg: "rgba(124,58,237,0.06)" },
  slate:   { border: "#334155", glow: "rgba(51,65,85,0.1)",    text: "#94A3B8",   bg: "rgba(15,23,42,0.5)" },
};

type CardTheme = keyof typeof CARD_THEMES;

function StatCard({
  label, value, sub, icon: Icon, theme, pulse, delay = 0,
}: {
  label: string; value: number | string; sub?: string;
  icon: React.ElementType; theme: CardTheme; pulse?: boolean; delay?: number;
}) {
  const t = CARD_THEMES[theme];
  const isNum = typeof value === "number";
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="relative rounded-2xl p-4 flex flex-col gap-2 overflow-hidden"
      style={{
        background: t.bg,
        border: `1px solid ${t.border}40`,
        boxShadow: `0 0 20px ${t.glow}, inset 0 1px 0 ${t.border}10`,
      }}
    >
      {/* top glow bar */}
      <div className="absolute top-0 left-4 right-4 h-px" style={{ background: `linear-gradient(90deg, transparent, ${t.border}80, transparent)` }} />

      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#475569" }}>{label}</span>
        <Icon
          className={cn("w-4 h-4", pulse && "animate-pulse")}
          style={{ color: t.text }}
        />
      </div>

      <p className="text-3xl font-black" style={{ color: t.text, textShadow: `0 0 20px ${t.border}60` }}>
        {isNum ? <AnimatedNumber value={value as number} /> : value}
      </p>

      {sub && <p className="text-[10px]" style={{ color: "#475569" }}>{sub}</p>}
    </motion.div>
  );
}

// ─── Section Title ────────────────────────────────────────────────────────────

function SectionTitle({ children, icon: Icon, color = "#00D4FF" }: {
  children: React.ReactNode; icon?: React.ElementType; color?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${color}40)` }} />
      <div className="flex items-center gap-2 px-3 py-1 rounded-full" style={{ border: `1px solid ${color}30`, background: `${color}08` }}>
        {Icon && <Icon className="w-3 h-3" style={{ color }} />}
        <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap" style={{ color }}>{children}</span>
      </div>
      <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${color}40, transparent)` }} />
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Cockpit() {
  const [period, setPeriod] = useState<Period>("7d");
  const [pipeline, setPipeline] = useState<PipelineStats | null>(null);
  const [funnel, setFunnel] = useState<FunnelStage[]>([]);
  const [brokers, setBrokers] = useState<BrokerPerf[]>([]);
  const [aiStats, setAiStats] = useState<AiStats | null>(null);
  const [speedBuckets, setSpeedBuckets] = useState<SpeedBucket[]>([]);
  const [trend, setTrend] = useState<TrendDay[]>([]);
  const [alerts, setAlerts] = useState<{ level: string; msg: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    const days = period === "7d" ? 7 : 30;
    const since = subDays(now, days).toISOString();
    const h48 = subHours(now, 48).toISOString();

    // ── 1. Pipeline KPIs ────────────────────────────────────────────────────
    const [
      { count: totalActive },
      { count: neverTouched },
      { count: cooling },
      { count: concludedPeriod },
      { count: receivedPeriod },
      { count: noBroker },
    ] = await Promise.all([
      supabase.from("leads").select("id", { count: "exact", head: true })
        .not("status", "in", '("CONCLUDED","ABANDONED","EXCLUDED")'),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .is("last_broker_whatsapp_at", null)
        .not("status", "in", '("CONCLUDED","ABANDONED","EXCLUDED")'),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .lt("last_interaction_at", h48)
        .not("status", "in", '("CONCLUDED","ABANDONED","EXCLUDED")'),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("status", "CONCLUDED").gte("created_at", since),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .gte("created_at", since),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .is("broker_id", null)
        .not("status", "in", '("CONCLUDED","ABANDONED","EXCLUDED")'),
    ]);

    const convRate = (receivedPeriod ?? 0) > 0
      ? Math.round(((concludedPeriod ?? 0) / (receivedPeriod ?? 1)) * 100)
      : 0;

    setPipeline({
      total_active: totalActive ?? 0,
      never_touched: neverTouched ?? 0,
      cooling: cooling ?? 0,
      concluded_month: concludedPeriod ?? 0,
      conversion_rate: convRate,
      no_broker: noBroker ?? 0,
    });

    // ── 2. Funil com Tempo de Permanência ────────────────────────────────────
    const statuses = [
      { status: "NEW",             label: "Novos",           color: "bg-sky-500",     neon: "#38BDF8" },
      { status: "IN_PROGRESS",     label: "Em Andamento",    color: "bg-indigo-500",  neon: "#818CF8" },
      { status: "DOCS_REQUESTED",  label: "Docs",            color: "bg-amber-500",   neon: "#FCD34D" },
      { status: "VISIT_SCHEDULED", label: "Visita",          color: "bg-purple-500",  neon: "#A78BFA" },
      { status: "CONCLUDED",       label: "Concluídos",      color: "bg-emerald-500", neon: "#34D399" },
    ];

    const funnelData = await Promise.all(statuses.map(async (s) => {
      const { data } = await supabase
        .from("leads")
        .select("created_at, last_interaction_at")
        .eq("status", s.status)
        .limit(200);

      const rows = data || [];
      let totalDays = 0;
      rows.forEach(r => {
        const ref = r.last_interaction_at || r.created_at;
        totalDays += (now.getTime() - new Date(ref).getTime()) / 86400000;
      });
      const avgDays = rows.length > 0 ? Math.round(totalDays / rows.length) : 0;

      return { ...s, count: rows.length, avg_days: avgDays };
    }));
    setFunnel(funnelData);

    // ── 3. Performance dos Corretores ────────────────────────────────────────
    const { data: brokerProfiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .eq("role", "BROKER")
      .eq("lead_assignment_enabled", true);

    if (brokerProfiles?.length) {
      const rows: BrokerPerf[] = await Promise.all(
        brokerProfiles.map(async (b) => {
          const [
            { data: receivedLeads },
            { count: autoFollowups },
            { count: sentinelaCount },
            { count: converted },
          ] = await Promise.all([
            supabase.from("leads")
              .select("id, last_broker_whatsapp_at, created_at")
              .eq("broker_id", b.id)
              .gte("created_at", since),
            supabase.from("internal_notifications")
              .select("id", { count: "exact", head: true })
              .eq("to_id", b.id)
              .in("type", ["AUTO_FOLLOWUP_SENT", "COLD_FOLLOWUP_SENT"])
              .gte("created_at", since),
            supabase.from("ai_sentinela_sessions")
              .select("id", { count: "exact", head: true })
              .in("lead_id",
                (await supabase.from("leads").select("id").eq("broker_id", b.id)).data?.map(l => l.id) || []
              )
              .gte("started_at", since),
            supabase.from("leads")
              .select("id", { count: "exact", head: true })
              .eq("broker_id", b.id)
              .eq("status", "CONCLUDED")
              .gte("created_at", since),
          ]);

          const leads = receivedLeads || [];
          const contacted = leads.filter(l => l.last_broker_whatsapp_at).length;
          const contactRate = leads.length > 0 ? Math.round((contacted / leads.length) * 100) : 0;

          const contactTimes = leads
            .filter(l => l.last_broker_whatsapp_at)
            .map(l => (new Date(l.last_broker_whatsapp_at!).getTime() - new Date(l.created_at).getTime()) / 3600000);
          const avgFirstContact = contactTimes.length > 0
            ? Math.round(contactTimes.reduce((a, b) => a + b, 0) / contactTimes.length * 10) / 10
            : null;

          const auto = autoFollowups ?? 0;
          const autoRate = leads.length > 0 ? auto / leads.length : 0;
          const traffic_light: BrokerPerf["traffic_light"] =
            contactRate >= 80 && (avgFirstContact ?? 99) <= 4 && autoRate < 0.3 ? "green" :
            contactRate >= 50 && (avgFirstContact ?? 99) <= 24 ? "yellow" : "red";

          return {
            id: b.id,
            name: `${b.first_name ?? ""} ${b.last_name ?? ""}`.trim(),
            received: leads.length,
            contacted,
            contact_rate: contactRate,
            avg_first_contact_h: avgFirstContact,
            auto_followups: auto,
            sentinela_count: sentinelaCount ?? 0,
            converted: converted ?? 0,
            traffic_light,
          };
        })
      );

      setBrokers(rows.sort((a, b) => {
        const o = { red: 0, yellow: 1, green: 2 };
        return o[a.traffic_light] - o[b.traffic_light];
      }));
    }

    // ── 4. IA ROI ────────────────────────────────────────────────────────────
    const [
      { count: campaignsActive },
      { count: prospectsSent },
      { count: prospectsQualified },
      { count: sentinelaSessions },
      { count: sentinelaMessages },
      { count: followupAuto },
      { count: followupResponded },
    ] = await Promise.all([
      supabase.from("ia_campaigns").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("ia_conversations").select("id", { count: "exact", head: true }).gte("created_at", since),
      supabase.from("ia_conversations").select("id", { count: "exact", head: true })
        .in("status", ["qualified", "escalated"]).gte("created_at", since),
      supabase.from("ai_sentinela_sessions").select("id", { count: "exact", head: true }).gte("started_at", since),
      supabase.from("ai_sentinela_usage").select("id", { count: "exact", head: true }).gte("created_at", since),
      supabase.from("internal_notifications")
        .select("id", { count: "exact", head: true })
        .in("type", ["AUTO_FOLLOWUP_SENT", "COLD_FOLLOWUP_SENT"])
        .gte("created_at", since),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .not("last_lead_response_at", "is", null).gte("last_lead_response_at", since),
    ]);

    setAiStats({
      campaigns_active: campaignsActive ?? 0,
      prospects_sent: prospectsSent ?? 0,
      prospects_qualified: prospectsQualified ?? 0,
      sentinela_sessions: sentinelaSessions ?? 0,
      sentinela_messages: sentinelaMessages ?? 0,
      followup_auto: followupAuto ?? 0,
      followup_responded: followupResponded ?? 0,
    });

    // ── 5. Velocidade de Atendimento ─────────────────────────────────────────
    const { data: contactedLeads } = await supabase
      .from("leads")
      .select("created_at, last_broker_whatsapp_at")
      .not("last_broker_whatsapp_at", "is", null)
      .gte("created_at", since)
      .limit(500);

    const buckets = [
      { label: "< 1 hora",   max: 1,        count: 0, color: "bg-emerald-500", neon: "#10B981" },
      { label: "1h – 4h",    max: 4,        count: 0, color: "bg-sky-500",     neon: "#38BDF8" },
      { label: "4h – 24h",   max: 24,       count: 0, color: "bg-amber-500",   neon: "#F59E0B" },
      { label: "> 24 horas", max: Infinity, count: 0, color: "bg-red-500",     neon: "#EF4444" },
    ];

    (contactedLeads || []).forEach(l => {
      const h = (new Date(l.last_broker_whatsapp_at!).getTime() - new Date(l.created_at).getTime()) / 3600000;
      if (h < 1) buckets[0].count++;
      else if (h < 4) buckets[1].count++;
      else if (h < 24) buckets[2].count++;
      else buckets[3].count++;
    });
    setSpeedBuckets(buckets);

    // ── 6. Tendência diária ──────────────────────────────────────────────────
    const trendDays = Math.min(days, 14);
    const trendData: TrendDay[] = [];
    for (let i = trendDays - 1; i >= 0; i--) {
      const dayStart = startOfDay(subDays(now, i)).toISOString();
      const dayEnd   = startOfDay(subDays(now, i - 1)).toISOString();
      const [{ count: rec }, { count: conc }] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true })
          .gte("created_at", dayStart).lt("created_at", dayEnd),
        supabase.from("leads").select("id", { count: "exact", head: true })
          .eq("status", "CONCLUDED").gte("created_at", dayStart).lt("created_at", dayEnd),
      ]);
      trendData.push({
        date: subDays(now, i).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        received: rec ?? 0,
        concluded: conc ?? 0,
      });
    }
    setTrend(trendData);

    // ── Alertas ──────────────────────────────────────────────────────────────
    const newAlerts: { level: string; msg: string }[] = [];
    if ((noBroker ?? 0) > 0)
      newAlerts.push({ level: "critical", msg: `${noBroker} lead(s) sem corretor atribuído` });
    if ((neverTouched ?? 0) > 5)
      newAlerts.push({ level: "critical", msg: `${neverTouched} leads nunca receberam contato do corretor` });
    if ((cooling ?? 0) > 10)
      newAlerts.push({ level: "warning", msg: `${cooling} leads sem contato há mais de 48h` });
    if (newAlerts.length === 0)
      newAlerts.push({ level: "ok", msg: "Nenhum alerta crítico no momento" });
    setAlerts(newAlerts);

    setLastRefresh(now);
    setLoading(false);
  }, [period]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  const maxTrend = Math.max(...trend.map(d => d.received), 1);
  const totalSpeed = speedBuckets.reduce((a, b) => a + b.count, 0);

  return (
    <div className="p-4 md:p-6 space-y-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3"
      >
        <div>
          <h2
            className="text-xl font-black uppercase tracking-[0.15em] flex items-center gap-2"
            style={{ color: "#fff", textShadow: "0 0 20px rgba(0,212,255,0.4)" }}
          >
            <Activity className="w-5 h-5" style={{ color: "#00D4FF" }} />
            Cockpit
          </h2>
          <p className="text-[10px] uppercase tracking-widest mt-0.5" style={{ color: "#334155" }}>
            Atualizado {formatDistanceToNow(lastRefresh, { locale: ptBR, addSuffix: true })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div
            className="flex p-1 gap-1 rounded-xl"
            style={{ background: "rgba(8,11,20,0.8)", border: "1px solid #1E293B" }}
          >
            {(["7d", "30d"] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className="px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all"
                style={period === p ? {
                  background: "linear-gradient(135deg, #0066FF, #00D4FF)",
                  color: "#fff",
                  boxShadow: "0 0 12px rgba(0,212,255,0.35)",
                } : { color: "#475569" }}
              >
                {p === "7d" ? "7 dias" : "30 dias"}
              </button>
            ))}
          </div>
          {/* Refresh */}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-30"
            style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.2)", color: "#00D4FF" }}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            {loading ? "Carregando" : "Atualizar"}
          </button>
        </div>
      </motion.div>

      {/* ── Alertas ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {alerts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            {alerts.map((a, i) => (
              <motion.div
                key={i}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: i * 0.08 }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm"
                style={a.level === "critical" ? {
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.35)",
                  color: "#F87171",
                  boxShadow: "0 0 16px rgba(239,68,68,0.1)",
                } : a.level === "warning" ? {
                  background: "rgba(245,158,11,0.08)",
                  border: "1px solid rgba(245,158,11,0.35)",
                  color: "#FCD34D",
                } : {
                  background: "rgba(16,185,129,0.06)",
                  border: "1px solid rgba(16,185,129,0.25)",
                  color: "#34D399",
                }}
              >
                {a.level === "critical" && <XCircle className="w-4 h-4 shrink-0 animate-pulse" />}
                {a.level === "warning"  && <AlertTriangle className="w-4 h-4 shrink-0" />}
                {a.level === "ok"       && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                {a.msg}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 1. Linha de Comando — KPIs ───────────────────────────────────────── */}
      <div>
        <SectionTitle icon={Shield}>Linha de Comando</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard delay={0.0} label="Leads Ativos"     value={pipeline?.total_active ?? 0}       icon={Activity}  theme="cyan" />
          <StatCard delay={0.05} label="Nunca Tocados"   value={pipeline?.never_touched ?? 0}      icon={PhoneOff}  theme={(pipeline?.never_touched ?? 0) > 0 ? "red" : "emerald"} pulse={(pipeline?.never_touched ?? 0) > 0} />
          <StatCard delay={0.1} label="Esfriando +48h"   value={pipeline?.cooling ?? 0}            icon={Clock}     theme={(pipeline?.cooling ?? 0) > 5 ? "amber" : "emerald"} />
          <StatCard delay={0.15} label="Sem Corretor"    value={pipeline?.no_broker ?? 0}          icon={UserX}     theme={(pipeline?.no_broker ?? 0) > 0 ? "red" : "emerald"} pulse={(pipeline?.no_broker ?? 0) > 0} />
          <StatCard delay={0.2} label={`Vendas (${period})`} value={pipeline?.concluded_month ?? 0} icon={TrendingUp} theme="emerald" />
          <StatCard delay={0.25} label="Conversão"       value={`${pipeline?.conversion_rate ?? 0}%`} icon={Target} theme={(pipeline?.conversion_rate ?? 0) >= 10 ? "emerald" : "amber"} sub="leads → venda" />
        </div>
      </div>

      {/* ── 2. Funil ─────────────────────────────────────────────────────────── */}
      <div>
        <SectionTitle icon={BarChart2} color="#7C3AED">Funil — Tempo de Permanência</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {funnel.map((stage, i) => {
            const maxCount = Math.max(...funnel.map(f => f.count), 1);
            const pct = Math.max(4, (stage.count / maxCount) * 100);
            return (
              <motion.div
                key={stage.status}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className="rounded-2xl p-4 flex flex-col gap-2"
                style={{
                  background: `${stage.neon}08`,
                  border: `1px solid ${stage.neon}30`,
                  boxShadow: `0 0 16px ${stage.neon}0A`,
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest truncate" style={{ color: "#475569" }}>
                    {stage.label}
                  </span>
                  <div className="w-2 h-2 rounded-full" style={{ background: stage.neon, boxShadow: `0 0 6px ${stage.neon}` }} />
                </div>
                <p className="text-3xl font-black" style={{ color: stage.neon, textShadow: `0 0 16px ${stage.neon}50` }}>
                  <AnimatedNumber value={stage.count} />
                </p>
                <p className="text-xs font-bold" style={{
                  color: stage.avg_days > 14 ? "#F87171" : stage.avg_days > 7 ? "#FCD34D" : "#475569"
                }}>
                  {stage.avg_days > 0 ? `~${stage.avg_days}d parado` : "< 1 dia"}
                </p>
                {/* bar */}
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <motion.div
                    className="h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, delay: i * 0.07 + 0.3 }}
                    style={{ background: `linear-gradient(90deg, ${stage.neon}80, ${stage.neon})` }}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ── 3. Termômetro dos Corretores ─────────────────────────────────────── */}
      <div>
        <SectionTitle icon={Users} color="#F59E0B">Termômetro de Esforço</SectionTitle>
        {brokers.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: "#334155" }}>Nenhum corretor encontrado.</p>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid #1E293B" }}
          >
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr style={{ background: "rgba(8,11,20,0.9)", borderBottom: "1px solid #1E293B" }}>
                  {["Corretor","Status","Recebidos","Contatou","Taxa %","1º Contato","Robô Atuou","Vendas"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest" style={{ color: "#334155" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {brokers.map((b, i) => {
                  const tl = b.traffic_light;
                  const rowNeon = tl === "green" ? "#10B981" : tl === "yellow" ? "#F59E0B" : "#EF4444";
                  return (
                    <motion.tr
                      key={b.id}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      style={{
                        borderBottom: "1px solid #0F172A",
                        background: tl === "red" ? "rgba(239,68,68,0.04)" : tl === "yellow" ? "rgba(245,158,11,0.03)" : "transparent",
                      }}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-4 py-3 font-bold text-white">{b.name || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <div
                            className={cn("w-2.5 h-2.5 rounded-full", tl !== "green" && "animate-pulse")}
                            style={{ background: rowNeon, boxShadow: `0 0 6px ${rowNeon}` }}
                          />
                          <span className="text-[10px] font-black uppercase" style={{ color: rowNeon }}>
                            {tl === "green" ? "Proativo" : tl === "yellow" ? "Regular" : "Inativo"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-black text-white">{b.received}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-black text-white">{b.contacted}</span>
                          <div className="w-12 h-1 rounded-full overflow-hidden" style={{ background: "#0F172A" }}>
                            <div className="h-full rounded-full" style={{
                              width: `${b.contact_rate}%`,
                              background: b.contact_rate >= 80 ? "#10B981" : b.contact_rate >= 50 ? "#F59E0B" : "#EF4444",
                            }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-black" style={{
                          color: b.contact_rate >= 80 ? "#34D399" : b.contact_rate >= 50 ? "#FCD34D" : "#F87171"
                        }}>{b.contact_rate}%</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-bold" style={{
                          color: b.avg_first_contact_h === null ? "#334155" :
                            b.avg_first_contact_h <= 1 ? "#34D399" :
                            b.avg_first_contact_h <= 4 ? "#38BDF8" :
                            b.avg_first_contact_h <= 24 ? "#FCD34D" : "#F87171"
                        }}>
                          {b.avg_first_contact_h === null ? "—" : `${b.avg_first_contact_h}h`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-black" style={{
                          color: b.auto_followups + b.sentinela_count > 10 ? "#F87171" :
                            b.auto_followups + b.sentinela_count > 5 ? "#FCD34D" : "#334155"
                        }}>{b.auto_followups + b.sentinela_count}x</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-black" style={{ color: b.converted > 0 ? "#34D399" : "#334155" }}>
                          {b.converted}
                        </span>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </motion.div>
        )}
      </div>

      {/* ── 4. IA ROI + Velocidade ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* IA ROI */}
        <div>
          <SectionTitle icon={Cpu} color="#7C3AED">IA — Retorno das Automações</SectionTitle>
          <div className="grid grid-cols-1 gap-3">
            {[
              {
                icon: Bot, color: "#818CF8", label: "Prospector",
                items: [
                  { v: aiStats?.campaigns_active ?? 0, l: "Campanhas ativas" },
                  { v: aiStats?.prospects_sent ?? 0, l: "Conversas abertas" },
                  { v: aiStats?.prospects_qualified ?? 0, l: "Qualificados", highlight: true },
                ],
              },
              {
                icon: Shield, color: "#A78BFA", label: "Sentinela",
                items: [
                  { v: aiStats?.sentinela_sessions ?? 0, l: "Sessões abertas" },
                  { v: aiStats?.sentinela_messages ?? 0, l: "Msgs enviadas" },
                ],
              },
              {
                icon: RefreshCw, color: "#38BDF8", label: "Follow-up Auto",
                items: [
                  { v: aiStats?.followup_auto ?? 0, l: "Disparos auto" },
                  { v: aiStats?.followup_responded ?? 0, l: "Leads responderam", highlight: true },
                ],
              },
            ].map((block, bi) => (
              <motion.div
                key={block.label}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: bi * 0.1 }}
                className="rounded-2xl p-4"
                style={{
                  background: `${block.color}08`,
                  border: `1px solid ${block.color}25`,
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <block.icon className="w-4 h-4" style={{ color: block.color }} />
                  <span className="text-xs font-black uppercase tracking-widest" style={{ color: block.color }}>{block.label}</span>
                </div>
                <div className="flex gap-6">
                  {block.items.map(item => (
                    <div key={item.l}>
                      <p className="text-2xl font-black" style={{ color: item.highlight ? "#34D399" : "#fff" }}>
                        <AnimatedNumber value={item.v} />
                      </p>
                      <p className="text-[10px]" style={{ color: "#334155" }}>{item.l}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Velocidade */}
        <div>
          <SectionTitle icon={Timer} color="#10B981">Velocidade de Atendimento</SectionTitle>
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-2xl p-5 space-y-4 h-full"
            style={{ background: "rgba(8,11,20,0.6)", border: "1px solid #1E293B" }}
          >
            {speedBuckets.map((bucket, i) => {
              const pct = totalSpeed > 0 ? Math.round((bucket.count / totalSpeed) * 100) : 0;
              return (
                <div key={bucket.label} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold" style={{ color: "#64748B" }}>{bucket.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black" style={{ color: bucket.neon }}>{bucket.count}</span>
                      <span className="text-[10px]" style={{ color: "#334155" }}>{pct}%</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                    <motion.div
                      className="h-full rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.9, delay: i * 0.1 + 0.2 }}
                      style={{ background: `linear-gradient(90deg, ${bucket.neon}60, ${bucket.neon})` }}
                    />
                  </div>
                </div>
              );
            })}
            {totalSpeed === 0 && (
              <p className="text-sm text-center py-4" style={{ color: "#334155" }}>Nenhum dado no período</p>
            )}
            <p className="text-[10px] pt-2" style={{ color: "#1E293B" }}>
              Tempo entre criação do lead e primeiro contato via WhatsApp
            </p>
          </motion.div>
        </div>
      </div>

      {/* ── 5. Tendência Diária ───────────────────────────────────────────────── */}
      <div>
        <SectionTitle icon={TrendingUp} color="#00D4FF">Tendência — Últimos {Math.min(period === "7d" ? 7 : 14, 14)} dias</SectionTitle>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-5"
          style={{ background: "rgba(8,11,20,0.6)", border: "1px solid #1E293B" }}
        >
          <div className="flex items-end gap-1" style={{ height: "120px" }}>
            {trend.map((day, i) => (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-1 min-w-0 group" style={{ height: "100%" }}>
                <div className="flex-1 flex flex-col justify-end w-full gap-px">
                  {/* Received bar */}
                  <motion.div
                    className="w-full rounded-t-sm"
                    initial={{ height: 0 }}
                    animate={{ height: `${maxTrend > 0 ? Math.max(4, (day.received / maxTrend) * 96) : 4}px` }}
                    transition={{ duration: 0.6, delay: i * 0.04 }}
                    title={`Recebidos: ${day.received}`}
                    style={{ background: "rgba(0,212,255,0.35)", minWidth: 4 }}
                  />
                  {/* Concluded overlay */}
                  {day.concluded > 0 && (
                    <motion.div
                      className="w-full rounded-t-sm absolute"
                      initial={{ height: 0 }}
                      animate={{ height: `${maxTrend > 0 ? Math.max(3, (day.concluded / maxTrend) * 96) : 3}px` }}
                      transition={{ duration: 0.6, delay: i * 0.04 + 0.2 }}
                      title={`Vendas: ${day.concluded}`}
                      style={{ background: "#10B981", position: "relative", marginTop: -3 }}
                    />
                  )}
                </div>
                <span
                  className="text-[8px] truncate w-full text-center opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: "#475569" }}
                >{day.date}</span>
                <span className="text-[8px] truncate w-full text-center" style={{ color: "#334155" }}>{day.date}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-5 mt-3 text-[10px]" style={{ color: "#334155" }}>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-sm inline-block" style={{ background: "rgba(0,212,255,0.35)" }} />
              Leads recebidos
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-sm inline-block" style={{ background: "#10B981" }} />
              Vendas concluídas
            </span>
          </div>
        </motion.div>
      </div>

    </div>
  );
}
