import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Play, AlertTriangle, Target, ChevronDown, CalendarX } from "lucide-react";
import { format, isToday, isPast, startOfTomorrow, startOfToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const MAX_VISIBLE = 5;

export function MissionToday({ brokerId, onSelectLead }: { brokerId: string; onSelectLead: (id: string) => void }) {
  const [showAllLate, setShowAllLate] = useState(false);
  const [showAllToday, setShowAllToday] = useState(false);

  const { data: scheduledLeads = [] } = useQuery({
    queryKey: ["mission-today", brokerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, name, status, next_action_date, phone")
        .eq("broker_id", brokerId)
        .not("next_action_date", "is", null)
        .lte("next_action_date", startOfTomorrow().toISOString())
        .not("status", "eq", "CONCLUDED")
        .not("status", "eq", "ABANDONED")
        .not("status", "eq", "EXCLUDED")
        .order("next_action_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: noActionCount = 0 } = useQuery({
    queryKey: ["mission-no-action", brokerId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("broker_id", brokerId)
        .is("next_action_date", null)
        .not("status", "eq", "CONCLUDED")
        .not("status", "eq", "ABANDONED")
        .not("status", "eq", "EXCLUDED");
      if (error) return 0;
      return count || 0;
    },
  });

  const lateLeads = scheduledLeads.filter(
    (l: any) => l.next_action_date && isPast(new Date(l.next_action_date)) && !isToday(new Date(l.next_action_date))
  );
  const todayLeads = scheduledLeads.filter(
    (l: any) => l.next_action_date && isToday(new Date(l.next_action_date))
  );

  const visibleLate = showAllLate ? lateLeads : lateLeads.slice(0, MAX_VISIBLE);
  const visibleToday = showAllToday ? todayLeads : todayLeads.slice(0, MAX_VISIBLE);

  if (scheduledLeads.length === 0 && noActionCount === 0) {
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
          {visibleLate.map((lead: any) => (
            <LeadRow key={lead.id} lead={lead} variant="late" onSelect={onSelectLead} />
          ))}
          {!showAllLate && lateLeads.length > MAX_VISIBLE && (
            <button
              onClick={() => setShowAllLate(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold text-red-400 hover:text-red-300 border border-red-500/20 rounded-xl hover:bg-red-900/10 transition-all">
              <ChevronDown className="w-3 h-3" />
              +{lateLeads.length - MAX_VISIBLE} atrasados
            </button>
          )}
        </div>
      )}

      {/* Ordens do Dia */}
      {todayLeads.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">
              Hoje ({todayLeads.length})
            </span>
          </div>
          {visibleToday.map((lead: any) => (
            <LeadRow key={lead.id} lead={lead} variant="today" onSelect={onSelectLead} />
          ))}
          {!showAllToday && todayLeads.length > MAX_VISIBLE && (
            <button
              onClick={() => setShowAllToday(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold text-indigo-400 hover:text-indigo-300 border border-indigo-500/20 rounded-xl hover:bg-indigo-500/5 transition-all">
              <ChevronDown className="w-3 h-3" />
              +{todayLeads.length - MAX_VISIBLE} para hoje
            </button>
          )}
        </div>
      )}

      {/* Leads sem agendamento — só contador */}
      {noActionCount > 0 && (
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-slate-800/60 border border-gray-700/40">
          <CalendarX className="w-4 h-4 text-gray-600 shrink-0" />
          <p className="text-xs text-gray-600">
            <span className="font-bold text-gray-500">{noActionCount} leads</span> sem próxima ação agendada
          </p>
        </div>
      )}
    </div>
  );
}

function LeadRow({ lead, variant, onSelect }: {
  lead: any;
  variant: "late" | "today";
  onSelect: (id: string) => void;
}) {
  const isLate = variant === "late";
  return (
    <button
      onClick={() => onSelect(lead.id)}
      className={cn(
        "group w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left",
        isLate
          ? "bg-red-900/10 border-red-500/20 hover:border-red-500/40 hover:bg-red-900/20"
          : "bg-slate-700/30 border-gray-700/40 hover:border-indigo-500/30 hover:bg-indigo-500/5"
      )}>
      <div className="flex items-center gap-3">
        <div className={cn(
          "flex flex-col items-center justify-center w-10 h-10 rounded-lg font-black leading-none shrink-0",
          isLate ? "bg-red-900/40 text-red-400" : "bg-slate-700/60 text-gray-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors"
        )}>
          {isLate ? (
            <>
              <span className="text-xs">{format(new Date(lead.next_action_date), "dd")}</span>
              <span className="text-[8px] uppercase">{format(new Date(lead.next_action_date), "MMM", { locale: ptBR })}</span>
            </>
          ) : (
            <span className="text-xs font-bold">{format(new Date(lead.next_action_date), "HH:mm")}</span>
          )}
        </div>
        <div>
          <h3 className="font-bold text-sm text-gray-200 group-hover:text-white transition-colors">{lead.name}</h3>
          {isLate ? (
            <p className="text-[10px] font-bold text-red-400 flex items-center gap-1 mt-0.5">
              <AlertTriangle className="h-3 w-3" /> ATRASADO
            </p>
          ) : (
            <p className="text-[10px] font-medium text-gray-600 uppercase tracking-wide mt-0.5">{lead.status}</p>
          )}
        </div>
      </div>
      <div className={cn(
        "h-7 w-7 rounded-full flex items-center justify-center transition-colors",
        isLate
          ? "bg-red-900/40 border border-red-500/30 text-red-400 group-hover:scale-110"
          : "bg-slate-700/60 group-hover:bg-indigo-600/30 text-gray-600 group-hover:text-indigo-400"
      )}>
        <Play className="h-3 w-3 ml-0.5 fill-current" />
      </div>
    </button>
  );
}
