// AnalisePage — funil completo + tendência 8 semanas + motivos perda + perf por produto.

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import {
  BarChart3, Loader2, TrendingUp, TrendingDown, Minus, ArrowDown,
  Filter, Building2, AlertCircle,
} from "lucide-react";
import Shell from "@/components/manager-v2/Shell";

type Period = 7 | 30 | 90;

interface Lead {
  id: string;
  status: string;
  product: string | null;
  faixa_mcmv: string | null;
  lost_reason: string | null;
  created_at: string;
  last_interaction_at: string | null;
  negotiating_since: string | null;
}

const FUNIL_STAGES = [
  { key: "NEW",              label: "Novos",          color: "#94A3B8" },
  { key: "IN_PROGRESS",      label: "Em conversa",    color: "#06B6D4" },
  { key: "NEGOTIATING",      label: "Negociando",     color: "#A78BFA" },
  { key: "VISIT_SCHEDULED",  label: "Visita agend.",  color: "#F472B6" },
  { key: "VISITA_REALIZADA", label: "Visita feita",   color: "#F59E0B" },
  { key: "DOCS_REQUESTED",   label: "Pasta",          color: "#FB923C" },
  { key: "CONCLUDED",        label: "Vendas",         color: "#10B981" },
];

const LOST_LABELS: Record<string, string> = {
  PRECO: "Preço",
  LOCALIZACAO: "Localização",
  DOCUMENTACAO: "Documentação",
  RENDA: "Renda insuficiente",
  CONCORRENCIA: "Concorrência",
  SEM_INTERESSE: "Perdeu interesse",
  SEM_RESPOSTA: "Sumiu",
  OUTRO: "Outro",
};

