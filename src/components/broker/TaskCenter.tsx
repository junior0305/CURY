import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchOpenTasks, markTaskDone, snoozeTask } from "@/integrations/supabase/tasks";
import type { Task } from "@/types/task";
import type { Lead } from "@/types/lead";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AlarmClock, CheckCircle2, Clock, History, Link2, RefreshCw, AlertCircle } from "lucide-react";

function minutesDiff(dueAtIso: string, now: number) {
  return Math.round((new Date(dueAtIso).getTime() - now) / 60000);
}

function fmtTime(dueAtIso: string) {
  const d = new Date(dueAtIso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtDay(dueAtIso: string) {
  const d = new Date(dueAtIso);
  return d.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function TaskCenter({
  leads,
  onOpenLead,
}: {
  leads: Lead[];
  onOpenLead: (leadId: string) => void;
}) {
  const queryClient = useQueryClient();
  const { data: tasks = [], isLoading, refetch } = useQuery<Task[]>({
    queryKey: ["tasks"],
    queryFn: fetchOpenTasks,
  });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const doneMutation = useMutation({
    mutationFn: (id: string) => markTaskDone(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const snoozeMutation = useMutation({
    mutationFn: ({ id, mins }: { id: string; mins: number }) =>
      snoozeTask(id, new Date(Date.now() + mins * 60_000).toISOString()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const grouped = useMemo(() => {
    const overdue: Task[] = [];
    const soon: Task[] = [];
    const today: Task[] = [];

    const nowDate = new Date(now);

    for (const t of tasks) {
      const mins = minutesDiff(t.dueAt, now);
      const dueDate = new Date(t.dueAt);

      if (mins < 0) {
        overdue.push(t);
        continue;
      }
      if (mins <= 10) {
        soon.push(t);
        continue;
      }
      if (isSameDay(dueDate, nowDate)) {
        today.push(t);
        continue;
      }
      // tasks beyond today: keep in today list for simplicity
      today.push(t);
    }

    return { overdue, soon, today };
  }, [tasks, now]);

  const section = (
    title: string,
    icon: React.ReactNode,
    items: Task[],
    tone: "rose" | "amber" | "slate"
  ) => {
    const toneMeta = {
      rose: {
        ring: "ring-rose-200",
        dot: "bg-rose-600",
        badge: "bg-rose-600",
        chip: "bg-rose-600/10 text-rose-700",
      },
      amber: {
        ring: "ring-amber-200",
        dot: "bg-amber-600",
        badge: "bg-amber-600",
        chip: "bg-amber-600/10 text-amber-800",
      },
      slate: {
        ring: "ring-slate-200",
        dot: "bg-slate-600",
        badge: "bg-slate-900",
        chip: "bg-slate-900/10 text-slate-800",
      },
    }[tone];

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn("grid h-9 w-9 place-items-center rounded-2xl ring-1 bg-white", toneMeta.ring)}>
              {icon}
            </div>
            <div>
              <div className="text-sm font-extrabold text-slate-900">{title}</div>
              <div className="text-[11px] text-slate-500">{items.length} tarefas</div>
            </div>
          </div>
          <Badge className={cn("rounded-full text-white", toneMeta.badge)}>{items.length}</Badge>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
            Nada aqui.
          </div>
        ) : (
          <div className="space-y-2">
            {items.slice(0, 6).map((t) => {
              const mins = minutesDiff(t.dueAt, now);
              const isSoon = mins >= 0 && mins <= 10;
              const isOverdue = mins < 0;

              const lead = t.leadId ? leads.find((l) => l.id === t.leadId) : undefined;

              return (
                <div
                  key={t.id}
                  className={cn(
                    "rounded-2xl bg-white/80 backdrop-blur ring-1 ring-slate-200 p-3 shadow-sm",
                    "dashboard-tilt transition-all duration-500",
                    isSoon && "ring-2 ring-amber-400 bg-amber-50 shadow-[0_0_20px_rgba(245,158,11,0.2)]",
                    isOverdue && "ring-2 ring-rose-500 bg-rose-50 shadow-[0_0_20px_rgba(225,29,72,0.2)] animate-pulse"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {isOverdue && <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />}
                        <div className="font-semibold text-slate-900 truncate">{t.title}</div>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", toneMeta.chip)}>
                          {fmtDay(t.dueAt)} • {fmtTime(t.dueAt)}
                        </span>
                        {isSoon && (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                            AGORA ({mins}m)
                          </span>
                        )}
                        {isOverdue && (
                          <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                            ATRASADA ({Math.abs(mins)}m)
                          </span>
                        )}
                        {lead && (
                          <button
                            type="button"
                            onClick={() => onOpenLead(lead.id)}
                            className="inline-flex items-center gap-1 rounded-full bg-indigo-600/10 px-2 py-0.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-600/15"
                          >
                            <Link2 className="h-3 w-3" /> {lead.name.split(" ")[0]}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-xl hover:bg-emerald-50 hover:text-emerald-700"
                        onClick={() => doneMutation.mutate(t.id)}
                        disabled={doneMutation.isPending}
                        title="Concluir"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-xl hover:bg-slate-100"
                        onClick={() => snoozeMutation.mutate({ id: t.id, mins: 60 })}
                        disabled={snoozeMutation.isPending}
                        title="Adiar 1h"
                      >
                        <History className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="relative overflow-hidden rounded-3xl border-none bg-white/80 backdrop-blur shadow-[0_22px_60px_-36px_rgba(15,23,42,0.55)] ring-1 ring-slate-200">
      <div className="absolute -right-14 -top-14 h-44 w-44 rounded-full bg-amber-500/10 blur-0" />
      <div className="absolute -left-20 -bottom-20 h-56 w-56 rounded-full bg-indigo-600/10" />

      <div className="relative p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
              <AlarmClock className="h-4 w-4 text-amber-600" />
              Lembretes e tarefas
            </div>
            <div className="mt-1 text-xs text-slate-500">
              O sistema destaca o que está perto do horário (e o que atrasou).
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => refetch()}
            className="rounded-2xl bg-white/70 backdrop-blur border-slate-200 hover:bg-white"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            Atualizar
          </Button>
        </div>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
          {section("Atrasadas", <Clock className="h-4 w-4 text-rose-600" />, grouped.overdue, "rose")}
          {section("Agora", <Clock className="h-4 w-4 text-amber-600" />, grouped.soon, "amber")}
          {section("Hoje", <Clock className="h-4 w-4 text-slate-700" />, grouped.today, "slate")}
        </div>
      </div>
    </Card>
  );
}