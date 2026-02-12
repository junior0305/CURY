
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { format, isToday, isPast, isFuture } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export function MissionToday({ brokerId, onSelectLead }: { brokerId: string, onSelectLead: (id: string) => void }) {
  const { data: missionLeads = [] } = useQuery({
    queryKey: ['mission-today', brokerId],
    queryFn: async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      // Buscar leads agendados para hoje OU atrasados OU novos sem agendamento
      const { data, error } = await supabase
        .from('leads')
        .select('id, name, status, next_action_date, phone')
        .eq('broker_id', brokerId)
        .or(`next_action_date.lte.${todayEnd.toISOString()},next_action_date.is.null`)
        .not('status', 'eq', 'CONCLUDED')
        .not('status', 'eq', 'ABANDONED')
        .order('next_action_date', { ascending: true })
        .limit(10); // Foco nos top 10

      if (error) throw error;
      return data;
    }
  });

  if (missionLeads.length === 0) return null;

  return (
    <div className="mb-8 animate-in slide-in-from-top-4 duration-500">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 bg-indigo-600 rounded-lg text-white">
          <Calendar className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">
          Sua Missão de Hoje
        </h2>
        <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-none">
          {missionLeads.length} Prioridades
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {missionLeads.map((lead: any) => {
          const date = lead.next_action_date ? new Date(lead.next_action_date) : null;
          const isLate = date && isPast(date) && !isToday(date);
          const isNow = date && isToday(date);
          
          return (
            <button
              key={lead.id}
              onClick={() => onSelectLead(lead.id)}
              className={cn(
                "flex flex-col p-4 rounded-2xl border text-left transition-all hover:scale-105 active:scale-95 group relative overflow-hidden",
                isLate ? "bg-rose-50 border-rose-100" : isNow ? "bg-white border-indigo-200 ring-2 ring-indigo-50" : "bg-white border-slate-100"
              )}
            >
              <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20">
                <Clock className="h-12 w-12" />
              </div>
              
              <div className="flex justify-between items-start mb-2">
                <Badge variant="outline" className={cn("text-[9px] font-bold border-none", isLate ? "bg-rose-200 text-rose-700" : "bg-slate-100 text-slate-500")}>
                  {isLate ? "ATRASADO" : isNow ? "HOJE" : "NOVO"}
                </Badge>
                {date && <span className="text-[10px] font-bold text-slate-400">{format(date, "HH:mm")}</span>}
              </div>
              
              <h3 className="font-bold text-slate-900 truncate w-full">{lead.name}</h3>
              <p className="text-xs text-slate-500 mt-1 truncate">{lead.status}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
