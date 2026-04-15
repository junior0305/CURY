import { useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchLeadsForDashboard, registerBrokerContact } from "@/integrations/supabase/leads";
import { fetchOpenTasks } from "@/integrations/supabase/tasks";
import { Lead, LeadStatus } from "@/types/lead";
import { Task } from "@/types/task";
import {
  Loader2, Phone, MessageSquare, Clock, AlertTriangle, Bell,
  Zap, AlertCircle, Hourglass, MapPin, Calendar, FileText,
  Bot, SkipForward, AlertOctagon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";

interface LeadListProps {
  selectedLeadId: string | null;
  onSelectLead: (id: string) => void;
  currentUserRole: string;
  filter: LeadStatus | "ACTIVE" | "ALL";
  compact?: boolean;
  iaRepliedLeadIds?: Set<string>;
  botActiveLeadIds?: Set<string>;
  redistributionThresholdH?: number;
}

const STATUS_COLORS: Record<LeadStatus, string> = {
  NEW:              "bg-sky-500/20 text-sky-300 border-sky-500/30",
  IN_PROGRESS:      "bg-blue-500/20 text-blue-300 border-blue-500/30",
  VISIT_SCHEDULED:  "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  DOCS_REQUESTED:   "bg-amber-500/20 text-amber-300 border-amber-500/30",
  CONCLUDED:        "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  EXCLUDED:         "bg-slate-500/20 text-slate-400 border-slate-500/30",
  ABANDONED:        "bg-rose-500/20 text-rose-300 border-rose-500/30",
};

const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW:             "NOVO",
  IN_PROGRESS:     "ATENDIMENTO",
  VISIT_SCHEDULED: "VISITA",
  DOCS_REQUESTED:  "DOCS",
  CONCLUDED:       "VENDA",
  EXCLUDED:        "EXCLUÍDO",
  ABANDONED:       "PERDIDO",
};

// Statuses eligible for redistribution
const REDIST_STATUSES: LeadStatus[] = ["NEW", "IN_PROGRESS", "DOCS_REQUESTED"];

