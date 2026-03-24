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
      if (differenceInSeconds(new Date(), mountTime) >= 60) {
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
        .select("id, reward_label, reward_value, action_type, created_at, status, profiles:profile_id(first_name, last_name)")
        .eq('status', 'APPROVED')
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });

  // Vendas do mês atual com contagem por corretor
  const { data: recentSales = [] } = useQuery({
    queryKey: ["ticker-sales-month"],
    queryFn: async () => {
      const som = new Date(); som.setDate(1); som.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("leads")
        .select("id, broker_id, last_interaction_at, profiles:broker_id(first_name)")
        .eq("status", "CONCLUDED")
        .gte("last_interaction_at", som.toISOString())
        .order("last_interaction_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    refetchInterval: 30000,
  });

  // Mapa: broker_id → total de vendas no mês
  const monthlySalesCount = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of recentSales) {
      if (s.broker_id) map[s.broker_id] = (map[s.broker_id] || 0) + 1;
    }
    return map;
  }, [recentSales]);

  // Itens do ticker: vendas recentes + prêmios, mesclados por data
  const tickerItems = useMemo(() => {
    const sales = recentSales.slice(0, 6).map((s: any) => ({
      id: `sale-${s.id}`,
      type: 'SALE' as const,
      name: (s.profiles as any)?.first_name || "Corretor",
      brokerId: s.broker_id,
      date: s.last_interaction_at,
    }));
    const prizes = achievements.map((a: any) => ({
      id: a.id,
      type: 'PRIZE' as const,
      name: a.profiles?.first_name || "Corretor",
      value: a.reward_value,
      date: a.created_at,
    }));
    return [...sales, ...prizes]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);
  }, [recentSales, achievements]);

  useEffect(() => {
    if (!user?.id) return;
    const syncPendingSounds = async () => {
      const achievementIds = achievements.map((a: any) => a.id);
      const { data: readIds } = await supabase
        .from('audio_notifications_read').select('achievement_id')
        .eq('user_id', user.id).in('achievement_id', achievementIds);
      const alreadyHeard = new Set(readIds?.map(r => r.achievement_id) || []);
      const pendingToPlay = achievements.find((a: any) => !alreadyHeard.has(a.id) && !playedIds.has(a.id));
      if (pendingToPlay) {
        const { error } = await supabase.from('audio_notifications_read').insert({ user_id: user.id, achievement_id: pendingToPlay.id });
        if (!error) { playSound('SALE'); setPlayedIds(prev => new Set([...prev, pendingToPlay.id])); }
      }
    };
    syncPendingSounds();
  }, [achievements, user?.id, playSound, playedIds]);

  const NeonName = ({ name }: { name: string }) => (
    <span className="text-white font-black italic tracking-tighter drop-shadow-[0_0_8px_rgba(129,140,248,0.8)] px-1">
      {name.toUpperCase()}
    </span>
  );

  const getSaleMessage = (item: { name: string; brokerId: string }) => {
    const count = monthlySalesCount[item.brokerId] || 1;
    const s = count > 1 ? "S" : "";
    const msgs = [
      <><NeonName name={item.name} /> FECHOU MAIS UMA — {count} VENDA{s} NO MÊS! VAI FICAR SÓ OLHANDO?</>,
      <>JÁ SÃO {count} VENDA{s} PARA <NeonName name={item.name} /> ESTE MÊS. A CORRIDA ESTÁ ABERTA.</>,
      <>MAIS UMA VENDA PARA <NeonName name={item.name} />! TOTAL: {count} NO MÊS. QUEM É O PRÓXIMO?</>,
    ];
    return msgs[item.brokerId.charCodeAt(0) % msgs.length];
  };

  const getPrizeMessage = (item: { name: string; value: number; brokerId?: string }) => {
    const value = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.value);
    const count = item.brokerId ? monthlySalesCount[item.brokerId] : 0;
    const countSuffix = count > 0 ? ` — ${count} VENDA${count > 1 ? "S" : ""} NO MÊS` : "";
    const msgs = [
      <>VIU O PIX DA <NeonName name={item.name} />? {value} NO BOLSO{countSuffix}. O PRÓXIMO É O SEU.</>,
      <><NeonName name={item.name} /> ACABOU DE FATURAR {value}{countSuffix}. VAI FICAR SÓ OLHANDO?</>,
      <><NeonName name={item.name} /> GARANTIU +{value}{countSuffix}. A ELITE NÃO PARA.</>,
    ];
    return msgs[(item.name.charCodeAt(0) || 0) % msgs.length];
  };

  // Corretor líder do mês: quem tem mais vendas concluídas
  const topBroker = useMemo(() => {
    if (recentSales.length === 0) return null;
    let topId = '';
    let topCount = 0;
    for (const [id, count] of Object.entries(monthlySalesCount)) {
      if (count > topCount) { topCount = count; topId = id; }
    }
    const topSale = (recentSales as any[]).find(s => s.broker_id === topId);
    return topSale ? { name: topSale.profiles?.first_name || 'Corretor', count: topCount } : null;
  }, [recentSales, monthlySalesCount]);

  const userName = user?.email?.split('@')[0] || "Agente";
  const initialName = topBroker?.name || (achievements[0] as any)?.profiles?.first_name;

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

          {isInitialMinute && (
            <div className="flex items-center gap-4 py-1.5 px-6 rounded-2xl bg-indigo-500/10 border border-indigo-500/40 animate-radiant-glow">
              {initialName ? (
                <>
                  <Flame className="h-5 w-5 text-rose-500 animate-pulse" />
                  <span className="font-black text-xs sm:text-sm tracking-tight text-white uppercase italic flex items-center gap-2">
                    {initialName.toUpperCase()} LIDERA COM {topBroker?.count ?? ''} VENDA{(topBroker?.count ?? 0) > 1 ? 'S' : ''} NO MÊS. CADÊ O SEU RESULTADO, {userName.toUpperCase()}?
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

          {tickerItems.length === 0 && !isInitialMinute ? (
            <span className="text-indigo-400/40 font-black text-[10px] sm:text-xs uppercase tracking-[0.2em] animate-pulse">
              AGUARDANDO O PRÓXIMO ALVO SER ABATIDO... 🚀
            </span>
          ) : (
            [...tickerItems, ...tickerItems].map((item, idx) => {
              const isFresh = differenceInMinutes(new Date(), new Date(item.date)) < 5;
              return (
                <div key={`${item.id}-${idx}`} className={cn(
                  "flex items-center gap-4 py-1.5 px-5 rounded-2xl border transition-all",
                  isFresh
                    ? "bg-indigo-600/20 border-indigo-500/50 animate-pulse-glow shadow-[0_0_20px_rgba(99,102,241,0.2)]"
                    : "bg-white/5 border-white/5"
                )}>
                  <span className={cn("font-bold text-xs sm:text-sm tracking-tight uppercase flex items-center", isFresh ? "text-white" : "text-slate-400")}>
                    {item.type === 'SALE'
                      ? getSaleMessage(item as any)
                      : getPrizeMessage(item as any)}
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
