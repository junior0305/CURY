// CampanhaIndex — lista das campanhas do manager com filtros e métricas.
// Click numa campanha → /campanha/:id (detalhe).

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import {
  Send, Plus, Loader2, Pause, Play, Trash2, Sparkles, Filter,
  TrendingUp, MessageSquare, ArrowRight, Calendar,
} from "lucide-react";
import Shell from "@/components/manager-v2/Shell";

interface Campaign {
  id: string;
  name: string;
  status: string;
  leads_targeted: number | null;
  leads_contacted: number | null;
  leads_responded: number | null;
  leads_qualified: number | null;
  created_at: string;
}

type StatusFilter = "all" | "active" | "paused" | "completed" | "draft";

export default function CampanhaIndex() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    if (!userId) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("ia_campaigns")
        .select("id, name, status, leads_targeted, leads_contacted, leads_responded, leads_qualified, created_at")
        .eq("created_by", userId)
        .order("created_at", { ascending: false })
        .limit(50);
      setCampaigns((data as Campaign[]) || []);
      setLoading(false);
    })();
  }, [userId]);

  const counts = useMemo(() => ({
    all: campaigns.length,
    active: campaigns.filter((c) => c.status === "active").length,
    paused: campaigns.filter((c) => c.status === "paused").length,
    completed: campaigns.filter((c) => c.status === "completed").length,
    draft: campaigns.filter((c) => c.status === "draft").length,
  }), [campaigns]);

  const filtered = useMemo(() => {
    if (filter === "all") return campaigns;
    return campaigns.filter((c) => c.status === filter);
  }, [campaigns, filter]);

  const totals = useMemo(() => ({
    contatados: campaigns.reduce((s, c) => s + (c.leads_contacted || 0), 0),
    respondidos: campaigns.reduce((s, c) => s + (c.leads_responded || 0), 0),
    qualificados: campaigns.reduce((s, c) => s + (c.leads_qualified || 0), 0),
  }), [campaigns]);

  return (
    <Shell
      title="Campanhas"
      subtitle="prospecção em massa via IA"
      icon={Send}
      color="#10B981"
      actions={
        <Link
          to="/manager/campanha/nova"
          className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition"
        >
          <Plus className="w-3.5 h-3.5" /> Nova campanha
        </Link>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> carregando campanhas…
        </div>
      ) : (
        <div className="space-y-4">
          {/* Totais */}
          <div className="grid grid-cols-3 gap-2">
            <TotalCard icon={Send} label="Disparadas" value={totals.contatados} color="#06B6D4" />
            <TotalCard icon={MessageSquare} label="Respostas" value={totals.respondidos} color="#F472B6" sub={totals.contatados > 0 ? `${Math.round((totals.respondidos / totals.contatados) * 100)}% taxa` : ""} />
            <TotalCard icon={TrendingUp} label="Qualificados" value={totals.qualificados} color="#10B981" />
          </div>

          {/* Filtros */}
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-[11px] uppercase tracking-widest text-slate-500 font-bold mr-1">Filtrar:</span>
            {(["all", "active", "paused", "draft", "completed"] as StatusFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition ${
                  filter === f
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50"
                    : "bg-slate-800/60 text-slate-400 border border-slate-700/50 hover:text-slate-200"
                }`}
              >
                {f === "all" ? "Todas" : f === "active" ? "Ativas" : f === "paused" ? "Pausadas" : f === "draft" ? "Rascunho" : "Concluídas"}
                <span className="ml-1 text-slate-500">· {counts[f]}</span>
              </button>
            ))}
          </div>

          {/* Lista de campanhas */}
          {filtered.length === 0 ? (
            <div className="rounded-2xl bg-slate-900/40 border border-slate-800/60 p-12 text-center">
              <Send className="w-10 h-10 text-slate-700 mx-auto mb-3" />
              <p className="text-sm text-slate-400">
                {filter === "all" ? "Nenhuma campanha criada ainda." : `Nenhuma campanha ${filter}.`}
              </p>
              <Link
                to="/manager/campanha/nova"
                className="inline-flex items-center gap-1 mt-3 text-xs font-bold text-emerald-400 hover:text-emerald-300"
              >
                <Plus className="w-3 h-3" /> Criar a primeira campanha
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map((c, i) => (
                <CampaignCard key={c.id} c={c} delay={i * 0.03} />
              ))}
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}

function TotalCard({ icon: Icon, label, value, color, sub }: { icon: any; label: string; value: number; color: string; sub?: string }) {
  return (
    <div className="rounded-xl p-3 border" style={{ background: `${color}06`, borderColor: `${color}30` }}>
      <div className="flex items-center gap-1.5 mb-1 text-[11px] uppercase tracking-widest font-bold" style={{ color }}>
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-2xl font-black tabular-nums" style={{ color }}>{value.toLocaleString("pt-BR")}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function CampaignCard({ c, delay }: { c: Campaign; delay: number }) {
  const statusColor = c.status === "active" ? "#10B981" : c.status === "paused" ? "#F59E0B" : c.status === "draft" ? "#A78BFA" : "#71717A";
  const respPct = c.leads_contacted ? ((c.leads_responded || 0) / c.leads_contacted) * 100 : 0;
  const date = new Date(c.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  return (
    <Link to={`/manager/campanha/${c.id}`}>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay }}
        whileHover={{ y: -2 }}
        className="rounded-2xl p-4 border transition-all cursor-pointer h-full"
        style={{
          background: `linear-gradient(135deg, ${statusColor}08, rgba(15,23,42,0.5))`,
          borderColor: `${statusColor}40`,
        }}
      >
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: statusColor, boxShadow: c.status === "active" ? `0 0 6px ${statusColor}` : "none" }}
              />
              <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: statusColor }}>
                {c.status}
              </span>
              <span className="text-[11px] text-slate-500 ml-auto flex items-center gap-1">
                <Calendar className="w-2.5 h-2.5" /> {date}
              </span>
            </div>
            <p className="text-sm font-bold text-slate-100 truncate">{c.name}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <Stat label="Disparadas" value={c.leads_contacted || 0} color="#06B6D4" />
          <Stat label="Respostas" value={c.leads_responded || 0} color="#F472B6" />
          <Stat label="Qualif." value={c.leads_qualified || 0} color="#10B981" />
        </div>

        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-500">
            taxa resposta:{" "}
            <span className="font-bold" style={{ color: respPct > 20 ? "#10B981" : respPct > 10 ? "#F59E0B" : "#EF4444" }}>
              {Math.round(respPct)}%
            </span>
          </span>
          <span className="text-slate-400 flex items-center gap-1 font-bold">
            ver detalhe <ArrowRight className="w-3 h-3" />
          </span>
        </div>
      </motion.div>
    </Link>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center rounded-lg py-1.5" style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
      <div className="text-base font-black tabular-nums leading-none" style={{ color }}>
        {value.toLocaleString("pt-BR")}
      </div>
      <div className="text-[11px] uppercase tracking-wider text-slate-500 mt-1">{label}</div>
    </div>
  );
}
