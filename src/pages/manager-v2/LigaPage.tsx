// LigaPage — ranking entre managers com comparação rica.
// Click no rival → mostra: campanhas dele que funcionam, templates que ele usa, gaps da minha equipe.

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { toast } from "sonner";
import {
  Trophy, ChevronLeft, ChevronRight, Loader2, TrendingUp, TrendingDown, Minus,
  Send, MessageSquare, Copy, Sparkles, Eye,
} from "lucide-react";
import Shell from "@/components/manager-v2/Shell";

type Period = "week" | "month";

interface ManagerRow {
  manager_id: string;
  first_name: string;
  vendas: number;
  pastas: number;
  visitas: number;
  vendas_anterior: number;
  is_me: boolean;
  brokers: number;
}

interface CampaignSummary {
  id: string;
  name: string;
  status: string;
  leads_targeted: number | null;
  leads_contacted: number | null;
  leads_responded: number | null;
  created_at: string;
}

function calcWindow(period: Period, offset: number): { start: Date; end: Date; label: string } {
  const now = new Date();
  if (period === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7 * offset);
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay());
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const label = offset === 0 ? "Esta semana" : offset === 1 ? "Semana passada" : `${offset} semanas atrás`;
    return { start, end, label };
  }
  const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
  const label = offset === 0 ? "Este mês" : offset === 1 ? "Mês passado" : start.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return { start, end, label };
}

