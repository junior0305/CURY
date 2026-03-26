import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Zap, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lead } from "@/types/lead";
import type { User } from "@/types/user";

interface Props {
  brokers: User[];
  leads: Lead[];
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
}

export default function LeadQueue({ brokers, leads }: Props) {
  const active = brokers
    .filter(b => b.leadAssignmentEnabled)
    .map(broker => {
      const activeLeads = leads.filter(l =>
        l.brokerId === broker.id &&
        !["CONCLUDED","ABANDONED","EXCLUDED"].includes(l.status)
      ).length;
      return { broker, activeLeads };
    })
    .sort((a, b) => a.activeLeads - b.activeLeads); // menos sobrecarregado primeiro

  const absent = brokers.filter(b => !b.leadAssignmentEnabled);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 mb-3">
          <Zap className="w-3.5 h-3.5 text-yellow-400" /> Fila Ativa
        </h3>

        {active.length === 0 ? (
          <div className="text-center py-10 text-gray-600 border border-dashed border-gray-700/40 rounded-xl">
            <Zap className="w-8 h-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm">Nenhum corretor ativo na fila</p>
          </div>
        ) : (
          <div className="space-y-2">
            {active.map(({ broker, activeLeads }, i) => (
              <div
                key={broker.id}
                className="flex items-center gap-3 bg-slate-800/30 border border-gray-700/30 rounded-xl px-4 py-3"
              >
                <span className="text-gray-600 font-black text-sm w-5 text-center">{i + 1}</span>
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className="bg-emerald-900/60 text-emerald-200 font-bold text-xs">
                    {initials(broker.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{broker.name.split(" ")[0]}</p>
                  <p className="text-xs text-gray-500">{activeLeads} leads ativos</p>
                </div>
                <div className={cn(
                  "px-3 py-1 rounded-full text-xs font-black",
                  activeLeads === 0
                    ? "bg-emerald-500/20 text-emerald-400"
                    : activeLeads < 20
                    ? "bg-yellow-500/20 text-yellow-400"
                    : "bg-red-500/20 text-red-400"
                )}>
                  {activeLeads === 0 ? "Livre" : activeLeads < 20 ? "Normal" : "Cheio"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {absent.length > 0 && (
        <div>
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 mb-3">
            <UserX className="w-3.5 h-3.5" /> Fora da Fila
          </h3>
          <div className="space-y-2">
            {absent.map(broker => (
              <div
                key={broker.id}
                className="flex items-center gap-3 bg-slate-800/20 border border-gray-700/20 rounded-xl px-4 py-3 opacity-50"
              >
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className="bg-slate-700 text-gray-400 font-bold text-xs">
                    {initials(broker.name)}
                  </AvatarFallback>
                </Avatar>
                <p className="text-gray-500 font-medium text-sm">{broker.name.split(" ")[0]}</p>
                <span className="ml-auto text-xs text-gray-600 bg-gray-700/40 px-2 py-0.5 rounded-full">ausente</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
