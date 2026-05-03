import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2, Target, Clock, Zap, TrendingUp, RefreshCw,
  ChevronRight,
} from "lucide-react";
import CoachingDrawer from "./CoachingDrawer";

interface BrokerRow {
  id: string;
  first_name: string;
  last_name: string | null;
  // efficiency JSON
  leads_total: number;
  leads_in_progress: number;
  leads_visit: number;
  leads_docs: number;
  leads_concluded: number;
  leads_abandoned: number;
  lead_to_visit: number | null;
  lead_to_docs: number | null;
  lead_to_sale: number | null;
  visit_to_sale: number | null;
  tpr_avg_min: number | null;
  resp_5min_pct: number | null;
  has_enough_data: boolean;
  efficiency_score: number;
}

interface Props {
  managerId: string;
  periodDays: number;
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function tprColor(min: number | null): string {
  if (min === null) return "text-gray-500";
  if (min < 30) return "text-emerald-300";
  if (min < 120) return "text-amber-300";
  return "text-red-300";
}

function scoreTier(score: number): { label: string; cls: string; emoji: string } {
  if (score >= 25) return { label: "Top",      cls: "bg-amber-900/40 text-amber-200 border-amber-500/40",   emoji: "🏆" };
  if (score >= 15) return { label: "Forte",    cls: "bg-emerald-900/40 text-emerald-200 border-emerald-500/40", emoji: "💪" };
  if (score >= 8)  return { label: "Médio",    cls: "bg-slate-800 text-gray-300 border-gray-600/40",        emoji: "📊" };
  return { label: "Atenção", cls: "bg-red-900/40 text-red-200 border-red-500/40", emoji: "⚠️" };
}

export default function PerformancePanel({ managerId, periodDays }: Props) {
  const [rows, setRows] = useState<BrokerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [coachBroker, setCoachBroker] = useState<BrokerRow | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data: brokers } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("manager_id", managerId)
        .eq("role", "BROKER")
        .order("first_name");

      if (!brokers || brokers.length === 0) { setRows([]); setLoading(false); return; }

      const enriched = await Promise.all(brokers.map(async (b: any) => {
        const { data } = await supabase.rpc("get_broker_efficiency", {
          p_broker_id: b.id, p_period_days: periodDays,
        });
        return { ...b, ...(data as any) } as BrokerRow;
      }));

