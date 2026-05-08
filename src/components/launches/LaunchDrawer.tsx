// Drawer com ranking detalhado por categoria.

import { useState } from "react";
import { X, Trophy, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAuth } from "@/components/AuthProvider";
import { Launch, useLaunchRankings } from "./useActiveLaunches";

function fmtMoney(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
}

function fmtCountdown(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "encerrado";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return `${h}h ${m}m`;
}

interface Props { launch: Launch; onClose: () => void; }

export default function LaunchDrawer({ launch, onClose }: Props) {
  const { user } = useAuth();
  const { data: rankings = [] } = useLaunchRankings(launch.id);
  const actions = launch.reward_rules.map(r => r.action);
  const [tab, setTab] = useState(actions[0] || "venda");

  const list = rankings.filter(r => r.action_type === tab);
  const rule = launch.reward_rules.find(r => r.action === tab);

  return (
    <Sheet open onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md bg-slate-950 border-amber-500/30 overflow-y-auto">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-4xl mb-1">{launch.hero_emoji || "🚀"}</div>
              <h2 className="text-2xl font-black text-amber-300">{launch.name}</h2>
              <p className="text-xs text-amber-200/70 flex items-center gap-1.5 mt-1">
                <Clock className="w-3.5 h-3.5" /> termina em {fmtCountdown(launch.ends_at)}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
          </div>

          {launch.description && (
            <p className="text-sm text-gray-300 whitespace-pre-wrap">{launch.description}</p>
          )}

          {/* Regras de prêmio */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 space-y-1">
            <div className="text-[10px] uppercase tracking-wider font-bold text-amber-300">Premiação</div>
            {launch.reward_rules.map(r => (
              <div key={r.action} className="text-xs text-amber-100 flex items-center justify-between">
                <span className="capitalize">{r.action}</span>
                <span className="font-bold text-emerald-300">{fmtMoney(r.prize_per_unit)} por {r.action === "venda" ? "venda" : r.action === "documento" ? "pasta" : "visita"}</span>
              </div>
            ))}
            <div className="text-[10px] text-amber-300/60 pt-1 border-t border-amber-500/20 mt-1.5">
              ⚠️ Prêmio só é pago após validação pela secretária/admin.
            </div>
          </div>

          {/* Tabs por ação */}
          {actions.length > 1 && (
            <div className="flex gap-1 p-1 rounded-lg bg-slate-900 border border-gray-700/50">
              {actions.map(a => (
                <button key={a} onClick={() => setTab(a)}
                  className="flex-1 px-3 py-1.5 rounded text-xs uppercase tracking-wider font-bold transition"
                  style={{
                    background: tab === a ? "rgba(251,191,36,0.30)" : "transparent",
                    color: tab === a ? "#fcd34d" : "#9ca3af",
                  }}>
                  {a}
                </button>
              ))}
            </div>
          )}

          {/* Ranking da ação ativa */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-black text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                <Trophy className="w-4 h-4" /> Ranking · {tab}
              </h3>
              {rule && <span className="text-xs text-emerald-300 font-bold">{fmtMoney(rule.prize_per_unit)}/un</span>}
            </div>
            {list.length === 0 && (
              <div className="text-center text-xs text-amber-200/40 italic py-4">Ninguém pontuou ainda. Seja o primeiro!</div>
            )}
            {list.map(r => {
              const isMe = r.broker_id === user?.id;
              return (
                <div key={r.broker_id} className="flex items-center gap-2 py-2 border-b border-gray-800/50 last:border-0">
                  <span className="text-base font-black w-7 text-amber-400">
                    {r.rank_position === 1 ? "🥇" : r.rank_position === 2 ? "🥈" : r.rank_position === 3 ? "🥉" : `#${r.rank_position}`}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-bold truncate ${isMe ? "text-amber-200" : "text-gray-200"}`}>
                      {isMe ? "VOCÊ" : r.broker_name}
                    </div>
                    <div className="text-[10px] text-gray-500 flex items-center gap-2">
                      {r.verified_count > 0 && (
                        <span className="text-emerald-400 flex items-center gap-0.5">
                          <CheckCircle2 className="w-2.5 h-2.5" />{r.verified_count} validado{r.verified_count !== 1 ? "s" : ""}
                        </span>
                      )}
                      {r.pending_count > 0 && (
                        <span className="text-amber-400 flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />{r.pending_count} pendente{r.pending_count !== 1 ? "s" : ""}
                        </span>
                      )}
                      {r.rejected_count > 0 && (
                        <span className="text-red-400/70 flex items-center gap-0.5">
                          <AlertTriangle className="w-2.5 h-2.5" />{r.rejected_count} rejeitado{r.rejected_count !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-emerald-300">{fmtMoney(r.prize_estimate)}</div>
                    {r.prize_paid > 0 && <div className="text-[9px] text-emerald-400/70">pago {fmtMoney(r.prize_paid)}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
