import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Target, TrendingUp, TrendingDown, Minus, DollarSign, Banknote,
  Loader2, Calendar, Zap, AlertTriangle, CheckCircle2,
} from "lucide-react";

interface Metrics {
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
  team_id: string | null;
}

function fmtBR(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function fmtPeriod(start: string, end: string): string {
  try {
    const s = new Date(start), e = new Date(end);
    const d = (x: Date) => x.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const isoWeek = (d: Date) => {
      const target = new Date(d.valueOf());
      const dayNr = (d.getDay() + 6) % 7;
      target.setDate(target.getDate() - dayNr + 3);
      const firstThursday = target.valueOf();
      target.setMonth(0, 1);
      if (target.getDay() !== 4) target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
      return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
    };
    return `Semana ${isoWeek(s)} (${d(s)} → ${d(e)})`;
  } catch { return "Semana atual"; }
}

interface Props { managerId: string; }

export default function MetaForecastHeader({ managerId }: Props) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_manager_week_metrics", { p_manager_id: managerId });
    if (!error && data) setMetrics(data as Metrics);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [managerId]);

  if (loading && !metrics) {
    return (
      <div className="rounded-xl bg-slate-900/40 border border-gray-700/50 p-3 flex items-center justify-center text-gray-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando meta da semana...
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="rounded-xl bg-slate-900/40 border border-gray-700/50 p-3 text-gray-500 text-sm">
        Sem dados de meta esta semana
      </div>
    );
  }

  const m = metrics;
  const progressPct = Math.min(100, m.progress_pct || 0);
  const forecastDelta = m.forecast_vs_target;
  const onTrack = forecastDelta >= 0;
  const targetWasSet = m.target > 0;

  return (
    <div className={`rounded-xl border p-3 backdrop-blur-sm ${
      !targetWasSet ? "bg-slate-900/40 border-gray-700/50" :
      onTrack ? "bg-gradient-to-br from-emerald-900/30 to-slate-900/40 border-emerald-500/40" :
                "bg-gradient-to-br from-red-900/30 to-slate-900/40 border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.15)]"
    }`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Target className={`w-4 h-4 ${onTrack ? "text-emerald-300" : "text-red-300"}`} />
          <span className="text-xs uppercase tracking-wider text-gray-400">Meta da semana</span>
          <span className="text-xs text-gray-500 inline-flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {fmtPeriod(m.week_start, m.week_end)}
          </span>
        </div>
        {targetWasSet && (
          <div className={`text-xs font-bold inline-flex items-center gap-1 px-2 py-0.5 rounded ${
            onTrack ? "bg-emerald-900/50 text-emerald-200 border border-emerald-500/40" :
                      "bg-red-900/50 text-red-200 border border-red-500/40"
          }`}>
            {onTrack ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
            Forecast {forecastDelta >= 0 ? "+" : ""}{fmtBR(forecastDelta)} vs meta
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 md:gap-3">
        {/* Vendas vs Meta */}
        <div className="md:col-span-2 bg-slate-900/60 border border-gray-700/50 rounded-lg p-2.5">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-[10px] uppercase tracking-wider text-gray-400">Vendas / Meta</span>
            {targetWasSet && (
              <span className={`text-[10px] font-bold ${onTrack ? "text-emerald-300" : "text-red-300"}`}>
                {fmtBR(progressPct)}%
              </span>
            )}
          </div>
          <div className="text-2xl font-black text-white leading-none">
            {m.sales_so_far} <span className="text-gray-500 text-sm font-normal">/ {targetWasSet ? m.target : "—"}</span>
          </div>
          {targetWasSet && (
            <div className="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${onTrack ? "bg-emerald-500" : "bg-red-500"}`}
                   style={{ width: `${progressPct}%` }} />
            </div>
          )}
          {!targetWasSet && (
            <div className="text-[10px] text-amber-400 mt-1">⚠️ Meta semanal não cadastrada</div>
          )}
        </div>

        {/* Forecast */}
        <div className="bg-slate-900/60 border border-gray-700/50 rounded-lg p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-gray-400 inline-flex items-center gap-1">
            <Zap className="w-3 h-3" /> Forecast
          </div>
          <div className="text-xl font-black text-white leading-none mt-1">{fmtBR(m.forecast)}</div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            {m.sales_so_far} feitas + {fmtBR(m.pipeline_quente * 0.45)} quentes + {fmtBR(m.pipeline_frio * 0.10)} frios
          </div>
        </div>

        {/* Pipeline */}
        <div className="bg-slate-900/60 border border-gray-700/50 rounded-lg p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-gray-400">Pipeline</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-black text-orange-300 leading-none">{m.pipeline_quente}</span>
            <span className="text-xs text-gray-500">quente</span>
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            +{m.pipeline_frio} frio · {m.docs_week} docs · {m.visitas_week} visitas
          </div>
        </div>

        {/* CAC */}
        <div className="bg-slate-900/60 border border-gray-700/50 rounded-lg p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-gray-400 inline-flex items-center gap-1">
            <DollarSign className="w-3 h-3" /> CAC
          </div>
          <div className="text-xl font-black text-white leading-none mt-1">
            {m.cac !== null ? fmtMoney(m.cac) : "—"}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">por venda</div>
        </div>

        {/* CPL */}
        <div className="bg-slate-900/60 border border-gray-700/50 rounded-lg p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-gray-400 inline-flex items-center gap-1">
            <Banknote className="w-3 h-3" /> CPL
          </div>
          <div className="text-xl font-black text-white leading-none mt-1">
            {m.cpl !== null ? fmtMoney(m.cpl) : "—"}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            ADS {fmtMoney(m.ads_invested)} · {m.leads_week} leads
          </div>
        </div>
      </div>
    </div>
  );
}
