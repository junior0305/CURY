// Hero card do lançamento — substitui visualmente o card "Campanha" quando há
// launch ativo. Coexiste: se múltiplos lançamentos, mostra o primeiro;
// admin pode preferir só 1 ativo por vez.

import { useState, useEffect } from "react";
import { Trophy, Clock, Zap, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/AuthProvider";
import { Launch, useLaunchRankings } from "./useActiveLaunches";
import LaunchDrawer from "./LaunchDrawer";

function fmtCountdown(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "encerrado";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtMoney(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
}

interface Props {
  launch: Launch;
}

export default function LaunchHeroCard({ launch }: Props) {
  const { user } = useAuth();
  const { data: rankings = [] } = useLaunchRankings(launch.id);
  const [open, setOpen] = useState(false);
  const [tick, setTick] = useState(0);

  // re-render countdown a cada 30s
  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(i);
  }, []);

  // Top 3 de cada categoria + posição do user
  const myActions = rankings.filter(r => r.broker_id === user?.id);
  const myTotal = myActions.reduce((s, r) => s + r.prize_estimate, 0);

  const actions = launch.reward_rules.map(r => r.action);
  const top3 = (action: string) => rankings.filter(r => r.action_type === action).slice(0, 3);

  const emoji = launch.hero_emoji || "🚀";
  const countdown = fmtCountdown(launch.ends_at);
  void tick;

  return (
    <>
      <motion.button
        onClick={() => setOpen(true)}
        initial={{ scale: 0.97, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ y: -1 }}
        className="w-full text-left rounded-2xl border-2 p-4 sm:p-5 relative overflow-hidden block"
        style={{
          borderColor: "rgba(251, 191, 36, 0.55)",
          background: "linear-gradient(135deg, rgba(251,191,36,0.18), rgba(245,158,11,0.06))",
          boxShadow: "0 0 24px rgba(251,191,36,0.25)",
        }}
      >
        <div className="flex items-start gap-3">
          <div className="text-4xl shrink-0">{emoji}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-widest font-black text-amber-400 mb-0.5">
              🏆 LANÇAMENTO
            </div>
            <div className="text-xl sm:text-2xl font-black truncate" style={{ color: "var(--crm-text)" }}>
              {launch.name}
            </div>
            <div className="flex items-center gap-2 text-xs mt-1 text-amber-300">
              <Clock className="w-3.5 h-3.5" />
              <span className="font-bold">{countdown} restantes</span>
              {myActions.length > 0 && (
                <>
                  <span className="text-amber-500/40">·</span>
                  <span className="text-emerald-300 font-bold">você ganhou {fmtMoney(myTotal)}</span>
                </>
              )}
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-amber-400/60 shrink-0" />
        </div>

        {/* Ranking compacto */}
        {launch.ranking_visible && rankings.length > 0 && (
          <div className="mt-3 pt-3 border-t border-amber-500/20 grid gap-2"
               style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}>
            {actions.map(action => {
              const t3 = top3(action);
              const rule = launch.reward_rules.find(r => r.action === action);
              const myRow = myActions.find(r => r.action_type === action);
              return (
                <div key={action} className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-black text-amber-300">
                    <span>{action}</span>
                    {rule && <span className="text-emerald-300">{fmtMoney(rule.prize_per_unit)}/un</span>}
                  </div>
                  {t3.length === 0 && (
                    <div className="text-[11px] text-amber-200/40 italic">ninguém ainda</div>
                  )}
                  {t3.map(r => {
                    const isMe = r.broker_id === user?.id;
                    return (
                      <div key={r.broker_id} className={`text-[11px] flex items-center gap-1 ${isMe ? "font-black text-amber-200" : "text-gray-300"}`}>
                        <span className="text-amber-400/70">{r.rank_position === 1 ? "🥇" : r.rank_position === 2 ? "🥈" : r.rank_position === 3 ? "🥉" : `#${r.rank_position}`}</span>
                        <span className="truncate flex-1">{isMe ? "VOCÊ" : r.broker_name}</span>
                        <span className="font-bold">{r.verified_count + r.pending_count}</span>
                      </div>
                    );
                  })}
                  {myRow && myRow.rank_position > 3 && (
                    <div className="text-[11px] text-amber-200 font-bold flex items-center gap-1">
                      <span>#{myRow.rank_position}</span>
                      <span>VOCÊ · {myRow.verified_count + myRow.pending_count}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </motion.button>

      {open && <LaunchDrawer launch={launch} onClose={() => setOpen(false)} />}
    </>
  );
}
