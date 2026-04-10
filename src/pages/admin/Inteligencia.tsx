import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Brain, Zap, MessageSquare, Bot, Shield, RefreshCw,
  AlertTriangle, CheckCircle2, XCircle, Clock, Activity,
  Wifi, WifiOff, TrendingUp, TrendingDown, Minus,
  ChevronRight, Cpu, Loader2, AlertOctagon, Info,
} from "lucide-react";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Period = "7d" | "30d" | "all";

type ToolStatus = "ok" | "warning" | "critical" | "inactive";

interface IntelData {
  // Chips
  chipsTotal: number;
  chipsOpen: number;
  chipsOffline: number;

  // Leads saúde
  leadsTotal: number;
  leadsNovos: number;
  leadsParados24h: number;
  leadsParados72h: number;
  leadsPorStatus: { status: string; count: number }[];

  // Cerebro
  cerebroTotal: number;
  cerebroComEnvio: number;
  cerebroSemEnvio: number;
  cerebroMensagens: number;
  cerebroReagendados: number;
  cerebroPulados: number;
  cerebroUltimaExec: string | null;
  cerebroLeadsTravados: { lead: string; action: string; status: string }[];

  // Learning
  learningByAction: { action_type: string; total: number; responderam: number }[];

  // Scheduler
  schedulerTotal: number;
  schedulerComEnvio: number;
  schedulerMensagens: number;
  schedulerUltima: string | null;

  // Agentes (automation_logs)
  agentes: {
    entity_type: string;
    success: number;
    failed: number;
    total: number;
    ultima: string | null;
  }[];

  // Guardian
  guardianPorTipo: {
    check_type: string;
    severity: string;
    total: number;
    auto_fixados: number;
    resolvidos: number;
    ultima: string | null;
  }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sinceDate(period: Period): string | null {
  if (period === "all") return null;
  return new Date(Date.now() - (period === "7d" ? 7 : 30) * 86400000).toISOString();
}

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 2) return "agora";
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  return `${d}d atrás`;
}

function pct(n: number, d: number) {
  if (!d) return "—";
  return `${Math.round((n / d) * 100)}%`;
}

const LEAD_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  NEW:             { label: "Novo",         color: "#38BDF8" },
  IN_PROGRESS:     { label: "Em andamento", color: "#818CF8" },
  VISIT_SCHEDULED: { label: "Visita",       color: "#10B981" },
  DOCS_REQUESTED:  { label: "Docs",         color: "#F59E0B" },
  ABANDONED:       { label: "Abandonado",   color: "#94A3B8" },
  EXCLUDED:        { label: "Excluído",     color: "#EF4444" },
};

const ACTION_LABEL: Record<string, string> = {
  toque_1:        "1º Toque",
  toque_2:        "2º Toque",
  toque_3:        "3º Toque",
  last_chance:    "Última Chance",
  docs_reminder:  "Lembrete Docs",
  sentinela:      "Sentinela",
};

const AGENT_LABEL: Record<string, string> = {
  redistribuicao:           "Redistribuição",
  welcome:                  "Boas-Vindas",
  scoring:                  "Scoring",
  briefing:                 "Briefing",
  classificacao_retroativa: "Classificação Retroativa",
  recuperacao_abandonados:  "Recuperação",
  anti_sobrecarga:          "Anti-Sobrecarga",
  relatorio_diario:         "Relatório Diário",
  sentinela_quentes:        "Sentinela Quentes",
};

const GUARDIAN_LABEL: Record<string, { label: string; desc: string }> = {
  bot_offline:       { label: "Chip offline",       desc: "WhatsApp do corretor desconectado" },
  heartbeat:         { label: "Heartbeat",           desc: "Verificação periódica do sistema" },
  failed_buildup:    { label: "Fila acumulando",     desc: "Leads falhando repetidamente" },
  broker_no_bot:     { label: "Corretor sem chip",   desc: "Corretor sem WhatsApp configurado" },
  queue_stuck:       { label: "Fila travada",        desc: "Leads parados sem processar" },
  zero_sends_streak: { label: "Sem envios",          desc: "Horas consecutivas sem enviar nada" },
};

