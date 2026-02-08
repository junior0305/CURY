import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchLeadsForDashboard } from "@/integrations/supabase/leads";
import { Lead, LeadStatus } from "@/types/lead";
import { Loader2, Phone, MessageSquare, Clock, AlertTriangle, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { FunnelFilter } from "@/components/dashboard/FunnelStageCards";

interface LeadListProps {
  selectedLeadId: string | null;
  onSelectLead: (id: string) => void;
  currentUserRole: string;
  filter: FunnelFilter;
}

const statusLabels: Record<LeadStatus, string> = {
  NEW: "NOVO",
  IN_PROGRESS: "EM ATENDIMENTO",
  VISIT_SCHEDULED: "VISITA AGENDADA",
  DOCS_REQUESTED: "DOCUMENTO SOLICITADO",
  EXCLUDED: "EXCLUÍDO",
  ABANDONED: "ABANDONADO",
};

const statusColors: Record<LeadStatus, string> = {
  NEW: "bg-sky-600",
  IN_PROGRESS: "bg-blue-600",
  VISIT_SCHEDULED: "bg-emerald-600",
  DOCS_REQUESTED: "bg-amber-600",
  EXCLUDED: "bg-slate-500",
  ABANDONED: "bg-rose-600",
};

const filterLabel: Record<FunnelFilter, string> = {
  ACTIVE: "ATIVOS",
  ALL: "TODOS",
  NEW: "NOVOS",
  IN_PROGRESS: "ATENDIMENTO",
  VISIT_SCHEDULED: "VISITA",
  DOCS_REQUESTED: "DOCUMENTO",
  EXCLUDED: "EXCLUÍDOS",
  ABANDONED: "EXCLUÍDOS",
};

const LeadList = ({ selectedLeadId, onSelectLead, currentUserRole, filter }: LeadListProps) => {
  const { data: leads = [], isLoading, error } = useQuery<Lead[]>({
    queryKey: ['dashboardLeads'],
    queryFn: fetchLeadsForDashboard,
  });

  const filtered = useMemo(() => {
    if (filter === "ALL") return leads;
    if (filter === "ACTIVE") return leads.filter((l) => l.status !== "ABANDONED");
    return leads.filter((l) => l.status === filter);
  }, [filter, leads]);

  if (isLoading) {
    return (
      <Card className="shadow-[0_22px_60px_-40px_rgba(15,23,42,0.45)] border-none h-[72vh] flex items-center justify-center rounded-3xl">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="shadow-[0_22px_60px_-40px_rgba(15,23,42,0.45)] border-none p-6 h-[72vh] flex items-center justify-center text-rose-600 rounded-3xl">
        <AlertTriangle className="w-5 h-5 mr-2" /> Erro ao carregar leads.
      </Card>
    );
  }

  return (
    <Card className="shadow-[0_22px_60px_-40px_rgba(15,23,42,0.45)] border-none h-[72vh] flex flex-col rounded-3xl bg-white/80 backdrop-blur ring-1 ring-slate-200 dashboard-tilt">
      <CardHeader className="p-5 border-b border-slate-100 bg-white/70 rounded-t-3xl">
        <CardTitle className="text-lg font-extrabold text-slate-900 flex items-center justify-between">
          <span>
            Leads <span className="text-indigo-600">{filterLabel[filter]}</span>
          </span>
          <div className="flex items-center gap-2">
            <Badge className="rounded-full bg-slate-900 text-white text-[11px]">{currentUserRole}</Badge>
            <Badge className="rounded-full bg-indigo-600 text-white text-[11px]">{filtered.length}</Badge>
          </div>
        </CardTitle>
        <p className="text-sm text-slate-500">Clique em um lead para abrir o plano de ação.</p>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-500">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-700">
              <Check className="w-7 h-7" />
            </div>
            <p className="font-semibold">Nada por aqui.</p>
            <p className="text-sm">Troque o filtro do funil ou crie um lead manual.</p>
          </div>
        ) : (
          filtered.map((lead) => (
            <div
              key={lead.id}
              className={`flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 cursor-pointer transition-all ${
                selectedLeadId === lead.id
                  ? 'bg-indigo-50 border-indigo-100'
                  : 'hover:bg-slate-50'
              }`}
              onClick={() => onSelectLead(lead.id)}
            >
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 truncate">{lead.name}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <Badge className={`text-[11px] font-bold ${statusColors[lead.status]} text-white rounded-full`}>
                    {lead.status === 'ABANDONED' ? 'EXCLUÍDO' : statusLabels[lead.status]}
                  </Badge>
                  <span className="text-[11px] text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {new Date(lead.lastInteractionAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <div className="grid h-9 w-9 place-items-center rounded-2xl bg-indigo-600/10 text-indigo-700">
                  <Phone className="w-4 h-4" />
                </div>
                <div className="grid h-9 w-9 place-items-center rounded-2xl bg-emerald-600/10 text-emerald-700">
                  <MessageSquare className="w-4 h-4" />
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