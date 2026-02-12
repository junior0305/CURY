import { useMemo, useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Lead } from "@/types/lead";
import { User } from "@/types/user";
import { Crown, Sparkles, Trophy, BarChart3, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAudioArena } from "@/hooks/use-audio-arena";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, startOfMonth, isAfter, parseISO } from "date-fns";

type PodiumEntry = {
  id: string;
  name: string;
  points: number;
  subtitle: string;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
  return (first + last).toUpperCase();
}

function scoreForLead(lead: Lead, filteredHistory: any[], startDate: Date) {
  // Filtra o histórico para incluir apenas eventos dentro do período
  const relevantHistory = filteredHistory.filter(h => 
    h.lead_id === lead.id && 
    isAfter(parseISO(h.created_at), startDate)
  );

  const stagesReached = new Set(relevantHistory.map(h => h.stage));
  
  // Só adiciona o status atual se a última interação foi dentro do período
  if (lead.last_interaction_at && isAfter(parseISO(lead.last_interaction_at), startDate)) {
    stagesReached.add(lead.status);
  }

  let totalPoints = 0;
  
  if (stagesReached.has("CONCLUDED")) totalPoints += 500;
  if (stagesReached.has("DOCS_REQUESTED")) totalPoints += 50;
  if (stagesReached.has("VISIT_SCHEDULED")) totalPoints += 20;
  if (stagesReached.has("IN_PROGRESS")) totalPoints += 2;
  
  // Pontos por lead NOVO apenas se criado no período
  if (lead.created_at && isAfter(parseISO(lead.created_at), startDate)) {
     totalPoints += 0.5;
  }
  
  return totalPoints;
}

