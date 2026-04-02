import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchLeadsForDashboard } from "@/integrations/supabase/leads";
import { fetchOpenTasks } from "@/integrations/supabase/tasks";
import { Lead, LeadStatus } from "@/types/lead";
import { Task } from "@/types/task";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { ChevronRight, Flame, Calendar, FileText, Zap, Clock, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type UrgentAction = {
  lead: Lead;
  level: "critico" | "urgente" | "importante" | "novo";
  label: string;
  action: string;
  icon: React.ElementType;
};

function getUrgencyLevel(lead: Lead, tasks: Task[], now: number): UrgentAction | null {
  if (lead.status === "ABANDONED" || lead.status === "EXCLUDED" || lead.status === "CONCLUDED") return null;

  const hoursSince = (now - new Date(lead.lastInteractionAt || lead.createdAt || now).getTime()) / 3600000;

  // DOCS SOLICITADOS — máxima prioridade: lead pronto para fechar
  if (lead.status === "DOCS_REQUESTED") {
    return {
      lead,
      level: "critico",
      label: "🔥 Quente — Docs pendentes",
      action: "Cobrar envio dos documentos — esse lead está pronto para fechar",
      icon: FileText,
    };
  }

  // VISITA MARCADA — alta prioridade: compromisso real
  if (lead.status === "VISIT_SCHEDULED") {
    return {
      lead,
      level: "urgente",
      label: "🏠 Visita marcada",
      action: "Confirme a visita e prepare os detalhes do imóvel",
      icon: Calendar,
    };
  }

  // FALANDO AGORA — respondeu recentemente (NEW ou IN_PROGRESS < 2h): ainda frio, mas ativo
  if (hoursSince < 2 && (lead.status === "NEW" || lead.status === "IN_PROGRESS")) {
    return {
      lead,
      level: "importante",
      label: `Ativo — ${Math.round(hoursSince * 60)}min atrás`,
      action: "Lead respondendo agora — qualifique e tente agendar visita",
      icon: Flame,
    };
  }

  // NOVO LEAD sem contato
  if (lead.status === "NEW" && hoursSince >= 2) {
    return {
      lead,
      level: "novo",
      label: `Novo — ${Math.floor(hoursSince)}h sem contato`,
      action: "Primeiro contato: envie a mensagem de apresentação",
      icon: Zap,
    };
  }

  // EM ATENDIMENTO parado > 24h sem tarefa agendada
  const hasPendingTask = tasks.some(t => t.leadId === lead.id);
  if (lead.status === "IN_PROGRESS" && hoursSince >= 24 && !hasPendingTask) {
    return {
      lead,
      level: "importante",
      label: `Parado ${Math.floor(hoursSince)}h`,
      action: "Agendar próxima ação para não perder o lead",
      icon: Clock,
    };
  }

  return null;
}

const LEVEL_STYLES = {
  critico:    { bg: "bg-red-900/30",    border: "border-red-500/50",    text: "text-red-300",    badge: "bg-red-500/20 text-red-300 border-red-500/30"    },
  urgente:    { bg: "bg-emerald-900/20",border: "border-emerald-500/40",text: "text-emerald-300",badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"},
  importante: { bg: "bg-amber-900/20",  border: "border-amber-500/40",  text: "text-amber-300",  badge: "bg-amber-500/20 text-amber-300 border-amber-500/30"  },
  novo:       { bg: "bg-sky-900/20",    border: "border-sky-500/40",    text: "text-sky-300",    badge: "bg-sky-500/20 text-sky-300 border-sky-500/30"       },
};

interface RadarAcaoProps {
  onSelectLead: (id: string) => void;
}

export function RadarAcao({ onSelectLead }: RadarAcaoProps) {
  const { session } = useAuth();
  const [index, setIndex] = useState(0);
  const now = Date.now();

  const { data: leads = [] } = useQuery<Lead[]>({
    queryKey: ["dashboardLeads"],
    queryFn: fetchLeadsForDashboard,
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: fetchOpenTasks,
  });

  const urgentActions = useMemo(() => {
    const myLeads = leads.filter(l => l.brokerId === session?.user.id);

    const actions: UrgentAction[] = [];
    for (const lead of myLeads) {
      const action = getUrgencyLevel(lead, tasks, now);
      if (action) actions.push(action);
    }

    // Ordenar: critico > urgente > importante > novo
    const order = { critico: 0, urgente: 1, importante: 2, novo: 3 };
    return actions.sort((a, b) => order[a.level] - order[b.level]);
  }, [leads, tasks, session?.user.id]);

  if (urgentActions.length === 0) return null;

  const current = urgentActions[Math.min(index, urgentActions.length - 1)];
  const style = LEVEL_STYLES[current.level];
  const Icon = current.icon;

  return (
    <div className={cn("rounded-xl border p-3 space-y-2", style.bg, style.border)}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", {
            "bg-red-400": current.level === "critico",
            "bg-emerald-400": current.level === "urgente",
            "bg-amber-400": current.level === "importante",
            "bg-sky-400": current.level === "novo",
          })} />
          <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
            Próxima ação
          </span>
        </div>
        {urgentActions.length > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIndex(i => Math.max(0, i - 1))}
              disabled={index === 0}
              className="w-5 h-5 flex items-center justify-center text-gray-600 hover:text-gray-300 disabled:opacity-30"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <span className="text-[10px] text-gray-600">{index + 1}/{urgentActions.length}</span>
            <button
              onClick={() => setIndex(i => Math.min(urgentActions.length - 1, i + 1))}
              disabled={index === urgentActions.length - 1}
              className="w-5 h-5 flex items-center justify-center text-gray-600 hover:text-gray-300 disabled:opacity-30"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Card */}
      <div className="flex items-start gap-3">
        <div className={cn("p-2 rounded-lg border shrink-0", style.badge)}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-white font-black text-sm truncate">{current.lead.name}</p>
            <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded border", style.badge)}>
              {current.label}
            </span>
          </div>
          <p className={cn("text-xs mt-0.5", style.text)}>{current.action}</p>
        </div>
      </div>

      {/* Botão de ação */}
      <Button
        size="sm"
        onClick={() => onSelectLead(current.lead.id)}
        className={cn(
          "w-full h-8 text-xs font-black gap-1.5",
          current.level === "critico"    && "bg-red-600 hover:bg-red-500 text-white",
          current.level === "urgente"    && "bg-emerald-600 hover:bg-emerald-500 text-white",
          current.level === "importante" && "bg-amber-600 hover:bg-amber-500 text-white",
          current.level === "novo"       && "bg-sky-600 hover:bg-sky-500 text-white",
        )}
      >
        Abrir lead
        <ChevronRight className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
