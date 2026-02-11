import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, Target, ArrowRight, Banknote } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAudioArena } from "@/hooks/use-audio-arena";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

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

  // 1. Sincronizar sons não ouvidos (Vendas E Novos Leads)
  useEffect(() => {
    if (!user?.id) return;

    const syncPendingSounds = async () => {
      // --- BLOCO DE VENDAS (Já existente) ---
      // Buscar quais desses achievements o usuário já "ouviu" (estão na tabela de lidos)
      const achievementIds = achievements.map((a: any) => a.id);
      
      const { data: readIds } = await supabase
        .from('audio_notifications_read')
        .select('achievement_id')
        .eq('user_id', user.id)
        .in('achievement_id', achievementIds);

      const alreadyHeard = new Set(readIds?.map(r => r.achievement_id) || []);
      
      // Tocar o som para o mais recente que ainda não foi ouvido
      const pendingToPlay = achievements.find((a: any) => !alreadyHeard.has(a.id) && !playedIds.has(a.id));

      if (pendingToPlay) {
        console.log("[AchievementTicker] Tocando som para venda não ouvida:", pendingToPlay.id);
        
        // Registrar que ouviu ANTES de tocar para evitar loops
        const { error } = await supabase
          .from('audio_notifications_read')
          .insert({ user_id: user.id, achievement_id: pendingToPlay.id });

        if (!error) {
          playSound('SALE');
          setPlayedIds(prev => new Set([...prev, pendingToPlay.id]));
        }
      }

      // --- NOVO BLOCO: LEADS NÃO OUVIDOS ---
      // Buscar leads NOVOS atribuídos a este corretor que ele ainda não "ouviu"
      const { data: recentLeads } = await supabase
        .from('leads')
        .select('id, name')
        .eq('broker_id', user.id)
        .eq('status', 'NEW')
        .order('created_at', { ascending: false })
        .limit(5);

      if (recentLeads && recentLeads.length > 0) {
        const leadIds = recentLeads.map(l => l.id);
        
        // Verificar quais desses já foram marcados como "lidos" no áudio
        const { data: heardLeads } = await supabase
          .from('audio_notifications_read')
          .select('achievement_id') // Usamos a mesma coluna para simplificar
          .eq('user_id', user.id)
          .in('achievement_id', leadIds);

        const heardSet = new Set(heardLeads?.map(h => h.achievement_id) || []);
        
        // Pegar o mais recente que ele ainda não ouviu
        const leadToNotify = recentLeads.find(l => !heardSet.has(l.id) && !playedIds.has(l.id));

        if (leadToNotify) {
          console.log("[AudioPersistence] Novo lead não ouvido detectado:", leadToNotify.name);
          
          await supabase
            .from('audio_notifications_read')
            .insert({ user_id: user.id, achievement_id: leadToNotify.id });

          playSound('NEW_LEAD');
          setPlayedIds(prev => new Set([...prev, leadToNotify.id]));
        }
      }
    };

    syncPendingSounds();
  }, [achievements, user?.id, playSound, playedIds]);

  // 2. Escuta Realtime para novos achievements
  useEffect(() => {
    const channel = supabase
      .channel('achievements-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'achievements' },
        () => {
          console.log("[AchievementTicker] Mudança detectada, atualizando lista...");
          refetch();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

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

    // Usar o ID para manter a mesma frase para o mesmo achievement
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
            // Duplicar para loop contínuo
            [...achievements, ...achievements].map((ach: any, idx) => (
              <div key={`${ach.id}-${idx}`} className="flex items-center gap-4 py-1.5 px-4 bg-white/5 rounded-2xl border border-white/10 hover:bg-white/10 transition-all">
                <span className="text-white font-black text-xs sm:text-sm tracking-tight uppercase">
                  {getMessage(ach)}
                </span>
                <div className="flex items-center gap-1 bg-emerald-500/20 px-2 py-0.5 rounded-lg border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                  <Banknote className="h-3 w-3 text-emerald-400" />
                  <span className="text-emerald-400 font-black text-[10px] sm:text-xs">
                    VALOR CREDITADO
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default AchievementTicker;