export function LeaderboardPodium({ leads, users, onOpenKPIs }: { 
  leads: Lead[]; 
  users: User[];
  onOpenKPIs?: (id: string, name: string) => void;
}) {
  // Estado interno para controle de timeframe (já que o Dashboard não controlava)
  const [timeframe, setTimeframe] = useState<'WEEK' | 'MONTH'>('MONTH');

  const { data: history = [] } = useQuery({
    queryKey: ['funnel-history'],
    queryFn: async () => {
      const { data, error } = await supabase.from('funnel_history').select('*');
      if (error) throw error;
      return data;
    }
  });

  const { playSound } = useAudioArena();
  const prevRankings = useRef<string[]>([]);

  const top3 = useMemo(() => {
    // IMPORTANTE: Ranking UNIVERSAL e ABSOLUTO
    const brokers = users.filter((u) => u.role === "BROKER");
    const byBroker: Record<string, number> = {};

    // Define data de corte
    const now = new Date();
    const startDate = timeframe === 'WEEK' ? startOfWeek(now) : startOfMonth(now);

    console.log(`[Podium] Rankeando ${brokers.length} corretores para timeframe: ${timeframe}`);

    for (const lead of leads) {
      if (!lead.brokerId) continue;
      byBroker[lead.brokerId] = (byBroker[lead.brokerId] ?? 0) + scoreForLead(lead, history, startDate);
    }

    // Gerar lista de ranking real, sem favorecer ninguém
    const entries: PodiumEntry[] = brokers
      .map((b) => ({
        id: b.id,
        name: b.name,
        points: Math.round((byBroker[b.id] ?? 0) * 10) / 10,
        subtitle: b.leadAssignmentEnabled ? "Em Campo" : "Pausa",
      }))
      .filter((e) => e.points > 0)
      .sort((a, b) => b.points - a.points); // Ordenação absoluta por pontos

    console.log("[Podium] Top 3 Real detectado:", entries.slice(0, 3));
    return entries.slice(0, 3);
  }, [leads, users, history, timeframe]);

  useEffect(() => {
    const currentRankIds = top3.map(b => b.id);
    console.log("[Podium] Verificando ultrapassagem...", { 
      atual: currentRankIds, 
      anterior: prevRankings.current 
    });
    
    // Se não for a primeira carga e a ordem mudou (especialmente no top 3)
    if (prevRankings.current.length > 0) {
      const topChanged = JSON.stringify(currentRankIds) !== JSON.stringify(prevRankings.current);
      
      if (topChanged) {
        console.log("[Podium] ULTRAPASSAGEM DETECTADA! Disparando áudio...");
        playSound('OVERTAKE');
      }
    }
    
    prevRankings.current = currentRankIds;
  }, [top3, playSound]);

  const slots: Array<{ place: 1 | 2 | 3; entry?: PodiumEntry; height: string; tone: string; ring: string; textTone: string }> = [
    { place: 2, entry: top3[1], height: "h-20 sm:h-24", tone: "bg-slate-200", ring: "ring-slate-100", textTone: "text-slate-600" },
    { place: 1, entry: top3[0], height: "h-28 sm:h-32", tone: "bg-indigo-600", ring: "ring-indigo-200", textTone: "text-indigo-600" },
    { place: 3, entry: top3[2], height: "h-16 sm:h-20", tone: "bg-amber-700/80", ring: "ring-amber-100", textTone: "text-amber-800" },
  ];

  return (
    <Card className="relative overflow-hidden rounded-[2.5rem] border-none bg-white shadow-[0_30px_100px_-20px_rgba(0,0,0,0.12)] p-6 sm:p-8 animate-in zoom-in-95 duration-700">
      <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-600/5 blur-3xl" />
      <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-sky-600/5 blur-3xl" />

      <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500 rounded-2xl text-white shadow-lg shadow-amber-200">
              <Trophy className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tighter">HALL DA FAMA</h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="border-indigo-100 bg-indigo-50/50 text-indigo-600 font-bold uppercase text-[10px] tracking-widest rounded-full">
                  Elite Performance
                </Badge>
                <div className="h-1 w-1 rounded-full bg-slate-300" />
                <button 
                  onClick={() => setTimeframe(timeframe === 'WEEK' ? 'MONTH' : 'WEEK')}
                  className="text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors underline decoration-2 underline-offset-4"
                >
                  Ver {timeframe === 'MONTH' ? "da Semana" : "do Mês"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
          <Button 
            variant={timeframe === 'WEEK' ? "default" : "ghost"} 
            size="sm" 
            onClick={() => setTimeframe('WEEK')}
            className={cn("rounded-xl text-xs font-bold px-4 transition-all", timeframe === 'WEEK' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500")}
          >
            Semana
          </Button>
          <Button 
            variant={timeframe === 'MONTH' ? "default" : "ghost"} 
            size="sm" 
            onClick={() => setTimeframe('MONTH')}
            className={cn("rounded-xl text-xs font-bold px-4 transition-all", timeframe === 'MONTH' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500")}
          >
            Mês
          </Button>
        </div>
      </div>

      {top3.length === 0 ? (
        <div className="py-12 text-center text-slate-400 font-medium italic bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
          A batalha está apenas começando... Aguardando os primeiros avanços no funil.
        </div>
      ) : (
        <div className="grid grid-cols-3 items-end gap-2 sm:gap-6 max-w-2xl mx-auto">
          {slots.map((s) => (
            <div key={s.place} className="flex flex-col items-center group">
              <div className="relative mb-4 flex flex-col items-center">
                <Avatar className={cn(
                  "h-14 w-14 sm:h-20 sm:w-20 ring-4 shadow-xl transition-all duration-500 group-hover:scale-110", 
                  s.place === 1 ? "ring-indigo-100" : "ring-white"
                )}>
                  <AvatarFallback className={cn("text-lg sm:text-2xl font-black", s.place === 1 ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600")}>
                    {s.entry ? initials(s.entry.name) : s.place}
                  </AvatarFallback>
                </Avatar>
                
                {s.place === 1 && (
                  <div className="absolute -top-6 bg-amber-400 p-2 rounded-xl shadow-lg animate-bounce">
                    <Crown className="h-5 w-5 text-white" />
                  </div>
                )}
                
                <div className={cn(
                  "absolute -bottom-2 rounded-full px-3 py-0.5 text-[10px] font-black text-white shadow-md",
                  s.place === 1 ? "bg-indigo-600" : s.place === 2 ? "bg-slate-500" : "bg-amber-800"
                )}>
                  #{s.place}
                </div>
              </div>

              <div
                className={cn(
                  "w-full rounded-t-[2.5rem] rounded-b-3xl shadow-inner transition-all duration-700 dashboard-float",
                  s.height,
                  s.place === 1 ? "bg-indigo-600 shadow-[0_20px_50px_-10px_rgba(79,70,229,0.4)]" : 
                  s.place === 2 ? "bg-slate-200" : "bg-amber-700/80"
                )}
                style={{ animationDelay: `${s.place * 150}ms` }}
              >
                <div className="flex h-full items-center justify-center">
                   <Sparkles className={cn("h-6 w-6 opacity-20 text-white", s.place === 1 ? "animate-pulse" : "hidden")} />
                </div>
              </div>

              <div className="mt-4 text-center w-full">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{s.place === 1 ? "O Melhor" : s.place === 2 ? "Vice-Líder" : "No Topo"}</p>
                <h3 className="mt-1 text-sm sm:text-lg font-black text-slate-900 truncate px-2">{s.entry?.name ?? "—"}</h3>
                
                {s.entry && (
                  <div className="mt-3 flex flex-col items-center gap-2">
                    <div className="flex items-center gap-1.5 bg-slate-900 text-white px-3 py-1 rounded-full text-[11px] font-black shadow-sm">
                      <TrendingUp className="h-3 w-3 text-emerald-400" />
                      {s.entry.points} PTS
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => onOpenKPIs?.(s.entry!.id, s.entry!.name)}
                      className="h-7 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 rounded-full"
                    >
                      <BarChart3 className="h-3 w-3 mr-1" /> Ver KPIs
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default LeaderboardPodium;