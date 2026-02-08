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

interface LeadListProps {
  selectedLeadId: string | null;
  onSelectLead: (id: string) => void;
  currentUserRole: string;
  filter: LeadStatus | "ACTIVE" | "ALL";
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

const LeadList = ({ selectedLeadId, onSelectLead, currentUserRole, filter }: LeadListProps) => {
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
    const myLeadsOnly = leads.filter(l => l.brokerId === session?.user.id);
    
    // Join tasks into my leads only
    const leadsWithTasks = myLeadsOnly.map(lead => {
      const leadTasks = tasks.filter(t => t.leadId === lead.id);
      const nextTask = leadTasks.length > 0 
        ? leadTasks.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())[0]
        : null;
      
      const hoursSinceLastAction = (now - new Date(lead.lastInteractionAt).getTime()) / 3600000;
      const isStale = hoursSinceLastAction > 4 && lead.status !== 'CONCLUDED';

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

    // Filter
    let filtered = leadsWithTasks;
    if (filter === "ACTIVE") {
      filtered = leadsWithTasks.filter(l => l.status !== "ABANDONED" && l.status !== "EXCLUDED");
    } else if (filter !== "ALL") {
      filtered = leadsWithTasks.filter(l => l.status === filter);
    }

    // Sort: Priority DESC, then oldest interaction ASC
    return filtered.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return new Date(a.lastInteractionAt).getTime() - new Date(b.lastInteractionAt).getTime();
    });
  }, [leads, tasks, filter]);

  if (loadingLeads) {
    return (
      <Card className="border-none h-full flex items-center justify-center bg-transparent shadow-none">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col rounded-3xl sm:rounded-[2.5rem] bg-white border border-slate-200/60 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.1)] overflow-hidden">
      <CardHeader className="p-4 sm:p-6 border-b border-slate-100 shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">Fila de Ação</CardTitle>
          <Badge className="rounded-full bg-indigo-600 text-white font-bold">{processedLeads.length}</Badge>
        </div>
        <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">Ordem de urgência</p>
      </CardHeader>
      
      <CardContent className="p-0 flex-1 overflow-y-auto bg-slate-50/30">
        {processedLeads.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Check className="w-10 h-10 mx-auto mb-4 text-emerald-400 opacity-50" />
            <p className="font-bold text-slate-600 italic">Tudo limpo por aqui!</p>
          </div>
        ) : (
          processedLeads.map((lead) => (
            <div
              key={lead.id}
              className={cn(
                "group relative p-5 border-b border-slate-100 cursor-pointer transition-all duration-300",
                selectedLeadId === lead.id ? "bg-white shadow-[0_10px_30px_-10px_rgba(0,0,0,0.1)] z-10" : "hover:bg-indigo-50/30",
                lead.priority >= 2 && "bg-rose-50/20",
                lead.isStale && "ring-2 ring-inset ring-amber-500 bg-amber-50/30"
              )}
              onClick={() => onSelectLead(lead.id)}
            >
              {selectedLeadId === lead.id && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-indigo-600 rounded-r-full" />}
              
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
          ))
        )}
      </CardContent>
    </Card>
  );
};

export default LeadList;