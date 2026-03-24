import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  Activity, AlertTriangle, Users, Zap, Bot, RefreshCw,
  TrendingUp, Clock, CalendarX, UserX, Wifi, WifiOff,
  CheckCircle2, XCircle, ArrowRight, PhoneOff, Target,
  Timer, Shield, BarChart2, Cpu, MessageSquare,
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
}

interface TrendDay {
  date: string;
  received: number;
  concluded: number;
}

type Period = "7d" | "30d";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color, pulse }: {
  label: string; value: number | string; sub?: string;
  icon: React.ElementType; color: string; pulse?: boolean;
}) {
  const colors: Record<string, { bg: string; border: string; text: string; icon: string }> = {
    green:  { bg: "bg-emerald-900/20", border: "border-emerald-500/30", text: "text-emerald-300", icon: "text-emerald-400" },
    red:    { bg: "bg-red-900/20",     border: "border-red-500/30",     text: "text-red-300",     icon: "text-red-400" },
    amber:  { bg: "bg-amber-900/20",   border: "border-amber-500/30",   text: "text-amber-300",   icon: "text-amber-400" },
    indigo: { bg: "bg-indigo-900/20",  border: "border-indigo-500/30",  text: "text-indigo-300",  icon: "text-indigo-400" },
    sky:    { bg: "bg-sky-900/20",     border: "border-sky-500/30",     text: "text-sky-300",     icon: "text-sky-400" },
    purple: { bg: "bg-purple-900/20",  border: "border-purple-500/30",  text: "text-purple-300",  icon: "text-purple-400" },
    slate:  { bg: "bg-slate-800/40",   border: "border-gray-700/40",    text: "text-gray-300",    icon: "text-gray-400" },
  };
  const c = colors[color] ?? colors.slate;
  return (
    <div className={cn("rounded-xl border p-4 flex flex-col gap-2", c.bg, c.border)}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{label}</span>
        <Icon className={cn("w-4 h-4", c.icon, pulse && "animate-pulse")} />
      </div>
      <p className={cn("text-2xl font-black", c.text)}>{value}</p>
      {sub && <p className="text-[10px] text-gray-600">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children, icon: Icon }: { children: React.ReactNode; icon?: React.ElementType }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="h-px flex-1 bg-gray-700/40" />
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="w-3 h-3 text-gray-500" />}
        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest whitespace-nowrap">{children}</span>
      </div>
      <div className="h-px flex-1 bg-gray-700/40" />
    </div>
  );
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="w-full bg-gray-800 rounded-full h-1.5 mt-1">
      <div className={cn("h-1.5 rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
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

    // ── 2. Funil com tempo médio ────────────────────────────────────────────
    const statuses = [
      { status: "NEW",            label: "Novos",          color: "bg-sky-500" },
      { status: "IN_PROGRESS",    label: "Em Andamento",   color: "bg-indigo-500" },
      { status: "DOCS_REQUESTED", label: "Docs Solicitados", color: "bg-amber-500" },
      { status: "VISIT_SCHEDULED",label: "Visita Agendada", color: "bg-purple-500" },
      { status: "CONCLUDED",      label: "Concluídos",     color: "bg-emerald-500" },
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

    // ── 3. Performance dos Corretores ───────────────────────────────────────
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

          // Avg first contact time (hours)
          const contactTimes = leads
            .filter(l => l.last_broker_whatsapp_at)
            .map(l => (new Date(l.last_broker_whatsapp_at!).getTime() - new Date(l.created_at).getTime()) / 3600000);
          const avgFirstContact = contactTimes.length > 0
            ? Math.round(contactTimes.reduce((a, b) => a + b, 0) / contactTimes.length * 10) / 10
            : null;

          // Traffic light
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

    // ── 4. IA ROI ───────────────────────────────────────────────────────────
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

    // ── 5. Velocidade de Atendimento ────────────────────────────────────────
    const { data: contactedLeads } = await supabase
      .from("leads")
      .select("created_at, last_broker_whatsapp_at")
      .not("last_broker_whatsapp_at", "is", null)
      .gte("created_at", since)
      .limit(500);

    const buckets = [
      { label: "< 1 hora", max: 1, count: 0, color: "bg-emerald-500" },
      { label: "1h – 4h",  max: 4, count: 0, color: "bg-sky-500" },
      { label: "4h – 24h", max: 24, count: 0, color: "bg-amber-500" },
      { label: "> 24 horas", max: Infinity, count: 0, color: "bg-red-500" },
    ];

    (contactedLeads || []).forEach(l => {
      const h = (new Date(l.last_broker_whatsapp_at!).getTime() - new Date(l.created_at).getTime()) / 3600000;
      if (h < 1) buckets[0].count++;
      else if (h < 4) buckets[1].count++;
      else if (h < 24) buckets[2].count++;
      else buckets[3].count++;
    });
    setSpeedBuckets(buckets);

    // ── 6. Tendência diária ─────────────────────────────────────────────────
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

    // ── Alertas ─────────────────────────────────────────────────────────────
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

  return (
    <div className="p-4 md:p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" /> Cockpit
          </h2>
          <p className="text-[10px] text-gray-600 mt-0.5">
            Atualizado {formatDistanceToNow(lastRefresh, { locale: ptBR, addSuffix: true })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-800 rounded-lg p-1 gap-1">
            {(["7d", "30d"] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={cn("px-3 py-1 rounded-md text-xs font-bold transition-all",
                  period === p ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white")}>
                {p === "7d" ? "7 dias" : "30 dias"}
              </button>
            ))}
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-gray-700/40 text-gray-400 hover:text-white text-xs font-bold transition-all disabled:opacity-40">
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Alertas */}
      <div className="space-y-2">
        {alerts.map((a, i) => (
          <div key={i} className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-bold",
            a.level === "critical" && "bg-red-900/20 border-red-500/40 text-red-300",
            a.level === "warning"  && "bg-amber-900/20 border-amber-500/40 text-amber-300",
            a.level === "ok"       && "bg-emerald-900/10 border-emerald-500/20 text-emerald-400",
          )}>
            {a.level === "critical" && <XCircle className="w-4 h-4 shrink-0 animate-pulse" />}
            {a.level === "warning"  && <AlertTriangle className="w-4 h-4 shrink-0" />}
            {a.level === "ok"       && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            {a.msg}
          </div>
        ))}
      </div>

      {/* ── 1. Linha de Comando ────────────────────────────────────────────── */}
      <div>
        <SectionTitle icon={Shield}>Linha de Comando</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Leads Ativos"      value={pipeline?.total_active ?? "—"}       icon={Activity}    color="indigo" />
          <StatCard label="Nunca Tocados"      value={pipeline?.never_touched ?? "—"}      icon={PhoneOff}    color={(pipeline?.never_touched ?? 0) > 0 ? "red" : "green"} pulse={(pipeline?.never_touched ?? 0) > 0} />
          <StatCard label="Esfriando +48h"     value={pipeline?.cooling ?? "—"}            icon={Clock}       color={(pipeline?.cooling ?? 0) > 5 ? "amber" : "green"} />
          <StatCard label="Sem Corretor"       value={pipeline?.no_broker ?? "—"}          icon={UserX}       color={(pipeline?.no_broker ?? 0) > 0 ? "red" : "green"} pulse={(pipeline?.no_broker ?? 0) > 0} />
          <StatCard label={`Vendas (${period})`} value={pipeline?.concluded_month ?? "—"} icon={TrendingUp}   color="green" />
          <StatCard label="Taxa Conversão"     value={`${pipeline?.conversion_rate ?? 0}%`} icon={Target}    color={(pipeline?.conversion_rate ?? 0) >= 10 ? "green" : "amber"} sub="leads recebidos → venda" />
        </div>
      </div>

      {/* ── 2. Funil com Tempo de Permanência ────────────────────────────── */}
      <div>
        <SectionTitle icon={BarChart2}>Funil — Tempo de Permanência</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {funnel.map(stage => (
            <div key={stage.status} className="bg-slate-800/40 border border-gray-700/40 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest truncate">{stage.label}</span>
                <div className={cn("w-2 h-2 rounded-full", stage.color)} />
              </div>
              <p className="text-2xl font-black text-white">{stage.count}</p>
              <p className={cn("text-xs font-bold mt-1",
                stage.avg_days > 14 ? "text-red-400" :
                stage.avg_days > 7 ? "text-amber-400" : "text-gray-500")}>
                {stage.avg_days > 0 ? `~${stage.avg_days}d parado` : "< 1 dia"}
              </p>
              <MiniBar value={stage.count} max={Math.max(...funnel.map(f => f.count), 1)} color={stage.color} />
            </div>
          ))}
        </div>
      </div>

      {/* ── 3. Ranking de Corretores ──────────────────────────────────────── */}
      <div>
        <SectionTitle icon={Users}>Termômetro de Esforço — Corretores</SectionTitle>
        {brokers.length === 0 ? (
          <p className="text-sm text-gray-600 text-center py-6">Nenhum corretor encontrado.</p>
        ) : (
          <div className="rounded-xl border border-gray-700/40 overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="bg-slate-900/60 border-b border-gray-700/40">
                  <th className="text-left px-4 py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest">Corretor</th>
                  <th className="text-center px-3 py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest">Status</th>
                  <th className="text-center px-3 py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest">Recebidos</th>
                  <th className="text-center px-3 py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest">Contatou</th>
                  <th className="text-center px-3 py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest">Taxa %</th>
                  <th className="text-center px-3 py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest">1º Contato</th>
                  <th className="text-center px-3 py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest">Robô Atuou</th>
                  <th className="text-center px-3 py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest">Converteu</th>
                </tr>
              </thead>
              <tbody>
                {brokers.map(b => (
                  <tr key={b.id} className={cn(
                    "border-b border-gray-700/20 hover:bg-slate-800/30 transition-colors",
                    b.traffic_light === "red" && "bg-red-900/5",
                    b.traffic_light === "yellow" && "bg-amber-900/5",
                  )}>
                    <td className="px-4 py-3 font-bold text-white">{b.name || "—"}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={cn("w-2.5 h-2.5 rounded-full inline-block",
                        b.traffic_light === "green" ? "bg-emerald-400" :
                        b.traffic_light === "yellow" ? "bg-amber-400 animate-pulse" :
                        "bg-red-400 animate-pulse"
                      )} />
                    </td>
                    <td className="px-3 py-3 text-center font-black text-white">{b.received}</td>
                    <td className="px-3 py-3 text-center font-black text-white">{b.contacted}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={cn("font-black text-sm",
                        b.contact_rate >= 80 ? "text-emerald-400" :
                        b.contact_rate >= 50 ? "text-amber-400" : "text-red-400")}>
                        {b.contact_rate}%
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={cn("text-sm font-bold",
                        b.avg_first_contact_h === null ? "text-gray-600" :
                        b.avg_first_contact_h <= 1 ? "text-emerald-400" :
                        b.avg_first_contact_h <= 4 ? "text-sky-400" :
                        b.avg_first_contact_h <= 24 ? "text-amber-400" : "text-red-400")}>
                        {b.avg_first_contact_h === null ? "—" : `${b.avg_first_contact_h}h`}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={cn("font-black",
                        b.auto_followups + b.sentinela_count > 10 ? "text-red-400" :
                        b.auto_followups + b.sentinela_count > 5 ? "text-amber-400" : "text-gray-500")}>
                        {b.auto_followups + b.sentinela_count}x
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={cn("font-black", b.converted > 0 ? "text-emerald-400" : "text-gray-600")}>
                        {b.converted}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 bg-slate-900/40 flex gap-4 text-[10px] text-gray-600">
              <span>🟢 Proativo — contatou rápido, pouca automação</span>
              <span>🟡 Regular — contatou tarde ou depende do robô</span>
              <span>🔴 Inativo — robô faz o trabalho por ele</span>
            </div>
          </div>
        )}
      </div>

      {/* ── 4. IA ROI ──────────────────────────────────────────────────────── */}
      <div>
        <SectionTitle icon={Cpu}>IA — Retorno das Automações</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Prospector */}
          <div className="bg-indigo-900/10 border border-indigo-500/20 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-black text-indigo-300 uppercase tracking-widest">Prospector</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><p className="text-xl font-black text-white">{aiStats?.campaigns_active ?? 0}</p><p className="text-[10px] text-gray-600">Campanhas ativas</p></div>
              <div><p className="text-xl font-black text-white">{aiStats?.prospects_sent ?? 0}</p><p className="text-[10px] text-gray-600">Conversas abertas</p></div>
              <div><p className="text-xl font-black text-emerald-400">{aiStats?.prospects_qualified ?? 0}</p><p className="text-[10px] text-gray-600">Qualificados</p></div>
            </div>
            {(aiStats?.prospects_sent ?? 0) > 0 && (
              <p className="text-[10px] text-indigo-300">
                Taxa de qualificação: {Math.round(((aiStats?.prospects_qualified ?? 0) / (aiStats?.prospects_sent ?? 1)) * 100)}%
              </p>
            )}
          </div>
          {/* Sentinela */}
          <div className="bg-purple-900/10 border border-purple-500/20 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-black text-purple-300 uppercase tracking-widest">Sentinela</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div><p className="text-xl font-black text-white">{aiStats?.sentinela_sessions ?? 0}</p><p className="text-[10px] text-gray-600">Sessões abertas</p></div>
              <div><p className="text-xl font-black text-white">{aiStats?.sentinela_messages ?? 0}</p><p className="text-[10px] text-gray-600">Msgs enviadas</p></div>
            </div>
            <p className="text-[10px] text-purple-300">Reengajamento de leads parados 48h+</p>
          </div>
          {/* Follow-up */}
          <div className="bg-sky-900/10 border border-sky-500/20 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-sky-400" />
              <span className="text-xs font-black text-sky-300 uppercase tracking-widest">Follow-up Auto</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div><p className="text-xl font-black text-white">{aiStats?.followup_auto ?? 0}</p><p className="text-[10px] text-gray-600">Disparos auto</p></div>
              <div><p className="text-xl font-black text-emerald-400">{aiStats?.followup_responded ?? 0}</p><p className="text-[10px] text-gray-600">Leads ativos</p></div>
            </div>
            <p className="text-[10px] text-sky-300">Blocos 1–4 do scheduler</p>
          </div>
        </div>
      </div>

      {/* ── 5. Velocidade de Atendimento ──────────────────────────────────── */}
      <div>
        <SectionTitle icon={Timer}>Velocidade de Atendimento</SectionTitle>
        <div className="bg-slate-800/40 border border-gray-700/40 rounded-xl p-4">
          <div className="space-y-3">
            {speedBuckets.map(bucket => {
              const total = speedBuckets.reduce((a, b) => a + b.count, 0);
              const pct = total > 0 ? Math.round((bucket.count / total) * 100) : 0;
              return (
                <div key={bucket.label} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-24 shrink-0">{bucket.label}</span>
                  <div className="flex-1 bg-gray-800 rounded-full h-4 overflow-hidden">
                    <div
                      className={cn("h-4 rounded-full transition-all flex items-center justify-end pr-2", bucket.color)}
                      style={{ width: `${pct}%`, minWidth: bucket.count > 0 ? "2rem" : 0 }}>
                      {pct > 8 && <span className="text-[10px] font-black text-white">{pct}%</span>}
                    </div>
                  </div>
                  <span className="text-xs font-black text-white w-8 text-right">{bucket.count}</span>
                </div>
              );
            })}
          </div>
          {speedBuckets.reduce((a, b) => a + b.count, 0) === 0 && (
            <p className="text-sm text-gray-600 text-center py-4">Nenhum dado de velocidade no período</p>
          )}
          <p className="text-[10px] text-gray-600 mt-3">
            Tempo entre criação do lead e primeiro contato do corretor via WhatsApp
          </p>
        </div>
      </div>

      {/* ── 6. Tendência Diária ────────────────────────────────────────────── */}
      <div>
        <SectionTitle icon={TrendingUp}>Tendência — Últimos {Math.min(period === "7d" ? 7 : 14, 14)} dias</SectionTitle>
        <div className="bg-slate-800/40 border border-gray-700/40 rounded-xl p-4">
          <div className="flex items-end gap-1 h-28">
            {trend.map(day => (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
                <div className="w-full flex flex-col justify-end gap-0.5" style={{ height: "88px" }}>
                  <div
                    className="w-full bg-indigo-500/60 rounded-t transition-all"
                    style={{ height: `${maxTrend > 0 ? Math.max(4, (day.received / maxTrend) * 80) : 4}px` }}
                    title={`Recebidos: ${day.received}`}
                  />
                  {day.concluded > 0 && (
                    <div
                      className="w-full bg-emerald-500 rounded transition-all absolute"
                      style={{
                        height: `${maxTrend > 0 ? Math.max(2, (day.concluded / maxTrend) * 80) : 2}px`,
                        position: "relative",
                        marginTop: "-4px",
                      }}
                      title={`Vendas: ${day.concluded}`}
                    />
                  )}
                </div>
                <span className="text-[8px] text-gray-600 truncate w-full text-center">{day.date}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-2 text-[10px] text-gray-500">
            <span className="flex items-center gap-1"><span className="w-3 h-2 bg-indigo-500/60 rounded inline-block" /> Leads recebidos</span>
            <span className="flex items-center gap-1"><span className="w-3 h-2 bg-emerald-500 rounded inline-block" /> Vendas</span>
          </div>
        </div>
      </div>

    </div>
  );
}
