import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flame, Timer, TrendingUp, Users2, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CampaignHeroBanner({ leads, users }: { leads: any[], users: any[] }) {
  // 1. Buscar Campanha Ativa
  const { data: campaign } = useQuery({
    queryKey: ["active-campaign"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("active_campaigns")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  // 1.5 Buscar Histórico de Funil (para garantir contagem cumulativa)
  const { data: history = [] } = useQuery({
    queryKey: ["campaign-funnel-history"],
    queryFn: async () => {
      const { data, error } = await supabase.from('funnel_history').select('*');
      if (error) throw error;
      return data;
    }
  });

  // 2. Calcular progresso dos corretores para esta campanha
  const leaderboard = useMemo(() => {
    if (!campaign) return [];
    
    const brokers = users.filter(u => u.role === 'BROKER');
    const actionMap: Record<string, string> = {
      'VISIT': 'VISIT_SCHEDULED',
      'SALE': 'CONCLUDED',
      'DOCS': 'DOCS_REQUESTED'
    };
    
    const targetStatus = actionMap[campaign.target_action];
    
    return brokers.map(broker => {
      // NOVA LÓGICA: Contar leads únicos que atingiram o status no histórico
      // OU que estão atualmente nesse status (backup)
      
      const historyCount = history.filter(h => 
        h.broker_id === broker.id && 
        h.stage === targetStatus &&
        // Opcional: Filtrar pela data da campanha se necessário
        // (Assume-se que a campanha conta "tudo" por enquanto ou implementamos filtro de data)
        (campaign.created_at ? new Date(h.created_at) >= new Date(campaign.created_at) : true)
      ).length;

      // Fallback para contagem atual se histórico estiver vazio (retrocompatibilidade)
      const currentStatusCount = leads.filter(l => l.brokerId === broker.id && l.status === targetStatus).length;
      
      // Usa o maior valor (Histórico vs Atual) para garantir que ninguém perca pontos
      const count = Math.max(historyCount, currentStatusCount);

      return {
        name: broker.name.split(' ')[0],
        count,
        progress: Math.min(Math.round((count / campaign.target_count) * 100), 100)
      };
    })
    .filter(b => b.count > 0) // Apenas quem já deu o primeiro passo
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  }, [campaign, leads, users, history]);

  if (!campaign) return null;

  const timeLeft = new Date(campaign.ends_at).getTime() - Date.now();
  const daysLeft = Math.max(0, Math.floor(timeLeft / (1000 * 60 * 60 * 24)));

  return (
    <div className="relative group overflow-hidden rounded-[2rem] bg-slate-900 border-none shadow-[0_20px_50px_-15px_rgba(79,70,229,0.5)] mb-8 animate-in zoom-in-95 duration-500">
      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-indigo-600/20 to-transparent skew-x-[-20deg] translate-x-20" />
      <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-rose-600/10 blur-3xl rounded-full animate-pulse" />

      <div className="relative grid grid-cols-1 lg:grid-cols-12 items-center">
        {/* Lado Esquerdo: O Desafio */}
        <div className="lg:col-span-7 p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-3">
            <Badge className="bg-rose-600 text-white font-black px-3 py-1 rounded-full animate-bounce">CAMPANHA ATIVA</Badge>
            <div className="flex items-center gap-1.5 text-rose-400 font-bold text-xs uppercase tracking-widest">
              <Timer className="h-4 w-4" />
              Faltam {daysLeft} dias
            </div>
          </div>
          
          <div>
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tighter leading-none italic">
              {campaign.title}
            </h2>
            <p className="text-indigo-200 mt-2 font-medium text-sm sm:text-base max-w-md">
              Meta: <span className="text-white font-black">{campaign.target_count} {campaign.target_action === 'VISIT' ? 'Visitas' : 'Ações'}</span> = 
              <span className="text-emerald-400 font-black ml-1">R$ {campaign.reward_amount} no PIX</span>
            </p>
          </div>
        </div>

        {/* Lado Direito: Monitor de Elite */}
        <div className="lg:col-span-5 bg-white/5 backdrop-blur-md h-full p-6 sm:p-8 border-l border-white/10">
          <h3 className="text-indigo-400 font-black text-[10px] uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <TrendingUp className="h-3 w-3" /> Monitor de Elite
          </h3>
          
          <div className="space-y-4">
            {leaderboard.length === 0 ? (
              <p className="text-slate-500 text-xs italic">Ninguém pontuou ainda. Seja o primeiro!</p>
            ) : (
              leaderboard.map((broker, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex justify-between items-end">
                    <span className="text-white font-bold text-xs flex items-center gap-2">
                      <span className="text-[10px] text-indigo-500">#{idx + 1}</span>
                      {broker.name}
                    </span>
                    <span className="text-indigo-300 font-black text-[10px]">{broker.count}/{campaign.target_count}</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                    <div 
                      className={cn(
                        "h-full transition-all duration-1000 ease-out rounded-full",
                        idx === 0 ? "bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" : "bg-slate-600"
                      )}
                      style={{ width: `${broker.progress}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
          
          {leaderboard.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-2">
              <Trophy className="h-3 w-3 text-amber-400" />
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                {leaderboard[0].name} está liderando a corrida!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}