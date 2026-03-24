import { useMemo, useState, useEffect, useRef } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Lead } from "@/types/lead";
import { User } from "@/types/user";
import { Crown, Sparkles, Trophy, BarChart3, TrendingUp } from "lucide-react";
import { useAudioArena } from "@/hooks/use-audio-arena";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, startOfMonth, isAfter, parseISO } from "date-fns";

type PodiumEntry = { id: string; name: string; points: number; subtitle: string };

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]?.[0] : "")).toUpperCase();
}

function scoreForLead(lead: Lead, filteredHistory: any[], startDate: Date) {
  const relevantHistory = filteredHistory.filter(h =>
    h.lead_id === lead.id && h.created_at && isAfter(parseISO(h.created_at), startDate)
  );
  const stagesReached = new Set(relevantHistory.map(h => h.stage));
  const lastUpdateStr = lead.lastInteractionAt || lead.createdAt;
  const lastUpdate = lastUpdateStr ? parseISO(lastUpdateStr) : new Date(0);
  if (isAfter(lastUpdate, startDate)) stagesReached.add(lead.status);

  let pts = 0;
  if (stagesReached.has("CONCLUDED"))       pts += 500;
  if (stagesReached.has("DOCS_REQUESTED"))  pts += 50;
  if (stagesReached.has("VISIT_SCHEDULED")) pts += 20;
  if (stagesReached.has("IN_PROGRESS"))     pts += 2;
  if (lead.createdAt && isAfter(parseISO(lead.createdAt), startDate)) pts += 0.5;
  return pts;
}

const SLOT_CONFIG = [
  { place: 2 as const, height: "h-20 sm:h-24", label: "Vice-Líder",  avatarBg: "bg-slate-600",  barBg: "bg-slate-600",   barShadow: "" },
  { place: 1 as const, height: "h-28 sm:h-32", label: "O Melhor",    avatarBg: "bg-indigo-600", barBg: "bg-indigo-600",  barShadow: "shadow-[0_20px_50px_-10px_rgba(79,70,229,0.6)]" },
  { place: 3 as const, height: "h-16 sm:h-20", label: "Top 3",       avatarBg: "bg-amber-700",  barBg: "bg-amber-700",   barShadow: "" },
];