// ─── Componentes ─────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: ToolStatus }) {
  const cfg = {
    ok:       { icon: CheckCircle2, label: "Operacional", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    warning:  { icon: AlertTriangle, label: "Atenção",    cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
    critical: { icon: XCircle,       label: "Crítico",    cls: "bg-red-500/15 text-red-400 border-red-500/30" },
    inactive: { icon: Minus,         label: "Inativo",    cls: "bg-slate-800 text-slate-500 border-slate-700" },
  }[status];
  const Icon = cfg.icon;
  return (
    <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border", cfg.cls)}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function SeverityIcon({ s }: { s: string }) {
  if (s === "high") return <AlertOctagon className="w-4 h-4 text-red-400" />;
  if (s === "medium") return <AlertTriangle className="w-4 h-4 text-amber-400" />;
  return <Info className="w-4 h-4 text-sky-400" />;
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Inteligencia() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<IntelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<Date>(new Date());

  useEffect(() => { fetchAll(); }, [period]);

  async function fetchAll() {
    setLoading(true);
    try {
      const since = sinceDate(period);

      const [
        chipsRes,
        leadsRes,
        cerebroRes,
        learningRes,
        schedulerRes,
        agentesRes,
        guardianRes,
      ] = await Promise.all([
        // Chips
        supabase.from("bot_instances").select("status"),

        // Leads
        supabase.from("leads").select("status, created_at, last_interaction_at"),

        // Cerebro runs
        (() => {
          let q = supabase.from("cerebro_runs").select("processed,rescheduled,skipped,ran_at,details");
          if (since) q = q.gte("ran_at", since);
          return q.order("ran_at", { ascending: false });
        })(),

        // Cerebro learning
        (() => {
          let q = supabase.from("cerebro_learning").select("action_type,responded");
          if (since) q = q.gte("created_at", since);
          return q;
        })(),

        // Scheduler
        (() => {
          let q = supabase.from("scheduler_runs").select("total,critical,cold,cadence,ran_at");
          if (since) q = q.gte("ran_at", since);
          return q.order("ran_at", { ascending: false });
        })(),

        // Automation logs — usa executed_at
        (() => {
          let q = supabase.from("automation_logs").select("entity_type,status,executed_at");
          if (since) q = q.gte("executed_at", since);
          return q;
        })(),

        // Guardian
        (() => {
          let q = supabase.from("guardian_alerts").select("check_type,severity,auto_fixed,resolved_at,created_at");
          if (since) q = q.gte("created_at", since);
          return q;
        })(),
      ]);

      // ── Chips ──
      const chips = chipsRes.data || [];
      const chipsOpen = chips.filter((c: any) => ["open", "active"].includes((c.status || "").toLowerCase())).length;
      const chipsOffline = chips.filter((c: any) => (c.status || "").toLowerCase() === "offline").length;

      // ── Leads ──
      const leads = leadsRes.data || [];
      const now = Date.now();
      const leadsParados24h = leads.filter((l: any) =>
        l.last_interaction_at &&
        now - new Date(l.last_interaction_at).getTime() > 86400000 &&
        !["EXCLUDED", "ABANDONED"].includes(l.status)
      ).length;
      const leadsParados72h = leads.filter((l: any) =>
        l.last_interaction_at &&
        now - new Date(l.last_interaction_at).getTime() > 72 * 3600000 &&
        !["EXCLUDED", "ABANDONED"].includes(l.status)
      ).length;
      const statusMap: Record<string, number> = {};
      for (const l of leads) statusMap[l.status] = (statusMap[l.status] || 0) + 1;
      const leadsPorStatus = Object.entries(statusMap).map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count);
      const leadsNovos = leads.filter((l: any) => {
        const age = now - new Date(l.created_at).getTime();
        return age < 7 * 86400000;
      }).length;

      // ── Cerebro ──
      const cerebroRows = cerebroRes.data || [];
      const cerebroComEnvio = cerebroRows.filter((r: any) => (r.processed || 0) > 0).length;
      const cerebroSemEnvio = cerebroRows.length - cerebroComEnvio;
      const cerebroMensagens = cerebroRows.reduce((s: number, r: any) => s + (r.processed || 0), 0);
      const cerebroReagendados = cerebroRows.reduce((s: number, r: any) => s + (r.rescheduled || 0), 0);
      const cerebroPulados = cerebroRows.reduce((s: number, r: any) => s + (r.skipped || 0), 0);
      const cerebroUltimaExec = cerebroRows[0]?.ran_at ?? null;

      // Leads travados: pegar da última execução com details
      const lastWithDetails = cerebroRows.find((r: any) => r.details?.items?.length > 0);
      const cerebroLeadsTravados: { lead: string; action: string; status: string }[] = [];
      if (lastWithDetails?.details?.items) {
        for (const item of lastWithDetails.details.items) {
          if (item.status !== "ok" && item.status !== "sent") {
            cerebroLeadsTravados.push({
              lead: item.lead || "?",
              action: item.action || "?",
              status: item.status || "?",
            });
          }
        }
      }

      // ── Learning ──
      const lMap: Record<string, { total: number; responderam: number }> = {};
      for (const r of (learningRes.data || [])) {
        if (!lMap[r.action_type]) lMap[r.action_type] = { total: 0, responderam: 0 };
        lMap[r.action_type].total++;
        if (r.responded) lMap[r.action_type].responderam++;
      }
      const learningByAction = Object.entries(lMap)
        .map(([k, v]) => ({ action_type: k, ...v }))
        .sort((a, b) => b.total - a.total);

      // ── Scheduler ──
      const schedRows = schedulerRes.data || [];
      const schedulerComEnvio = schedRows.filter((r: any) => (r.total || 0) > 0).length;
      const schedulerMensagens = schedRows.reduce((s: number, r: any) => s + (r.total || 0), 0);

      // ── Agentes ──
      const aMap: Record<string, { success: number; failed: number; ultima: string | null }> = {};
      for (const r of (agentesRes.data || [])) {
        if (!aMap[r.entity_type]) aMap[r.entity_type] = { success: 0, failed: 0, ultima: null };
        if (r.status === "success") aMap[r.entity_type].success++;
        else aMap[r.entity_type].failed++;
        if (!aMap[r.entity_type].ultima || r.executed_at > aMap[r.entity_type].ultima!) {
          aMap[r.entity_type].ultima = r.executed_at;
        }
      }
      const agentes = Object.entries(aMap).map(([entity_type, v]) => ({
        entity_type,
        ...v,
        total: v.success + v.failed,
      })).sort((a, b) => b.total - a.total);

      // ── Guardian ──
      const gMap: Record<string, { severity: string; total: number; auto_fixados: number; resolvidos: number; ultima: string | null }> = {};
      for (const r of (guardianRes.data || [])) {
        if (!gMap[r.check_type]) gMap[r.check_type] = { severity: r.severity, total: 0, auto_fixados: 0, resolvidos: 0, ultima: null };
        gMap[r.check_type].total++;
        if (r.auto_fixed) gMap[r.check_type].auto_fixados++;
        if (r.resolved_at) gMap[r.check_type].resolvidos++;
        if (!gMap[r.check_type].ultima || r.created_at > gMap[r.check_type].ultima!) {
          gMap[r.check_type].ultima = r.created_at;
        }
      }
      const guardianPorTipo = Object.entries(gMap)
        .map(([check_type, v]) => ({ check_type, ...v }))
        .sort((a, b) => {
          const order = { high: 0, medium: 1, info: 2 };
          return (order[a.severity as keyof typeof order] ?? 3) - (order[b.severity as keyof typeof order] ?? 3);
        });

      setData({
        chipsTotal: chips.length,
        chipsOpen,
        chipsOffline,
        leadsTotal: leads.length,
        leadsNovos,
        leadsParados24h,
        leadsParados72h,
        leadsPorStatus,
        cerebroTotal: cerebroRows.length,
        cerebroComEnvio,
        cerebroSemEnvio,
        cerebroMensagens,
        cerebroReagendados,
        cerebroPulados,
        cerebroUltimaExec,
        cerebroLeadsTravados,
        learningByAction,
        schedulerTotal: schedRows.length,
        schedulerComEnvio,
        schedulerMensagens,
        schedulerUltima: schedRows[0]?.ran_at ?? null,
        agentes,
        guardianPorTipo,
      });
      setRefreshedAt(new Date());
    } finally {
      setLoading(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
      </div>
    );
  }

  const d = data!;

  // ── Status calculado por ferramenta ─────────────────────────────────────────
  const chipsStatus: ToolStatus =
    d.chipsOffline === 0 ? "ok" :
    d.chipsOffline / d.chipsTotal > 0.5 ? "critical" : "warning";

  const cerebroTaxaFalha = d.cerebroTotal > 0 ? d.cerebroSemEnvio / d.cerebroTotal : 0;
  const cerebroStatus: ToolStatus =
    d.cerebroTotal === 0 ? "inactive" :
    cerebroTaxaFalha > 0.8 ? "critical" :
    cerebroTaxaFalha > 0.4 ? "warning" : "ok";

  const schedStatus: ToolStatus =
    d.schedulerTotal === 0 ? "inactive" :
    d.schedulerComEnvio === 0 ? "warning" : "ok";

  const welcomeAgent = d.agentes.find(a => a.entity_type === "welcome");
  const welcomeStatus: ToolStatus =
    !welcomeAgent ? "inactive" :
    welcomeAgent.failed / welcomeAgent.total > 0.6 ? "critical" :
    welcomeAgent.failed / welcomeAgent.total > 0.3 ? "warning" : "ok";

  const redistAgent = d.agentes.find(a => a.entity_type === "redistribuicao");
  const redistParado = redistAgent
    ? Date.now() - new Date(redistAgent.ultima!).getTime() > 48 * 3600000
    : true;
  const redistStatus: ToolStatus = !redistAgent ? "inactive" : redistParado ? "warning" : "ok";

  // ── Alertas críticos ativos (Guardian) ───────────────────────────────────────
  const alertasCriticos = d.guardianPorTipo.filter(
    a => a.severity === "high" && a.resolvidos < a.total
  );
  const alertasAtivos = d.guardianPorTipo.filter(a => a.resolvidos < a.total);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Brain className="w-5 h-5 text-violet-400" />
            Painel de Inteligência
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Estado real de todas as ferramentas e agentes • {timeAgo(refreshedAt.toISOString())}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden border border-slate-700">
            {(["7d", "30d", "all"] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={cn("px-3 py-1.5 text-xs font-bold transition-all",
                  period === p ? "bg-violet-600 text-white" : "bg-slate-900 text-slate-400 hover:text-white"
                )}>
                {p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : "Tudo"}
              </button>
            ))}
          </div>
          <button onClick={fetchAll} disabled={loading}
            className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-all">
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* ── Diagnóstico Geral ──────────────────────────────────────────────── */}
      <section>
        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-3">Diagnóstico Geral</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {[
            { icon: Wifi, label: "Chips WhatsApp", status: chipsStatus,
              detail: `${d.chipsOpen}/${d.chipsTotal} conectados` },
            { icon: Cpu, label: "Cerebro", status: cerebroStatus,
              detail: cerebroStatus === "critical"
                ? `${Math.round(cerebroTaxaFalha * 100)}% execuções sem envio`
                : `${d.cerebroMensagens} msgs enviadas` },
            { icon: Zap, label: "Scheduler", status: schedStatus,
              detail: schedStatus === "warning"
                ? "Rodando mas sem envios"
                : `${d.schedulerMensagens} toques enviados` },
            { icon: Bot, label: "Boas-Vindas", status: welcomeStatus,
              detail: welcomeAgent
                ? `${welcomeAgent.failed}/${welcomeAgent.total} falhando`
                : "Sem execuções" },
            { icon: Activity, label: "Redistribuição", status: redistStatus,
              detail: redistAgent
                ? (redistParado ? `Parado há ${timeAgo(redistAgent.ultima)}` : `Última: ${timeAgo(redistAgent.ultima)}`)
                : "Sem registros" },
          ].map(({ icon: Icon, label, status, detail }) => (
            <Card key={label} className={cn(
              "p-3 border flex flex-col gap-2",
              status === "critical" ? "bg-red-950/30 border-red-500/30" :
              status === "warning"  ? "bg-amber-950/30 border-amber-500/30" :
              status === "ok"       ? "bg-emerald-950/20 border-emerald-500/20" :
                                      "bg-slate-900/60 border-slate-700/50"
            )}>
              <div className="flex items-center justify-between">
                <Icon className={cn("w-4 h-4",
                  status === "critical" ? "text-red-400" :
                  status === "warning"  ? "text-amber-400" :
                  status === "ok"       ? "text-emerald-400" : "text-slate-600"
                )} />
                <StatusPill status={status} />
              </div>
              <p className="text-xs font-bold text-white">{label}</p>
              <p className="text-[10px] text-slate-400 leading-snug">{detail}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Alertas Ativos (Guardian) ──────────────────────────────────────── */}
      {alertasAtivos.length > 0 && (
        <section>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-3 flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            Alertas Ativos — Guardian
            <span className="text-amber-400 font-black">{alertasAtivos.reduce((s, a) => s + (a.total - a.resolvidos), 0)}</span>
          </p>
          <div className="space-y-2">
            {alertasAtivos.map(a => {
              const info = GUARDIAN_LABEL[a.check_type] || { label: a.check_type, desc: "" };
              const pendentes = a.total - a.resolvidos;
              const pctRes = a.total > 0 ? Math.round((a.resolvidos / a.total) * 100) : 0;
              return (
                <Card key={a.check_type} className={cn(
                  "p-3 border flex items-start gap-3",
                  a.severity === "high"   ? "bg-red-950/20 border-red-500/25" :
                  a.severity === "medium" ? "bg-amber-950/20 border-amber-500/25" :
                                            "bg-slate-900/60 border-slate-700/40"
                )}>
                  <SeverityIcon s={a.severity} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white">{info.label}</span>
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className={cn("font-black text-sm",
                          a.severity === "high" ? "text-red-400" :
                          a.severity === "medium" ? "text-amber-400" : "text-sky-400"
                        )}>{pendentes}</span>
                        <span className="text-slate-500">pendentes</span>
                        {a.resolvidos > 0 && (
                          <span className="text-emerald-400">{a.resolvidos} resolvidos</span>
                        )}
                        {a.auto_fixados > 0 && (
                          <span className="text-sky-400">{a.auto_fixados} auto-fix</span>
                        )}
                        <span className="text-slate-600">último: {timeAgo(a.ultima)}</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">{info.desc}</p>
                    {a.total > 0 && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${pctRes}%` }} />
                        </div>
                        <span className="text-[10px] text-slate-500 shrink-0">{pctRes}% resolvido</span>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Saúde dos Leads ────────────────────────────────────────────────── */}
      <section>
        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-3 flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-sky-400" />
          Saúde dos Leads
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          {[
            { label: "Total de Leads", value: d.leadsTotal, color: "text-white" },
            { label: "Novos (7d)", value: d.leadsNovos, color: "text-sky-400" },
            {
              label: "Parados +24h", value: d.leadsParados24h,
              color: d.leadsParados24h > 20 ? "text-amber-400" : "text-slate-300",
              warn: d.leadsParados24h > 20,
            },
            {
              label: "Parados +72h", value: d.leadsParados72h,
              color: d.leadsParados72h > 10 ? "text-red-400" : "text-slate-300",
              warn: d.leadsParados72h > 10,
            },
          ].map(m => (
            <Card key={m.label} className={cn(
              "p-3 border",
              (m as any).warn ? "bg-red-950/20 border-red-500/25" : "bg-slate-900/60 border-slate-700/50"
            )}>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{m.label}</p>
              <p className={cn("text-2xl font-black mt-1", m.color)}>{m.value}</p>
            </Card>
          ))}
        </div>
        {/* Status breakdown */}
        <Card className="bg-slate-900/60 border-slate-700/50 p-4">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-3">Pipeline por Status</p>
          <div className="space-y-1.5">
            {d.leadsPorStatus.map(ls => {
              const info = LEAD_STATUS_LABEL[ls.status] || { label: ls.status, color: "#64748B" };
              return (
                <div key={ls.status} className="flex items-center gap-3">
                  <span className="text-[10px] text-slate-400 w-28 shrink-0">{info.label}</span>
                  <Bar value={ls.count} max={d.leadsTotal} color={info.color} />
                  <span className="text-xs font-bold text-slate-300 w-8 text-right">{ls.count}</span>
                  <span className="text-[10px] text-slate-600 w-10">{pct(ls.count, d.leadsTotal)}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </section>

      {/* ── Cerebro Orquestrador ───────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            Cerebro Orquestrador
          </p>
          <StatusPill status={cerebroStatus} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <Card className="p-3 bg-slate-900/60 border-slate-700/50">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Execuções</p>
            <p className="text-2xl font-black text-white">{d.cerebroTotal}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Última: {timeAgo(d.cerebroUltimaExec)}</p>
          </Card>
          <Card className={cn("p-3 border", d.cerebroMensagens === 0 ? "bg-red-950/20 border-red-500/25" : "bg-slate-900/60 border-slate-700/50")}>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Mensagens Enviadas</p>
            <p className={cn("text-2xl font-black", d.cerebroMensagens === 0 ? "text-red-400" : "text-cyan-400")}>{d.cerebroMensagens}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{pct(d.cerebroComEnvio, d.cerebroTotal)} execuções ok</p>
          </Card>
          <Card className={cn("p-3 border", d.cerebroReagendados > 200 ? "bg-amber-950/20 border-amber-500/25" : "bg-slate-900/60 border-slate-700/50")}>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Reagendados</p>
            <p className={cn("text-2xl font-black", d.cerebroReagendados > 200 ? "text-amber-400" : "text-white")}>{d.cerebroReagendados}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">leads em retry loop</p>
          </Card>
          <Card className="p-3 bg-slate-900/60 border-slate-700/50">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Sem envio</p>
            <p className={cn("text-2xl font-black", cerebroTaxaFalha > 0.7 ? "text-red-400" : "text-white")}>{d.cerebroSemEnvio}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{pct(d.cerebroSemEnvio, d.cerebroTotal)} das exec.</p>
          </Card>
        </div>

        {/* Leads travados na última execução */}
        {d.cerebroLeadsTravados.length > 0 && (
          <Card className="bg-slate-900/60 border-slate-700/50 p-4 mb-3">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-3">
              Leads travados na última execução ({d.cerebroLeadsTravados.length})
            </p>
            <div className="space-y-1">
              {d.cerebroLeadsTravados.map((item, i) => {
                const isFailedFinal = item.status === "failed";
                const retryNum = item.status.startsWith("retry_") ? item.status.replace("retry_", "") : null;
                return (
                  <div key={i} className="flex items-center gap-3 py-1 border-b border-slate-800 last:border-0">
                    <span className="text-xs text-slate-300 flex-1 truncate">{item.lead}</span>
                    <span className="text-[10px] text-slate-500">{ACTION_LABEL[item.action] || item.action}</span>
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full",
                      isFailedFinal ? "bg-red-500/15 text-red-400" :
                      retryNum === "4" ? "bg-orange-500/15 text-orange-400" :
                      "bg-amber-500/15 text-amber-400"
                    )}>
                      {isFailedFinal ? "FALHOU" : `Retry ${retryNum}`}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-500 mt-3 italic">
              Causa provável: chip do corretor responsável offline. Resolva em Admin → Integrações → Sistema.
            </p>
          </Card>
        )}

        {/* Learning: taxa de resposta */}
        {d.learningByAction.length > 0 && (
          <Card className="bg-slate-900/60 border-slate-700/50 p-4">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-3">
              Taxa de Resposta por Tipo de Toque
              {d.learningByAction.every(r => r.responderam === 0) && (
                <span className="ml-2 text-amber-400 normal-case">⚠ campo responded não está sendo atualizado</span>
              )}
            </p>
            <div className="space-y-2">
              {d.learningByAction.map(row => {
                const taxa = row.total > 0 ? Math.round((row.responderam / row.total) * 100) : 0;
                return (
                  <div key={row.action_type} className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 w-28 shrink-0">{ACTION_LABEL[row.action_type] || row.action_type}</span>
                    <Bar value={row.responderam} max={row.total} color="#22D3EE" />
                    <span className="text-xs font-bold text-slate-300 w-8 text-right">{taxa}%</span>
                    <span className="text-[10px] text-slate-600 w-16 text-right">{row.responderam}/{row.total}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </section>

      {/* ── Follow-up Scheduler ────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            Follow-up Scheduler
          </p>
          <StatusPill status={schedStatus} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3 bg-slate-900/60 border-slate-700/50">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Execuções</p>
            <p className="text-2xl font-black text-white">{d.schedulerTotal}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Última: {timeAgo(d.schedulerUltima)}</p>
          </Card>
          <Card className={cn("p-3 border", d.schedulerMensagens === 0 ? "bg-amber-950/20 border-amber-500/25" : "bg-slate-900/60 border-slate-700/50")}>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Toques Enviados</p>
            <p className={cn("text-2xl font-black", d.schedulerMensagens === 0 ? "text-amber-400" : "text-white")}>{d.schedulerMensagens}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {d.schedulerMensagens === 0
                ? "Rodando mas sem leads para processar"
                : `${pct(d.schedulerComEnvio, d.schedulerTotal)} das exec. com envio`}
            </p>
          </Card>
          <Card className="p-3 bg-slate-900/60 border-slate-700/50">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Com Envio</p>
            <p className="text-2xl font-black text-white">{d.schedulerComEnvio}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{pct(d.schedulerComEnvio, d.schedulerTotal)} das execuções</p>
          </Card>
        </div>
      </section>

      {/* ── Agentes ────────────────────────────────────────────────────────── */}
      {d.agentes.length > 0 && (
        <section>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-3 flex items-center gap-2">
            <Bot className="w-3.5 h-3.5 text-sky-400" />
            Agentes Autônomos
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {d.agentes.map(agent => {
              const taxa = agent.total > 0 ? Math.round((agent.success / agent.total) * 100) : 0;
              const status: ToolStatus = taxa >= 80 ? "ok" : taxa >= 50 ? "warning" : "critical";
              const parado = agent.ultima
                ? Date.now() - new Date(agent.ultima).getTime() > 48 * 3600000
                : false;
              return (
                <Card key={agent.entity_type} className={cn(
                  "p-4 border",
                  status === "critical" ? "bg-red-950/20 border-red-500/25" :
                  status === "warning"  ? "bg-amber-950/20 border-amber-500/25" :
                                          "bg-slate-900/60 border-slate-700/50"
                )}>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <p className="text-xs font-bold text-white">
                        {AGENT_LABEL[agent.entity_type] || agent.entity_type}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Última exec: {timeAgo(agent.ultima)}
                        {parado && <span className="text-amber-400 ml-1">• parado</span>}
                      </p>
                    </div>
                    <StatusPill status={status} />
                  </div>
                  <div className="flex items-end gap-1.5 mb-2">
                    <span className="text-xl font-black text-white">{agent.total}</span>
                    <span className="text-xs text-slate-500 mb-0.5">execuções</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mb-2">
                    <div className="h-full rounded-full transition-all"
                      style={{
                        width: `${taxa}%`,
                        background: taxa >= 80 ? "#10B981" : taxa >= 50 ? "#F59E0B" : "#EF4444",
                      }} />
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-emerald-400">{agent.success} ok</span>
                    <span className="font-bold text-slate-300">{taxa}% sucesso</span>
                    {agent.failed > 0 && <span className="text-red-400">{agent.failed} falhas</span>}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* ── AI Coach placeholder ────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold flex items-center gap-2">
            <Brain className="w-3.5 h-3.5 text-emerald-400" />
            AI Coach — Qualidade dos Corretores
          </p>
          <StatusPill status="inactive" />
        </div>
        <Card className="bg-slate-900/60 border-slate-700/50 border-dashed p-5">
          <div className="flex items-start gap-3">
            <Clock className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-slate-400">Aguardando primeiras análises</p>
              <p className="text-[10px] text-slate-600 mt-1 max-w-lg">
                O AI Coach precisa acumular conversas IA (<code className="bg-slate-800 px-1 rounded">ia_conversations</code>)
                para gerar notas de qualidade. Atualmente há 7 conversas registradas.
                À medida que o sistema processa mais leads com chip conectado, as análises aparecerão aqui com evolução histórica por corretor.
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* Rodapé */}
      <div className="text-[10px] text-slate-700 text-center pb-4">
        Período: {period === "7d" ? "últimos 7 dias" : period === "30d" ? "últimos 30 dias" : "todo o histórico"}
        {" "}• automation_logs usa campo <code>executed_at</code>
        {" "}• cerebro_runs e scheduler_runs usam <code>ran_at</code>
      </div>

    </div>
  );
}