export default function LigaPage() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [period, setPeriod] = useState<Period>("week");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<ManagerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRival, setSelectedRival] = useState<string | null>(null);

  const { start, end, label } = useMemo(() => calcWindow(period, offset), [period, offset]);
  const prevWindow = useMemo(() => calcWindow(period, offset + 1), [period, offset]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      setLoading(true);
      const { data: managers } = await supabase
        .from("profiles")
        .select("id, first_name")
        .eq("role", "MANAGER");

      if (!managers) { setLoading(false); return; }

      const computed = await Promise.all(
        managers.map(async (m: any) => {
          const { data: brokers } = await supabase
            .from("profiles").select("id").eq("manager_id", m.id).eq("role", "BROKER");
          const ids = (brokers || []).map((b: any) => b.id);
          if (ids.length === 0) {
            return {
              manager_id: m.id, first_name: m.first_name || "—",
              vendas: 0, pastas: 0, visitas: 0, vendas_anterior: 0,
              is_me: m.id === userId, brokers: 0,
            };
          }
          const [vRes, pRes, vsRes, vAntRes] = await Promise.all([
            supabase.from("leads").select("id", { count: "exact", head: true })
              .in("broker_id", ids).eq("status", "CONCLUDED")
              .gte("last_interaction_at", start.toISOString()).lt("last_interaction_at", end.toISOString()),
            supabase.from("leads").select("id", { count: "exact", head: true })
              .in("broker_id", ids).eq("status", "DOCS_REQUESTED")
              .gte("last_interaction_at", start.toISOString()).lt("last_interaction_at", end.toISOString()),
            supabase.from("leads").select("id", { count: "exact", head: true })
              .in("broker_id", ids).in("status", ["VISIT_SCHEDULED", "VISITA_REALIZADA"])
              .gte("last_interaction_at", start.toISOString()).lt("last_interaction_at", end.toISOString()),
            supabase.from("leads").select("id", { count: "exact", head: true })
              .in("broker_id", ids).eq("status", "CONCLUDED")
              .gte("last_interaction_at", prevWindow.start.toISOString()).lt("last_interaction_at", prevWindow.end.toISOString()),
          ]);
          return {
            manager_id: m.id, first_name: m.first_name || "—",
            vendas: vRes.count || 0, pastas: pRes.count || 0, visitas: vsRes.count || 0,
            vendas_anterior: vAntRes.count || 0,
            is_me: m.id === userId, brokers: ids.length,
          };
        })
      );
      computed.sort((a, b) => b.vendas - a.vendas || b.visitas - a.visitas || b.pastas - a.pastas);
      setRows(computed);
      setLoading(false);
    })();
  }, [userId, period, offset]);

  const me = rows.find((r) => r.is_me);
  const myPos = rows.findIndex((r) => r.is_me) + 1;
  const top = rows[0];

  return (
    <Shell title="Liga de Managers" subtitle="quem está vencendo e por quê" icon={Trophy} color="#F59E0B">
      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> calculando liga…
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header com toggle período */}
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-100">{label}</h2>
                {me && top && !me.is_me && (
                  <p className="text-[11px] text-slate-400">
                    {top.is_me ? "🥇 Você é o líder" : `${top.vendas - me.vendas} vendas pra alcançar ${top.first_name}`}
                  </p>
                )}
                {me?.is_me && top.is_me && (
                  <p className="text-[11px] text-emerald-400">🥇 Você está liderando — mantenha o ritmo</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex bg-slate-800/60 rounded-lg p-0.5 border border-slate-700/60">
                {(["week", "month"] as Period[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => { setPeriod(p); setOffset(0); }}
                    className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-md transition ${
                      period === p ? "bg-amber-500/20 text-amber-300" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {p === "week" ? "Semana" : "Mês"}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setOffset((o) => Math.min(o + 1, period === "week" ? 8 : 6))}
                  disabled={offset >= (period === "week" ? 8 : 6)}
                  className="w-7 h-7 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/60 flex items-center justify-center text-slate-400 disabled:opacity-30"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setOffset((o) => Math.max(o - 1, 0))}
                  disabled={offset === 0}
                  className="w-7 h-7 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/60 flex items-center justify-center text-slate-400 disabled:opacity-30"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Tabela do ranking */}
          <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-900/40 border-b border-slate-800/60">
                  <tr className="text-[11px] uppercase tracking-widest text-slate-500">
                    <th className="px-4 py-2.5 text-left font-bold">#</th>
                    <th className="px-4 py-2.5 text-left font-bold">Manager</th>
                    <th className="px-3 py-2.5 text-center font-bold">Time</th>
                    <th className="px-3 py-2.5 text-center font-bold">Pastas</th>
                    <th className="px-3 py-2.5 text-center font-bold">Visitas</th>
                    <th className="px-3 py-2.5 text-center font-bold">Vendas</th>
                    <th className="px-3 py-2.5 text-center font-bold">Δ</th>
                    <th className="px-3 py-2.5 text-center font-bold"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const delta = r.vendas - r.vendas_anterior;
                    const TIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
                    const tColor = delta > 0 ? "#10B981" : delta < 0 ? "#EF4444" : "#71717A";
                    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
                    const isOpen = selectedRival === r.manager_id;
                    return (
                      <motion.tr
                        key={r.manager_id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className={`border-b border-slate-800/30 transition cursor-pointer ${
                          r.is_me ? "bg-amber-500/[0.06] border-amber-500/30" : "hover:bg-white/[0.02]"
                        }`}
                        onClick={() => !r.is_me && setSelectedRival(isOpen ? null : r.manager_id)}
                      >
                        <td className="px-4 py-2.5 text-slate-500 text-xs font-mono">{medal || `#${i + 1}`}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className={`font-bold ${r.is_me ? "text-amber-300" : "text-slate-200"}`}>
                              {r.first_name}
                            </span>
                            {r.is_me && (
                              <span className="text-[11px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded">
                                VOCÊ
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center text-slate-400 text-xs tabular-nums">{r.brokers}</td>
                        <td className="px-3 py-2.5 text-center font-black text-cyan-300 tabular-nums">{r.pastas}</td>
                        <td className="px-3 py-2.5 text-center font-black text-violet-300 tabular-nums">{r.visitas}</td>
                        <td className="px-3 py-2.5 text-center font-black tabular-nums">
                          <span className={r.is_me ? "text-amber-300 text-base" : "text-emerald-300"}>{r.vendas}</span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="inline-flex items-center gap-1 text-xs font-bold tabular-nums" style={{ color: tColor }}>
                            <TIcon className="w-3 h-3" />
                            {delta > 0 ? "+" : ""}{delta}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {!r.is_me && (
                            <ChevronRight
                              className="w-4 h-4 text-slate-500 transition-transform mx-auto"
                              style={{ transform: isOpen ? "rotate(90deg)" : "none" }}
                            />
                          )}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Drilldown do rival */}
          <AnimatePresence>
            {selectedRival && (
              <RivalDetail managerId={selectedRival} onClose={() => setSelectedRival(null)} />
            )}
          </AnimatePresence>

          {!selectedRival && (
            <div className="rounded-2xl bg-slate-900/40 border border-slate-800/60 p-4 text-center">
              <p className="text-xs text-slate-500">
                <Eye className="w-3 h-3 inline mr-1" />
                Click em um manager rival pra ver as campanhas dele que estão funcionando + templates que ele usa
              </p>
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}

function RivalDetail({ managerId, onClose }: { managerId: string; onClose: () => void }) {
  const [name, setName] = useState<string>("");
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: profile }, { data: camps }] = await Promise.all([
        supabase.from("profiles").select("first_name").eq("id", managerId).maybeSingle(),
        supabase
          .from("ia_campaigns")
          .select("id, name, status, leads_targeted, leads_contacted, leads_responded, created_at")
          .eq("created_by", managerId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      setName(profile?.first_name || "—");
      setCampaigns((camps as any) || []);
      setLoading(false);
    })();
  }, [managerId]);

  // Top 3 campanhas dele por taxa de resposta
  const topCampaigns = useMemo(() => {
    return campaigns
      .filter((c) => (c.leads_contacted || 0) > 10)
      .map((c) => ({
        ...c,
        respPct: c.leads_contacted ? ((c.leads_responded || 0) / c.leads_contacted) * 100 : 0,
      }))
      .sort((a, b) => b.respPct - a.respPct)
      .slice(0, 5);
  }, [campaigns]);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl bg-slate-900/60 border border-amber-500/40 overflow-hidden"
      style={{ boxShadow: "0 0 24px rgba(245,158,11,0.15)" }}
    >
      <div className="px-4 py-3 border-b border-slate-800/60 flex items-center justify-between bg-gradient-to-r from-amber-500/10 to-transparent">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-amber-300">
            Espionando: {name}
          </h3>
        </div>
        <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded transition">
          fechar ✕
        </button>
      </div>

      {loading ? (
        <div className="p-6 flex items-center justify-center text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> coletando inteligência…
        </div>
      ) : topCampaigns.length === 0 ? (
        <div className="p-6 text-center text-slate-500 text-sm">
          {name} não tem campanhas com volume suficiente pra análise ainda.
        </div>
      ) : (
        <div className="p-4 space-y-3">
          <p className="text-xs text-slate-300">
            🏆 As <span className="text-amber-300 font-bold">{topCampaigns.length} campanhas dele</span> com melhor taxa de resposta:
          </p>
          <div className="space-y-2">
            {topCampaigns.map((c) => (
              <div
                key={c.id}
                className="rounded-xl bg-slate-900/40 border border-slate-800/60 p-3 flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center shrink-0">
                  <Send className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-100 truncate">{c.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {c.leads_contacted} disparadas · {c.leads_responded} responderam ·
                    <span className="text-pink-400 font-bold ml-1">{Math.round(c.respPct)}% resp</span>
                  </p>
                </div>
                <button
                  onClick={() => toast.success(`📋 Detalhe da campanha "${c.name}" — Fase 3 conecta com clonar real`)}
                  className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-1 hover:bg-amber-500/20 transition shrink-0"
                >
                  <Copy className="w-3 h-3" /> Clonar
                </button>
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-violet-500/[0.06] border border-violet-500/30 p-3 flex items-start gap-3">
            <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-300 leading-relaxed">
              <span className="text-violet-300 font-bold">Insight:</span> Compare o nome e o produto das campanhas dele com as suas.
              Se ele aposta em "ZS_BARATO" e você não tem nada parecido, vale testar. Click "Clonar" pra criar
              uma cópia adaptada pro seu time.
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
}
