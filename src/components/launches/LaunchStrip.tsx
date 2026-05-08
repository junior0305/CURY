// Strip persistente acima da fila — discreto mas sempre visível durante lançamento.

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { Launch, useLaunchRankings } from "./useActiveLaunches";

function fmtCountdown(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "encerrado";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h`;
}

interface Props { launch: Launch; }

export default function LaunchStrip({ launch }: Props) {
  const { user } = useAuth();
  const { data: rankings = [] } = useLaunchRankings(launch.id);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(i);
  }, []);

  const myActions = rankings.filter(r => r.broker_id === user?.id);
  const positions = myActions.map(a => `#${a.rank_position} ${a.action_type}`).join(" · ");
  void tick;

  return (
    <div className="rounded-lg px-3 py-2 flex items-center gap-2 text-xs font-bold"
      style={{
        background: "linear-gradient(90deg, rgba(251,191,36,0.18), rgba(245,158,11,0.05))",
        borderLeft: "3px solid rgba(251,191,36,0.65)",
        color: "rgb(252 211 77)",
      }}>
      <Trophy className="w-3.5 h-3.5 shrink-0 text-amber-400" />
      <span className="text-amber-200">{launch.hero_emoji} {launch.name}</span>
      <span className="text-amber-400/60">·</span>
      <span className="text-amber-300">termina em {fmtCountdown(launch.ends_at)}</span>
      {positions && (
        <>
          <span className="text-amber-400/60">·</span>
          <span className="text-amber-100">você {positions}</span>
        </>
      )}
    </div>
  );
}
