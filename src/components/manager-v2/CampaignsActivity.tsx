// CampaignsActivity — footer compacto: campanhas ativas + respostas recentes inline
// Click numa campanha → expande respostas dela.

import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import {
  Send, MessageSquare, ChevronDown, Plus, Pause, Play, BarChart3, Sparkles,
} from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  status: string;
  leads_targeted: number | null;
  leads_contacted: number | null;
  leads_responded: number | null;
}

interface Props {
  managerId: string;
  brokers: any[];
}

export default function CampaignsActivity({ managerId, brokers }: Props) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // Pega chip do manager + dos corretores → IDs dos bots
      const { data: managerProfile } = await supabase
        .from("profiles")
        .select("bot_instance_id")
        .eq("id", managerId)
        .maybeSingle();
      const botIds = new Set<string>();
      if (managerProfile?.bot_instance_id) botIds.add(managerProfile.bot_instance_id);
      brokers.forEach((b) => b.bot_instance_id && botIds.add(b.bot_instance_id));

      // Campanhas ativas dos chips do time
      const { data } = await supabase
        .from("ia_campaigns")
        .select("id, name, status, leads_targeted, leads_contacted, leads_responded, prospect_instance_ids, bot_instance_id, created_by")
        .eq("created_by", managerId)
        .order("created_at", { ascending: false })
        .limit(8);

      setCampaigns((data as any) || []);
      setLoading(false);
    })();
  }, [managerId, brokers]);

  if (loading) return null;

  return (
    <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Send className="w-3.5 h-3.5 text-emerald-400" />
          <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-300">
            Campanhas
          </h3>
          <span className="text-[11px] text-slate-600">
            {campaigns.length} criadas por você
          </span>
        </div>
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/15 transition"
        >
          <Plus className="w-3 h-3" /> Nova campanha
        </motion.button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
        {/* Card "Criar campanha" — sempre primeiro */}
        <Link to="/manager/campanha/nova" className="block">
          <motion.div
            whileHover={{ y: -2, scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="group h-full min-h-[110px] rounded-xl p-3 border-2 border-dashed border-emerald-500/40 hover:border-emerald-500/80 bg-gradient-to-br from-emerald-500/5 to-slate-900/40 hover:from-emerald-500/10 transition-all flex flex-col items-center justify-center gap-2 text-center"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center group-hover:rotate-12 transition-transform">
              <Plus className="w-5 h-5 text-emerald-400" />
            </div>
            <p className="text-sm font-bold text-emerald-300">Criar campanha</p>
            <p className="text-[11px] text-slate-500 leading-snug max-w-[180px]">
              upload de leads · escolher chip · disparar via IA
            </p>
            <span className="text-[11px] uppercase tracking-widest text-emerald-500/80 font-black flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5" /> Builder completo
            </span>
          </motion.div>
        </Link>

        {campaigns.length === 0 && (
          <div className="md:col-span-2 px-4 py-6 text-center">
            <p className="text-xs text-slate-500">
              Nenhuma campanha criada por você ainda. Click ao lado pra começar.
            </p>
          </div>
        )}

        {campaigns.map((c) => {
            const respPct = c.leads_contacted
              ? Math.round(((c.leads_responded || 0) / c.leads_contacted) * 100)
              : 0;
            const isActive = c.status === "active";
            const isPaused = c.status === "paused";
            const statusColor = isActive ? "#10B981" : isPaused ? "#F59E0B" : "#71717A";

            return (
              <motion.button
                key={c.id}
                whileHover={{ y: -2 }}
                onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                className="rounded-xl p-3 text-left border transition-all"
                style={{
                  background: `${statusColor}06`,
                  borderColor: `${statusColor}30`,
                }}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{
                        background: statusColor,
                        boxShadow: isActive ? `0 0 6px ${statusColor}` : "none",
                      }}
                    />
                    <p className="text-sm font-bold text-slate-100 truncate">{c.name}</p>
                  </div>
                  <span
                    className="text-[11px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0"
                    style={{ background: `${statusColor}20`, color: statusColor }}
                  >
                    {c.status}
                  </span>
                </div>

                <div className="flex items-center gap-3 mt-2">
                  <div className="flex-1">
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-black text-slate-100 tabular-nums">
                        {c.leads_contacted || 0}
                      </span>
                      <span className="text-[11px] text-slate-500">enviadas</span>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-black text-pink-400 tabular-nums">
                        {c.leads_responded || 0}
                      </span>
                      <span className="text-[11px] text-slate-500">resp</span>
                    </div>
                    <p className="text-[11px] text-slate-500 text-right">{respPct}%</p>
                  </div>
                </div>
              </motion.button>
            );
          })}
      </div>
    </div>
  );
}
