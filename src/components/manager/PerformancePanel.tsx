import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2, Target, Clock, Zap, TrendingUp, RefreshCw,
  ChevronRight, X, Award, AlertTriangle, CheckCircle2, BarChart3,
} from "lucide-react";

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

      {/* Coaching Drawer */}
      {coachBroker && (
        <CoachingDrawer broker={coachBroker} onClose={() => setCoachBroker(null)} periodDays={periodDays} />
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

// ─── Coaching Drawer (1:1) ────────────────────────────────────────────────────

function CoachingDrawer({ broker, onClose, periodDays }: { broker: BrokerRow; onClose: () => void; periodDays: number }) {
  const tier = scoreTier(broker.efficiency_score);
  const total = broker.leads_total || 1;
  const stages = [
    { label: "Leads recebidos",     count: broker.leads_total,        pct: 100 },
    { label: "Em conversa",         count: broker.leads_in_progress + broker.leads_visit + broker.leads_docs + broker.leads_concluded, pct: ((broker.leads_in_progress + broker.leads_visit + broker.leads_docs + broker.leads_concluded) / total) * 100 },
    { label: "Visita agendada+",    count: broker.leads_visit + broker.leads_docs + broker.leads_concluded, pct: ((broker.leads_visit + broker.leads_docs + broker.leads_concluded) / total) * 100 },
    { label: "Docs solicitados",    count: broker.leads_docs + broker.leads_concluded, pct: ((broker.leads_docs + broker.leads_concluded) / total) * 100 },
    { label: "Vendas concluídas",   count: broker.leads_concluded,    pct: (broker.leads_concluded / total) * 100 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
           className="bg-slate-950 border border-cyan-500/40 rounded-t-2xl md:rounded-2xl w-full md:max-w-2xl max-h-[90vh] overflow-y-auto shadow-[0_0_50px_rgba(0,212,255,0.2)]">
        <div className="sticky top-0 bg-slate-950 border-b border-gray-800 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-cyan-400" />
            <div>
              <h3 className="font-bold text-white">1:1 com {broker.first_name} {broker.last_name || ""}</h3>
              <p className="text-[11px] text-gray-500">Sessão de coaching · últimos {periodDays} dias</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Tier badge */}
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${tier.cls}`}>
            <span className="text-lg">{tier.emoji}</span>
            <div>
              <div className="text-xs uppercase tracking-wider opacity-70">Classificação</div>
              <div className="font-bold">{tier.label} (score {broker.efficiency_score})</div>
            </div>
          </div>

          {/* Funil visual */}
          <div className="bg-slate-900/60 border border-gray-700/50 rounded-xl p-4">
            <h4 className="text-sm font-bold text-gray-200 mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" /> Funil de conversão
            </h4>
            <div className="space-y-2">
              {stages.map((s, i) => (
                <div key={s.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-300">{s.label}</span>
                    <span className="text-gray-400 font-mono">{s.count} ({fmt(s.pct)}%)</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${
                      i === 0 ? "bg-blue-500" :
                      i === 1 ? "bg-cyan-500" :
                      i === 2 ? "bg-amber-500" :
                      i === 3 ? "bg-orange-500" :
                                "bg-emerald-500"
                    }`} style={{ width: `${Math.max(2, s.pct)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Métricas chave */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900/60 border border-gray-700/50 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 inline-flex items-center gap-1">
                <Clock className="w-3 h-3" /> TPR (tempo de 1ª resposta)
              </div>
              <div className={`text-xl font-bold ${tprColor(broker.tpr_avg_min)} mt-0.5`}>
                {broker.tpr_avg_min !== null ? `${fmt(broker.tpr_avg_min)} min` : "Sem dado"}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                {broker.resp_5min_pct !== null ? `${fmt(broker.resp_5min_pct)}% respondidos em ≤5min` : ""}
              </div>
            </div>
            <div className="bg-slate-900/60 border border-gray-700/50 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 inline-flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> Eficiência (leads → venda)
              </div>
              <div className="text-xl font-bold text-emerald-300 mt-0.5">
                {broker.lead_to_sale !== null ? `1 venda / ${fmt(broker.lead_to_sale)} leads` : "Sem venda"}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                {broker.visit_to_sale !== null ? `${fmt(broker.visit_to_sale)} visitas / venda` : ""}
              </div>
            </div>
          </div>

          {/* Insights automáticos */}
          <div className="bg-cyan-950/30 border border-cyan-500/30 rounded-xl p-4">
            <h4 className="text-sm font-bold text-cyan-200 mb-2 flex items-center gap-2">
              <Award className="w-4 h-4" /> Pontos a discutir nesta 1:1
            </h4>
            <ul className="space-y-1.5 text-xs text-gray-200">
              {!broker.has_enough_data && (
                <li className="flex items-start gap-2 text-amber-200">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  Amostra pequena (&lt;30 leads). Métricas têm baixa confiabilidade — não tirar conclusões duras ainda.
                </li>
              )}
              {broker.tpr_avg_min !== null && broker.tpr_avg_min > 120 && (
                <li className="flex items-start gap-2 text-red-200">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <strong>TPR crítico:</strong> {fmt(broker.tpr_avg_min)}min — leads esfriam em &lt;30min. Estudo HBR: ≤5min = 9× mais conversão.
                </li>
              )}
              {broker.resp_5min_pct !== null && broker.resp_5min_pct < 30 && broker.has_enough_data && (
                <li className="flex items-start gap-2 text-amber-200">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  Apenas {fmt(broker.resp_5min_pct)}% dos leads respondidos em ≤5min. Meta: ≥60%.
                </li>
              )}
              {broker.leads_abandoned > 0 && broker.has_enough_data && (broker.leads_abandoned / broker.leads_total) > 0.3 && (
                <li className="flex items-start gap-2 text-orange-200">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  Taxa de abandono alta: {fmt((broker.leads_abandoned / broker.leads_total) * 100)}% dos leads viraram ABANDONED. Ver motivos de perda.
                </li>
              )}
              {broker.lead_to_visit !== null && broker.lead_to_visit > 15 && broker.has_enough_data && (
                <li className="flex items-start gap-2 text-amber-200">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <strong>Qualifica pouco:</strong> precisa {fmt(broker.lead_to_visit)} leads pra 1 visita. Treinar perguntas de qualificação (renda, FGTS, score).
                </li>
              )}
              {broker.lead_to_visit !== null && broker.visit_to_sale !== null && broker.visit_to_sale > 4 && (
                <li className="flex items-start gap-2 text-amber-200">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <strong>Qualifica bem mas perde no fechamento:</strong> {fmt(broker.visit_to_sale)} visitas pra 1 venda. Focar em fechamento e contorno de objeções.
                </li>
              )}
              {broker.efficiency_score >= 25 && (
                <li className="flex items-start gap-2 text-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <strong>Alto desempenho.</strong> Considerar dar mais leads (ele converte). Pedir pra compartilhar métodos com a equipe.
                </li>
              )}
              {broker.has_enough_data && broker.efficiency_score < 8 && (
                <li className="flex items-start gap-2 text-red-200">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <strong>Performance crítica.</strong> Sentar individualmente, revisar últimas conversas no Coach IA, definir plano de 30 dias.
                </li>
              )}
            </ul>
          </div>

          <div className="text-[11px] text-gray-500 italic px-2">
            💡 Use esses insights na conversa, mas escute mais do que fala. Pergunte "o que tá te impedindo?" antes de sugerir.
          </div>
        </div>
      </div>
    </div>
  );
}
