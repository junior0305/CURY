import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, Zap, ShieldCheck, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAudioArena } from "@/hooks/use-audio-arena";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { differenceInMinutes, differenceInSeconds } from "date-fns";

export function AchievementTicker() {
  const { user } = useAuth();
  const { playSound } = useAudioArena();
  const [playedIds, setPlayedIds] = useState<Set<string>>(new Set());
  const [mountTime] = useState(new Date());
  const [isInitialMinute, setIsInitialMinute] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      const secondsPassed = differenceInSeconds(new Date(), mountTime);
      if (secondsPassed >= 60) {
        setIsInitialMinute(false);
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [mountTime]);

  const { data: achievements = [] } = useQuery({
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
          profiles:profile_id (first_name, last_name)
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
        const { error } = await supabase.from('audio_notifications_read').insert({ user_id: user.id, achievement_id: pendingToPlay.id });
        if (!error) {
          playSound('SALE');
          setPlayedIds(prev => new Set([...prev, pendingToPlay.id]));
        }
      }
    };
    syncPendingSounds();
  }, [achievements, user?.id, playSound, playedIds]);

  // Função para renderizar o nome com efeito neon
  const NeonName = ({ name }: { name: string }) => (
    <span className="text-white font-black italic tracking-tighter drop-shadow-[0_0_8px_rgba(129,140,248,0.8)] px-1">
      {name.toUpperCase()}
    </span>
  );

  const getMessage = (ach: any) => {
    const name = ach.profiles?.first_name || "Corretor";
    const value = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ach.reward_value);
    
    // Mensagens diretas e agressivas
    const templates = [
      <>VIU O PIX DA <NeonName name={name} />? {value} NO BOLSO. O PRÓXIMO É O SEU.</>,
      <><NeonName name={name} /> ACABOU DE FATURAR {value}. VAI FICAR SÓ OLHANDO?</>,
      <><NeonName name={name} /> GARANTIU +{value}. O DINHEIRO ESTÁ SAINDO, CADÊ O SEU?</>,
      <>MAIS {value} PARA <NeonName name={name} />. A ELITE NÃO PARA.</>,
      <>FOCO NO PIX: <NeonName name={name} /> DESBLOQUEOU {value} AGORA.</>,
    ];
    return templates[ach.id.charCodeAt(0) % templates.length];
  };

  const userName = user?.email?.split('@')[0] || "Agente";

  return (
    <div className="relative overflow-hidden bg-[#070B14] h-12 flex items-center border-b border-indigo-500/20 shadow-[0_4px_30px_rgba(0,0,0,0.5)] z-50">
      <div className="absolute left-0 top-0 bottom-0 px-3 sm:px-6 bg-indigo-600 text-white flex items-center gap-2 z-20 font-black text-[10px] sm:text-xs tracking-tighter uppercase italic skew-x-[-12deg] -ml-2 border-r-2 border-indigo-400/50 shadow-[5px_0_15px_rgba(79,70,229,0.4)]">
        <div className="skew-x-[12deg] flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-300 animate-pulse" />
          <span>Wall of Fame</span>
        </div>
      </div>
      
      <div className="flex w-full overflow-hidden">
        <div className="flex animate-marquee whitespace-nowrap gap-12 sm:gap-24 items-center pl-32">
          
          {/* MENSAGEM DE IMPACTO INICIAL NO PRIMEIRO MINUTO */}
          {isInitialMinute && (
            <div className="flex items-center gap-4 py-1.5 px-6 rounded-2xl bg-indigo-500/10 border border-indigo-500/40 animate-radiant-glow">
              {achievements.length > 0 ? (
                <>
                  <Flame className="h-5 w-5 text-rose-500 animate-pulse" />
                  <span className="font-black text-xs sm:text-sm tracking-tight text-white uppercase italic flex items-center gap-2">
                    {achievements[0].profiles?.first_name.toUpperCase()} JÁ GARANTIU O DELA HOJE. CADÊ O SEU RESULTADO, {userName.toUpperCase()}?
                  </span>
                  <div className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                </>
              ) : (
                <>
                  <ShieldCheck className="h-5 w-5 text-indigo-400 animate-pulse" />
                  <span className="font-black text-xs sm:text-sm tracking-widest text-indigo-100 uppercase italic">
                    ARENA LIBERADA. SEJA O PRIMEIRO A APARECER AQUI HOJE, {userName.toUpperCase()}.
                  </span>
                </>
              )}
            </div>
          )}

          {/* LISTA DE VENCEDORES SEMPRE ROLANDO */}
          {achievements.length === 0 && !isInitialMinute ? (
            <span className="text-indigo-400/40 font-black text-[10px] sm:text-xs uppercase tracking-[0.2em] animate-pulse">
              AGUARDANDO O PRÓXIMO ALVO SER ABATIDO... 🚀
            </span>
          ) : (
            [...achievements, ...achievements].map((ach: any, idx) => {
              const isFresh = differenceInMinutes(new Date(), new Date(ach.created_at)) < 5;
              return (
                <div 
                  key={`${ach.id}-${idx}`} 
                  className={cn(
                    "flex items-center gap-4 py-1.5 px-5 rounded-2xl border transition-all",
                    isFresh 
                      ? "bg-indigo-600/20 border-indigo-500/50 animate-pulse-glow shadow-[0_0_20px_rgba(99,102,241,0.2)]" 
                      : "bg-white/5 border-white/5"
                  )}
                >
                  <span className={cn(
                    "font-bold text-xs sm:text-sm tracking-tight uppercase flex items-center",
                    isFresh ? "text-white" : "text-slate-400"
                  )}>
                    {getMessage(ach)}
                  </span>
                  {isFresh && (
                    <div className="flex items-center gap-1 bg-indigo-500 px-2 py-0.5 rounded-lg border border-indigo-400 shadow-lg">
                      <Zap className="h-3 w-3 text-white fill-white animate-bounce" />
                      <span className="text-white font-black text-[9px] uppercase tracking-tighter">AGORA</span>
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