export function LeaderboardPodium({ users, onOpenKPIs }: {
  leads?: Lead[];   // mantido por compatibilidade, não usado
  users: User[];
  onOpenKPIs?: (id: string, name: string) => void;
}) {
  const [timeframe, setTimeframe] = useState<"WEEK" | "MONTH">("MONTH");
  const { playSound } = useAudioArena();
  const prevRankings = useRef<string[]>([]);

  // Busca TODOS os leads (não filtrado por broker) para o ranking
  const { data: allLeads = [] } = useQuery({
    queryKey: ["ranking-all-leads"],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, broker_id, status, last_interaction_at, created_at")
        .not("status", "in", '("ABANDONED","EXCLUDED")');
      return (data || []).map((l: any) => ({
        id: l.id,
        brokerId: l.broker_id,
        status: l.status,
        lastInteractionAt: l.last_interaction_at,
        createdAt: l.created_at,
      })) as Lead[];
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: history = [] } = useQuery({
    queryKey: ["funnel-history"],
    queryFn: async () => {
      const { data, error } = await supabase.from("funnel_history").select("*");
      if (error) throw error;
      return data;
    },
  });

  const top3 = useMemo(() => {
    const brokers = users.filter(u => u.role === "BROKER");
    const startDate = timeframe === "WEEK" ? startOfWeek(new Date()) : startOfMonth(new Date());
    const byBroker: Record<string, number> = {};
    for (const lead of allLeads) {
      if (!lead.brokerId) continue;
      byBroker[lead.brokerId] = (byBroker[lead.brokerId] ?? 0) + scoreForLead(lead, history, startDate);
    }
    return brokers
      .map(b => ({ id: b.id, name: b.name, points: Math.round((byBroker[b.id] ?? 0) * 10) / 10, subtitle: b.leadAssignmentEnabled ? "Em Campo" : "Pausa" }))
      .filter(e => e.points > 0)
      .sort((a, b) => b.points - a.points)
      .slice(0, 3);
  }, [allLeads, users, history, timeframe]);

  useEffect(() => {
    const ids = top3.map(b => b.id);
    if (prevRankings.current.length > 0 && JSON.stringify(ids) !== JSON.stringify(prevRankings.current)) {
      playSound("OVERTAKE");
    }
    prevRankings.current = ids;
  }, [top3, playSound]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-700/40 bg-slate-800/40 p-6 sm:p-8">
      {/* Glows decorativos */}
      <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-600/5 blur-3xl pointer-events-none" />
      <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-amber-600/5 blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/20 border border-amber-500/30 rounded-2xl">
            <Trophy className="h-6 w-6 text-amber-400" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white tracking-tighter">HALL DA FAMA</h2>
            <Badge className="mt-1 bg-indigo-500/10 border-indigo-500/20 text-indigo-400 font-bold uppercase text-[10px] tracking-widest rounded-full">
              Elite Performance
            </Badge>
          </div>
        </div>

        {/* Toggle semana/mês */}
        <div className="flex items-center gap-1 bg-slate-900/60 p-1 rounded-xl border border-gray-700/40">
          {(["WEEK", "MONTH"] as const).map(tf => (
            <button key={tf} onClick={() => setTimeframe(tf)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                timeframe === tf
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/40"
                  : "text-gray-600 hover:text-gray-400"
              )}>
              {tf === "WEEK" ? "Semana" : "Mês"}
            </button>
          ))}
        </div>
      </div>

      {top3.length === 0 ? (
        <div className="py-12 text-center text-gray-700 border-2 border-dashed border-gray-700/40 rounded-2xl">
          A batalha está apenas começando... Aguardando os primeiros avanços.
        </div>
      ) : (
        <div className="grid grid-cols-3 items-end gap-3 sm:gap-6 max-w-2xl mx-auto">
          {SLOT_CONFIG.map(s => {
            const entry = top3[s.place - 1];
            return (
              <div key={s.place} className="flex flex-col items-center group">
                {/* Avatar */}
                <div className="relative mb-4 flex flex-col items-center">
                  {s.place === 1 && (
                    <div className="absolute -top-7 bg-amber-400 p-2 rounded-xl shadow-lg shadow-amber-900/40 animate-bounce">
                      <Crown className="h-5 w-5 text-white" />
                    </div>
                  )}
                  <Avatar className={cn(
                    "ring-4 shadow-xl transition-all duration-500 group-hover:scale-110",
                    s.place === 1 ? "h-16 w-16 sm:h-20 sm:w-20 ring-indigo-500/30" : "h-12 w-12 sm:h-16 sm:w-16 ring-gray-700/40"
                  )}>
                    <AvatarFallback className={cn("font-black text-white", s.place === 1 ? "text-xl sm:text-2xl" : "text-base sm:text-lg", s.avatarBg)}>
                      {entry ? initials(entry.name) : s.place}
                    </AvatarFallback>
                  </Avatar>
                  <div className={cn(
                    "absolute -bottom-2 rounded-full px-2 py-0.5 text-[9px] font-black text-white shadow-md",
                    s.place === 1 ? "bg-indigo-600" : s.place === 2 ? "bg-slate-600" : "bg-amber-700"
                  )}>
                    #{s.place}
                  </div>
                </div>

                {/* Barra do pódio */}
                <div className={cn(
                  "w-full rounded-t-2xl rounded-b-xl transition-all duration-700",
                  s.height, s.barBg, s.barShadow
                )}>
                  <div className="flex h-full items-center justify-center">
                    {s.place === 1 && <Sparkles className="h-6 w-6 opacity-30 text-white animate-pulse" />}
                  </div>
                </div>

                {/* Info */}
                <div className="mt-4 text-center w-full">
                  <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest">{s.label}</p>
                  <h3 className="mt-1 text-sm sm:text-base font-black text-white truncate px-1">
                    {entry?.name ?? "—"}
                  </h3>
                  {entry && (
                    <div className="mt-2 flex flex-col items-center gap-1.5">
                      <div className="flex items-center gap-1.5 bg-slate-700/60 border border-gray-700/40 text-white px-3 py-1 rounded-full text-[11px] font-black">
                        <TrendingUp className="h-3 w-3 text-emerald-400" />
                        {entry.points} PTS
                      </div>
                      <Button variant="ghost" size="sm"
                        onClick={() => onOpenKPIs?.(entry.id, entry.name)}
                        className="h-6 text-[10px] font-bold text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-full px-2">
                        <BarChart3 className="h-3 w-3 mr-1" /> Ver KPIs
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default LeaderboardPodium;
