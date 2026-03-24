import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Zap, MessageSquare, FileText, Calendar, Target, Gift, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlertItem {
  color: "red" | "orange" | "amber" | "emerald" | "indigo" | "green";
  icon: React.ElementType;
  text: string;
  pulse: boolean;
}

interface Props {
  compact?: boolean;
  showMissions?: boolean;
  onClickMissions?: () => void;
  pendingPrizes?: number;
  onClickPrizes?: () => void;
}

const COLOR_STYLES = {
  red:     { border: "border-l-red-500",     bg: "bg-red-500/10",     text: "text-red-300",     icon: "text-red-400"     },
  orange:  { border: "border-l-orange-500",  bg: "bg-orange-500/10",  text: "text-orange-200",  icon: "text-orange-400"  },
  amber:   { border: "border-l-amber-500",   bg: "bg-amber-500/10",   text: "text-amber-200",   icon: "text-amber-400"   },
  emerald: { border: "border-l-emerald-500", bg: "bg-emerald-500/10", text: "text-emerald-200", icon: "text-emerald-400" },
  indigo:  { border: "border-l-indigo-500",  bg: "bg-indigo-500/10",  text: "text-indigo-200",  icon: "text-indigo-400"  },
  green:   { border: "border-l-green-500",   bg: "bg-green-500/10",   text: "text-green-200",   icon: "text-green-400"   },
};

export function GamificationBar({ showMissions, onClickMissions, pendingPrizes = 0, onClickPrizes }: Props) {
  const { user } = useAuth();
  const [activeIdx, setActiveIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  const { data: alertData } = useQuery({
    queryKey: ["broker-situation", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const now = new Date();
      const h2ago = new Date(now.getTime() - 2 * 3600000).toISOString();
      const today = now.toISOString().split("T")[0];

      const [leadsRes, missionsRes] = await Promise.all([
        supabase.from("leads")
          .select("id, status, welcome_responded_at, last_broker_whatsapp_at, next_action_date")
          .eq("broker_id", user.id)
          .not("status", "in", '("ABANDONED","EXCLUDED","CONCLUDED")'),
        supabase.from("daily_missions")
          .select("id, completed")
          .eq("broker_id", user.id)
          .eq("date", today),
      ]);

      const leads = leadsRes.data || [];
      const missions = missionsRes.data || [];
      const weekEnd = new Date(now.getTime() + 7 * 24 * 3600000).toISOString();

      return {
        newLeads:     leads.filter(l => l.status === "NEW").length,
        waitingReply: leads.filter(l =>
          l.welcome_responded_at &&
          (!l.last_broker_whatsapp_at || l.last_broker_whatsapp_at < l.welcome_responded_at) &&
          l.welcome_responded_at < h2ago
        ).length,
        docsClose:    leads.filter(l => l.status === "DOCS_REQUESTED").length,
        visits:       leads.filter(l => l.status === "VISIT_SCHEDULED" && l.next_action_date && l.next_action_date <= weekEnd).length,
        missionsDone: missions.filter(m => m.completed).length,
        missionsTotal: missions.length,
      };
    },
    refetchInterval: 60000,
    enabled: !!user?.id,
  });

  const alerts = useMemo((): AlertItem[] => {
    if (!alertData) return [];
    const items: AlertItem[] = [];

    if (alertData.newLeads > 0) items.push({
      color: "red", icon: Zap, pulse: true,
      text: `${alertData.newLeads} lead${alertData.newLeads > 1 ? "s" : ""} NOVO${alertData.newLeads > 1 ? "S" : ""} aguardando seu primeiro contato`,
    });
    if (alertData.waitingReply > 0) items.push({
      color: "orange", icon: MessageSquare, pulse: true,
      text: `${alertData.waitingReply} lead${alertData.waitingReply > 1 ? "s" : ""} respondeu${alertData.waitingReply > 1 ? "ram" : ""} há 2h+ e está${alertData.waitingReply > 1 ? "o" : ""} esperando você`,
    });
    if (alertData.docsClose > 0) items.push({
      color: "amber", icon: FileText, pulse: false,
      text: `${alertData.docsClose} negócio${alertData.docsClose > 1 ? "s" : ""} com documentação pendente — QUASE FECHANDO!`,
    });
    if (alertData.visits > 0) items.push({
      color: "emerald", icon: Calendar, pulse: false,
      text: `${alertData.visits} visita${alertData.visits > 1 ? "s" : ""} agendada${alertData.visits > 1 ? "s" : ""} esta semana`,
    });

    const { missionsDone, missionsTotal } = alertData;
    if (missionsTotal > 0) items.push({
      color: missionsDone === missionsTotal ? "green" : "indigo",
      icon: missionsDone === missionsTotal ? CheckCircle2 : Target,
      pulse: missionsDone === missionsTotal,
      text: missionsDone === missionsTotal
        ? `Missões do dia concluídas! ${missionsDone}/${missionsTotal} ✅`
        : `Missões hoje: ${missionsDone}/${missionsTotal} — continue avançando`,
    });

    if (items.length === 0) items.push({
      color: "green", icon: CheckCircle2, pulse: false,
      text: "Situação limpa — mantenha o ritmo!",
    });

    return items;
  }, [alertData]);

  // Rotação com fade a cada 4s
  useEffect(() => {
    if (alerts.length <= 1) return;
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setActiveIdx(i => (i + 1) % alerts.length);
        setVisible(true);
      }, 300);
    }, 4000);
    return () => clearInterval(interval);
  }, [alerts.length]);

  const current = alerts[activeIdx % Math.max(alerts.length, 1)];
  if (!current) return null;

  const c = COLOR_STYLES[current.color];
  const Icon = current.icon;

  return (
    <div className={cn(
      "flex items-center gap-3 rounded-xl border border-l-4 px-4 py-3 transition-opacity duration-300",
      "bg-slate-900/80 border-gray-700/40",
      c.border,
      visible ? "opacity-100" : "opacity-0"
    )}>
      <Icon className={cn("w-4 h-4 shrink-0", c.icon, current.pulse && "animate-pulse")} />
      <p className={cn("text-sm font-bold flex-1 truncate", c.text)}>
        {current.text}
      </p>
      {alerts.length > 1 && (
        <div className="flex gap-1 shrink-0">
          {alerts.map((_, i) => (
            <div key={i} className={cn("h-1 rounded-full transition-all", i === activeIdx % alerts.length ? "w-4 bg-white/60" : "w-1 bg-white/20")} />
          ))}
        </div>
      )}
      <div className="flex gap-1.5 shrink-0">
        {showMissions && onClickMissions && (
          <button onClick={onClickMissions}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/10">
            <Target className="w-3.5 h-3.5 text-yellow-400" />
          </button>
        )}
        {onClickPrizes && pendingPrizes > 0 && (
          <button onClick={onClickPrizes}
            className="p-1.5 rounded-lg bg-yellow-500/20 hover:bg-yellow-500/30 transition-colors border border-yellow-400/30 animate-pulse">
            <Gift className="w-3.5 h-3.5 text-yellow-400" />
          </button>
        )}
      </div>
    </div>
  );
}
