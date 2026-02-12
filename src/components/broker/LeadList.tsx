import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchLeadsForDashboard } from "@/integrations/supabase/leads";
import { fetchOpenTasks } from "@/integrations/supabase/tasks";
import { Lead, LeadStatus } from "@/types/lead";
import { Task } from "@/types/task";
import { 
  Loader2, 
  Phone, 
  MessageSquare, 
  Clock, 
  AlertTriangle, 
  Check, 
  Bell, 
  Zap, 
  AlertCircle,
  Hourglass 
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/AuthProvider";
import { formatDistanceToNow, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";

// Função auxiliar para tempo relativo seguro (Ignora fuso horário negativo/pequeno)
const getSafeRelativeTime = (dateString: string | null) => {
  if (!dateString) return "";
  
  const date = new Date(dateString);
  const now = new Date();
  const diffMinutes = differenceInMinutes(now, date);

  // Se a diferença for menor que 60 minutos (ou negativa por erro de fuso), mostra "Agora"
  if (diffMinutes < 60) {
    return "Agora";
  }

  return formatDistanceToNow(date, { addSuffix: true, locale: ptBR })
    .replace("cerca de ", "")
    .replace("atrás", "")
    .trim();
};

interface LeadListProps {
  selectedLeadId: string | null;
  onSelectLead: (id: string) => void;
  currentUserRole: string;
  filter: LeadStatus | "ACTIVE" | "ALL";
  compact?: boolean;
}

const statusLabels: Record<LeadStatus, string> = {
  NEW: "NOVO",
  IN_PROGRESS: "EM ATENDIMENTO",
  VISIT_SCHEDULED: "VISITA AGENDADA",
  DOCS_REQUESTED: "DOCUMENTO SOLICITADO",
  CONCLUDED: "VENDA CONCLUÍDA",
  EXCLUDED: "EXCLUÍDO",
  ABANDONED: "ABANDONADO",
};

const statusColors: Record<LeadStatus, string> = {
  NEW: "bg-sky-600",
  IN_PROGRESS: "bg-blue-600",
  VISIT_SCHEDULED: "bg-emerald-600",
  DOCS_REQUESTED: "bg-amber-600",
  CONCLUDED: "bg-indigo-600",
  EXCLUDED: "bg-slate-500",
  ABANDONED: "bg-rose-600",
};

const getTimeSince = (isoString: string | null) => {
  if (!isoString) return "Agora";
  const date = new Date(isoString);
  const now = new Date();
  
  // CORREÇÃO: Se a diferença for negativa (fuso horário do servidor vs cliente), trata como 0
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return "Agora";
  
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Agora";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
};

const LeadList = ({ selectedLeadId, onSelectLead, currentUserRole, filter, compact }: LeadListProps) => {
  const { session } = useAuth();
  
  const { data: leads = [], isLoading: loadingLeads } = useQuery<Lead[]>({
    queryKey: ['dashboardLeads'],
    queryFn: fetchLeadsForDashboard,
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: fetchOpenTasks,
  });

  const processedLeads = useMemo(() => {
    const now = Date.now();
    
    // FILTRO DE PRIVACIDADE: Na lista lateral, o corretor SÓ vê o que é dele.
    // E GARANTIMOS que leads perdidos/abandonados sumam da lista.
    const myLeadsOnly = leads.filter(l => 
      l.brokerId === session?.user.id && 
      l.status !== 'ABANDONED' && 
      l.status !== 'EXCLUDED'
    );
    
    // Join tasks into my leads only - FILTERING FOR THE MOST URGENT TASK ONLY PER LEAD
    const leadsWithTasks = myLeadsOnly.map(lead => {
      // Regra: Apenas uma tarefa atrasada ou pendente visível por vez
      const leadTasks = tasks
        .filter(t => t.leadId === lead.id)
        .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()); // Mais antiga primeiro
      
      const nextTask = leadTasks.length > 0 ? leadTasks[0] : null;
      
      const lastAction = new Date(lead.lastInteractionAt || lead.createdAt || now);
      
      // Lógica de cálculo de horas de inatividade ignorando o período das 21h às 08h
      let effectiveNow = new Date(now);
      if (now >= 21) {
        effectiveNow.setHours(21, 0, 0, 0);
      } else if (now < 8) {
        effectiveNow.setDate(effectiveNow.getDate() - 1);
        effectiveNow.setHours(21, 0, 0, 0);
      }

      let effectiveStart = new Date(lastAction);
      const startHour = lastAction.getHours();
      if (startHour >= 21) {
        effectiveStart.setDate(effectiveStart.getDate() + 1);
        effectiveStart.setHours(8, 0, 0, 0);
      } else if (startHour < 8) {
        effectiveStart.setHours(8, 0, 0, 0);
      }

      const diffMs = effectiveNow.getTime() - effectiveStart.getTime();
      const hoursSinceLastAction = Math.max(0, Math.floor(diffMs / 3600000));
      
      const isStale = hoursSinceLastAction >= 4 && lead.status !== 'CONCLUDED' && lead.status !== 'EXCLUDED';

      let priority = 0; // 0: low, 1: today, 2: overdue/now, 3: ultra (new), 4: STALE ALERT
      if (isStale) priority = 4;
      else if (lead.status === 'NEW') priority = 3;
      else if (nextTask) {
        const diff = (new Date(nextTask.dueAt).getTime() - now) / 60000;
        if (diff < 0) priority = 2;
        else if (diff < 15) priority = 2;
        else priority = 1;
      }

      return { ...lead, nextTask, priority, isStale, hoursSinceLastAction };
    });

    // Filter by Selected Card (NEW LOGIC: ONLY SHOW IF SELECTED)
    let filtered = leadsWithTasks;
    if (filter === "ACTIVE") {
      // By default, if nothing specific is selected, we might show nothing or high priority
      // But based on user request: "Only show the lead that the broker clicks on the specific card"
      // So if it's "ACTIVE" (initial state), we show only what's really high priority or nothing
      filtered = leadsWithTasks.filter(l => l.priority >= 2); 
    } else if (filter === "ALL") {
      filtered = leadsWithTasks;
    } else {
      filtered = leadsWithTasks.filter(l => l.status === filter);
    }

    // Sort: Priority DESC, then oldest interaction ASC
    return filtered.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      const timeA = new Date(a.lastInteractionAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.lastInteractionAt || b.createdAt || 0).getTime();
      return timeA - timeB;
    });
  }, [leads, tasks, filter]);

  if (loadingLeads) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-center h-12">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {processedLeads.map((lead) => (
        <div
          key={lead.id}
          onClick={() => onSelectLead(lead.id)}
          className={cn(
            "p-3 rounded-xl border cursor-pointer transition-all hover:bg-slate-50 relative group",
            selectedLeadId === lead.id ? "bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200" : "bg-white border-slate-100",
            compact ? "py-2" : "p-3"
          )}
        >
          <div className="flex justify-between items-start mb-1">
            <h4 className={cn("font-bold text-slate-900 truncate", compact ? "text-xs" : "text-sm")}>{lead.name}</h4>
            <span className="text-[10px] text-slate-400 whitespace-nowrap ml-2">
              {getSafeRelativeTime(lead.last_interaction_at || lead.created_at)}
            </span>
          </div>
          
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h4 className="font-bold text-slate-900 truncate text-[15px]">{lead.name}</h4>
                {lead.isStale && (
                  <Badge className="bg-amber-500 text-white animate-pulse text-[9px] font-black uppercase">
                    <Hourglass className="w-2 h-2 mr-1" /> Esfriando
                  </Badge>
                )}
                <Badge className={cn("text-[9px] font-black tracking-tighter h-4 px-1.5 rounded-full", statusColors[lead.status], "text-white border-none")}>
                  {statusLabels[lead.status]}
                </Badge>
              </div>

              {lead.isStale ? (
                <div className="flex items-center gap-1.5 text-[11px] font-black mt-2 py-1 px-2 rounded-lg w-fit bg-amber-100 text-amber-700">
                  <AlertCircle className="w-3 h-3" />
                  ALERTA: {Math.floor(lead.hoursSinceLastAction)}h sem atendimento!
                </div>
              ) : lead.nextTask ? (
                <div className={cn(
                  "flex items-center gap-1.5 text-[11px] font-bold mt-2 py-1 px-2 rounded-lg w-fit",
                  lead.priority >= 2 ? "bg-rose-600 text-white animate-pulse" : "bg-indigo-100 text-indigo-700"
                )}>
                  <Bell className="w-3 h-3" />
                  PROX: {lead.nextTask.title} • {new Date(lead.nextTask.dueAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </div>
              ) : lead.status === 'NEW' ? (
                <div className="flex items-center gap-1.5 text-[11px] font-bold mt-2 py-1 px-2 rounded-lg w-fit bg-sky-600 text-white">
                  <Zap className="w-3 h-3" />
                  NOVO: Inicie a cadência agora!
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-[11px] font-bold mt-2 py-1 px-2 rounded-lg w-fit bg-slate-200 text-slate-500 italic">
                  <AlertTriangle className="w-3 h-3" />
                  Sem tarefa agendada!
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 shrink-0 items-end">
              <div className="flex gap-1">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <MessageSquare className="w-3.5 h-3.5" />
                </div>
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <Phone className="w-3.5 h-3.5" />
                </div>
              </div>
              <span className="text-[9px] font-black text-slate-400 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" /> 
                {Math.round((Date.now() - new Date(lead.lastInteractionAt).getTime()) / 3600000)}h parado
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default LeadList;