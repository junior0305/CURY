import { useQuery } from "@tanstack/react-query";
import { fetchLeadsForDashboard } from "@/integrations/supabase/leads";
import { Lead, LeadStatus } from "@/types/lead";
import { Loader2, Phone, MessageSquare, Clock, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/AuthProvider";

interface LeadListProps {
  selectedLeadId: string | null;
  onSelectLead: (id: string) => void;
  currentUserRole: string;
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
  NEW: "bg-indigo-500 hover:bg-indigo-600",
  IN_PROGRESS: "bg-blue-500 hover:bg-blue-600",
  VISIT_SCHEDULED: "bg-green-500 hover:bg-green-600",
  DOCS_REQUESTED: "bg-amber-500 hover:bg-amber-600",
  EXCLUDED: "bg-gray-400",
  ABANDONED: "bg-red-500",
};

const LeadList = ({ selectedLeadId, onSelectLead, currentUserRole }: LeadListProps) => {
  const { data: leads = [], isLoading, error } = useQuery<Lead[]>({
    queryKey: ['dashboardLeads'],
    queryFn: fetchLeadsForDashboard,
  });

  if (isLoading) {
    return (
      <Card className="shadow-xl border-none h-[80vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="shadow-xl border-none p-6 h-[80vh] flex items-center justify-center text-red-500">
        <AlertTriangle className="w-5 h-5 mr-2" /> Erro ao carregar leads.
      </Card>
    );
  }

  return (
    <Card className="shadow-xl border-none h-[80vh] flex flex-col">
      <CardHeader className="p-4 border-b bg-indigo-50/50 rounded-t-2xl">
        <CardTitle className="text-xl font-bold text-gray-900 flex items-center justify-between">
          Leads Prioritários ({leads.length})
          <Badge className="bg-indigo-600 text-white text-xs">{currentUserRole}</Badge>
        </CardTitle>
        <p className="text-sm text-gray-500">Foco no próximo passo da cadência.</p>
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-y-auto">
        {leads.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <Check className="w-8 h-8 mx-auto mb-3 text-green-400" />
            <p className="font-semibold">Nenhum lead pendente de ação.</p>
            <p className="text-sm">Ótimo trabalho! Crie um novo lead ou aguarde a distribuição.</p>
          </div>
        ) : (
          leads.map(lead => (
            <div
              key={lead.id}
              className={`flex items-center justify-between p-4 border-b cursor-pointer transition-all ${selectedLeadId === lead.id ? 'bg-indigo-100 border-indigo-300' : 'hover:bg-gray-50'}`}
              onClick={() => onSelectLead(lead.id)}
            >
              <div>
                <p className="font-semibold text-gray-800">{lead.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={`text-xs font-medium ${statusColors[lead.status]} text-white`}>
                    {statusLabels[lead.status]}
                  </Badge>
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {new Date(lead.lastInteractionAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <Phone className="w-5 h-5 text-indigo-500" />
                <MessageSquare className="w-5 h-5 text-green-500" />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};

export default LeadList;