import { useState } from "react";
import { useGamification } from "@/hooks/useGamification";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Zap, Gift, CheckCircle2, Clock, Star, RefreshCw, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

const DIFFICULTY_CONFIG = {
  EASY:   { label: "Fácil",   color: "bg-green-900/40 text-green-300 border-green-500/30" },
  MEDIUM: { label: "Médio",   color: "bg-yellow-900/40 text-yellow-300 border-yellow-500/30" },
  HARD:   { label: "Difícil", color: "bg-red-900/40 text-red-300 border-red-500/30" },
};

const ACTION_ICONS: Record<string, string> = {
  CONTACT_LEADS:   "📞",
  SCHEDULE_VISITS: "📅",
  CLOSE_SALES:     "🏆",
  UPDATE_PIPELINE: "🔄",
  EARLY_ACTION:    "🌅",
  LOGIN_STREAK:    "🔥",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DailyMissionsPanel({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { missions, xpStats, prizeClaims, loading, reload } = useGamification();
  const { toast } = useToast();
  const [claiming, setClaiming] = useState<string | null>(null);

  const completedCount = missions.filter(m => m.completed).length;
  const totalXpAvailable = missions.reduce((s, m) => s + m.xpReward, 0);
  const xpEarned = missions.filter(m => m.completed).reduce((s, m) => s + m.xpReward, 0);

  const handleClaimPrize = async (missionId: string, prizeLabel: string) => {
    if (!user?.id) return;
    setClaiming(missionId);
    try {
      // Marcar como claimed
      await supabase.from("daily_missions").update({ prize_claimed: true }).eq("id", missionId);
      toast({ title: `🎁 ${prizeLabel} registrado!`, description: "Aguarde aprovação do gestor." });
      await reload();
    } catch (e) {
      toast({ title: "Erro ao registrar prêmio", variant: "destructive" });
    } finally {
      setClaiming(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-gray-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-black">
            <Zap className="w-6 h-6 text-yellow-400" />
            Missões do Dia
          </DialogTitle>
        </DialogHeader>

        {/* Resumo do dia */}
        <div className="grid grid-cols-3 gap-3 my-2">
          {[
            { label: "Concluídas", value: `${completedCount}/${missions.length}`, icon: CheckCircle2, color: "text-green-400" },
            { label: "XP Ganho", value: `+${xpEarned}`, icon: Zap, color: "text-yellow-400" },
            { label: "Nível Atual", value: xpStats?.levelName || "—", icon: Star, color: "text-purple-400" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-slate-800/60 rounded-xl p-3 text-center border border-gray-700/40">
              <Icon className={cn("w-4 h-4 mx-auto mb-1", color)} />
              <p className={cn("font-black text-lg leading-none", color)}>{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Barra de progresso do dia */}
        <div className="bg-slate-800/40 rounded-xl p-3 border border-gray-700/40">
          <div className="flex justify-between text-xs text-gray-400 mb-2">
            <span>Progresso de hoje</span>
            <span className="text-yellow-400 font-bold">{xpEarned} / {totalXpAvailable} XP disponíveis</span>
          </div>
          <Progress value={totalXpAvailable > 0 ? (xpEarned / totalXpAvailable) * 100 : 0} className="h-2" />
        </div>

        {/* Lista de missões */}
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <RefreshCw className="w-6 h-6 text-yellow-400 animate-spin" />
          </div>
        ) : missions.length === 0 ? (
          <div className="text-center py-10 text-gray-500">
            <Zap className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p>Nenhuma missão disponível hoje.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {missions.map(mission => {
              const diffConfig = DIFFICULTY_CONFIG[mission.difficulty];
              const progressPercent = Math.min(100, (mission.progress / mission.target) * 100);
              const canClaim = mission.completed && mission.prizeType && mission.prizeValue > 0 && !mission.prizeClaimed;

              return (
                <div key={mission.id}
                  className={cn(
                    "rounded-xl border p-4 transition-all",
                    mission.completed
                      ? "border-green-500/30 bg-green-900/10"
                      : "border-gray-700/40 bg-slate-800/40"
                  )}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-xl shrink-0">{ACTION_ICONS[mission.actionType] || "⚡"}</span>
                      <div className="min-w-0">
                        <p className={cn("font-bold text-sm", mission.completed ? "text-green-300" : "text-white")}>
                          {mission.title}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{mission.description}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge className={cn("text-xs border", diffConfig.color)}>{diffConfig.label}</Badge>
                      <span className="text-xs text-yellow-400 font-bold">+{mission.xpReward} XP</span>
                    </div>
                  </div>

                  {/* Barra de progresso */}
                  <div className="flex items-center gap-2 mb-2">
                    <Progress value={progressPercent}
                      className={cn("flex-1 h-2", mission.completed && "[&>div]:bg-green-500")} />
                    <span className="text-xs text-gray-400 shrink-0 font-mono w-12 text-right">
                      {mission.progress}/{mission.target}
                    </span>
                  </div>

                  {/* Prêmio */}
                  {mission.prizeType && mission.prizeValue > 0 && (
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1.5 text-xs">
                        <Gift className="w-3.5 h-3.5 text-yellow-400" />
                        <span className="text-yellow-300 font-bold">{mission.prizeLabel}</span>
                      </div>
                      {mission.completed && !mission.prizeClaimed && (
                        <Button size="sm" onClick={() => handleClaimPrize(mission.id, mission.prizeLabel!)}
                          disabled={claiming === mission.id}
                          className="h-7 px-3 text-xs bg-yellow-600 hover:bg-yellow-500 font-bold text-black gap-1">
                          <Gift className="w-3 h-3" />
                          {claiming === mission.id ? "..." : "Resgatar"}
                        </Button>
                      )}
                      {mission.prizeClaimed && (
                        <span className="text-xs text-green-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Resgatado
                        </span>
                      )}
                    </div>
                  )}

                  {mission.completed && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-green-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Missão concluída!</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Prêmios pendentes */}
        {prizeClaims.filter(p => p.status === "PENDING").length > 0 && (
          <div className="mt-2 bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-3">
            <p className="text-yellow-300 font-bold text-sm flex items-center gap-2 mb-2">
              <Trophy className="w-4 h-4" /> Prêmios aguardando aprovação
            </p>
            {prizeClaims.filter(p => p.status === "PENDING").map(p => (
              <div key={p.id} className="flex items-center justify-between text-xs py-1">
                <span className="text-gray-300">{p.prizeLabel}</span>
                <Badge className="bg-yellow-900/40 text-yellow-300 border-yellow-500/30 text-xs">Pendente</Badge>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
