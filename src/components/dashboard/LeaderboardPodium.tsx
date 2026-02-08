import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Lead } from "@/types/lead";
import { User } from "@/types/user";
import { Crown, Sparkles, Trophy } from "lucide-react";

type PodiumEntry = {
  id: string;
  name: string;
  points: number;
  subtitle: string;
};

type LeaderboardType = "WEEK" | "MONTH";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
  return (first + last).toUpperCase();
}

function scoreForLead(lead: Lead) {
  if (lead.status === "DOCS_REQUESTED") return 3;
  if (lead.status === "VISIT_SCHEDULED") return 2;
  if (lead.status === "IN_PROGRESS") return 1;
  if (lead.status === "NEW") return 0.5;
  return 0;
}

function getStartOfWeek() {
  const now = new Date();
  const day = now.getDay(); // 0 (Sun) to 6 (Sat)
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Mon start
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getStartOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export default function LeaderboardPodium({
  leads,
  users,
}: {
  leads: Lead[];
  users: User[];
  title?: string;
  subtitle?: string;
}) {
  const [type, setType] = useState<LeaderboardType>("WEEK");

  const top3 = useMemo(() => {
    const brokers = users.filter((u) => u.role === "BROKER");
    const byBroker: Record<string, number> = {};
    const startDate = type === "WEEK" ? getStartOfWeek() : getStartOfMonth();

    for (const lead of leads) {
      if (!lead.brokerId) continue;
      
      // Filter leads by last interaction within the period to measure performance
      const leadDate = new Date(lead.lastInteractionAt);
      if (leadDate >= startDate) {
        byBroker[lead.brokerId] = (byBroker[lead.brokerId] ?? 0) + scoreForLead(lead);
      }
    }

    const entries: PodiumEntry[] = brokers
      .map((b) => ({
        id: b.id,
        name: b.name,
        points: Math.round((byBroker[b.id] ?? 0) * 10) / 10,
        subtitle: b.leadAssignmentEnabled ? "Ativo" : "Off-line",
      }))
      .filter((e) => e.points > 0)
      .sort((a, b) => b.points - a.points)
      .slice(0, 3);

    return entries;
  }, [leads, users, type]);

  const slots: Array<{ place: 1 | 2 | 3; entry?: PodiumEntry; height: string; tone: string; ring: string }> = [
    { place: 2, entry: top3[1], height: "h-24", tone: "bg-sky-600", ring: "ring-sky-200" },
    { place: 1, entry: top3[0], height: "h-32", tone: "bg-indigo-600", ring: "ring-indigo-200" },
    { place: 3, entry: top3[2], height: "h-20", tone: "bg-emerald-600", ring: "ring-emerald-200" },
  ];

  return (
    <Card className="relative overflow-hidden rounded-3xl border-none bg-white shadow-[0_22px_60px_-36px_rgba(15,23,42,0.55)] ring-1 ring-indigo-100 w-full">
      <div className="absolute -right-14 -top-14 h-40 w-40 rounded-full bg-indigo-600/10" />
      <div className="absolute -left-20 -bottom-20 h-56 w-56 rounded-full bg-sky-600/10" />

      <div className="relative p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            <div className="text-lg font-black tracking-tight text-slate-900 uppercase">Pódio de Performance</div>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button 
              onClick={() => setType("WEEK")}
              className={cn(
                "px-3 py-1 text-[10px] font-bold rounded-lg transition-all",
                type === "WEEK" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >SEMANA</button>
            <button 
              onClick={() => setType("MONTH")}
              className={cn(
                "px-3 py-1 text-[10px] font-bold rounded-lg transition-all",
                type === "MONTH" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >MÊS</button>
          </div>
        </div>
        
        <p className="text-xs text-slate-500 font-medium mb-6">
          {type === "WEEK" ? "Desde segunda-feira" : "Deste o dia 1º"} • Baseado em avanço no funil
        </p>

        {top3.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-sm text-slate-500">
            A disputa ainda não começou. Avance um lead para aparecer aqui!
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-3 items-end gap-3">
            {slots.map((s) => (
              <div key={s.place} className="flex flex-col items-center">
                <div className="mb-2 flex items-center gap-2">
                  <Avatar className={cn("h-10 w-10 ring-2", s.ring)}>
                    <AvatarFallback className="bg-white text-slate-900 font-bold">
                      {s.entry ? initials(s.entry.name) : s.place}
                    </AvatarFallback>
                  </Avatar>
                  {s.place === 1 && (
                    <div className="rounded-full bg-amber-500/15 p-1.5 text-amber-700">
                      <Crown className="h-4 w-4" />
                    </div>
                  )}
                </div>

                <div
                  className={cn(
                    "w-full rounded-3xl",
                    "shadow-[0_18px_50px_-36px_rgba(15,23,42,0.75)]",
                    "ring-1",
                    s.ring,
                    "dashboard-float",
                    "transform-gpu",
                    "transition-transform duration-300 hover:-translate-y-1",
                    s.height,
                    s.tone
                  )}
                  style={{ animationDelay: s.place === 1 ? "120ms" : s.place === 2 ? "0ms" : "240ms" }}
                />

                <div className="mt-3 text-center">
                  <div className="text-xs font-semibold text-slate-500">{s.place}º lugar</div>
                  <div className="mt-0.5 text-sm font-extrabold text-slate-900">
                    {s.entry?.name ?? "—"}
                  </div>
                  <div className="mt-1 flex items-center justify-center gap-2">
                    <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-white">
                      {s.entry ? `${s.entry.points} pts` : "0 pts"}
                    </span>
                    {s.entry && (
                      <span className="text-[11px] font-semibold text-slate-500">{s.entry.subtitle}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {["DOCS_REQUESTED", "VISIT_SCHEDULED", "IN_PROGRESS"].map((k) => (
            <div
              key={k}
              className="rounded-2xl bg-white ring-1 ring-slate-200 p-3 shadow-sm dashboard-tilt"
            >
              <div className="text-xs font-semibold text-slate-500">Como pontuamos</div>
              <div className="mt-1 text-sm font-bold text-slate-900">
                {k === "DOCS_REQUESTED" && "Documento (3 pts)"}
                {k === "VISIT_SCHEDULED" && "Visita (2 pts)"}
                {k === "IN_PROGRESS" && "Atendimento (1 pt)"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}