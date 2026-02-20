import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Play, AlertTriangle, Target } from "lucide-react";
import { format, isToday, isPast, startOfTomorrow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export function MissionToday({ brokerId, onSelectLead }: { brokerId: string; onSelectLead: (id: string) => void }) {
  const { data: missionLeads = [] } = useQuery({
    queryKey: ["mission-today", brokerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, name, status, next_action_date, phone")
        .eq("broker_id", brokerId)
        .or(`next_action_date.lte.${startOfTomorrow().toISOString()},next_action_date.is.null`)
        .not("status", "eq", "CONCLUDED")
        .not("status", "eq", "ABANDONED")
        .not("status", "eq", "EXCLUDED")
        .order("next_action_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const lateLeads = missionLeads.filter(
    (l: any) => l.next_action_date && isPast(new Date(l.next_action_date)) && !isToday(new Date(l.next_action_date))
  );
  const todayLeads = missionLeads.filter(
    (l: any) => !l.next_action_date || isToday(new Date(l.next_action_date))
  );

  if (missionLeads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl mb-3">
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
        </div>
        <p className="text-sm font-bold text-gray-300">Missão Cumprida!</p>
        <p className="text-xs text-gray-600 mt-1">Agenda limpa por hoje. 🏖️</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Target className="w-4 h-4 text-indigo-400 shrink-0" />
        <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest">Missão de Hoje</h2>
      </div>

      {/* Zona Crítica — Atrasados */}
      {lateLeads.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] font-black text-red-400 uppercase tracking-widest">
              Zona Crítica ({lateLeads.length})
            </span>
          </div>
          {lateLeads.map((lead: any) => (
            <button key={lead.id} onClick={() => onSelectLead(lead.id)}
              className="group w-full flex items-center justify-between p-3 bg-red-900/10 border border-red-500/20 rounded-xl hover:border-red-500/40 hover:bg-red-900/20 transition-all text-left">
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center justify-center w-10 h-10 bg-red-900/40 text-red-400 rounded-lg font-black leading-none shrink-0">
                  <span className="text-xs">
                    {lead.next_action_date ? format(new Date(lead.next_action_date), "dd") : "!!"}
                  </span>
                  <span className="text-[8px] uppercase">
                    {lead.next_action_date ? format(new Date(lead.next_action_date), "MMM", { locale: ptBR }) : "HOJE"}
                  </span>
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">{lead.name}</h3>
                  <p className="text-[10px] font-bold text-red-400 flex items-center gap-1 mt-0.5">
                    <AlertTriangle className="h-3 w-3" /> ATRASADO
                  </p>
                </div>
              </div>
              <div className="h-7 w-7 rounded-full bg-red-900/40 border border-red-500/30 flex items-center justify-center text-red-400 group-hover:scale-110 transition-transform">
                <Play className="h-3 w-3 ml-0.5 fill-current" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Ordens do Dia */}
      {todayLeads.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">
              Ordens do Dia ({todayLeads.length})
            </span>
          </div>
          {todayLeads.map((lead: any) => (
            <button key={lead.id} onClick={() => onSelectLead(lead.id)}
              className="group w-full flex items-center justify-between p-3 bg-slate-700/30 border border-gray-700/40 rounded-xl hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all text-left">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 bg-slate-700/60 text-gray-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors rounded-xl font-bold text-xs shrink-0">
                  {lead.next_action_date ? format(new Date(lead.next_action_date), "HH:mm") : "AGORA"}
                </div>
                <div>
                  <h3 className="font-bold text-gray-200 group-hover:text-white transition-colors text-sm">{lead.name}</h3>
                  <p className="text-[10px] font-medium text-gray-600 uppercase tracking-wide mt-0.5">{lead.status}</p>
                </div>
              </div>
              <div className="h-7 w-7 rounded-full bg-slate-700/60 group-hover:bg-indigo-600/30 flex items-center justify-center text-gray-600 group-hover:text-indigo-400 transition-colors">
                <Play className="h-3 w-3 ml-0.5 fill-current" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
