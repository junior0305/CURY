// MetaThermometer — barra única de meta (mensal+semanal+forecast)
// Clicável: colapsado mostra resumo, expandido mostra detalhe + alerta.

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Calendar,
  ChevronDown, Zap, DollarSign, Banknote, Target, Loader2,
} from "lucide-react";

interface WeekMetrics {
  week_start: string;
  week_end: string;
  target: number;
  target_monthly: number;
  sales_so_far: number;
  progress_pct: number | null;
  pipeline_quente: number;
  pipeline_frio: number;
  forecast: number;
  forecast_vs_target: number;
  leads_week: number;
  visitas_week: number;
  docs_week: number;
  ads_invested: number;
  cac: number | null;
  cpl: number | null;
}

interface Props {
  managerId: string;
  teamId?: string | null;
}

// Cor / status — gradiente progressivo: vermelho → âmbar → amarelo → verde → ciano → azul
// Quanto melhor a meta, mais "azul" — sinal de excelência.
function statusFromPct(pct: number, daysLeft: number, daysTotal: number) {
  const expectedPct = Math.max(0, Math.min(100, ((daysTotal - daysLeft) / daysTotal) * 100));
  const lag = pct - expectedPct;
  // Crítico (>20% atrás)        — vermelho
  // Atenção (10-20% atrás)       — âmbar
  // Quase lá (2-10% atrás)       — amarelo
  // No ritmo (-2 a +5%)          — verde
  // Acelerando (+5 a +15%)       — ciano
  // Superando (>15% à frente)    — azul (excelência)
  if (lag < -20) return { color: "#EF4444", label: "Crítico",     icon: TrendingDown,  severity: "crit" as const };
  if (lag < -10) return { color: "#F59E0B", label: "Atenção",     icon: AlertTriangle, severity: "warn" as const };
  if (lag < -2)  return { color: "#FBBF24", label: "Quase lá",    icon: AlertTriangle, severity: "warn" as const };
  if (lag < 5)   return { color: "#10B981", label: "No ritmo",    icon: CheckCircle2,  severity: "ok"   as const };
  if (lag < 15)  return { color: "#06B6D4", label: "Acelerando",  icon: TrendingUp,    severity: "ok"   as const };
  return        { color: "#3B82F6", label: "Superando",   icon: TrendingUp,    severity: "ok"   as const };
}

function fmtMoney(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("pt-BR", {
    style: "currency", currency: "BRL", maximumFractionDigits: 0,
  });
}

