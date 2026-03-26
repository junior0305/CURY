import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toggleBrokerPresence } from "@/integrations/supabase/profiles";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users, UserCheck, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { User } from "@/types/user";

interface Props {
  brokers: User[];
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
}

export default function AttendancePanel({ brokers }: Props) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ id, present }: { id: string; present: boolean }) =>
      toggleBrokerPresence(id, present),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teamBrokers"] });
    },
    onError: (err: any) => {
      toast.error("Erro ao atualizar presença: " + err.message);
    },
    onSettled: () => setPending(null),
  });

  const present = brokers.filter(b => b.leadAssignmentEnabled);
  const absent = brokers.filter(b => !b.leadAssignmentEnabled);

  const toggle = (broker: User) => {
    setPending(broker.id);
    mutation.mutate({ id: broker.id, present: !broker.leadAssignmentEnabled });
  };

  if (!brokers.length) {
    return (
      <div className="text-center py-20 text-gray-600">
        <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
        <p>Nenhum corretor na sua equipe ainda.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Resumo */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-3 bg-emerald-900/20 border border-emerald-500/20 rounded-xl px-4 py-3">
          <UserCheck className="w-5 h-5 text-emerald-400" />
          <div>
            <p className="text-2xl font-black text-emerald-400 leading-none">{present.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">Presentes</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-slate-800/40 border border-gray-700/30 rounded-xl px-4 py-3">
          <UserX className="w-5 h-5 text-gray-500" />
          <div>
            <p className="text-2xl font-black text-gray-500 leading-none">{absent.length}</p>
            <p className="text-xs text-gray-500 mt-0.5">Ausentes</p>
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {brokers.map(broker => {
          const isPresent = broker.leadAssignmentEnabled;
          const isLoading = pending === broker.id;

          return (
            <div
              key={broker.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-4 py-3 transition-all",
                isPresent
                  ? "border-emerald-500/20 bg-emerald-900/10"
                  : "border-gray-700/30 bg-slate-800/20 opacity-70"
              )}
            >
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarFallback className={cn(
                  "font-black text-sm",
                  isPresent ? "bg-emerald-900/60 text-emerald-200" : "bg-slate-700 text-gray-400"
                )}>
                  {initials(broker.name)}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <p className={cn("font-bold truncate", isPresent ? "text-white" : "text-gray-500")}>
                  {broker.name}
                </p>
                <p className="text-xs text-gray-600">
                  {isPresent ? "Recebendo leads" : "Fora da fila"}
                </p>
              </div>

              <Switch
                checked={isPresent}
                onCheckedChange={() => toggle(broker)}
                disabled={isLoading}
                className="data-[state=checked]:bg-emerald-500"
              />
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-gray-600">
        Ausentes não recebem leads automáticos. Reative manualmente quando retornarem.
      </p>
    </div>
  );
}
