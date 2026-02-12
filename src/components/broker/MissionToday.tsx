import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, CheckCircle2, AlertCircle, Play, AlertTriangle } from "lucide-react";
import { format, isToday, isPast, isFuture, startOfTomorrow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export function MissionToday({ brokerId, onSelectLead }: { brokerId: string, onSelectLead: (id: string) => void }) {
  const { data: missionLeads = [] } = useQuery({
    queryKey: ['mission-today', brokerId],
    queryFn: async () => {
      // Buscar leads agendados para hoje OU atrasados OU novos sem agendamento
      const { data, error } = await supabase
        .from('leads')
        .select('id, name, status, next_action_date, phone')
        .eq('broker_id', brokerId)
        .or(`next_action_date.lte.${startOfTomorrow().toISOString()},next_action_date.is.null`)
        .not('status', 'eq', 'CONCLUDED')
        .not('status', 'eq', 'ABANDONED')
        .not('status', 'eq', 'EXCLUDED')
        .order('next_action_date', { ascending: true }); // Ordena por urgência

      if (error) throw error;
      return data || [];
    }
  });

  const lateLeads = missionLeads.filter((l: any) => l.next_action_date && isPast(new Date(l.next_action_date)) && !isToday(new Date(l.next_action_date)));
  const todayLeads = missionLeads.filter((l: any) => !l.next_action_date || isToday(new Date(l.next_action_date)));

  if (missionLeads.length === 0) return (
    <div className="p-6 rounded-3xl border-2 border-dashed border-slate-200 text-center bg-slate-50/50 flex flex-col items-center justify-center min-h-[200px]">
      <div className="bg-white p-4 rounded-full shadow-sm mb-3">
        <CheckCircle2 className="h-8 w-8 text-emerald-400" />
      </div>
      <p className="text-sm font-bold text-slate-600">Missão Cumprida!</p>
      <p className="text-xs text-slate-400">Sua agenda está limpa por hoje. 🏖️</p>
    </div>
  );

  return (
    <div className="space-y-6 animate-in slide-in-from-left-4 duration-500">
      
      {/* 1. ZONA CRÍTICA (ATRASADOS) */}
      {lateLeads.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <div className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
            <h2 className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Zona Crítica ({lateLeads.length})</h2>
          </div>
          
          <div className="space-y-2">
            {lateLeads.map((lead: any) => (
              <button
                key={lead.id}
                onClick={() => onSelectLead(lead.id)}
                className="group relative w-full flex items-center justify-between p-3 bg-white border-l-4 border-l-rose-500 rounded-r-xl shadow-sm hover:shadow-md transition-all border border-slate-100 overflow-hidden"
              >
                <div className="absolute inset-0 bg-rose-50 opacity-0 group-hover:opacity-100 transition-opacity" />
                
                <div className="flex items-center gap-4 relative z-10">
                  <div className="flex flex-col items-center justify-center w-12 h-12 bg-rose-100 text-rose-700 rounded-lg font-black leading-none">
                    <span className="text-xs">
                      {lead.next_action_date ? format(new Date(lead.next_action_date), 'dd') : '!!'}
                    </span>
                    <span className="text-[8px] uppercase">
                      {lead.next_action_date ? format(new Date(lead.next_action_date), 'MMM', {locale: ptBR}) : 'HOJE'}
                    </span>
                  </div>
                  <div className="text-left">
                    <h3 className="font-bold text-slate-900 text-sm">{lead.name}</h3>
                    <p className="text-[10px] font-bold text-rose-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> ATRASADO
                    </p>
                  </div>
                </div>

                <div className="h-8 w-8 rounded-full bg-white border-2 border-rose-100 flex items-center justify-center text-rose-500 relative z-10 group-hover:scale-110 transition-transform shadow-sm">
                  <Play className="h-3 w-3 ml-0.5 fill-current" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 2. ZONA DE COMBATE (HOJE) */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <div className="h-2 w-2 rounded-full bg-indigo-500" />
          <h2 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Ordens do Dia ({todayLeads.length})</h2>
        </div>

        <div className="space-y-2">
          {todayLeads.map((lead: any) => (
            <button
              key={lead.id}
              onClick={() => onSelectLead(lead.id)}
              className="group relative w-full flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 hover:border-indigo-300 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-12 h-12 bg-slate-50 text-slate-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors rounded-xl font-bold text-xs shadow-inner">
                  {lead.next_action_date ? format(new Date(lead.next_action_date), 'HH:mm') : 'AGORA'}
                </div>
                <div className="text-left">
                  <h3 className="font-bold text-slate-700 group-hover:text-indigo-900 transition-colors text-sm">{lead.name}</h3>
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">{lead.status}</p>
                </div>
              </div>

              <div className="h-8 w-8 rounded-full bg-slate-50 group-hover:bg-indigo-100 flex items-center justify-center text-slate-300 group-hover:text-indigo-600 transition-colors">
                <Play className="h-3 w-3 ml-0.5 fill-current" />
              </div>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}