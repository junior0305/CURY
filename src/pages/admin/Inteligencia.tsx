import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Brain, Zap, MessageSquare, Bot, Shield, RefreshCw,
  TrendingUp, TrendingDown, Minus, AlertTriangle,
  CheckCircle2, XCircle, Clock, Users, Activity,
  ChevronRight, BarChart3, Cpu, Loader2
} from "lucide-react";

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Period = "7d" | "30d" | "all";

interface IntelData {
  // Funil
  leadsEntrados: number;
  toquesEnviados: number;
  leadsResponderam: number;
  conversasAbertas: number;
  qualificados: number;
  escalados: number;

  // Cerebro
  cerebroExecucoes: number;
  cerebroProcessados: number;
  cerebroReagendados: number;
  cerebroPulados: number;
  cerebroUltimaExec: string | null;
  learningByAction: { action_type: string; total: number; responderam: number; tempo_medio: number | null }[];

  // Scheduler
  schedulerExecucoes: number;
  schedulerCritical: number;
  schedulerCold: number;
  schedulerCadence: number;
  schedulerTotal: number;

  // IA Chat
  conversasPorStatus: { status: string; total: number }[];
  totalMensagens: number;
  taxaQualificacao: number;

  // Agentes (automation_logs)
  agentesLogs: { entity_type: string; status: string; count: number }[];

  // AI Coach
  coachAnalises: number;
  coachNotaMedia: number | null;
  coachPorCorretor: { broker_id: string; nome: string; nota: number; periodo: string }[];

  // Guardian
  guardianAlertas: { severity: string; count: number }[];

  // Webhooks / leads entrados
  webhookLeads: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sinceDate(period: Period): string | null {
  if (period === "all") return null;
  const days = period === "7d" ? 7 : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function pct(num: number, den: number) {
  if (!den) return "—";
  return `${Math.round((num / den) * 100)}%`;
}

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

const ACTION_LABEL: Record<string, string> = {
  toque_1: "1º Toque",
  toque_2: "2º Toque",
  toque_3: "3º Toque",
  last_chance: "Última Chance",
  docs_reminder: "Lembrete Docs",
  broker_warmup: "Aquecimento",
  broker_alert: "Alerta Corretor",
  manager_alert: "Alerta Gerente",
  sla_first_contact: "SLA 1º Contato",
};

const STATUS_CONV: Record<string, { label: string; color: string }> = {
  qualified:       { label: "Qualificado",  color: "#10B981" },
  escalated:       { label: "Escalado",     color: "#818CF8" },
  no_interest:     { label: "Sem Interesse",color: "#EF4444" },
  waiting_response:{ label: "Aguardando",   color: "#F59E0B" },
  active:          { label: "Ativo",        color: "#00D4FF" },
};

const AGENT_LABEL: Record<string, string> = {
  redistribuicao:             "Redistribuição",
  welcome:                    "Boas-Vindas",
  scoring:                    "Scoring",
  briefing:                   "Briefing Corretor",
  classificacao_retroativa:   "Classificação Retroativa",
  recuperacao_abandonados:    "Recuperação Abandonados",
  anti_sobrecarga:            "Anti-Sobrecarga",
  relatorio_diario:           "Relatório Diário",
  sentinela_quentes:          "Sentinela Quentes",
};

// ─── Componentes menores ─────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, label, color = "text-slate-400" }: { icon: any; label: string; color?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className={cn("w-4 h-4", color)} />
      <span className={cn("text-xs font-bold uppercase tracking-widest", color)}>{label}</span>
    </div>
  );
}

function MetricCard({ label, value, sub, trend, highlight }: {
  label: string; value: string | number; sub?: string;
  trend?: "up" | "down" | "neutral"; highlight?: string;
}) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "up" ? "text-emerald-400" : trend === "down" ? "text-red-400" : "text-slate-500";
  return (
    <Card className="bg-slate-900/60 border-slate-700/50 p-4 flex flex-col gap-1">
      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{label}</span>
      <span className={cn("text-2xl font-black", highlight || "text-white")}>{value}</span>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
      {trend && <TrendIcon className={cn("w-3.5 h-3.5 mt-1", trendColor)} />}
    </Card>
  );
}

