import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchUnassignedLeads } from "@/integrations/supabase/leads";
import { updateLeadBroker } from "@/integrations/supabase/leads";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, UserPlus, Clock, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Lead } from "@/types/lead";
import type { User } from "@/types/user";

interface Props {
  brokers: User[];
  teamLeads: Lead[];
  onAssigned: () => void;
}

function hoursAgo(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / 3600000;
}

function LeadRow({
  lead,
  brokers,
  currentBrokerId,
  onAssign,
}: {
  lead: Lead;
  brokers: User[];
  currentBrokerId?: string | null;
  onAssign: (leadId: string, brokerId: string) => void;
}) {
  const presentBrokers = brokers.filter(b => b.leadAssignmentEnabled);
  const hours = Math.floor(hoursAgo(lead.lastInteractionAt || lead.createdAt));

  return (
    <div className="flex items-center gap-3 bg-slate-800/30 border border-gray-700/30 rounded-xl px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-white font-semibold text-sm truncate">{lead.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <Clock className="w-3 h-3 text-gray-500" />
          <span className="text-xs text-gray-500">{hours}h · {lead.tag || "sem tag"}</span>
        </div>
      </div>
      <Select
        defaultValue={currentBrokerId || ""}
        onValueChange={(brokerId) => onAssign(lead.id, brokerId)}
      >
        <SelectTrigger className="w-36 h-8 text-xs rounded-lg border-gray-600 bg-slate-700">
          <SelectValue placeholder="Atribuir..." />
        </SelectTrigger>
        <SelectContent className="rounded-xl border-none shadow-2xl">
          {presentBrokers.length === 0 && (
            <SelectItem value="" disabled>Nenhum presente</SelectItem>
          )}
          {presentBrokers.map(b => (
            <SelectItem key={b.id} value={b.id} className="text-xs">
              {(b.name || "—").split(" ")[0]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function DistributionPanel({ brokers, teamLeads, onAssigned }: Props) {
  const queryClient = useQueryClient();

  const { data: unassignedLeads = [], isLoading: loadingUnassigned } = useQuery<Lead[]>({
    queryKey: ["unassignedLeads"],
    queryFn: fetchUnassignedLeads,
    refetchInterval: 30000,
  });

  const assignMutation = useMutation({
    mutationFn: ({ leadId, brokerId }: { leadId: string; brokerId: string }) =>
      updateLeadBroker(leadId, brokerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unassignedLeads"] });
      queryClient.invalidateQueries({ queryKey: ["teamLeads"] });
      toast.success("Lead atribuído!");
      onAssigned();
    },
    onError: (err: any) => toast.error("Erro: " + err.message),
  });

  const handleAssign = (leadId: string, brokerId: string) => {
    assignMutation.mutate({ leadId, brokerId });
  };

  const now = Date.now();
  const stalledLeads = teamLeads.filter(l =>
    l.status !== "CONCLUDED" && l.status !== "ABANDONED" && l.status !== "EXCLUDED" &&
    hoursAgo(l.lastInteractionAt || l.createdAt) > 24
  ).sort((a, b) =>
    hoursAgo(b.lastInteractionAt || b.createdAt) - hoursAgo(a.lastInteractionAt || a.createdAt)
  );

  const brokerMap = Object.fromEntries(brokers.map(b => [b.id, b]));

  return (
    <div className="space-y-6">

      {/* Sem corretor */}
      <div>
        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 mb-3">
          <Inbox className="w-3.5 h-3.5" /> Sem Corretor
          {unassignedLeads.length > 0 && (
            <span className="bg-amber-500/20 text-amber-400 text-[10px] font-black px-2 py-0.5 rounded-full">
              {unassignedLeads.length}
            </span>
          )}
        </h3>

        {loadingUnassigned ? (
          <p className="text-gray-600 text-sm text-center py-6">Carregando...</p>
        ) : unassignedLeads.length === 0 ? (
          <div className="text-center py-8 text-gray-600 border border-dashed border-gray-700/40 rounded-xl">
            <UserPlus className="w-8 h-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm">Nenhum lead sem corretor</p>
          </div>
        ) : (
          <div className="space-y-2">
            {unassignedLeads.map(lead => (
              <LeadRow
                key={lead.id}
                lead={lead}
                brokers={brokers}
                currentBrokerId={null}
                onAssign={handleAssign}
              />
            ))}
          </div>
        )}
      </div>

      {/* Parados +24h */}
      <div>
        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 mb-3">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
          <span className="text-red-400">Parados +24h</span>
          {stalledLeads.length > 0 && (
            <span className="bg-red-500/20 text-red-400 text-[10px] font-black px-2 py-0.5 rounded-full">
              {stalledLeads.length}
            </span>
          )}
        </h3>

        {stalledLeads.length === 0 ? (
          <div className="text-center py-8 text-gray-600 border border-dashed border-gray-700/40 rounded-xl">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm">Nenhum lead parado</p>
          </div>
        ) : (
          <div className="space-y-2">
            {stalledLeads.slice(0, 30).map(lead => {
              const broker = lead.brokerId ? brokerMap[lead.brokerId] : null;
              return (
                <div key={lead.id} className="flex items-center gap-3 bg-red-900/10 border border-red-500/20 rounded-xl px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{lead.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cn(
                        "text-xs font-bold",
                        hoursAgo(lead.lastInteractionAt || lead.createdAt) > 48 ? "text-red-400" : "text-amber-400"
                      )}>
                        {Math.floor(hoursAgo(lead.lastInteractionAt || lead.createdAt))}h
                      </span>
                      <span className="text-gray-600 text-xs">·</span>
                      <span className="text-gray-500 text-xs truncate">
                        {broker?.name.split(" ")[0] || "—"}
                      </span>
                    </div>
                  </div>
                  <Select
                    defaultValue={lead.brokerId || ""}
                    onValueChange={(brokerId) => handleAssign(lead.id, brokerId)}
                  >
                    <SelectTrigger className="w-36 h-8 text-xs rounded-lg border-red-500/30 bg-slate-700">
                      <SelectValue placeholder="Redistribuir..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-none shadow-2xl">
                      {brokers.filter(b => b.leadAssignmentEnabled).map(b => (
                        <SelectItem key={b.id} value={b.id} className="text-xs">
                          {(b.name || "—").split(" ")[0]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