export default function AnalisePage() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>(30);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      setLoading(true);
      const { data: brokers } = await supabase
        .from("profiles").select("id").eq("manager_id", userId).eq("role", "BROKER");
      const ids = (brokers || []).map((b: any) => b.id);
      if (ids.length === 0) { setLeads([]); setLoading(false); return; }

      const sinceWeeks = new Date();
      sinceWeeks.setDate(sinceWeeks.getDate() - 70); // 10 semanas pra calcular tendência
      const { data } = await supabase
        .from("leads")
        .select("id, status, product, faixa_mcmv, lost_reason, created_at, last_interaction_at, negotiating_since")
        .in("broker_id", ids)
        .gte("created_at", sinceWeeks.toISOString())
        .limit(5000);

      setLeads((data as Lead[]) || []);
      setLoading(false);
    })();
  }, [userId]);

  const periodLeads = useMemo(() => {
    const since = new Date(Date.now() - period * 24 * 3600 * 1000);
    return leads.filter((l) => new Date(l.created_at) >= since);
  }, [leads, period]);

  // Funil — leads que ATINGIRAM cada etapa (cumulativo descendente)
  const funil = useMemo(() => {
    const total = periodLeads.length;
    if (total === 0) return [];

    // Conta quantos PASSARAM por cada etapa (status atual >= etapa)
    const stageReached = (key: string) => {
      const order = FUNIL_STAGES.findIndex((s) => s.key === key);
      return periodLeads.filter((l) => {
        const li = FUNIL_STAGES.findIndex((s) => s.key === l.status);
        if (li >= order) return true;
        // EXCLUDED/ABANDONED não contam após NEW
        return false;
      }).length;
    };

    return FUNIL_STAGES.map((s, i) => {
      const count = stageReached(s.key);
      const prevCount = i === 0 ? total : stageReached(FUNIL_STAGES[i - 1].key);
      const stagePct = prevCount > 0 ? (count / prevCount) * 100 : 0;
      const totalPct = total > 0 ? (count / total) * 100 : 0;
      const drop = i === 0 ? 0 : prevCount - count;
      return { ...s, count, stagePct, totalPct, drop, prev: prevCount };
    });
  }, [periodLeads]);

  // Tendência: vendas por semana (últimas 8)
  const tendencia = useMemo(() => {
    const result: { label: string; vendas: number; novos: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const start = new Date();
      start.setDate(start.getDate() - 7 * (i + 1));
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      const vendas = leads.filter((l) =>
        l.status === "CONCLUDED" &&
        l.last_interaction_at &&
        new Date(l.last_interaction_at) >= start &&
        new Date(l.last_interaction_at) < end
      ).length;
      const novos = leads.filter((l) =>
        new Date(l.created_at) >= start && new Date(l.created_at) < end
      ).length;
      const labelDate = start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      result.push({ label: i === 0 ? "Esta sem" : labelDate, vendas, novos });
    }
    return result;
  }, [leads]);

  // Motivos de perda
  const motivosPerda = useMemo(() => {
    const perdidos = periodLeads.filter((l) => l.status === "ABANDONED" || l.lost_reason);
    const counts = new Map<string, number>();
    perdidos.forEach((l) => {
      const key = l.lost_reason || "SEM_RESPOSTA";
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const total = perdidos.length || 1;
    return Array.from(counts.entries())
      .map(([key, count]) => ({
        key,
        label: LOST_LABELS[key] || key,
        count,
        pct: (count / total) * 100,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [periodLeads]);

  // Performance por produto
  const porProduto = useMemo(() => {
    const map = new Map<string, { total: number; vendas: number }>();
    periodLeads.forEach((l) => {
      const key = l.product || "(sem produto)";
      const cur = map.get(key) || { total: 0, vendas: 0 };
      cur.total++;
      if (l.status === "CONCLUDED") cur.vendas++;
      map.set(key, cur);
    });
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v, conv: v.total > 0 ? (v.vendas / v.total) * 100 : 0 }))
      .sort((a, b) => b.vendas - a.vendas || b.total - a.total)
      .slice(0, 8);
  }, [periodLeads]);

  // Performance por faixa MCMV
  const porFaixa = useMemo(() => {
    const map = new Map<string, { total: number; vendas: number }>();
    periodLeads.forEach((l) => {
      const key = l.faixa_mcmv || "(sem faixa)";
      const cur = map.get(key) || { total: 0, vendas: 0 };
      cur.total++;
      if (l.status === "CONCLUDED") cur.vendas++;
      map.set(key, cur);
    });
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v, conv: v.total > 0 ? (v.vendas / v.total) * 100 : 0 }))
      .sort((a, b) => {
        const order: Record<string, number> = { FAIXA_1: 1, FAIXA_2: 2, FAIXA_3: 3, FORA: 4 };
        return (order[a.key] || 99) - (order[b.key] || 99);
      });
  }, [periodLeads]);

  // Insights derivados
  const insights = useMemo(() => {
    const arr: { type: "good" | "bad"; text: string }[] = [];
    if (funil.length > 0 && periodLeads.length > 10) {
      // Maior queda no funil
      let biggestDrop = { stage: "", pct: 0, fromTo: "" };
      for (let i = 1; i < funil.length; i++) {
        const drop = funil[i - 1].count > 0 ? ((funil[i - 1].count - funil[i].count) / funil[i - 1].count) * 100 : 0;
        if (drop > biggestDrop.pct && funil[i - 1].count > 0) {
          biggestDrop = {
            stage: funil[i].label,
            pct: drop,
            fromTo: `${funil[i - 1].label} → ${funil[i].label}`,
          };
        }
      }
      if (biggestDrop.pct > 50) {
        arr.push({ type: "bad", text: `Maior gargalo: ${biggestDrop.fromTo} (perde ${Math.round(biggestDrop.pct)}% dos leads). Foque coaching aqui.` });
      }
      // Conversão final
      const totalConv = periodLeads.length > 0 ? (funil[funil.length - 1].count / periodLeads.length) * 100 : 0;
      if (totalConv >= 5) {
        arr.push({ type: "good", text: `Conversão final saudável: ${totalConv.toFixed(1)}% (mercado: 2-5%).` });
      } else if (totalConv < 2 && periodLeads.length > 30) {
        arr.push({ type: "bad", text: `Conversão final baixa: ${totalConv.toFixed(1)}%. Revise origem/qualificação.` });
      }
    }
    // Top produto
    if (porProduto.length > 0 && porProduto[0].vendas > 0) {
      arr.push({ type: "good", text: `Produto campeão: ${porProduto[0].key} (${porProduto[0].vendas} vendas, ${Math.round(porProduto[0].conv)}% conv).` });
    }
    // Faixa
    if (porFaixa.length > 0) {
      const top = [...porFaixa].sort((a, b) => b.conv - a.conv)[0];
      if (top.vendas > 0) {
        arr.push({ type: "good", text: `Melhor conversão por faixa: ${top.key.replace("_", " ")} (${Math.round(top.conv)}%).` });
      }
    }
    // Motivo perda
    if (motivosPerda.length > 0 && motivosPerda[0].count > 5) {
      arr.push({ type: "bad", text: `Maior motivo de perda: ${motivosPerda[0].label} (${motivosPerda[0].count} leads, ${Math.round(motivosPerda[0].pct)}% das perdas).` });
    }
    return arr;
  }, [funil, periodLeads, porProduto, porFaixa, motivosPerda]);

  return (
    <Shell
      title="Análise"
      subtitle="funil + tendência + motivos de perda"
      icon={BarChart3}
      color="#F472B6"
      actions={
        <div className="flex bg-slate-800/60 rounded-lg p-0.5 border border-slate-700/60">
          {([7, 30, 90] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-md transition ${
                period === p ? "bg-pink-500/20 text-pink-300" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {p === 7 ? "7 dias" : p === 30 ? "30 dias" : "90 dias"}
            </button>
          ))}
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> calculando análise…
        </div>
      ) : periodLeads.length === 0 ? (
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 p-8 text-center text-slate-500">
          Sem leads no período selecionado.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Insights */}
          {insights.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {insights.map((ins, i) => {
                const color = ins.type === "good" ? "#10B981" : "#EF4444";
                const Icon = ins.type === "good" ? TrendingUp : AlertCircle;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="rounded-xl p-3 border flex items-start gap-2.5"
                    style={{ background: `${color}08`, borderColor: `${color}30` }}
                  >
                    <Icon className="w-4 h-4 shrink-0 mt-0.5" style={{ color }} />
                    <p className="text-xs text-slate-200 leading-relaxed">{ins.text}</p>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Grid: Funil + Tendência */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Funil */}
            <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800/60 flex items-center gap-2">
                <ArrowDown className="w-3.5 h-3.5 text-cyan-400" />
                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-300">
                  Funil — últimos {period}d ({periodLeads.length} leads)
                </h3>
              </div>
              <div className="p-4 space-y-2">
                {funil.map((s, i) => (
                  <FunilRow key={s.key} stage={s} delay={i * 0.04} max={funil[0]?.count || 1} />
                ))}
              </div>
            </div>

            {/* Tendência */}
            <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800/60 flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-300">
                  Tendência — 8 semanas
                </h3>
              </div>
              <div className="p-4">
                <TendenciaChart data={tendencia} />
              </div>
            </div>
          </div>

          {/* Grid: Motivos perda + Por faixa */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {motivosPerda.length > 0 && (
              <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800/60 flex items-center gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-300">
                    Motivos de perda
                  </h3>
                </div>
                <div className="p-4 space-y-2">
                  {motivosPerda.map((m, i) => (
                    <BarRow key={m.key} label={m.label} count={m.count} pct={m.pct} color="#EF4444" delay={i * 0.05} />
                  ))}
                </div>
              </div>
            )}

            {porFaixa.length > 0 && (
              <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800/60 flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-amber-400" />
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-300">
                    Por faixa MCMV
                  </h3>
                </div>
                <div className="p-4 space-y-2">
                  {porFaixa.map((f, i) => (
                    <FaixaRow key={f.key} faixa={f} delay={i * 0.05} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Por produto */}
          {porProduto.length > 0 && (
            <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800/60 flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-violet-400" />
                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-300">
                  Performance por produto
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-900/40 border-b border-slate-800/60">
                    <tr className="text-[11px] uppercase tracking-widest text-slate-500">
                      <th className="px-3 py-2 text-left">Produto</th>
                      <th className="px-3 py-2 text-center">Leads</th>
                      <th className="px-3 py-2 text-center">Vendas</th>
                      <th className="px-3 py-2 text-left">Conversão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porProduto.map((p, i) => (
                      <motion.tr
                        key={p.key}
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="border-b border-slate-800/30"
                      >
                        <td className="px-3 py-2 text-slate-200 font-bold">{p.key}</td>
                        <td className="px-3 py-2 text-center text-slate-400 tabular-nums">{p.total}</td>
                        <td className="px-3 py-2 text-center text-emerald-400 font-black tabular-nums">{p.vendas}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(100, p.conv)}%` }}
                                transition={{ duration: 0.6, delay: 0.2 + i * 0.04 }}
                                className="h-full rounded-full"
                                style={{ background: p.conv > 5 ? "#10B981" : p.conv > 2 ? "#F59E0B" : "#EF4444" }}
                              />
                            </div>
                            <span className="text-[11px] tabular-nums w-10 text-right" style={{ color: p.conv > 5 ? "#10B981" : p.conv > 2 ? "#F59E0B" : "#EF4444" }}>
                              {p.conv.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}

function FunilRow({ stage, delay, max }: { stage: any; delay: number; max: number }) {
  const widthPct = max > 0 ? (stage.count / max) * 100 : 0;
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="space-y-1"
    >
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold" style={{ color: stage.color }}>{stage.label}</span>
        <div className="flex items-center gap-2">
          {stage.drop > 0 && (
            <span className="text-[11px] text-red-400">−{stage.drop}</span>
          )}
          <span className="font-black text-slate-100 tabular-nums">{stage.count}</span>
          <span className="text-[11px] text-slate-500 w-10 text-right">
            {stage.totalPct.toFixed(0)}%
          </span>
        </div>
      </div>
      <div className="h-2 rounded-full bg-slate-800/60 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${widthPct}%` }}
          transition={{ duration: 0.7, delay: delay + 0.1 }}
          className="h-full rounded-full"
          style={{ background: stage.color, boxShadow: `0 0 6px ${stage.color}80` }}
        />
      </div>
    </motion.div>
  );
}

function TendenciaChart({ data }: { data: { label: string; vendas: number; novos: number }[] }) {
  const maxVendas = Math.max(1, ...data.map((d) => d.vendas));
  const maxNovos = Math.max(1, ...data.map((d) => d.novos));
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-1.5 h-32">
        {data.map((d, i) => {
          const hVendas = (d.vendas / maxVendas) * 80;
          const hNovos = (d.novos / maxNovos) * 80;
          const trend = i > 0 ? d.vendas - data[i - 1].vendas : 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex items-end justify-center gap-0.5 h-24">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${hNovos}%` }}
                  transition={{ delay: i * 0.05, duration: 0.6 }}
                  className="w-1.5 rounded-t bg-cyan-500/30 border-t-2 border-cyan-500/60"
                  title={`${d.novos} novos`}
                />
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${hVendas}%` }}
                  transition={{ delay: i * 0.05, duration: 0.6 }}
                  className="w-2 rounded-t bg-emerald-500"
                  style={{ boxShadow: "0 0 6px rgba(16,185,129,0.6)" }}
                  title={`${d.vendas} vendas`}
                />
              </div>
              <p className="text-[11px] text-slate-500">{d.label}</p>
              <p className="text-[11px] font-black text-emerald-400 tabular-nums leading-none">{d.vendas}</p>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-center gap-4 text-[11px] text-slate-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500 rounded-sm" /> vendas</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-cyan-500/30 border border-cyan-500/60 rounded-sm" /> leads novos</span>
      </div>
    </div>
  );
}

function BarRow({ label, count, pct, color, delay }: { label: string; count: number; pct: number; color: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="space-y-1"
    >
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-300">{label}</span>
        <span className="font-black tabular-nums" style={{ color }}>
          {count} <span className="text-slate-500 font-normal text-[11px]">· {Math.round(pct)}%</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, delay: delay + 0.1 }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>
    </motion.div>
  );
}

function FaixaRow({ faixa, delay }: { faixa: any; delay: number }) {
  const color = faixa.conv > 5 ? "#10B981" : faixa.conv > 2 ? "#F59E0B" : "#EF4444";
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="rounded-lg p-2.5 border"
      style={{ background: `${color}06`, borderColor: `${color}30` }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-slate-200">{faixa.key.replace("_", " ")}</span>
        <span className="text-base font-black tabular-nums" style={{ color }}>
          {faixa.vendas}<span className="text-[11px] text-slate-500 font-normal">/{faixa.total}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 rounded-full bg-slate-800 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, faixa.conv)}%` }}
            transition={{ duration: 0.6, delay: delay + 0.1 }}
            className="h-full rounded-full"
            style={{ background: color }}
          />
        </div>
        <span className="text-[11px] tabular-nums w-10 text-right" style={{ color }}>
          {faixa.conv.toFixed(1)}%
        </span>
      </div>
    </motion.div>
  );
}
