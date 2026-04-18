import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Zap, MessageSquare, TrendingUp } from "lucide-react";

/**
 * Zona 3 — Pulso do Dia
 * Três números que o corretor lê em dois segundos e sabe onde está.
 */
export function PulsoDia() {
  const { session } = useAuth();
  const userId = session?.user.id;

  const { data } = useQuery({
    queryKey: ["pulso-dia", userId],
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const todayIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

      const [{ count: leadsHoje }, { count: respostasHoje }, { count: emNegociacao }] =
        await Promise.all([
          supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("broker_id", userId!)
            .gte("created_at", todayIso),
          supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("broker_id", userId!)
            .gte("last_lead_response_at", todayIso),
          supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("broker_id", userId!)
            .in("status", ["VISIT_SCHEDULED", "DOCS_REQUESTED"]),
        ]);

      return {
        leadsHoje:     leadsHoje     ?? 0,
        respostasHoje: respostasHoje ?? 0,
        emNegociacao:  emNegociacao  ?? 0,
      };
    },
  });

  const s = data ?? { leadsHoje: 0, respostasHoje: 0, emNegociacao: 0 };

  return (
    <div className="grid grid-cols-3 gap-2">
      <StatBox icon={Zap}           label="Leads hoje"  value={s.leadsHoje}     color="sky"     />
      <StatBox icon={MessageSquare} label="Respostas"   value={s.respostasHoje} color="indigo"  />
      <StatBox icon={TrendingUp}    label="Negociação"  value={s.emNegociacao}  color="emerald" />
    </div>
  );
}

const COLOR_MAP = {
  sky:     { text: "text-sky-400",     bg: "bg-sky-500/8",     border: "border-sky-500/20"     },
  indigo:  { text: "text-indigo-400",  bg: "bg-indigo-500/8",  border: "border-indigo-500/20"  },
  emerald: { text: "text-emerald-400", bg: "bg-emerald-500/8", border: "border-emerald-500/20" },
};

function StatBox({ icon: Icon, label, value, color }: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: keyof typeof COLOR_MAP;
}) {
  const c = COLOR_MAP[color];
  return (
    <div className={`rounded-xl p-3 border ${c.bg} ${c.border} text-center`}>
      <Icon className={`w-3.5 h-3.5 mx-auto mb-1 ${c.text}`} />
      <p className={`text-2xl font-black leading-none tabular-nums ${c.text}`}>{value}</p>
      <p className="text-[9px] text-gray-600 uppercase tracking-wider mt-1 font-bold">{label}</p>
    </div>
  );
}