export default function MetaThermometer({ managerId, teamId }: Props) {
  const [metrics, setMetrics] = useState<WeekMetrics | null>(null);
  const [monthlyGoal, setMonthlyGoal] = useState<number | null>(null);
  const [monthlySales, setMonthlySales] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  // Hook no topo, ANTES dos returns antecipados de loading/sem-dados.
  // Chamado depois deles, quebraria as regras de hooks na transição.
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: weekData }, monthRes, salesRes] = await Promise.all([
        supabase.rpc("get_manager_week_metrics", { p_manager_id: managerId }),
        teamId ? supabase
          .from("team_goals")
          .select("sales_target")
          .eq("team_id", teamId)
          .eq("goal_type", "monthly")
          .gte("month", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10))
          .order("created_at", { ascending: false })
          .limit(1) : Promise.resolve({ data: [] }),
        // Vendas do mês atual
        (async () => {
          const { data: brokers } = await supabase
            .from("profiles")
            .select("id")
            .eq("manager_id", managerId)
            .eq("role", "BROKER");
          const ids = (brokers || []).map((b: any) => b.id);
          if (ids.length === 0) return { count: 0 };
          const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
          const { count } = await supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .in("broker_id", ids)
            .eq("status", "CONCLUDED")
            .gte("last_interaction_at", monthStart);
          return { count: count || 0 };
        })(),
      ]);

      if (weekData) setMetrics(weekData as WeekMetrics);
      const goalRow = (monthRes.data as any)?.[0];
      setMonthlyGoal(goalRow?.sales_target ?? null);
      setMonthlySales(salesRes.count);
      setLoading(false);
    })();
  }, [managerId, teamId]);

  if (loading) {
    return (
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-5 flex items-center gap-3 text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">carregando termômetro…</span>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-5 text-slate-400 text-sm">
        Sem dados de meta para o time. Configure em Admin → Financeiro → Metas.
      </div>
    );
  }

  // Cálculos
  const now = new Date();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysInMonth = monthEnd.getDate();
  const dayOfMonth = now.getDate();
  const daysLeftMonth = Math.max(1, daysInMonth - dayOfMonth);

  const monthPct = monthlyGoal ? (monthlySales / monthlyGoal) * 100 : 0;
  const monthStatus = statusFromPct(monthPct, daysLeftMonth, daysInMonth);

  const weekPct = metrics.target > 0 ? (metrics.sales_so_far / metrics.target) * 100 : 0;
  const forecastDelta = metrics.forecast_vs_target;
  const forecastOk = forecastDelta >= 0;

  const ritmoNecessario = monthlyGoal
    ? Math.max(0, (monthlyGoal - monthlySales) / daysLeftMonth)
    : 0;
  const ritmoAtual = dayOfMonth > 0 ? monthlySales / dayOfMonth : 0;
  const ritmoOk = ritmoAtual >= ritmoNecessario;

  const StatusIcon = monthStatus.icon;

  // "Respiração" de contraste — só quando atenção/crítico, e nunca com
  // reduzir-movimento ligado. Loop infinito numa tela de trabalho é ruído
  // permanente; aqui ele sobrevive porque carrega informação (meta em risco).
  const shouldBreathe = monthStatus.severity !== "ok" && !reduceMotion;

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: -4 }}
      animate={shouldBreathe ? {
        opacity: 1,
        y: 0,
        filter: ["brightness(0.98) saturate(0.98)", "brightness(1.04) saturate(1.06)", "brightness(0.98) saturate(0.98)"],
      } : { opacity: 1, y: 0 }}
      transition={{
        opacity: { duration: 0.18, ease: [0.23, 1, 0.32, 1] },
        y: { duration: 0.18, ease: [0.23, 1, 0.32, 1] },
        filter: shouldBreathe ? { duration: 5, repeat: Infinity, ease: "easeInOut" } : undefined,
      }}
      className="rounded-2xl overflow-hidden border relative"
      style={{
        background: "var(--crm-card)",
        // A cor de status vive na borda e no ícone, não num glow de 32px em volta
        // do card. Sombra difusa colorida é o que faz a tela parecer "de template".
        borderColor: `${monthStatus.color}55`,
        boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)",
      }}
    >
      {/* ─── Barra resumo (sempre visível) ──────────────────────────────── */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full px-5 py-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors"
      >
        {/* Status */}
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${monthStatus.color}20`, border: `1px solid ${monthStatus.color}50` }}
        >
          <StatusIcon className="w-5 h-5" style={{ color: monthStatus.color }} />
        </div>

        {/* Métricas em chips */}
        <div className="flex-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-left">
          {/* Mês */}
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span
                className="text-[11px] uppercase tracking-[0.18em] font-black px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                style={{
                  background: `${monthStatus.color}22`,
                  color: monthStatus.color,
                  border: `1px solid ${monthStatus.color}50`,
                }}
              >
                <Target className="w-2.5 h-2.5" /> META MÊS
              </span>
              <span className="text-[11px] text-slate-500 tabular-nums">{daysLeftMonth}d</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span
                className="text-4xl font-black tabular-nums leading-none"
                style={{
                  color: monthStatus.color,
                  textShadow: shouldBreathe ? `0 0 16px ${monthStatus.color}50` : `0 0 12px ${monthStatus.color}30`,
                }}
              >
                {monthlySales}
              </span>
              <span className="text-slate-500 text-base font-medium">/ {monthlyGoal ?? "—"}</span>
              {monthlyGoal && (
                <span className="text-sm font-black ml-1" style={{ color: monthStatus.color }}>
                  {Math.round(monthPct)}%
                </span>
              )}
            </div>
          </div>

          <div className="h-8 w-px bg-slate-800 hidden sm:block" />

          {/* Semana */}
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span
                className="text-[11px] uppercase tracking-[0.18em] font-black px-1.5 py-0.5 rounded inline-flex items-center gap-1 bg-slate-800/80 text-slate-300 border border-slate-700/60"
              >
                <Target className="w-2.5 h-2.5" /> META SEMANA
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-100 tabular-nums">
                {metrics.sales_so_far}
              </span>
              <span className="text-slate-500 text-sm">/ {metrics.target || "—"}</span>
              {metrics.target > 0 && (
                <span className="text-xs font-bold text-slate-400 ml-1">
                  {Math.round(weekPct)}%
                </span>
              )}
            </div>
          </div>

          <div className="h-8 w-px bg-slate-800 hidden md:block" />

          {/* Forecast */}
          <div className="flex flex-col">
            <span className="text-[11px] uppercase tracking-widest text-slate-500 font-bold flex items-center gap-1">
              <Zap className="w-3 h-3" /> Forecast
            </span>
            <div className="flex items-center gap-1">
              <span
                className={`text-xl font-black tabular-nums ${
                  forecastOk ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {metrics.forecast.toFixed(1)}
              </span>
              <span
                className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                  forecastOk ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"
                }`}
              >
                {forecastDelta >= 0 ? "+" : ""}{forecastDelta.toFixed(1)} vs meta
              </span>
            </div>
          </div>

          <div className="h-8 w-px bg-slate-800 hidden lg:block" />

          {/* Ritmo */}
          <div className="hidden lg:flex flex-col">
            <span className="text-[11px] uppercase tracking-widest text-slate-500 font-bold">
              Ritmo / dia
            </span>
            <div className="flex items-baseline gap-1.5">
              <span
                className={`text-xl font-black tabular-nums ${
                  ritmoOk ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {ritmoAtual.toFixed(1)}
              </span>
              <span className="text-slate-500 text-xs">precisa {ritmoNecessario.toFixed(1)}</span>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span
              className="text-xs font-black uppercase tracking-widest px-2 py-1 rounded-md"
              style={{
                background: `${monthStatus.color}15`,
                color: monthStatus.color,
                border: `1px solid ${monthStatus.color}40`,
              }}
            >
              {monthStatus.label}
            </span>
          </div>
        </div>

        <motion.div animate={{ rotate: expanded ? 180 : 0 }} className="text-slate-500 shrink-0">
          <ChevronDown className="w-5 h-5" />
        </motion.div>
      </button>

      {/* ─── Painel expandido ────────────────────────────────────────────── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden border-t border-slate-800/60"
          >
            <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <DetailCard
                label="Pipeline quente"
                value={metrics.pipeline_quente}
                sub={`+${metrics.pipeline_frio} frio`}
                color="#F97316"
              />
              <DetailCard
                label="Visitas (sem)"
                value={metrics.visitas_week}
                sub={`${metrics.docs_week} em docs`}
                color="#06B6D4"
              />
              <DetailCard
                label="CAC"
                value={fmtMoney(metrics.cac)}
                sub="por venda"
                color="#A78BFA"
                icon={DollarSign}
              />
              <DetailCard
                label="CPL"
                value={fmtMoney(metrics.cpl)}
                sub={`${metrics.leads_week} leads · ADS ${fmtMoney(metrics.ads_invested)}`}
                color="#22D3EE"
                icon={Banknote}
              />
            </div>

            {/* Termômetro semanal animado */}
            {metrics.target > 0 && (
              <div className="px-5 pb-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] uppercase tracking-widest text-slate-500 font-bold flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" /> Progresso da semana
                  </span>
                  <span className="text-xs text-slate-400 tabular-nums">{Math.round(weekPct)}%</span>
                </div>
                <div className="h-2 bg-slate-800/80 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: Math.min(100, weekPct) / 100 }}
                    transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                    className="h-full w-full rounded-full origin-left"
                    style={{
                      background: `linear-gradient(90deg, ${monthStatus.color}80, ${monthStatus.color})`,
                      boxShadow: `0 0 12px ${monthStatus.color}80`,
                    }}
                  />
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function DetailCard({
  label, value, sub, color, icon: Icon = Target,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  icon?: any;
}) {
  return (
    <div
      className="rounded-xl p-3 border"
      style={{
        background: `${color}08`,
        borderColor: `${color}30`,
      }}
    >
      <div
        className="text-[11px] uppercase tracking-widest font-bold flex items-center gap-1 mb-1"
        style={{ color: `${color}DD` }}
      >
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className="text-lg font-black tabular-nums" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}
