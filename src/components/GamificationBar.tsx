import { useGamification } from "@/hooks/useGamification";
import { Trophy, Star, Zap, ChevronRight, Gift } from "lucide-react";
import { cn } from "@/lib/utils";

const LEVEL_COLORS: Record<number, { bg: string; bar: string; badge: string; glow: string }> = {
  1:  { bg: "from-slate-800 to-slate-700",   bar: "from-slate-400 to-slate-300",     badge: "bg-slate-600 text-slate-200",   glow: "" },
  2:  { bg: "from-green-950 to-slate-800",   bar: "from-green-500 to-emerald-400",   badge: "bg-green-800 text-green-200",   glow: "shadow-green-900/40" },
  3:  { bg: "from-blue-950 to-slate-800",    bar: "from-blue-500 to-cyan-400",       badge: "bg-blue-800 text-blue-200",     glow: "shadow-blue-900/40" },
  4:  { bg: "from-violet-950 to-slate-800",  bar: "from-violet-500 to-purple-400",   badge: "bg-violet-800 text-violet-200", glow: "shadow-violet-900/40" },
  5:  { bg: "from-amber-950 to-slate-800",   bar: "from-amber-500 to-yellow-400",    badge: "bg-amber-800 text-amber-200",   glow: "shadow-amber-900/40" },
  6:  { bg: "from-orange-950 to-slate-800",  bar: "from-orange-500 to-red-400",      badge: "bg-orange-800 text-orange-200", glow: "shadow-orange-900/40" },
  7:  { bg: "from-red-950 to-slate-800",     bar: "from-red-500 to-rose-400",        badge: "bg-red-800 text-red-200",       glow: "shadow-red-900/40" },
  8:  { bg: "from-pink-950 to-slate-800",    bar: "from-pink-500 to-fuchsia-400",    badge: "bg-pink-800 text-pink-200",     glow: "shadow-pink-900/40" },
  9:  { bg: "from-yellow-950 to-slate-800",  bar: "from-yellow-400 to-amber-300",    badge: "bg-yellow-700 text-yellow-100", glow: "shadow-yellow-900/40" },
  10: { bg: "from-yellow-900 to-amber-800",  bar: "from-yellow-300 to-white",        badge: "bg-yellow-500 text-yellow-900", glow: "shadow-yellow-500/60" },
};

const LEVEL_ICONS: Record<number, string> = {
  1: "🪖", 2: "🔫", 3: "⚔️", 4: "🛡️", 5: "🎖️",
  6: "⭐", 7: "🏅", 8: "💎", 9: "👑", 10: "🔥",
};

interface Props {
  compact?: boolean;
  showMissions?: boolean;
  onClickMissions?: () => void;
  pendingPrizes?: number;
  onClickPrizes?: () => void;
}

export function GamificationBar({ compact = false, showMissions = true, onClickMissions, pendingPrizes = 0, onClickPrizes }: Props) {
  const { xpStats, missions, loading } = useGamification();

  if (loading || !xpStats) return null;

  const colors = LEVEL_COLORS[xpStats.level] || LEVEL_COLORS[1];
  const completedMissions = missions.filter(m => m.completed).length;
  const hasUnclaimedPrize = missions.some(m => m.completed && !m.prizeClaimed && m.prizeType);

  if (compact) {
    return (
      <div className={cn("flex items-center gap-3 px-3 py-2 rounded-xl bg-gradient-to-r shadow-lg", colors.bg, colors.glow)}>
        <span className="text-xl">{LEVEL_ICONS[xpStats.level]}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className={cn("text-xs font-black px-1.5 py-0.5 rounded", colors.badge)}>{xpStats.levelName}</span>
            <span className="text-xs text-gray-400">{xpStats.totalXp.toLocaleString()} XP</span>
          </div>
          <div className="h-1.5 bg-black/30 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-700", colors.bar)}
              style={{ width: `${xpStats.progressPercent}%` }}
            />
          </div>
        </div>
        {showMissions && onClickMissions && (
          <button onClick={onClickMissions} className="relative shrink-0">
            <Zap className="w-5 h-5 text-yellow-400" />
            {completedMissions < missions.length && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full text-[8px] text-white flex items-center justify-center font-bold">
                {missions.length - completedMissions}
              </span>
            )}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("rounded-2xl bg-gradient-to-r p-4 shadow-xl", colors.bg, colors.glow && `shadow-lg ${colors.glow}`)}>
      <div className="flex items-center gap-4">
        {/* Avatar de nível */}
        <div className="shrink-0 relative">
          <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center text-3xl border border-white/10 shadow-inner", `bg-black/30`)}>
            {LEVEL_ICONS[xpStats.level]}
          </div>
          <div className={cn("absolute -bottom-1 -right-1 text-[10px] font-black px-1.5 py-0.5 rounded-full border border-white/20", colors.badge)}>
            Nv.{xpStats.level}
          </div>
        </div>

        {/* Info XP */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-white font-black text-lg leading-none">{xpStats.levelName}</span>
            <span className="text-gray-300 text-xs font-mono">
              {xpStats.xpInCurrentLevel.toLocaleString()} / {xpStats.xpForNext === 99999 ? "MAX" : xpStats.xpForNext.toLocaleString()} XP
            </span>
          </div>
          <div className="h-3 bg-black/30 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-1000 relative", colors.bar)}
              style={{ width: `${xpStats.progressPercent}%` }}
            >
              {/* brilho animado */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
            </div>
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-xs text-gray-400">{xpStats.totalXp.toLocaleString()} XP total</span>
            {xpStats.level < 10 && (
              <span className="text-xs text-gray-500">
                Próximo: <span className="text-gray-300 font-semibold">{["","Recruta","Soldado","Cabo","Sargento","Tenente","Capitão","Major","Coronel","General","Lenda"][xpStats.level + 1]}</span>
              </span>
            )}
          </div>
        </div>

        {/* Botões laterais */}
        <div className="flex flex-col gap-2 shrink-0">
          {showMissions && onClickMissions && (
            <button onClick={onClickMissions}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors border border-white/10">
              <Zap className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-xs text-white font-bold">{completedMissions}/{missions.length}</span>
            </button>
          )}
          {onClickPrizes && (pendingPrizes > 0 || hasUnclaimedPrize) && (
            <button onClick={onClickPrizes}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/20 hover:bg-yellow-500/30 transition-colors border border-yellow-400/30 animate-pulse">
              <Gift className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-xs text-yellow-300 font-bold">Prêmio!</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
