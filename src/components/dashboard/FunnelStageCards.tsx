import type React from "react";
import { Lead, LeadStatus } from "@/types/lead";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowRight, FileText, Flame, Home, MapPin, UserRound } from "lucide-react";

export type FunnelFilter = LeadStatus | "ACTIVE" | "ALL";

const stageMeta: Array<{
  key: FunnelFilter;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  ring: string;
  pill: string;
}> = [
  {
    key: "ACTIVE",
    label: "Ativos",
    hint: "O que precisa de ação agora",
    icon: Flame,
    ring: "ring-indigo-200",
    pill: "bg-indigo-600",
  },
  {
    key: "NEW",
    label: "Novos",
    hint: "Primeiro contato",
    icon: UserRound,
    ring: "ring-sky-200",
    pill: "bg-sky-600",
  },
  {
    key: "IN_PROGRESS",
    label: "Atendimento",
    hint: "Em conversa",
    icon: Home,
    ring: "ring-blue-200",
    pill: "bg-blue-600",
  },
  {
    key: "VISIT_SCHEDULED",
    label: "Visita",
    hint: "Decisão em andamento",
    icon: MapPin,
    ring: "ring-emerald-200",
    pill: "bg-emerald-600",
  },
  {
    key: "DOCS_REQUESTED",
    label: "Documento",
    hint: "Reta final",
    icon: FileText,
    ring: "ring-amber-200",
    pill: "bg-amber-600",
  },
  {
    key: "ABANDONED",
    label: "Excluídos",
    hint: "Vai para Retrabalho",
    icon: ArrowRight,
    ring: "ring-rose-200",
    pill: "bg-rose-600",
  },
];

function countFor(filter: FunnelFilter, leads: Lead[]) {
  if (filter === "ALL") return leads.length;
  if (filter === "ACTIVE") return leads.filter((l) => l.status !== "ABANDONED").length;
  return leads.filter((l) => l.status === filter).length;
}

export default function FunnelStageCards({
  leads,
  value,
  onChange,
}: {
  leads: Lead[];
  value: FunnelFilter;
  onChange: (val: FunnelFilter) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {stageMeta.map((s, idx) => {
        const active = value === s.key;
        const count = countFor(s.key, leads);

        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onChange(s.key)}
            className={cn(
              "text-left",
              "group",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
              "animate-in fade-in slide-in-from-bottom-2 duration-500",
              idx > 0 && "[animation-delay:70ms]",
              idx > 1 && "[animation-delay:120ms]",
              idx > 2 && "[animation-delay:170ms]"
            )}
          >
            <Card
              className={cn(
                "relative overflow-hidden border-none",
                "rounded-3xl",
                "bg-white/80 backdrop-blur",
                "shadow-[0_18px_40px_-26px_rgba(15,23,42,0.45)]",
                "ring-1",
                s.ring,
                "transition-all duration-300",
                "transform-gpu",
                "hover:-translate-y-1 hover:shadow-[0_28px_68px_-36px_rgba(15,23,42,0.55)]",
                "dashboard-tilt",
                active && "ring-2 ring-indigo-500"
              )}
            >
              <div
                className={cn(
                  "absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-10",
                  s.pill
                )}
              />
              <div className="relative p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-500">{s.hint}</div>
                    <div className="mt-1 text-[15px] font-extrabold tracking-tight text-slate-900">
                      {s.label}
                    </div>
                  </div>

                  <div
                    className={cn(
                      "shrink-0 rounded-2xl p-2 text-white",
                      s.pill,
                      "shadow-sm",
                      "transition-transform duration-300 group-hover:scale-[1.06]"
                    )}
                  >
                    <s.icon className="h-4 w-4" />
                  </div>
                </div>

                <div className="mt-4 flex items-end justify-between">
                  <div className="text-3xl font-black tracking-tight text-slate-900">{count}</div>
                  <div
                    className={cn(
                      "rounded-full px-2 py-1 text-[11px] font-bold text-white",
                      active ? "bg-slate-900" : "bg-slate-800/80"
                    )}
                  >
                    {active ? "ATIVO" : "VER"}
                  </div>
                </div>
              </div>
            </Card>
          </button>
        );
      })}
    </div>
  );
}
