import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, Banknote, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAudioArena } from "@/hooks/use-audio-arena";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { differenceInMinutes } from "date-fns";

export function AchievementTicker() {
  const { user } = useAuth();
  const { playSound } = useAudioArena();
  const [playedIds, setPlayedIds] = useState<Set<string>>(new Set());

  const { data: achievements = [], refetch } = useQuery({
    queryKey: ["public-achievements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("achievements")
        .select(`
          id,
          reward_label,
          reward_value,
          action_type,
          created_at,
          status,
          profiles (first_name, last_name)
        `)
        .eq('status', 'APPROVED')
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!user?.id) return;

    const syncPendingSounds = async () => {
      const achievementIds = achievements.map((a: any) => a.id);
      
      const { data: readIds } = await supabase
        .from('audio_notifications_read')
        .select('achievement_id')
        .eq('user_id', user.id)
        .in('achievement_id', achievementIds);

      const alreadyHeard = new Set(readIds?.map(r => r.achievement_id) || []);
      const pendingToPlay = achievements.find((a: any) => !alreadyHeard.has(a.id) && !playedIds.has(a.id));

      if (pendingToPlay) {
        const { error } = await supabase
          .from('audio_notifications_read')
          .insert({ user_id: user.id, achievement_id: pendingToPlay.id });

        if (!error) {
          playSound('SALE');
          setPlayedIds(prev => new Set([...prev, pendingToPlay.id]));
        }
      }
    };

    syncPendingSounds();
  }, [achievements, user?.id, playSound, playedIds]);

  const getMessage = (ach: any) => {
    const name = ach.profiles?.first_name || "Corretor";
    const value = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ach.reward_value);
    
    const templates = [
      `🔥 EXPLODIU! ${name} acaba de faturar ${value}!`,
      `🚀 NINGUÉM SEGURA! ${name} garantiu +${value} de bônus!`,
      `💰 DINHEIRO NO BOLSO: ${name} recebeu ${value} agora!`,
      `📈 PERFORMANCE ELITE! ${name} desbloqueou ${value}!`,
      `⚡️ META BATIDA! ${name} faturou ${value} em prêmios!`,
    ];

    const index = ach.id.charCodeAt(0) % templates.length;
    return templates[index];
  };

  return (
    <div className="relative overflow-hidden bg-[#0F172A] h-12 flex items-center border-b border-indigo-500/30 shadow-[0_4px_25px_rgba(79,70,229,0.5)] z-50">
      <div className="absolute left-0 top-0 bottom-0 px-3 sm:px-6 bg-indigo-600 text-white flex items-center gap-2 z-20 font-black text-[10px] sm:text-xs tracking-tighter uppercase italic skew-x-[-12deg] -ml-2 border-r-2 border-indigo-400">
        <div className="skew-x-[12deg] flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-300 animate-pulse" />
          <span>Wall of Fame</span>
        </div>
      </div>
      
      <div className="flex w-full overflow-hidden">
        <div className="flex animate-marquee whitespace-nowrap gap-12 sm:gap-24 items-center pl-32">
          {achievements.length === 0 ? (
            <span className="text-indigo-300/50 font-bold text-[10px] sm:text-xs uppercase tracking-widest animate-pulse">
              Aguardando o próximo grande fechamento... 🚀
            </span>
          ) : (
            [...achievements, ...achievements].map((ach: any, idx) => {
              // Verifica se a venda é "FRESCA" (menos de 5 minutos desde a aprovação)
              const isFresh = differenceInMinutes(new Date(), new Date(ach.created_at)) < 5;

              return (
                <div 
                  key={`${ach.id}-${idx}`} 
                  className={cn(
                    "flex items-center gap-4 py-1.5 px-4 rounded-2xl border transition-all",
                    isFresh 
                      ? "bg-indigo-600/20 border-indigo-400 animate-pulse-glow shadow-[0_0_15px_rgba(99,102,241,0.4)]" 
                      : "bg-white/5 border-white/10"
                  )}
                >
                  <span className={cn(
                    "font-black text-xs sm:text-sm tracking-tight uppercase",
                    isFresh ? "text-white" : "text-slate-200"
                  )}>
                    {getMessage(ach)}
                  </span>
                  
                  {isFresh ? (
                    <div className="flex items-center gap-1 bg-amber-400 px-2 py-0.5 rounded-lg border border-amber-300 shadow-lg animate-bounce">
                      <Zap className="h-3 w-3 text-indigo-900 fill-indigo-900" />
                      <span className="text-indigo-900 font-black text-[9px] uppercase tracking-tighter">
                        RECÉM-FECHADO
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 bg-emerald-500/20 px-2 py-0.5 rounded-lg border border-emerald-500/30">
                      <Banknote className="h-3 w-3 text-emerald-400" />
                      <span className="text-emerald-400 font-black text-[10px]">
                        VALOR CREDITADO
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default AchievementTicker;