import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AlertTriangle, CheckCircle2, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lead } from "@/types/lead";
import type { User } from "@/types/user";

interface Props {
  brokers: User[];
  leads: Lead[];
  xpData: Record<string, { xp: number; level: number; levelName: string }>;
}

const LEVEL_COLORS: Record<number, string> = {
  1: "text-slate-400", 2: "text-green-400", 3: "text-blue-400",
  4: "text-violet-400", 5: "text-amber-400", 6: "text-orange-400",
  7: "text-red-400", 8: "text-pink-400", 9: "text-yellow-300", 10: "text-yellow-200",
};

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
}

function hoursAgo(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / 3600000;
}

export default function TeamRanking({ brokers, leads, xpData }: Props) {
  const rows = brokers.map(broker => {
    const bl = leads.filter(l => l.brokerId === broker.id);
    const concluded = bl.filter(l => l.status === "CONCLUDED").length;
    const active = bl.filter(l => !["CONCLUDED","ABANDONED","EXCLUDED"].includes(l.status)).length;
    const stalled = bl.filter(l =>
      !["CONCLUDED","ABANDONED","EXCLUDED"].includes(l.status) &&
      hoursAgo(l.lastInteractionAt || l.createdAt) > 24
    ).length;
    const convRate = bl.length > 0 ? ((concluded / bl.length) * 100).toFixed(1) : "0.0";
    const xp = xpData[broker.id] || { xp: 0, level: 1, levelName: "Recruta" };
    return { broker, concluded, active, stalled, convRate, xp };
  }).sort((a, b) => b.concluded - a.concluded);

  if (!rows.length) {
    return (
      <div className="text-center py-20 text-gray-600">
        <Trophy className="w-12 h-12 mx-auto mb-3 opacity-20" />
        <p>Nenhum corretor na equipe.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/40 border border-gray-700/40 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-700/50 bg-slate-800/60">
            {["#", "Corretor", "Nível", "Vendas", "Ativos", "Parados", "Conv."].map(h => (
              <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ broker, concluded, active, stalled, convRate, xp }, i) => (
            <tr
              key={broker.id}
              className={cn(
                "border-b border-gray-700/20 transition-colors",
                i === 0 && "bg-yellow-900/5",
                !broker.leadAssignmentEnabled && "opacity-40"
              )}
            >
              <td className="px-4 py-3">
                <span className={cn("font-black text-lg",
                  i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-300" : i === 2 ? "text-amber-600" : "text-gray-600"
                )}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-slate-700 text-white text-xs font-bold">
                      {initials(broker.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <span className="text-white font-medium">{broker.name.split(" ")[0]}</span>
                    {!broker.leadAssignmentEnabled && (
                      <span className="ml-1.5 text-[10px] text-gray-600 bg-gray-700/50 px-1.5 py-0.5 rounded-full">ausente</span>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <span className={cn("font-bold text-xs", LEVEL_COLORS[xp.level] || "text-gray-400")}>
                  {xp.levelName}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className={cn("font-black", concluded > 0 ? "text-green-400" : "text-gray-600")}>
                  {concluded}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-300">{active}</td>
              <td className="px-4 py-3">
                {stalled > 0
                  ? <span className="text-red-400 font-bold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{stalled}</span>
                  : <span className="text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />OK</span>
                }
              </td>
              <td className="px-4 py-3 text-gray-400 text-xs font-mono">{convRate}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
