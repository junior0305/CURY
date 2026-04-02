import { useState } from "react";
import { Lead } from "@/types/lead";
import { X, Sparkles, Bot, Calendar, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { LeadStatus } from "@/types/lead";

interface DailyBriefingProps {
  leads: Lead[];
  iaRepliedLeadIds: Set<string>;
  userId: string;
  onFilter: (filter: LeadStatus | "ALL") => void;
}

function sessionKey() {
  return "crm_briefing_dismissed_" + new Date().toDateString();
}

export function DailyBriefing({ leads, iaRepliedLeadIds, userId, onFilter }: DailyBriefingProps) {
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(sessionKey()) === "1");

  const myLeads = leads.filter(l => l.brokerId === userId && l.status !== "ABANDONED" && l.status !== "EXCLUDED");
  const today = new Date().toDateString();

  const newToday = myLeads.filter(l =>
    l.status === "NEW" && new Date(l.createdAt).toDateString() === today
  ).length;

  const iaReplied = myLeads.filter(l => iaRepliedLeadIds.has(l.id)).length;
  const visitsScheduled = myLeads.filter(l => l.status === "VISIT_SCHEDULED").length;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  if (dismissed || (newToday === 0 && iaReplied === 0 && visitsScheduled === 0)) return null;

  const items = [
    newToday > 0 && {
      icon: Sparkles,
      label: `${newToday} novo${newToday > 1 ? "s" : ""} hoje`,
      color: "text-sky-300",
      borderColor: "border-sky-500/30",
      bg: "bg-sky-500/10 hover:bg-sky-500/20",
      filter: "NEW" as const,
    },
    iaReplied > 0 && {
      icon: Bot,
      label: `${iaReplied} respondeu à IA`,
      color: "text-violet-300",
      borderColor: "border-violet-500/30",
      bg: "bg-violet-500/10 hover:bg-violet-500/20",
      filter: "ALL" as const,
    },
    visitsScheduled > 0 && {
      icon: Calendar,
      label: `${visitsScheduled} visita${visitsScheduled > 1 ? "s" : ""} marcada${visitsScheduled > 1 ? "s" : ""}`,
      color: "text-emerald-300",
      borderColor: "border-emerald-500/30",
      bg: "bg-emerald-500/10 hover:bg-emerald-500/20",
      filter: "VISIT_SCHEDULED" as const,
    },
  ].filter(Boolean) as {
    icon: any;
    label: string;
    color: string;
    borderColor: string;
    bg: string;
    filter: LeadStatus | "ALL";
  }[];

  return (
    <div className="relative bg-slate-800/50 border border-indigo-500/20 rounded-2xl px-4 py-3 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-indigo-600/8 via-transparent to-transparent pointer-events-none rounded-2xl" />

      <div className="relative flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">
            {greeting} — seu briefing de hoje
          </p>
          <div className="flex flex-wrap gap-2">
            {items.map((item, i) => (
              <button
                key={i}
                onClick={() => { onFilter(item.filter); }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all hover:scale-105 active:scale-95",
                  item.bg,
                  item.color,
                  item.borderColor,
                )}
              >
                <item.icon className="w-3 h-3" />
                {item.label}
                <ChevronRight className="w-3 h-3 opacity-40" />
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => { setDismissed(true); sessionStorage.setItem(sessionKey(), "1"); }}
          className="shrink-0 text-gray-700 hover:text-gray-400 p-1.5 rounded-lg hover:bg-gray-700/40 transition-colors"
          title="Fechar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