const LeadList = ({
  selectedLeadId, onSelectLead, currentUserRole, filter, compact,
  iaRepliedLeadIds = new Set(), botActiveLeadIds = new Set(), redistributionThresholdH,
}: LeadListProps) => {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  // Registra contato imediato quando o corretor abre WhatsApp ou liga para o lead.
  // Zera tanto last_interaction_at quanto last_broker_whatsapp_at para parar o
  // contador de horas e reiniciar o countdown de redistribuição.
  const registerContact = useCallback(async (leadId: string) => {
    await registerBrokerContact(leadId);
    queryClient.invalidateQueries({ queryKey: ["dashboardLeads"] });
  }, [queryClient]);

  const { data: leads = [], isLoading: loadingLeads } = useQuery<Lead[]>({
    queryKey: ["dashboardLeads"],
    queryFn: fetchLeadsForDashboard,
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: fetchOpenTasks,
  });

  const processedLeads = useMemo(() => {
    const now = Date.now();

    const myLeads = leads.filter(
      l => l.brokerId === session?.user.id && l.status !== "ABANDONED" && l.status !== "EXCLUDED"
    );

    const leadsWithMeta = myLeads.map(lead => {
      const leadTasks = tasks
        .filter(t => t.leadId === lead.id)
        .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
      const nextTask = leadTasks[0] || null;

      const lastAction = new Date(lead.lastInteractionAt || lead.createdAt || now);
      const diffMs = now - lastAction.getTime();
      const hoursSinceLastAction = Math.max(0, Math.floor(diffMs / 3600000));
      const isBotActive = botActiveLeadIds.has(lead.id);
      // Stale só conta se o bot NÃO estiver cuidando — bot ativo = não está abandonado
      const isStale = !isBotActive && hoursSinceLastAction >= 4 && lead.status !== "CONCLUDED" && lead.status !== "EXCLUDED";

      // Redistribution countdown
      const isRedistEligible = REDIST_STATUSES.includes(lead.status as LeadStatus) && !!redistributionThresholdH;
      let hoursUntilRedist: number | null = null;
      if (isRedistEligible && redistributionThresholdH) {
        const baseTime = lead.lastBrokerWhatsappAt
          ? new Date(lead.lastBrokerWhatsappAt).getTime()
          : new Date(lead.createdAt).getTime();
        const hoursSinceBase = (now - baseTime) / 3600000;
        hoursUntilRedist = Math.max(0, redistributionThresholdH - hoursSinceBase);
      }

      // IA replied badge
      const respondeuIA = iaRepliedLeadIds.has(lead.id);

      // Priority — alinhada com a definição de quente/morno/frio
      // 🔥 Quente = DOCS (mandou docs, pronto para fechar)
      // 🏠 Visita = VISIT_SCHEDULED (compromisso real)
      // ❄️ Frio   = IN_PROGRESS / NEW (ainda só falando)
      let priority = 0;
      let urgencyTag: "docs" | "visit" | "ia" | "new_fast" | "new" | "stale" | "bot" | null = null;

      if (lead.status === "DOCS_REQUESTED") {
        priority = 10; // Quente — mais próximo do fechamento
        urgencyTag = "docs";
      } else if (respondeuIA) {
        priority = 9; // IA reply — intenção alta
      } else if (lead.status === "VISIT_SCHEDULED") {
        priority = 8; // Visita marcada
        urgencyTag = "visit";
      } else if (isBotActive) {
        // Bot está cuidando — não urgente, mas visível
        priority = lead.status === "NEW" ? 6 : 3;
        urgencyTag = "bot";
      } else if (hoursSinceLastAction < 2 && lead.status === "NEW") {
        priority = 7; // Lead acabou de chegar — resposta rápida aumenta conversão
        urgencyTag = "new_fast";
      } else if (lead.status === "NEW") {
        priority = 5;
        urgencyTag = "new";
      } else if (isStale) {
        priority = 4;
        urgencyTag = "stale";
      } else if (nextTask) {
        const diff = (new Date(nextTask.dueAt).getTime() - now) / 60000;
        priority = diff < 15 ? 3 : 2;
      }

      // Boost priority if redistribution is imminent
      if (hoursUntilRedist !== null && hoursUntilRedist < 2) {
        priority = Math.max(priority, 8);
      }

      return { ...lead, nextTask, priority, urgencyTag, isStale, isBotActive, hoursSinceLastAction, respondeuIA, hoursUntilRedist };
    });

    let filtered = leadsWithMeta;
    if (filter === "ACTIVE") filtered = leadsWithMeta.filter(l => l.priority >= 2);
    else if (filter === "ALL") filtered = leadsWithMeta;
    else filtered = leadsWithMeta.filter(l => l.status === filter);

    return filtered.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return new Date(a.lastInteractionAt || a.createdAt || 0).getTime() - new Date(b.lastInteractionAt || b.createdAt || 0).getTime();
    });
  }, [leads, tasks, filter, session?.user.id, iaRepliedLeadIds, redistributionThresholdH]);

  if (loadingLeads) {
    return (
      <div className="flex items-center justify-center h-20">
        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
      </div>
    );
  }

  if (processedLeads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-gray-700">
        <AlertTriangle className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-xs">Nenhum lead neste filtro</p>
      </div>
    );
  }

  const nextLead = processedLeads[0];

  return (
    <div className="space-y-2">
      {/* Botão "Próximo da Fila" */}
      {nextLead && (
        <button
          onClick={() => onSelectLead(nextLead.id)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-indigo-600/15 border border-indigo-500/30 hover:bg-indigo-600/25 hover:border-indigo-500/50 transition-all group active:scale-[0.98]"
        >
          <div className="flex items-center gap-2">
            <SkipForward className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-xs font-black text-indigo-300 uppercase tracking-wide">Próximo da Fila</span>
          </div>
          <span className="text-[11px] font-bold text-indigo-400/70 truncate max-w-[140px]">{nextLead.name}</span>
        </button>
      )}

      {processedLeads.map(lead => {
        const isSelected = selectedLeadId === lead.id;
        const hoursAgo = Math.round((Date.now() - new Date(lead.lastInteractionAt).getTime()) / 3600000);
        const redistUrgent = lead.hoursUntilRedist !== null && lead.hoursUntilRedist < 2;
        const redistWarning = lead.hoursUntilRedist !== null && lead.hoursUntilRedist >= 2 && lead.hoursUntilRedist < 4;
        const redistHours = lead.hoursUntilRedist !== null ? Math.floor(lead.hoursUntilRedist) : null;
        const redistMins = lead.hoursUntilRedist !== null
          ? Math.floor((lead.hoursUntilRedist - Math.floor(lead.hoursUntilRedist)) * 60)
          : null;

        return (
          <div key={lead.id} onClick={() => onSelectLead(lead.id)}
            className={cn(
              "p-3 rounded-xl border cursor-pointer transition-all group",
              isSelected
                ? "bg-indigo-500/10 border-indigo-500/40 ring-1 ring-indigo-500/20"
                : redistUrgent
                  ? "bg-red-500/5 border-red-500/30 hover:border-red-500/50"
                  : lead.isStale
                    ? "bg-amber-500/5 border-amber-500/20 hover:border-amber-500/30"
                    : lead.isBotActive
                      ? "bg-cyan-500/5 border-cyan-500/20 hover:border-cyan-500/35"
                      : lead.respondeuIA
                        ? "bg-violet-500/5 border-violet-500/20 hover:border-violet-500/30"
                        : "bg-slate-700/30 border-gray-700/40 hover:border-gray-600/60 hover:bg-slate-700/50"
            )}>

            {/* Linha principal */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h4 className={cn("font-bold truncate text-sm", isSelected ? "text-indigo-200" : "text-gray-200")}>
                    {lead.name}
                  </h4>
                  {lead.tag && (
                    <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 text-[9px] font-black uppercase px-1.5 h-4 flex items-center gap-0.5">
                      <MapPin className="w-2 h-2" /> {lead.tag}
                    </Badge>
                  )}
                  {lead.urgencyTag === "docs" && (
                    <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/30 text-[9px] font-black uppercase animate-pulse px-1.5 h-4 flex items-center gap-0.5">
                      🔥 Quente
                    </Badge>
                  )}
                  {lead.urgencyTag === "visit" && (
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[9px] font-black uppercase px-1.5 h-4 flex items-center gap-0.5">
                      <Calendar className="w-2 h-2" /> 🏠 Visita
                    </Badge>
                  )}
                  {lead.respondeuIA && (
                    <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/30 text-[9px] font-black uppercase animate-pulse px-1.5 h-4 flex items-center gap-0.5">
                      <Bot className="w-2 h-2" /> Respondeu IA
                    </Badge>
                  )}
                  {lead.urgencyTag === "new_fast" && (
                    <Badge className="bg-sky-500/20 text-sky-300 border-sky-500/30 text-[9px] font-black uppercase animate-pulse px-1.5 h-4 flex items-center gap-0.5">
                      <Zap className="w-2 h-2" /> Chegou agora
                    </Badge>
                  )}
                  {lead.urgencyTag === "bot" && (
                    <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 text-[9px] font-black uppercase px-1.5 h-4 flex items-center gap-0.5">
                      <Bot className="w-2 h-2" /> Bot ativo
                    </Badge>
                  )}
                  {lead.urgencyTag === "stale" && (
                    <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[9px] font-black uppercase animate-pulse px-1.5 h-4 flex items-center gap-0.5">
                      <Hourglass className="w-2 h-2" /> Esfriando
                    </Badge>
                  )}
                </div>

                <Badge className={cn("mt-1.5 text-[9px] font-black border", STATUS_COLORS[lead.status as LeadStatus])}>
                  {STATUS_LABELS[lead.status as LeadStatus]}
                </Badge>
              </div>

              {/* Ações rápidas */}
              <div className="flex gap-1 shrink-0">
                <div
                  className="h-7 w-7 rounded-lg bg-slate-700/60 hover:bg-indigo-600 flex items-center justify-center text-gray-500 hover:text-white transition-colors cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    registerContact(lead.id); // registra contato — zera contador de horas
                    window.open(`https://wa.me/${lead.phone?.replace(/\D/g, "")}`, "_blank");
                  }}
                  title="Abrir WhatsApp"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                </div>
                <div
                  className="h-7 w-7 rounded-lg bg-slate-700/60 hover:bg-emerald-600 flex items-center justify-center text-gray-500 hover:text-white transition-colors cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    registerContact(lead.id); // registra contato — zera contador de horas
                    window.open(`tel:${lead.phone?.replace(/\D/g, "")}`, "_blank");
                  }}
                  title="Ligar"
                >
                  <Phone className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>

            {/* Countdown de redistribuição — prioridade sobre outros alertas */}
            {redistUrgent && redistHours !== null && (
              <div className="flex items-center gap-1.5 text-[11px] font-black py-1 px-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 w-fit animate-pulse mb-2">
                <AlertOctagon className="w-3 h-3" />
                Redistribuição em {redistHours}h{redistMins! > 0 ? `${redistMins}min` : ""}!
              </div>
            )}
            {redistWarning && redistHours !== null && (
              <div className="flex items-center gap-1.5 text-[11px] font-bold py-1 px-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 w-fit mb-2">
                <AlertOctagon className="w-3 h-3" />
                Redistribuição em {redistHours}h
              </div>
            )}

            {/* Alerta / Tarefa */}
            {lead.respondeuIA && !redistUrgent ? (
              <div className="flex items-center gap-1.5 text-[11px] font-black py-1 px-2 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-300 w-fit">
                <Bot className="w-3 h-3" />
                Respondeu à automação — atenda agora!
              </div>
            ) : lead.isStale && !redistUrgent ? (
              <div className="flex items-center gap-1.5 text-[11px] font-black py-1 px-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 w-fit">
                <AlertCircle className="w-3 h-3" />
                {Math.floor(lead.hoursSinceLastAction)}h sem atendimento!
              </div>
            ) : lead.nextTask ? (
              <div className={cn(
                "flex items-center gap-1.5 text-[11px] font-bold py-1 px-2 rounded-lg w-fit",
                lead.priority >= 2
                  ? "bg-red-500/20 border border-red-500/30 text-red-300 animate-pulse"
                  : "bg-indigo-500/10 border border-indigo-500/20 text-indigo-400"
              )}>
                <Bell className="w-3 h-3" />
                {lead.nextTask.title} · {new Date(lead.nextTask.dueAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            ) : lead.status === "NEW" ? (
              <div className="flex items-center gap-1.5 text-[11px] font-bold py-1 px-2 rounded-lg w-fit bg-sky-500/20 border border-sky-500/30 text-sky-300">
                <Zap className="w-3 h-3" /> NOVO: Inicie a cadência agora!
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[11px] py-1 px-2 rounded-lg w-fit bg-slate-700/30 border border-gray-700/30 text-gray-600">
                <AlertTriangle className="w-3 h-3" /> Sem tarefa agendada
              </div>
            )}

            {/* Tempo parado */}
            {hoursAgo > 0 && (
              <div className="flex items-center gap-1 mt-2 text-[10px] text-gray-700">
                <Clock className="w-2.5 h-2.5" />
                {hoursAgo}h sem interação
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default LeadList;