      enriched.sort((a, b) => b.efficiency_score - a.efficiency_score);
      setRows(enriched);
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [managerId, periodDays]);

  const stats = useMemo(() => {
    const valid = rows.filter(r => r.has_enough_data);
    return {
      total: rows.length,
      avgTpr: valid.length > 0 ? valid.reduce((s, r) => s + (r.tpr_avg_min || 0), 0) / valid.length : null,
      avgResp5: valid.length > 0 ? valid.reduce((s, r) => s + (r.resp_5min_pct || 0), 0) / valid.length : null,
      totalSales: rows.reduce((s, r) => s + r.leads_concluded, 0),
      totalLeads: rows.reduce((s, r) => s + r.leads_total, 0),
    };
  }, [rows]);

  return (
    <>
      {/* Stats top */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <Mini label="Corretores" value={stats.total.toString()} icon={Target} />
        <Mini label="TPR médio"  value={stats.avgTpr !== null ? `${fmt(stats.avgTpr)}min` : "—"} icon={Clock}
              accent={stats.avgTpr !== null && stats.avgTpr < 30 ? "emerald" : stats.avgTpr !== null && stats.avgTpr < 120 ? "amber" : "red"} />
        <Mini label="Resp ≤5min" value={stats.avgResp5 !== null ? `${fmt(stats.avgResp5)}%` : "—"} icon={Zap} />
        <Mini label="Vendas/Lead" value={stats.totalSales > 0 ? `${(stats.totalLeads / stats.totalSales).toFixed(1)}` : "—"} icon={TrendingUp} />
      </div>

      {/* Tabela */}
      <div className="bg-slate-900/40 border border-gray-700/50 rounded-xl overflow-hidden">
        <div className="px-3 py-2 bg-slate-900/80 flex items-center justify-between text-xs">
          <span className="text-gray-400">{periodDays}d · ranking por eficiência</span>
          <button onClick={load} disabled={loading} className="text-gray-400 hover:text-gray-200 inline-flex items-center gap-1">
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-gray-400 uppercase tracking-wider text-[10px]">
              <tr className="border-b border-gray-700/50">
                <th className="text-left px-2.5 py-2">Corretor</th>
                <th className="text-right px-2 py-2">TPR</th>
                <th className="text-right px-2 py-2">5min</th>
                <th className="text-right px-2 py-2">Leads</th>
                <th className="text-right px-2 py-2">L/Vis</th>
                <th className="text-right px-2 py-2">L/Doc</th>
                <th className="text-right px-2 py-2 text-emerald-300">L/Vnd</th>
                <th className="text-right px-2 py-2">Score</th>
                <th className="px-1"></th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr><td colSpan={9} className="text-center text-gray-500 py-6">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Calculando eficiência...
                </td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={9} className="text-center text-gray-500 py-6">Nenhum corretor</td></tr>
              )}
              {rows.map(r => {
                const tier = scoreTier(r.efficiency_score);
                return (
                  <tr key={r.id} className="border-b border-gray-700/30 hover:bg-slate-900/40 transition-colors cursor-pointer"
                      onClick={() => setCoachBroker(r)}>
                    <td className="px-2.5 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{tier.emoji}</span>
                        <div>
                          <div className="text-gray-100 font-medium leading-tight">
                            {r.first_name} {r.last_name?.[0] && r.last_name[0] + "."}
                          </div>
                          {!r.has_enough_data && (
                            <div className="text-[9px] text-amber-400 italic">📌 amostra pequena</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={`text-right px-2 py-2 font-mono ${tprColor(r.tpr_avg_min)}`}>
                      {r.tpr_avg_min !== null ? `${fmt(r.tpr_avg_min)}min` : "—"}
                    </td>
                    <td className="text-right px-2 py-2 font-mono text-gray-200">
                      {r.resp_5min_pct !== null ? `${fmt(r.resp_5min_pct)}%` : "—"}
                    </td>
                    <td className="text-right px-2 py-2 text-gray-300">{r.leads_total}</td>
                    <td className="text-right px-2 py-2 font-mono text-gray-300">{fmt(r.lead_to_visit)}</td>
                    <td className="text-right px-2 py-2 font-mono text-gray-300">{fmt(r.lead_to_docs)}</td>
                    <td className="text-right px-2 py-2 font-mono text-emerald-300 font-bold">{fmt(r.lead_to_sale)}</td>
                    <td className="text-right px-2 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] border ${tier.cls}`}>{r.efficiency_score}</span>
                    </td>
                    <td className="px-1 py-2 text-gray-500"><ChevronRight className="w-3 h-3" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 bg-slate-900/60 text-[10px] text-gray-500 leading-relaxed">
          <strong>L/Vis</strong> = leads necessários para 1 visita ·
          <strong> L/Doc</strong> = pra 1 docs ·
          <strong> L/Vnd</strong> = pra 1 venda (menor é melhor).
          <strong> TPR</strong> = tempo de primeira resposta médio.
          Click no corretor → sessão de coaching.
        </div>
      </div>

      {/* Coaching Drawer (3 abas: Diagnóstico / Conversas / Histórico) */}
      {coachBroker && (
        <CoachingDrawer broker={coachBroker} managerId={managerId} onClose={() => setCoachBroker(null)} periodDays={periodDays} />
      )}
    </>
  );
}

function Mini({ label, value, icon: Icon, accent = "default" }: { label: string; value: string; icon: any; accent?: "default" | "emerald" | "amber" | "red" }) {
  const acc: Record<string, string> = {
    default: "text-gray-200",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    red: "text-red-300",
  };
  return (
    <div className="bg-slate-900/40 border border-gray-700/50 rounded-lg p-2">
      <div className="text-[9px] uppercase tracking-wider text-gray-500 inline-flex items-center gap-1">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className={`text-base font-bold ${acc[accent]} mt-0.5 leading-none`}>{value}</div>
    </div>
  );
}

// CoachingDrawer foi extraído pra ./CoachingDrawer.tsx (3 abas: Diagnóstico/Conversas/Histórico)
