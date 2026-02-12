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

  if (missionLeads.length === 0) return (
    <div className="p-4 rounded-xl border border-dashed border-slate-200 text-center bg-slate-50/50">
      <p className="text-xs text-slate-400 font-medium">Sua agenda está limpa por hoje. 🏖️</p>
    </div>
  );

  return (
    <div className="mb-4 animate-in slide-in-from-top-4 duration-500">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Calendar className="h-3 w-3" /> Missão de Hoje
        </h2>
        <Badge className="bg-indigo-100 text-indigo-700 h-5 px-2 text-[10px] border-none">
          {missionLeads.length}
        </Badge>
      </div>

      <div className="space-y-2">
        {missionLeads.map((lead: any) => {
          const date = lead.next_action_date ? new Date(lead.next_action_date) : null;
          const isLate = date && isPast(date) && !isToday(date);
          const isNow = date && isToday(date);
          
          return (
            <button
              key={lead.id}
              onClick={() => onSelectLead(lead.id)}
              className={cn(
                "flex items-center justify-between w-full p-3 rounded-xl border text-left transition-all hover:shadow-md active:scale-95 group bg-white",
                isLate ? "border-rose-200 bg-rose-50/30" : isNow ? "border-indigo-200 bg-indigo-50/30" : "border-slate-100"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="font-bold text-slate-900 text-xs truncate">{lead.name}</h3>
                  {isLate && <Badge variant="destructive" className="h-4 px-1 text-[8px]">ATRASADO</Badge>}
                </div>
                <p className="text-[10px] text-slate-500 truncate flex items-center gap-1">
                  {lead.phone} • <span className="uppercase">{lead.status}</span>
                </p>
              </div>
              
              <div className="flex flex-col items-end pl-2">
                {date ? (
                  <span className={cn("text-[10px] font-bold", isLate ? "text-rose-600" : "text-indigo-600")}>
                    {format(date, "HH:mm")}
                  </span>
                ) : (
                  <Clock className="h-3 w-3 text-slate-300" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}