import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  Activity, AlertTriangle, Users, Zap, Bot, RefreshCw,
  TrendingUp, Clock, CalendarX, UserX, Wifi, WifiOff,
  CheckCircle2, XCircle, ArrowRight, PhoneOff,
} from "lucide-react";
import { formatDistanceToNow, subHours, subDays, startOfDay, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PipelineStats {
  total_active: number;
  never_touched: number;
  cooling: number;       // +48h sem contato
  no_next_action: number;
  concluded_week: number;
  conversion_rate: number;
}

interface BrokerRow {
  id: string;
  name: string;
  active_leads: number;
  no_action_leads: number;
  worked_week: number;
  last_activity: string | null;
  status: "active" | "slow" | "idle";
}

interface BotStats {
  welcome_today: number;
  responded_today: number;
  followups_today: number;
  last_webhook: string | null;
}

interface DistributionStats {
  leads_today: number;
  leads_yesterday: number;
  no_broker: number;
}

interface Alert {
  id: string;
  level: "critical" | "warning" | "info";
  message: string;
  time: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="h-px flex-1 bg-gray-700/40" />
      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest whitespace-nowrap">{children}</span>
      <div className="h-px flex-1 bg-gray-700/40" />
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function Cockpit() {
  const [pipeline, setPipeline] = useState<PipelineStats | null>(null);
  const [brokers, setBrokers] = useState<BrokerRow[]>([]);
  const [bot, setBot] = useState<BotStats | null>(null);
  const [distribution, setDistribution] = useState<DistributionStats | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    const todayStart = startOfDay(now).toISOString();
    const yesterdayStart = startOfDay(subDays(now, 1)).toISOString();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 }).toISOString();
    const h48 = subHours(now, 48).toISOString();
    const h4  = subHours(now, 4).toISOString();
    const h72 = subHours(now, 72).toISOString();

    // ── Pipeline ──────────────────────────────────────────────────────────────
    const [
      { count: totalActive },
      { count: neverTouched },
      { count: cooling },
      { count: noNextAction },
      { count: concludedWeek },
      { count: newWeek },
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
        .is("next_action_date", null)
        .not("status", "in", '("CONCLUDED","ABANDONED","EXCLUDED")'),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .eq("status", "CONCLUDED")
        .gte("last_interaction_at", weekStart),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .gte("created_at", weekStart),
    ]);

    const convRate = newWeek ? Math.round(((concludedWeek ?? 0) / newWeek) * 100) : 0;

    setPipeline({
      total_active:    totalActive    ?? 0,
      never_touched:   neverTouched   ?? 0,
      cooling:         cooling        ?? 0,
      no_next_action:  noNextAction   ?? 0,
      concluded_week:  concludedWeek  ?? 0,
      conversion_rate: convRate,
    });

    // ── Corretores ────────────────────────────────────────────────────────────
    const { data: brokerProfiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .eq("role", "BROKER")
      .eq("lead_assignment_enabled", true);

    if (brokerProfiles?.length) {
      const rows: BrokerRow[] = await Promise.all(
        brokerProfiles.map(async (b) => {
          const [
            { count: active },
            { count: noAction },
            { count: worked },
            { data: lastLead },
          ] = await Promise.all([
            supabase.from("leads").select("id", { count: "exact", head: true })
              .eq("broker_id", b.id)
              .not("status", "in", '("CONCLUDED","ABANDONED","EXCLUDED")'),
            supabase.from("leads").select("id", { count: "exact", head: true })
              .eq("broker_id", b.id)
              .is("next_action_date", null)
              .not("status", "in", '("CONCLUDED","ABANDONED","EXCLUDED")'),
            supabase.from("leads").select("id", { count: "exact", head: true })
              .eq("broker_id", b.id)
              .gte("last_interaction_at", weekStart)
              .not("status", "in", '("CONCLUDED","ABANDONED","EXCLUDED")'),
            supabase.from("leads").select("last_interaction_at")
              .eq("broker_id", b.id)
              .order("last_interaction_at", { ascending: false })
              .limit(1),
          ]);

          const lastAt = lastLead?.[0]?.last_interaction_at ?? null;
          const hoursIdle = lastAt
            ? (now.getTime() - new Date(lastAt).getTime()) / 3600000
            : 999;

          const status: BrokerRow["status"] =
            hoursIdle < 8 ? "active" :
            hoursIdle < 48 ? "slow" : "idle";

          return {
            id:            b.id,
            name:          `${b.first_name ?? ""} ${b.last_name ?? ""}`.trim(),
            active_leads:  active   ?? 0,
            no_action_leads: noAction ?? 0,
            worked_week:   worked   ?? 0,
            last_activity: lastAt,
            status,
          };
        })
      );

      setBrokers(rows.sort((a, b) => {
        const order = { idle: 0, slow: 1, active: 2 };
        return order[a.status] - order[b.status];
      }));
    }

    // ── Bot ───────────────────────────────────────────────────────────────────
    const [
      { count: welcomeToday },
      { count: respondedToday },
      { count: followupsToday },
      { data: lastWebhookData },
    ] = await Promise.all([
      supabase.from("leads").select("id", { count: "exact", head: true })
        .not("last_broker_whatsapp_at", "is", null)
        .gte("created_at", todayStart),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .not("welcome_responded_at", "is", null)
        .gte("welcome_responded_at", todayStart),
      supabase.from("internal_notifications").select("id", { count: "exact", head: true })
        .eq("type", "COLD_FOLLOWUP_SENT")
        .gte("created_at", todayStart),
      supabase.from("leads").select("received_at")
        .not("received_at", "is", null)
        .order("received_at", { ascending: false })
        .limit(1),
    ]);

    setBot({
      welcome_today:   welcomeToday   ?? 0,
      responded_today: respondedToday ?? 0,
      followups_today: followupsToday ?? 0,
      last_webhook:    lastWebhookData?.[0]?.received_at ?? null,
    });

    // ── Distribuição ──────────────────────────────────────────────────────────
    const [
      { count: leadsToday },
      { count: leadsYesterday },
      { count: noBroker },
    ] = await Promise.all([
      supabase.from("leads").select("id", { count: "exact", head: true })
        .gte("created_at", todayStart),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .gte("created_at", yesterdayStart)
        .lt("created_at", todayStart),
      supabase.from("leads").select("id", { count: "exact", head: true })
        .is("broker_id", null)
        .not("status", "in", '("CONCLUDED","ABANDONED","EXCLUDED")'),
    ]);

    setDistribution({
      leads_today:     leadsToday     ?? 0,
      leads_yesterday: leadsYesterday ?? 0,
      no_broker:       noBroker       ?? 0,
    });

    // ── Alertas ───────────────────────────────────────────────────────────────
    const newAlerts: Alert[] = [];

    // Leads sem corretor há mais de 1h
    if ((noBroker ?? 0) > 0) {
      newAlerts.push({
        id: "no-broker",
        level: "critical",
        message: `${noBroker} lead(s) sem corretor atribuído`,
        time: now.toISOString(),
      });
    }

    // Corretores sem atividade há 72h+ com leads ativos
    const idleBrokers = brokerProfiles?.filter(b => {
      const row = brokers.find(r => r.id === b.id);
      return row?.status === "idle" && (row?.active_leads ?? 0) > 0;
    });
    if (idleBrokers?.length) {
      // re-check after brokers state is set below
    }

    // Leads esfriando crítico
    if ((cooling ?? 0) > 10) {
      newAlerts.push({
        id: "cooling",
        level: "warning",
        message: `${cooling} leads sem contato há mais de 48h`,
        time: now.toISOString(),
      });
    }

    // Bot sem receber webhook há mais de 6h
    const lastWh = lastWebhookData?.[0]?.received_at;
    if (lastWh) {
      const webhookAge = (now.getTime() - new Date(lastWh).getTime()) / 3600000;
      if (webhookAge > 6) {
        newAlerts.push({
          id: "webhook-stale",
          level: "warning",
          message: `Último lead recebido há ${Math.floor(webhookAge)}h — verificar integração`,
          time: lastWh,
        });
      }
    }

    // Leads nunca tocados
    if ((neverTouched ?? 0) > 5) {
      newAlerts.push({
        id: "never-touched",
        level: "warning",
        message: `${neverTouched} leads nunca receberam contato do corretor`,
        time: now.toISOString(),
      });
    }

    if (newAlerts.length === 0) {
      newAlerts.push({
        id: "ok",
        level: "info",
        message: "Nenhum alerta crítico no momento",
        time: now.toISOString(),
      });
    }

    setAlerts(newAlerts);
    setLastRefresh(now);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5 * 60 * 1000); // refresh a cada 5min
    return () => clearInterval(interval);
  }, [load]);

  const statusBadge = (s: BrokerRow["status"]) => {
    if (s === "active") return <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">ATIVO</span>;
    if (s === "slow")   return <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">LENTO</span>;
    return <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-red-500/20 text-red-300 border border-red-500/30 animate-pulse">PARADO</span>;
  };

  const webhookOnline = bot?.last_webhook
    ? (new Date().getTime() - new Date(bot.last_webhook).getTime()) / 3600000 < 6
    : false;

  return (
    <div className="p-4 md:p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-400" /> Cockpit
          </h2>
          <p className="text-[10px] text-gray-600 mt-0.5">
            Atualizado {formatDistanceToNow(lastRefresh, { locale: ptBR, addSuffix: true })}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-gray-700/40 text-gray-400 hover:text-white hover:border-gray-500 text-xs font-bold transition-all disabled:opacity-40"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          Atualizar
        </button>
      </div>

      {/* ── Alertas ────────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {alerts.map(a => (
          <div key={a.id} className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-bold",
            a.level === "critical" && "bg-red-900/20 border-red-500/40 text-red-300",
            a.level === "warning"  && "bg-amber-900/20 border-amber-500/40 text-amber-300",
            a.level === "info"     && "bg-emerald-900/10 border-emerald-500/20 text-emerald-400",
          )}>
            {a.level === "critical" && <XCircle className="w-4 h-4 shrink-0 animate-pulse" />}
            {a.level === "warning"  && <AlertTriangle className="w-4 h-4 shrink-0" />}
            {a.level === "info"     && <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span className="flex-1">{a.message}</span>
            {a.level !== "info" && (
              <span className="text-[10px] font-normal opacity-60">
                {formatDistanceToNow(new Date(a.time), { locale: ptBR, addSuffix: true })}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* ── Pipeline ───────────────────────────────────────────────────────── */}
      <div>
        <SectionTitle>Saúde do Pipeline</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Leads Ativos"       value={pipeline?.total_active   ?? "—"} icon={Activity}   color="indigo" />
          <StatCard label="Nunca Tocados"       value={pipeline?.never_touched  ?? "—"} icon={PhoneOff}   color={( pipeline?.never_touched ?? 0) > 0 ? "red" : "green"} pulse={(pipeline?.never_touched ?? 0) > 0} />
          <StatCard label="Esfriando +48h"      value={pipeline?.cooling        ?? "—"} icon={Clock}      color={(pipeline?.cooling ?? 0) > 5 ? "amber" : "green"} />
          <StatCard label="Sem Próxima Ação"    value={pipeline?.no_next_action ?? "—"} icon={CalendarX}  color={(pipeline?.no_next_action ?? 0) > 10 ? "amber" : "slate"} />
          <StatCard label="Vendas na Semana"    value={pipeline?.concluded_week ?? "—"} icon={TrendingUp}  color="green" />
          <StatCard label="Conversão Semana"    value={`${pipeline?.conversion_rate ?? 0}%`} icon={CheckCircle2} color={(pipeline?.conversion_rate ?? 0) >= 10 ? "green" : "amber"} sub="leads novos → venda" />
        </div>
      </div>

      {/* ── Distribuição ───────────────────────────────────────────────────── */}
      <div>
        <SectionTitle>Distribuição de Leads</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard label="Chegaram Hoje"     value={distribution?.leads_today     ?? "—"} icon={Zap}    color="sky" sub={`${distribution?.leads_yesterday ?? 0} ontem`} />
          <StatCard label="Chegaram Ontem"    value={distribution?.leads_yesterday ?? "—"} icon={ArrowRight} color="slate" />
          <StatCard label="Sem Corretor"      value={distribution?.no_broker       ?? "—"} icon={UserX}  color={(distribution?.no_broker ?? 0) > 0 ? "red" : "green"} pulse={(distribution?.no_broker ?? 0) > 0} />
        </div>
      </div>

      {/* ── Bot ─────────────────────────────────────────────────────────────── */}
      <div>
        <SectionTitle>Automação & Bot</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Boas-Vindas Hoje"   value={bot?.welcome_today   ?? "—"} icon={Bot}    color="indigo" />
          <StatCard label="Responderam Hoje"   value={bot?.responded_today ?? "—"} icon={CheckCircle2} color={(bot?.responded_today ?? 0) > 0 ? "green" : "slate"} />
          <StatCard label="Follow-ups Hoje"    value={bot?.followups_today ?? "—"} icon={RefreshCw}   color="sky" />
          <div className={cn(
            "rounded-xl border p-4 flex flex-col gap-2",
            webhookOnline ? "bg-emerald-900/20 border-emerald-500/30" : "bg-red-900/20 border-red-500/30"
          )}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Integração</span>
              {webhookOnline
                ? <Wifi className="w-4 h-4 text-emerald-400" />
                : <WifiOff className="w-4 h-4 text-red-400 animate-pulse" />
              }
            </div>
            <p className={cn("text-sm font-black", webhookOnline ? "text-emerald-300" : "text-red-300")}>
              {webhookOnline ? "Online" : "Offline"}
            </p>
            <p className="text-[10px] text-gray-600">
              {bot?.last_webhook
                ? `Último lead: ${formatDistanceToNow(new Date(bot.last_webhook), { locale: ptBR, addSuffix: true })}`
                : "Nenhum lead recebido"}
            </p>
          </div>
        </div>
      </div>

      {/* ── Corretores ──────────────────────────────────────────────────────── */}
      <div>
        <SectionTitle>Atividade dos Corretores</SectionTitle>
        {brokers.length === 0 ? (
          <p className="text-sm text-gray-600 text-center py-6">Nenhum corretor encontrado.</p>
        ) : (
          <div className="rounded-xl border border-gray-700/40 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900/60 border-b border-gray-700/40">
                  <th className="text-left px-4 py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest">Corretor</th>
                  <th className="text-center px-3 py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest">Status</th>
                  <th className="text-center px-3 py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest">Ativos</th>
                  <th className="text-center px-3 py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest hidden md:table-cell">Sem Ação</th>
                  <th className="text-center px-3 py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest hidden md:table-cell">Trabalhados/Sem</th>
                  <th className="text-left px-3 py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest hidden lg:table-cell">Último Contato</th>
                </tr>
              </thead>
              <tbody>
                {brokers.map((b, i) => (
                  <tr key={b.id}
                    className={cn(
                      "border-b border-gray-700/20 transition-colors hover:bg-slate-800/30",
                      b.status === "idle" && "bg-red-900/5",
                      b.status === "slow" && "bg-amber-900/5",
                    )}>
                    <td className="px-4 py-3">
                      <span className="font-bold text-white text-sm">{b.name || "—"}</span>
                    </td>
                    <td className="px-3 py-3 text-center">{statusBadge(b.status)}</td>
                    <td className="px-3 py-3 text-center">
                      <span className="font-black text-white">{b.active_leads}</span>
                    </td>
                    <td className="px-3 py-3 text-center hidden md:table-cell">
                      <span className={cn("font-black", b.no_action_leads > 10 ? "text-red-400" : b.no_action_leads > 5 ? "text-amber-400" : "text-gray-400")}>
                        {b.no_action_leads}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center hidden md:table-cell">
                      <span className={cn("font-black", b.worked_week > 5 ? "text-emerald-400" : b.worked_week > 0 ? "text-amber-400" : "text-red-400")}>
                        {b.worked_week}
                      </span>
                    </td>
                    <td className="px-3 py-3 hidden lg:table-cell">
                      <span className="text-xs text-gray-500">
                        {b.last_activity
                          ? formatDistanceToNow(new Date(b.last_activity), { locale: ptBR, addSuffix: true })
                          : "Nunca"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
