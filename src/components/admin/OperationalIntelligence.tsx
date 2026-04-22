import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Brain,
  Cpu,
  RefreshCw,
  Shield,
  Wifi,
  WifiOff,
  Zap,
  Clock,
  UserX,
  Activity,
  TrendingUp,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Types ─────────────────────────────────────────────────────────────────────

interface IgnoredLead {
  id: string;
  name: string;
  status: string;
  created_at: string;
  contact_attempts: number;
  broker_name: string;
  hours_waiting: number;
}

interface StaleNegotiating {
  id: string;
  name: string;
  broker_name: string;
  days_stuck: number;
  negotiating_since: string;
}

interface ChipStat {
  id: string;
  chip_name: string;
  instance_name: string;
  chip_status: string;
  sends_24h: number;
  leads_responded_24h: number;
  total_leads: number;
}

interface AgentStat {
  name: string;
  icon: string;
  runs_24h: number;
  issues_found: number;
  auto_fixed: number;
  last_run: string | null;
  status: "ok" | "warn" | "error" | "idle";
  detail: string;
}

interface BrokerIgnoreRank {
  broker_name: string;
  broker_id: string;
  ignored_count: number;
}

interface IntelData {
  ignored_leads: IgnoredLead[];
  stale_negotiating: StaleNegotiating[];
  chip_stats: ChipStat[];
  agent_stats: AgentStat[];
  broker_ignore_rank: BrokerIgnoreRank[];
  unresolved_alerts: number;
  active_bot_count: number;
  offline_bot_count: number;
  tokens_24h: number;
  new_leads_24h: number;
  concluded_24h: number;
  loaded_at: Date | null;
}

const EMPTY: IntelData = {
  ignored_leads: [],
  stale_negotiating: [],
  chip_stats: [],
  agent_stats: [],
  broker_ignore_rank: [],
  unresolved_alerts: 0,
  active_bot_count: 0,
  offline_bot_count: 0,
  tokens_24h: 0,
  new_leads_24h: 0,
  concluded_24h: 0,
  loaded_at: null,
};

// ── Main Component ─────────────────────────────────────────────────────────────

