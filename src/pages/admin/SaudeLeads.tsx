import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, CheckCircle, Snowflake, RefreshCw, User, Phone, MessageSquare, BarChart2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

type LeadHealth = {
  id: string;
  name: string;
  phone: string;
  tag: string;
  status: string;
  health_score: number;
  broker_id: string | null;
  created_at: string;
  last_broker_whatsapp_at: string | null;
  last_lead_response_at: string | null;
  welcome_responded_at: string | null;
  next_action_date: string | null;
  broker: { first_name: string } | null;
};

type TemplateStats = {
  template_id: string;
  total_sent: number;
  total_responded: number;
  response_rate: number;
  template: { message: string } | null;
};

type Column = {
  key: string;
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
  leads: LeadHealth[];
};

function timeAgo(date: string | null) {
  if (!date) return "nunca";
  return formatDistanceToNow(new Date(date), { locale: ptBR, addSuffix: true });
}

function LeadCard({ lead, onReassign }: { lead: LeadHealth; onReassign: (id: string) => void }) {
  return (
    <div className="bg-slate-800/60 border border-gray-700/40 rounded-lg p-3 space-y-2 hover:border-gray-600/60 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-white text-sm font-semibold truncate">{lead.name}</p>
          <p className="text-gray-500 text-xs flex items-center gap-1">
            <Phone className="w-3 h-3" />{lead.phone}
          </p>
        </div>
        <Badge className="shrink-0 text-xs bg-slate-700/50 text-gray-400 border-gray-600/40">
          {lead.tag || "—"}
        </Badge>
      </div>

      <div className="space-y-1 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <User className="w-3 h-3" />
          <span>{lead.broker?.first_name || "Sem corretor"}</span>
        </div>
        <div className="flex items-center gap-1">
          <MessageSquare className="w-3 h-3" />
          <span>Corretor: {timeAgo(lead.last_broker_whatsapp_at)}</span>
        </div>
        {lead.welcome_responded_at && (
          <div className="flex items-center gap-1 text-orange-400">
            <AlertTriangle className="w-3 h-3" />
            <span>Lead respondeu {timeAgo(lead.welcome_responded_at)}</span>
          </div>
        )}
        {lead.next_action_date && (
          <div className="flex items-center gap-1 text-blue-400">
            <Clock className="w-3 h-3" />
            <span>Retorno: {timeAgo(lead.next_action_date)}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-full ${
            lead.health_score >= 70 ? "bg-green-400" :
            lead.health_score >= 40 ? "bg-yellow-400" : "bg-red-400"
          }`} />
          <span className="text-xs text-gray-500">Score: {lead.health_score}</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onReassign(lead.id)}
          className="text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-900/20 h-6 px-2"
        >
          Redistribuir
        </Button>
      </div>
    </div>
  );
}

export default function SaudeLeads() {
  const queryClient = useQueryClient();

  const { data: leads = [], isLoading, error: leadsError } = useQuery<LeadHealth[]>({
    queryKey: ["health-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id,name,phone,tag,status,health_score,broker_id,created_at,last_broker_whatsapp_at,last_lead_response_at,welcome_responded_at,next_action_date,broker:profiles!broker_id(first_name)")
        .not("status", "in", '("ABANDONED","EXCLUDED","CONCLUDED")')
        .order("health_score", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 60000,
  });

  const { data: templateStats = [] } = useQuery<TemplateStats[]>({
    queryKey: ["welcome-template-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("welcome_template_stats")
        .select("*, template:welcome_templates(message)")
        .order("response_rate", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const handleReassign = async (leadId: string) => {
    toast.info("Redistribuição manual disponível em Rework.");
  };

  const now = new Date();

  const critico = leads.filter(l =>
    l.welcome_responded_at &&
    (!l.last_broker_whatsapp_at || new Date(l.last_broker_whatsapp_at) < new Date(l.welcome_responded_at)) &&
    new Date(l.welcome_responded_at) < new Date(now.getTime() - 2 * 3600000)
  );

  const atencao = leads.filter(l =>
    !critico.find(c => c.id === l.id) &&
    l.health_score < 70 && l.health_score >= 30
  );

  const emDia = leads.filter(l =>
    !critico.find(c => c.id === l.id) &&
    l.health_score >= 70
  );

  const frio = leads.filter(l =>
    !critico.find(c => c.id === l.id) &&
    l.health_score < 30 &&
    new Date(l.created_at) < new Date(now.getTime() - 7 * 24 * 3600000)
  );

  const columns: Column[] = [
    { key: "critico", label: "Crítico", icon: AlertTriangle, color: "text-red-400", bg: "bg-red-900/10", border: "border-red-500/30", leads: critico },
    { key: "atencao", label: "Atenção", icon: Clock, color: "text-yellow-400", bg: "bg-yellow-900/10", border: "border-yellow-500/30", leads: atencao },
    { key: "emdia", label: "Em Dia", icon: CheckCircle, color: "text-green-400", bg: "bg-green-900/10", border: "border-green-500/30", leads: emDia },
    { key: "frio", label: "Frio", icon: Snowflake, color: "text-blue-400", bg: "bg-blue-900/10", border: "border-blue-500/30", leads: frio },
  ];

  return (
    <div className="p-4 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-white">Saúde dos Leads</h2>
          <p className="text-gray-500 text-sm">Monitoramento em tempo real do atendimento</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["health-leads"] })}
          className="text-gray-400 hover:text-white gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Atualizar
        </Button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-4 gap-3">
        {columns.map(col => (
          <div key={col.key} className={`rounded-lg border p-3 ${col.bg} ${col.border}`}>
            <div className="flex items-center gap-2 mb-1">
              <col.icon className={`w-4 h-4 ${col.color}`} />
              <span className={`text-sm font-bold ${col.color}`}>{col.label}</span>
            </div>
            <p className="text-2xl font-black text-white">{col.leads.length}</p>
            <p className="text-xs text-gray-500">leads</p>
          </div>
        ))}
      </div>

      {/* Kanban */}
      {leadsError && (
        <div className="text-red-400 text-sm bg-red-900/20 border border-red-500/30 rounded-lg p-3">
          Erro: {(leadsError as any)?.message}
        </div>
      )}
      {isLoading ? (
        <div className="text-center text-gray-500 py-12">Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {columns.map(col => (
            <div key={col.key} className="space-y-3">
              <div className={`flex items-center gap-2 pb-2 border-b ${col.border}`}>
                <col.icon className={`w-4 h-4 ${col.color}`} />
                <span className={`font-bold text-sm ${col.color}`}>{col.label}</span>
                <Badge className="ml-auto bg-slate-700/50 text-gray-400 border-gray-600/40 text-xs">
                  {col.leads.length}
                </Badge>
              </div>
              {col.leads.length === 0 ? (
                <p className="text-gray-600 text-xs text-center py-4">Nenhum lead</p>
              ) : (
                col.leads.map(lead => (
                  <LeadCard key={lead.id} lead={lead} onReassign={handleReassign} />
                ))
              )}
            </div>
          ))}
        </div>
      )}

      {/* Métricas de Boas-vindas */}
      {templateStats.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-indigo-400" />
            <h3 className="text-white font-bold">Efetividade das Mensagens de Boas-vindas</h3>
          </div>
          <div className="space-y-2">
            {templateStats.map((stat, i) => (
              <div key={stat.template_id} className="bg-slate-800/60 border border-gray-700/40 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-400 text-xs truncate max-w-[60%]">
                    #{i + 1} {stat.template?.message?.substring(0, 60)}...
                  </p>
                  <div className="flex items-center gap-3 text-xs shrink-0">
                    <span className="text-gray-500">{stat.total_sent} enviadas</span>
                    <span className="text-gray-500">{stat.total_responded} respondidas</span>
                    <Badge className={`${
                      Number(stat.response_rate) >= 50 ? "bg-green-900/40 text-green-300 border-green-500/30" :
                      Number(stat.response_rate) >= 25 ? "bg-yellow-900/40 text-yellow-300 border-yellow-500/30" :
                      "bg-red-900/40 text-red-300 border-red-500/30"
                    } border text-xs`}>
                      {stat.response_rate}%
                    </Badge>
                  </div>
                </div>
                <div className="w-full bg-slate-700/50 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full ${
                      Number(stat.response_rate) >= 50 ? "bg-green-500" :
                      Number(stat.response_rate) >= 25 ? "bg-yellow-500" : "bg-red-500"
                    }`}
                    style={{ width: `${Math.min(Number(stat.response_rate), 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