function StatusBadge({ ok }: { ok: boolean }) {
  return ok
    ? <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">Operacional</Badge>
    : <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-[10px]">Inativo</Badge>;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function Inteligencia() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<IntelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState(new Date());

  useEffect(() => { fetchAll(); }, [period]);

  async function fetchAll() {
    setLoading(true);
    try {
      const since = sinceDate(period);
      const addFilter = (q: any) => since ? q.gte("created_at", since) : q;
      const addFilterRanAt = (q: any) => since ? q.gte("ran_at", since) : q;

      const [
        cerebroRes,
        learningRes,
        schedulerRes,
        conversasRes,
        mensagensRes,
        agentesRes,
        coachRes,
        coachProfilesRes,
        guardianRes,
        webhookRes,
      ] = await Promise.all([
        addFilterRanAt(supabase.from("cerebro_runs").select("processed,rescheduled,skipped,ran_at").order("ran_at", { ascending: false })),
        addFilter(supabase.from("cerebro_learning").select("action_type,responded,response_time_minutes")),
        addFilterRanAt(supabase.from("scheduler_runs").select("critical,cold,cadence,stale,sentinela,total,ran_at")),
        addFilter(supabase.from("ia_conversations").select("status,escalated_to")),
        addFilter(supabase.from("ia_messages").select("id")),
        addFilter(supabase.from("automation_logs").select("entity_type,status")),
        addFilter(supabase.from("ai_coach_analysis").select("broker_id,quality_score,analysis_period,created_at")),
        supabase.from("profiles").select("id,first_name,full_name").eq("role", "BROKER"),
        addFilter(supabase.from("guardian_alerts").select("severity")),
        addFilter(supabase.from("webhook_logs").select("id").eq("processed", true)),
      ]);

      // Cerebro
      const cerebroRows = cerebroRes.data || [];
      const cerebroExecucoes = cerebroRows.length;
      const cerebroProcessados = cerebroRows.reduce((s: number, r: any) => s + (r.processed || 0), 0);
      const cerebroReagendados = cerebroRows.reduce((s: number, r: any) => s + (r.rescheduled || 0), 0);
      const cerebroPulados = cerebroRows.reduce((s: number, r: any) => s + (r.skipped || 0), 0);
      const cerebroUltimaExec = cerebroRows[0]?.ran_at ?? null;

      // Learning
      const learningRows = learningRes.data || [];
      const learningMap: Record<string, { total: number; responderam: number; tempo_total: number; tempo_count: number }> = {};
      for (const r of learningRows) {
        if (!learningMap[r.action_type]) learningMap[r.action_type] = { total: 0, responderam: 0, tempo_total: 0, tempo_count: 0 };
        learningMap[r.action_type].total++;
        if (r.responded) {
          learningMap[r.action_type].responderam++;
          if (r.response_time_minutes) {
            learningMap[r.action_type].tempo_total += r.response_time_minutes;
            learningMap[r.action_type].tempo_count++;
          }
        }
      }
      const learningByAction = Object.entries(learningMap).map(([k, v]) => ({
        action_type: k,
        total: v.total,
        responderam: v.responderam,
        tempo_medio: v.tempo_count > 0 ? Math.round(v.tempo_total / v.tempo_count) : null,
      })).sort((a, b) => b.total - a.total);

      // Scheduler
      const schedRows = schedulerRes.data || [];
      const schedulerExecucoes = schedRows.length;
      const schedulerCritical = schedRows.reduce((s: number, r: any) => s + (r.critical || 0), 0);
      const schedulerCold = schedRows.reduce((s: number, r: any) => s + (r.cold || 0), 0);
      const schedulerCadence = schedRows.reduce((s: number, r: any) => s + (r.cadence || 0), 0);
      const schedulerTotal = schedRows.reduce((s: number, r: any) => s + (r.total || 0), 0);

      // Conversas IA
      const convRows = conversasRes.data || [];
      const statusCount: Record<string, number> = {};
      for (const r of convRows) {
        statusCount[r.status] = (statusCount[r.status] || 0) + 1;
      }
      const conversasPorStatus = Object.entries(statusCount).map(([status, total]) => ({ status, total }));
      const totalConversas = convRows.length;
      const qualificados = (statusCount["qualified"] || 0) + (statusCount["escalated"] || 0);
      const taxaQualificacao = totalConversas > 0 ? Math.round((qualificados / totalConversas) * 100) : 0;
      const totalMensagens = mensagensRes.data?.length || 0;

      // Agentes
      const agentesMap: Record<string, Record<string, number>> = {};
      for (const r of (agentesRes.data || [])) {
        if (!agentesMap[r.entity_type]) agentesMap[r.entity_type] = {};
        agentesMap[r.entity_type][r.status] = (agentesMap[r.entity_type][r.status] || 0) + 1;
      }
      const agentesLogs = Object.entries(agentesMap).flatMap(([entity_type, statuses]) =>
        Object.entries(statuses).map(([status, count]) => ({ entity_type, status, count }))
      );

      // AI Coach
      const coachRows = coachRes.data || [];
      const coachAnalises = coachRows.length;
      const coachNotaMedia = coachAnalises > 0
        ? Math.round(coachRows.reduce((s: number, r: any) => s + (r.quality_score || 0), 0) / coachAnalises)
        : null;

      const profileMap: Record<string, string> = {};
      for (const p of (coachProfilesRes.data || [])) {
        profileMap[p.id] = p.first_name || p.full_name?.split(" ")[0] || "Corretor";
      }
      const coachPorCorretor = coachRows.map((r: any) => ({
        broker_id: r.broker_id,
        nome: profileMap[r.broker_id] || "—",
        nota: r.quality_score,
        periodo: r.analysis_period,
      })).sort((a: any, b: any) => b.nota - a.nota);

      // Guardian
      const guardianMap: Record<string, number> = {};
      for (const r of (guardianRes.data || [])) {
        guardianMap[r.severity] = (guardianMap[r.severity] || 0) + 1;
      }
      const guardianAlertas = Object.entries(guardianMap).map(([severity, count]) => ({ severity, count }));

      // Webhooks
      const webhookLeads = webhookRes.data?.length || 0;

      setData({
        leadsEntrados: webhookLeads,
        toquesEnviados: cerebroProcessados,
        leadsResponderam: learningRows.filter((r: any) => r.responded).length,
        conversasAbertas: totalConversas,
        qualificados,
        escalados: statusCount["escalated"] || 0,
        cerebroExecucoes, cerebroProcessados, cerebroReagendados, cerebroPulados, cerebroUltimaExec,
        learningByAction,
        schedulerExecucoes, schedulerCritical, schedulerCold, schedulerCadence, schedulerTotal,
        conversasPorStatus, totalMensagens, taxaQualificacao,
        agentesLogs,
        coachAnalises, coachNotaMedia, coachPorCorretor,
        guardianAlertas,
        webhookLeads,
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

  // ── Funil: passos ────────────────────────────────────────────────────────
  const funnelSteps = [
    { label: "Leads Entrados",  value: d.leadsEntrados,    color: "#38BDF8" },
    { label: "Toques IA",       value: d.toquesEnviados,   color: "#818CF8" },
    { label: "Responderam",     value: d.leadsResponderam, color: "#F59E0B" },
    { label: "Conversas IA",    value: d.conversasAbertas, color: "#00D4FF" },
    { label: "Qualificados",    value: d.qualificados,     color: "#10B981" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-8 max-w-7xl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Brain className="w-5 h-5 text-violet-400" />
            Painel de Inteligência
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Efetividade real de todas as ferramentas e agentes de IA</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period filter */}
          <div className="flex rounded-lg overflow-hidden border border-slate-700">
            {(["7d", "30d", "all"] as Period[]).map(p => (
              <button key={p}
                onClick={() => setPeriod(p)}
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
          <span className="text-[10px] text-slate-600">Atualizado {timeAgo(refreshedAt.toISOString())}</span>
        </div>
      </div>

      {/* ── Funil da IA ── */}
      <section>
        <SectionTitle icon={BarChart3} label="Funil da Inteligência Artificial" color="text-violet-400" />
        <Card className="bg-slate-900/60 border-slate-700/50 p-5">
          <div className="flex items-center gap-1 flex-wrap">
            {funnelSteps.map((step, i) => (
              <div key={step.label} className="flex items-center gap-1">
                <div className="flex flex-col items-center px-4 py-3 rounded-xl min-w-[90px]"
                  style={{ background: `${step.color}12`, border: `1px solid ${step.color}30` }}>
                  <span className="text-2xl font-black" style={{ color: step.color }}>{step.value}</span>
                  <span className="text-[10px] text-slate-400 font-bold uppercase mt-0.5 text-center leading-tight">{step.label}</span>
                  {i > 0 && funnelSteps[i - 1].value > 0 && (
                    <span className="text-[9px] mt-1" style={{ color: step.color }}>
                      {pct(step.value, funnelSteps[i - 1].value)}
                    </span>
                  )}
                </div>
                {i < funnelSteps.length - 1 && (
                  <ChevronRight className="w-4 h-4 text-slate-700 shrink-0" />
                )}
              </div>
            ))}
          </div>
          {d.toquesEnviados === 0 && (
            <p className="text-xs text-slate-500 mt-3 italic">
              O cerebro ainda não processou toques neste período — verifique se há leads na fila e se os chips estão conectados.
            </p>
          )}
        </Card>
      </section>

      {/* ── Cerebro Orquestrador ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle icon={Cpu} label="Cerebro Orquestrador" color="text-cyan-400" />
          <StatusBadge ok={d.cerebroExecucoes > 0} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <MetricCard label="Execuções" value={d.cerebroExecucoes} sub={`Última: ${timeAgo(d.cerebroUltimaExec)}`} />
          <MetricCard label="Mensagens Enviadas" value={d.cerebroProcessados} highlight="text-cyan-400" />
          <MetricCard label="Reagendados" value={d.cerebroReagendados} sub="tentativas futuras" />
          <MetricCard label="Pulados" value={d.cerebroPulados}
            highlight={d.cerebroPulados > 100 ? "text-amber-400" : "text-slate-300"}
            sub={d.cerebroPulados > 100 ? "⚠ verificar" : "normal"} />
        </div>

        {/* Learning: taxa de resposta por tipo de ação */}
        {d.learningByAction.length > 0 && (
          <Card className="bg-slate-900/60 border-slate-700/50 p-4">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-3">Taxa de Resposta por Tipo de Toque</p>
            <div className="space-y-2">
              {d.learningByAction.map(row => {
                const taxa = row.total > 0 ? Math.round((row.responderam / row.total) * 100) : 0;
                return (
                  <div key={row.action_type} className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 w-32 shrink-0">{ACTION_LABEL[row.action_type] || row.action_type}</span>
                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-cyan-500 transition-all"
                        style={{ width: `${taxa}%`, minWidth: taxa > 0 ? "4px" : "0" }} />
                    </div>
                    <span className="text-xs font-bold text-slate-300 w-10 text-right">{taxa}%</span>
                    <span className="text-[10px] text-slate-600 w-20">{row.responderam}/{row.total} leads</span>
                    {row.tempo_medio && (
                      <span className="text-[10px] text-slate-600">{row.tempo_medio}min resp.</span>
                    )}
                  </div>
                );
              })}
            </div>
            {d.learningByAction.every(r => r.responderam === 0) && (
              <p className="text-xs text-amber-400/70 mt-3 italic">
                ⚠ Nenhum lead marcado como respondido ainda — o campo <code className="text-xs bg-slate-800 px-1 rounded">responded</code> no cerebro_learning precisa ser atualizado quando o webhook receber resposta.
              </p>
            )}
          </Card>
        )}
      </section>

      {/* ── Follow-up Scheduler ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle icon={Zap} label="Follow-up Scheduler" color="text-amber-400" />
          <StatusBadge ok={d.schedulerExecucoes > 0} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard label="Execuções" value={d.schedulerExecucoes} />
          <MetricCard label="Leads Críticos" value={d.schedulerCritical} highlight="text-red-400" sub="urgência máxima" />
          <MetricCard label="Leads Frios" value={d.schedulerCold} highlight="text-blue-400" sub="sem contato recente" />
          <MetricCard label="Em Cadência" value={d.schedulerCadence} highlight="text-amber-400" sub="sequência automática" />
        </div>
      </section>

      {/* ── IA Chat Engine ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle icon={MessageSquare} label="IA Chat Engine (Conversas)" color="text-violet-400" />
          <StatusBadge ok={d.conversasAbertas > 0} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <MetricCard label="Conversas" value={d.conversasAbertas} />
          <MetricCard label="Mensagens Trocadas" value={d.totalMensagens} highlight="text-violet-400" />
          <MetricCard label="Qualificados" value={d.qualificados} highlight="text-emerald-400" sub={pct(d.qualificados, d.conversasAbertas)} />
          <MetricCard label="Taxa Qualif." value={`${d.taxaQualificacao}%`}
            highlight={d.taxaQualificacao >= 30 ? "text-emerald-400" : d.taxaQualificacao >= 10 ? "text-amber-400" : "text-slate-300"} />
        </div>
        {d.conversasPorStatus.length > 0 && (
          <Card className="bg-slate-900/60 border-slate-700/50 p-4">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-3">Distribuição por Status</p>
            <div className="flex flex-wrap gap-2">
              {d.conversasPorStatus.map(s => {
                const info = STATUS_CONV[s.status] || { label: s.status, color: "#64748B" };
                return (
                  <div key={s.status} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
                    style={{ background: `${info.color}15`, border: `1px solid ${info.color}30` }}>
                    <span className="text-sm font-black" style={{ color: info.color }}>{s.total}</span>
                    <span className="text-xs text-slate-400">{info.label}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </section>

      {/* ── AI Coach ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle icon={Brain} label="AI Coach — Qualidade dos Corretores" color="text-emerald-400" />
          <StatusBadge ok={d.coachAnalises > 0} />
        </div>
        {d.coachAnalises === 0 ? (
          <Card className="bg-slate-900/60 border-slate-700/50 border-dashed p-6 text-center">
            <Brain className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-500">Aguardando primeiras análises</p>
            <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
              O AI Coach roda 3x por semana. À medida que as conversas IA acumulam, notas de qualidade por corretor vão aparecer aqui com evolução histórica.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <MetricCard label="Análises Geradas" value={d.coachAnalises} highlight="text-emerald-400" />
            <MetricCard label="Nota Média" value={d.coachNotaMedia ?? "—"}
              highlight={d.coachNotaMedia && d.coachNotaMedia >= 70 ? "text-emerald-400" : d.coachNotaMedia && d.coachNotaMedia >= 40 ? "text-amber-400" : "text-red-400"}
              sub="de 100 pontos" />
            <MetricCard label="Corretores Avaliados" value={d.coachPorCorretor.length} />
          </div>
        )}
        {d.coachPorCorretor.length > 0 && (
          <Card className="bg-slate-900/60 border-slate-700/50 p-4 mt-3">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-3">Ranking de Qualidade</p>
            <div className="space-y-2">
              {d.coachPorCorretor.slice(0, 10).map((c, i) => (
                <div key={c.broker_id} className="flex items-center gap-3">
                  <span className="text-xs text-slate-600 w-4">{i + 1}</span>
                  <span className="text-xs text-slate-300 w-24 truncate">{c.nome}</span>
                  <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{
                        width: `${c.nota}%`,
                        background: c.nota >= 70 ? "#10B981" : c.nota >= 40 ? "#F59E0B" : "#EF4444"
                      }} />
                  </div>
                  <span className="text-xs font-bold w-8 text-right"
                    style={{ color: c.nota >= 70 ? "#10B981" : c.nota >= 40 ? "#F59E0B" : "#EF4444" }}>
                    {c.nota}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </section>

      {/* ── Agentes ── */}
      {d.agentesLogs.length > 0 && (
        <section>
          <SectionTitle icon={Activity} label="Agentes Autônomos" color="text-sky-400" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(
              d.agentesLogs.reduce((acc: Record<string, { success: number; failed: number; total: number }>, row) => {
                if (!acc[row.entity_type]) acc[row.entity_type] = { success: 0, failed: 0, total: 0 };
                acc[row.entity_type].total += row.count;
                if (row.status === "success") acc[row.entity_type].success += row.count;
                else acc[row.entity_type].failed += row.count;
                return acc;
              }, {})
            ).map(([agente, stats]) => {
              const taxa = stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0;
              return (
                <Card key={agente} className="bg-slate-900/60 border-slate-700/50 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white">{AGENT_LABEL[agente] || agente}</span>
                    {taxa >= 80
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      : taxa >= 50
                      ? <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      : <XCircle className="w-3.5 h-3.5 text-red-400" />
                    }
                  </div>
                  <div className="flex items-end gap-1.5 mb-2">
                    <span className="text-xl font-black text-white">{stats.total}</span>
                    <span className="text-xs text-slate-500 mb-0.5">execuções</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mb-1">
                    <div className="h-full rounded-full bg-sky-500"
                      style={{ width: `${taxa}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-emerald-400">{stats.success} ok</span>
                    <span className="text-slate-500">{taxa}% sucesso</span>
                    {stats.failed > 0 && <span className="text-red-400">{stats.failed} falhas</span>}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Guardian ── */}
      {d.guardianAlertas.length > 0 && (
        <section>
          <SectionTitle icon={Shield} label="Sistema Guardian — Alertas" color="text-amber-400" />
          <div className="flex flex-wrap gap-3">
            {d.guardianAlertas.map(a => {
              const color = a.severity === "high" ? "#EF4444" : a.severity === "medium" ? "#F59E0B" : "#38BDF8";
              const label = a.severity === "high" ? "Crítico" : a.severity === "medium" ? "Médio" : "Baixo";
              return (
                <div key={a.severity} className="flex items-center gap-2 px-4 py-3 rounded-xl"
                  style={{ background: `${color}12`, border: `1px solid ${color}30` }}>
                  <span className="text-2xl font-black" style={{ color }}>{a.count}</span>
                  <div>
                    <p className="text-xs font-bold" style={{ color }}>{label}</p>
                    <p className="text-[10px] text-slate-500">alertas</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── AI Sentinela ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle icon={Users} label="AI Sentinela" color="text-pink-400" />
          <StatusBadge ok={false} />
        </div>
        <Card className="bg-slate-900/60 border-slate-700/50 border-dashed p-5 text-center">
          <p className="text-xs text-slate-500">
            Sentinela ativa mas sem sessões registradas no período — leads quentes monitorados em tempo real.
          </p>
        </Card>
      </section>

      {/* Rodapé informativo */}
      <div className="text-[10px] text-slate-700 text-center pb-4">
        Dados atualizados em tempo real via Supabase • Período: {period === "7d" ? "últimos 7 dias" : period === "30d" ? "últimos 30 dias" : "todo o histórico"}
      </div>

    </div>
  );
}