export function OperationalIntelligence() {
  const [data, setData] = useState<IntelData>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [
        ignoredRes,
        staleRes,
        chipsRes,
        guardianLogRes,
        alertsRes,
        automationRes,
        tokensRes,
        leadsRes,
      ] = await Promise.all([
        // Leads ignorados (NEW/IN_PROGRESS com broker atribuído, sem contato >2h)
        supabase
          .from("leads")
          .select("id, name, status, created_at, contact_attempts, broker_id, profiles!broker_id(first_name)")
          .in("status", ["NEW", "IN_PROGRESS"])
          .not("broker_id", "is", null)
          .eq("contact_attempts", 0)
          .lt("created_at", new Date(Date.now() - 2 * 3600 * 1000).toISOString())
          .order("created_at", { ascending: true })
          .limit(30),

        // Leads NEGOTIATING parados >15 dias
        supabase
          .from("leads")
          .select("id, name, negotiating_since, broker_id, profiles!broker_id(first_name)")
          .eq("status", "NEGOTIATING")
          .not("negotiating_since", "is", null)
          .lt("negotiating_since", new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString())
          .order("negotiating_since", { ascending: true })
          .limit(20),

        // Chips
        supabase
          .from("bot_instances")
          .select("id, name, instance_name, status")
          .order("name"),

        // Guardian health log (últimas 24h)
        supabase
          .from("system_health_log")
          .select("run_at, checks_run, issues_found, auto_fixed, summary_json")
          .gte("run_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
          .order("run_at", { ascending: false })
          .limit(50),

        // Alertas não resolvidos
        supabase
          .from("guardian_alerts")
          .select("id, check_type, severity, message, auto_fixed, created_at")
          .is("resolved_at", null)
          .order("created_at", { ascending: false })
          .limit(5),

        // Automation logs (últimas 24h)
        supabase
          .from("automation_logs")
          .select("id, status, executed_at, error_message")
          .gte("executed_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
          .order("executed_at", { ascending: false })
          .limit(200),

        // Tokens (ia_messages últimas 24h)
        supabase
          .from("ia_messages")
          .select("ai_tokens_used")
          .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),

        // Leads novos e concluídos hoje
        supabase
          .from("leads")
          .select("status, created_at")
          .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
      ]);

      // ── Process ignored leads ────────────────────────────────────────────
      const ignoredLeads: IgnoredLead[] = (ignoredRes.data || []).map((l: any) => ({
        id: l.id,
        name: l.name || "Sem nome",
        status: l.status,
        created_at: l.created_at,
        contact_attempts: l.contact_attempts || 0,
        broker_name: l.profiles?.first_name || "Sem corretor",
        hours_waiting: Math.round((Date.now() - new Date(l.created_at).getTime()) / 3600000),
      }));

      // ── Broker ignore ranking ────────────────────────────────────────────
      const brokerMap: Record<string, { name: string; count: number }> = {};
      ignoredLeads.forEach((l) => {
        if (!brokerMap[l.broker_name]) brokerMap[l.broker_name] = { name: l.broker_name, count: 0 };
        brokerMap[l.broker_name].count++;
      });
      const brokerIgnoreRank: BrokerIgnoreRank[] = Object.entries(brokerMap)
        .map(([name, v]) => ({ broker_name: name, broker_id: "", ignored_count: v.count }))
        .sort((a, b) => b.ignored_count - a.ignored_count);

      // ── Stale negotiating ────────────────────────────────────────────────
      const staleNegotiating: StaleNegotiating[] = (staleRes.data || []).map((l: any) => ({
        id: l.id,
        name: l.name || "Sem nome",
        broker_name: l.profiles?.first_name || "Sem corretor",
        days_stuck: Math.floor((Date.now() - new Date(l.negotiating_since).getTime()) / 86400000),
        negotiating_since: l.negotiating_since,
      }));

      // ── Chip stats ───────────────────────────────────────────────────────
      const allChips = chipsRes.data || [];
      const activeBots = allChips.filter((b: any) => ["open", "active", "online"].includes(b.status)).length;
      const offlineBots = allChips.filter((b: any) => ["offline", "disconnected"].includes(b.status)).length;

      // Leads com atividade de chip nas últimas 24h
      const cutoff24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const leadsWithSends = await supabase
        .from("leads")
        .select("broker_id, last_broker_whatsapp_at, last_lead_response_at")
        .gte("last_broker_whatsapp_at", cutoff24h);

      // Group by bot - we approximate chip activity via leads
      const chipStats: ChipStat[] = allChips.map((b: any) => ({
        id: b.id,
        chip_name: b.name,
        instance_name: b.instance_name,
        chip_status: b.status,
        sends_24h: 0,
        leads_responded_24h: 0,
        total_leads: 0,
      }));

      // ── Guardian stats ───────────────────────────────────────────────────
      const guardianLogs = guardianLogRes.data || [];
      const guardianRuns = guardianLogs.length;
      const guardianIssues = guardianLogs.reduce((s: number, r: any) => s + (r.issues_found || 0), 0);
      const guardianFixed = guardianLogs.reduce((s: number, r: any) => s + (r.auto_fixed || 0), 0);
      const lastGuardianRun = guardianLogs[0]?.run_at || null;

      const unresolvedAlerts = alertsRes.data?.length || 0;

      // ── Automation stats ─────────────────────────────────────────────────
      const automationLogs = automationRes.data || [];
      const autoSuccess = automationLogs.filter((l: any) => l.status === "success").length;
      const autoFailed = automationLogs.filter((l: any) => l.status === "failed").length;
      const lastAuto = automationLogs[0]?.executed_at || null;

      // ── Tokens ──────────────────────────────────────────────────────────
      const tokens24h = (tokensRes.data || []).reduce(
        (s: number, m: any) => s + (m.ai_tokens_used || 0),
        0
      );

      // ── Leads today ─────────────────────────────────────────────────────
      const leadsToday = leadsRes.data || [];
      const newLeads24h = leadsToday.length;
      const concluded24h = leadsToday.filter((l: any) => l.status === "CONCLUDED").length;

      // ── Agent stats array ────────────────────────────────────────────────
      const agentStats: AgentStat[] = [
        {
          name: "Sistema Guardian",
          icon: "🛡️",
          runs_24h: guardianRuns,
          issues_found: guardianIssues,
          auto_fixed: guardianFixed,
          last_run: lastGuardianRun,
          status: guardianRuns === 0 ? "error" : unresolvedAlerts > 5 ? "warn" : "ok",
          detail: `${unresolvedAlerts} alertas ativos · ${guardianFixed} auto-corrigidos`,
        },
        {
          name: "Agentes (Automação)",
          icon: "⚡",
          runs_24h: automationLogs.length,
          issues_found: autoFailed,
          auto_fixed: autoSuccess,
          last_run: lastAuto,
          status: automationLogs.length === 0 ? "idle" : autoFailed > autoSuccess ? "warn" : "ok",
          detail: `${autoSuccess} sucesso · ${autoFailed} falha`,
        },
      ];

      setData({
        ignored_leads: ignoredLeads,
        stale_negotiating: staleNegotiating,
        chip_stats: chipStats,
        agent_stats: agentStats,
        broker_ignore_rank: brokerIgnoreRank,
        unresolved_alerts: unresolvedAlerts,
        active_bot_count: activeBots,
        offline_bot_count: offlineBots,
        tokens_24h: tokens24h,
        new_leads_24h: newLeads24h,
        concluded_24h: concluded24h,
        loaded_at: new Date(),
      });
    } catch (err) {
      console.error("[OperationalIntelligence] erro:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        Carregando inteligência operacional...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-cyan-400" />
          <span className="text-sm text-gray-400">
            {data.loaded_at
              ? `Atualizado ${formatDistanceToNow(data.loaded_at, { locale: ptBR, addSuffix: true })}`
              : "Carregando..."}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={load}
          className="text-gray-400 hover:text-white gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Atualizar
        </Button>
      </div>

      {/* ── KPIs rápidos ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={<AlertTriangle className="w-4 h-4 text-red-400" />}
          label="Leads Ignorados"
          value={data.ignored_leads.length}
          color={data.ignored_leads.length > 0 ? "border-red-500/50 bg-red-950/20" : "border-white/10 bg-white/3"}
          sub="sem contato >2h"
        />
        <KpiCard
          icon={<Clock className="w-4 h-4 text-orange-400" />}
          label="Negoc. Paradas"
          value={data.stale_negotiating.length}
          color={data.stale_negotiating.length > 0 ? "border-orange-500/50 bg-orange-950/20" : "border-white/10 bg-white/3"}
          sub=">15 dias sem avanço"
        />
        <KpiCard
          icon={<Wifi className="w-4 h-4 text-emerald-400" />}
          label="Chips Online"
          value={data.active_bot_count}
          color="border-emerald-500/30 bg-emerald-950/10"
          sub={`${data.offline_bot_count} offline`}
        />
        <KpiCard
          icon={<Zap className="w-4 h-4 text-purple-400" />}
          label="Tokens Hoje"
          value={data.tokens_24h > 0 ? `${(data.tokens_24h / 1000).toFixed(1)}k` : "0"}
          color="border-purple-500/30 bg-purple-950/10"
          sub="últimas 24h"
        />
      </div>

      {/* ── Bloco 1: Corretores Ignorando Leads ─────────────────────────── */}
      <Card className="border border-red-500/30 bg-red-950/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-black text-white flex items-center gap-2">
            <UserX className="w-4 h-4 text-red-400" />
            CORRETORES IGNORANDO LEADS
            {data.ignored_leads.length > 0 && (
              <Badge className="bg-red-500/20 text-red-300 border-red-500/30 text-[10px]">
                {data.ignored_leads.length} leads
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.ignored_leads.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="w-8 h-8 text-emerald-600" />} text="Nenhum lead sendo ignorado agora" />
          ) : (
            <div className="space-y-3">
              {/* Ranking de corretores que mais ignoram */}
              {data.broker_ignore_rank.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {data.broker_ignore_rank.map((b) => (
                    <div
                      key={b.broker_name}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-950/40 border border-red-500/30"
                    >
                      <span className="text-[10px] font-black text-red-300">{b.broker_name}</span>
                      <Badge className="bg-red-500 text-white text-[9px] px-1.5 py-0 h-4">
                        {b.ignored_count}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              {/* Lista de leads */}
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {data.ignored_leads.map((lead) => (
                  <div
                    key={lead.id}
                    className={cn(
                      "flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs",
                      lead.hours_waiting > 24
                        ? "bg-red-950/40 border-red-500/40"
                        : "bg-white/3 border-white/10"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-black text-red-400 shrink-0">
                        {lead.hours_waiting}h
                      </span>
                      <span className="text-white font-bold truncate">{lead.name}</span>
                      <Badge variant="outline" className="text-[9px] border-white/20 text-gray-400 shrink-0">
                        {lead.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-amber-400 font-bold">{lead.broker_name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Bloco 2: Negociações Paradas ─────────────────────────────────── */}
      {data.stale_negotiating.length > 0 && (
        <Card className="border border-orange-500/30 bg-orange-950/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-400" />
              NEGOCIAÇÕES PARADAS (+15 DIAS)
              <Badge className="bg-orange-500/20 text-orange-300 border-orange-500/30 text-[10px]">
                {data.stale_negotiating.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {data.stale_negotiating.map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-orange-950/30 border border-orange-500/30 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-black text-orange-400 shrink-0">
                      {lead.days_stuck}d
                    </span>
                    <span className="text-white font-bold truncate">{lead.name}</span>
                  </div>
                  <span className="text-[10px] text-amber-400 font-bold shrink-0">{lead.broker_name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* ── Bloco 3: Chips ─────────────────────────────────────────────── */}
        <Card className="border border-white/10 bg-white/3">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-cyan-400" />
              STATUS DOS CHIPS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
              {data.chip_stats.map((chip) => {
                const isOnline = ["open", "active", "online"].includes(chip.chip_status);
                const isConnecting = chip.chip_status === "connecting";
                return (
                  <div
                    key={chip.id}
                    className={cn(
                      "flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs",
                      isOnline
                        ? "bg-emerald-950/20 border-emerald-500/30"
                        : isConnecting
                        ? "bg-yellow-950/20 border-yellow-500/30"
                        : "bg-red-950/20 border-red-500/30"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isOnline ? (
                        <Wifi className="w-3 h-3 text-emerald-400 shrink-0" />
                      ) : isConnecting ? (
                        <Loader2 className="w-3 h-3 text-yellow-400 shrink-0 animate-spin" />
                      ) : (
                        <WifiOff className="w-3 h-3 text-red-400 shrink-0" />
                      )}
                      <span className={cn("font-bold truncate", isOnline ? "text-white" : "text-gray-500")}>
                        {chip.chip_name}
                      </span>
                    </div>
                    <Badge
                      className={cn(
                        "text-[9px] px-1.5 border",
                        isOnline
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                          : isConnecting
                          ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
                          : "bg-red-500/20 text-red-300 border-red-500/30"
                      )}
                    >
                      {chip.chip_status === "open" ? "online" : chip.chip_status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* ── Bloco 4: Agentes ───────────────────────────────────────────── */}
        <Card className="border border-white/10 bg-white/3">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-purple-400" />
              AGENTES — ÚLTIMAS 24H
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.agent_stats.map((agent) => (
                <div
                  key={agent.name}
                  className={cn(
                    "px-3 py-3 rounded-lg border",
                    agent.status === "ok"
                      ? "bg-emerald-950/20 border-emerald-500/30"
                      : agent.status === "warn"
                      ? "bg-amber-950/20 border-amber-500/30"
                      : agent.status === "error"
                      ? "bg-red-950/20 border-red-500/30"
                      : "bg-white/3 border-white/10"
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{agent.icon}</span>
                      <span className="text-xs font-black text-white">{agent.name}</span>
                    </div>
                    <AgentStatusBadge status={agent.status} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center mb-1.5">
                    <div>
                      <div className="text-lg font-black text-white">{agent.runs_24h}</div>
                      <div className="text-[9px] text-gray-500">execuções</div>
                    </div>
                    <div>
                      <div className={cn("text-lg font-black", agent.issues_found > 0 ? "text-amber-400" : "text-white")}>
                        {agent.issues_found}
                      </div>
                      <div className="text-[9px] text-gray-500">problemas</div>
                    </div>
                    <div>
                      <div className="text-lg font-black text-emerald-400">{agent.auto_fixed}</div>
                      <div className="text-[9px] text-gray-500">resolvidos</div>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-500">{agent.detail}</p>
                  {agent.last_run && (
                    <p className="text-[10px] text-gray-600 mt-0.5">
                      Última execução:{" "}
                      {formatDistanceToNow(new Date(agent.last_run), { locale: ptBR, addSuffix: true })}
                    </p>
                  )}
                </div>
              ))}

              {/* Alertas ativos do Guardian */}
              {data.unresolved_alerts > 0 && (
                <div className="px-3 py-2 rounded-lg bg-amber-950/30 border border-amber-500/30">
                  <div className="flex items-center gap-2 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="text-amber-300 font-bold">
                      {data.unresolved_alerts} alerta{data.unresolved_alerts !== 1 ? "s" : ""} ativo{data.unresolved_alerts !== 1 ? "s" : ""} não resolvido{data.unresolved_alerts !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Bloco 5: Funil do dia ─────────────────────────────────────────── */}
      <Card className="border border-white/10 bg-white/3">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-black text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-400" />
            FUNIL — ÚLTIMAS 24H
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FunnelToday />
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({
  icon,
  label,
  value,
  color,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
  sub: string;
}) {
  return (
    <div className={cn("rounded-xl border p-3.5", color)}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-black text-white">{value}</div>
      <div className="text-[10px] text-gray-600 mt-0.5">{sub}</div>
    </div>
  );
}

function AgentStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    ok: { label: "OK", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
    warn: { label: "ATENÇÃO", cls: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
    error: { label: "ERRO", cls: "bg-red-500/20 text-red-300 border-red-500/30" },
    idle: { label: "INATIVO", cls: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
  };
  const s = map[status] || map.idle;
  return (
    <Badge className={cn("text-[9px] px-1.5 border", s.cls)}>{s.label}</Badge>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      {icon}
      <p className="text-xs text-gray-600">{text}</p>
    </div>
  );
}

// ── Funnel do dia ─────────────────────────────────────────────────────────────

function FunnelToday() {
  const [funnel, setFunnel] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    supabase
      .from("leads")
      .select("status")
      .then(({ data }) => {
        if (!data) return;
        const counts: Record<string, number> = {};
        data.forEach((l: any) => {
          counts[l.status] = (counts[l.status] || 0) + 1;
        });
        setFunnel(counts);
      });
  }, []);

  const stages = [
    { key: "NEW", label: "Novos", color: "bg-blue-500" },
    { key: "IN_PROGRESS", label: "Em Andamento", color: "bg-indigo-500" },
    { key: "NEGOTIATING", label: "Negociando", color: "bg-purple-500" },
    { key: "VISIT_SCHEDULED", label: "Visita Marc.", color: "bg-cyan-500" },
    { key: "VISITA_REALIZADA", label: "Visita Feita", color: "bg-teal-500" },
    { key: "DOCS_REQUESTED", label: "Docs.", color: "bg-amber-500" },
    { key: "CONCLUDED", label: "Concluído", color: "bg-emerald-500" },
    { key: "ABANDONED", label: "Abandonado", color: "bg-red-500" },
  ];

  if (!funnel) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Loader2 className="w-3 h-3 animate-spin" />
        Carregando...
      </div>
    );
  }

  const maxVal = Math.max(...stages.map((s) => funnel[s.key] || 0), 1);

  return (
    <div className="space-y-2">
      {stages.map((stage) => {
        const val = funnel[stage.key] || 0;
        const pct = Math.round((val / maxVal) * 100);
        return (
          <div key={stage.key} className="flex items-center gap-3">
            <span className="text-[10px] text-gray-500 w-24 shrink-0 text-right">{stage.label}</span>
            <div className="flex-1 h-4 rounded bg-white/5 overflow-hidden">
              <div
                className={cn("h-full rounded transition-all", stage.color)}
                style={{ width: `${pct}%`, opacity: 0.8 }}
              />
            </div>
            <span className="text-xs font-bold text-white w-8 shrink-0">{val}</span>
          </div>
        );
      })}
    </div>
  );
}
