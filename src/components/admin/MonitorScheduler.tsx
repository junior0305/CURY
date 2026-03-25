import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw, Play, CheckCircle2, XCircle, Clock,
  Zap, Bot, MessageSquare, Users, Activity, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SchedulerRun {
  id: string;
  ran_at: string;
  status: "success" | "error";
  critical: number;
  cold: number;
  cadence: number;
  stale: number;
  sentinela: number;
  total: number;
  error_message: string | null;
  duration_ms: number | null;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function fmtDuration(ms: number | null) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

const BLOCKS = [
  { key: "critical", label: "Críticos", icon: AlertTriangle, color: "text-red-400" },
  { key: "cold",     label: "Frios",    icon: Users,          color: "text-sky-400" },
  { key: "cadence",  label: "Cadência", icon: MessageSquare,  color: "text-violet-400" },
  { key: "stale",    label: "Parados",  icon: Clock,          color: "text-amber-400" },
  { key: "sentinela",label: "Sentinela",icon: Bot,            color: "text-emerald-400" },
] as const;

export default function MonitorScheduler() {
  const [runs, setRuns] = useState<SchedulerRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("scheduler_runs")
      .select("*")
      .order("ran_at", { ascending: false })
      .limit(30);
    setRuns((data as SchedulerRun[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRuns();
    // Auto-refresh a cada 60s
    const t = setInterval(fetchRuns, 60000);
    return () => clearInterval(t);
  }, [fetchRuns]);

  const handleRunNow = async () => {
    setRunning(true);
    toast.info("Scheduler iniciado. Pode levar até 2 minutos...");
    // Fire-and-forget: não aguarda resposta (pode ultrapassar o timeout de 150s)
    supabase.functions.invoke("followup_scheduler", { body: {} }).catch(() => {});
    // Aguarda 8s e atualiza o histórico
    setTimeout(async () => {
      await fetchRuns();
      setRunning(false);
      toast.success("Execução concluída! Histórico atualizado.");
    }, 8000);
  };

  const lastRun = runs[0];
  const successRate = runs.length
    ? Math.round((runs.filter(r => r.status === "success").length / runs.length) * 100)
    : null;

  const totalLast24h = runs
    .filter(r => Date.now() - new Date(r.ran_at).getTime() < 86400000 && r.status === "success")
    .reduce((s, r) => s + r.total, 0);

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-100 text-amber-600 rounded-2xl">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Monitor de Automações</h2>
            <p className="text-sm text-slate-500">Histórico do Follow-Up Scheduler e Sentinela IA</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchRuns}
            disabled={loading}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Atualizar
          </Button>
          <Button
            size="sm"
            onClick={handleRunNow}
            disabled={running}
            className="gap-1.5 text-xs bg-amber-600 hover:bg-amber-500 text-white"
          >
            <Play className={cn("h-3.5 w-3.5", running && "animate-spin")} />
            {running ? "Executando..." : "Rodar Agora"}
          </Button>
        </div>
      </div>

      {/* ── Cards de resumo ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 border-none shadow-lg rounded-2xl bg-white ring-1 ring-slate-100">
          <p className="text-xs text-slate-500 font-medium mb-1">Última execução</p>
          {lastRun ? (
            <>
              <p className="text-base font-bold text-slate-800">{timeAgo(lastRun.ran_at)}</p>
              <p className="text-xs text-slate-400">{fmtTime(lastRun.ran_at)}</p>
            </>
          ) : (
            <p className="text-sm text-slate-400">Nenhuma ainda</p>
          )}
        </Card>

        <Card className="p-4 border-none shadow-lg rounded-2xl bg-white ring-1 ring-slate-100">
          <p className="text-xs text-slate-500 font-medium mb-1">Status</p>
          {lastRun ? (
            lastRun.status === "success" ? (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="font-bold text-emerald-600 text-sm">OK</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="font-bold text-red-600 text-sm">Erro</span>
              </div>
            )
          ) : (
            <p className="text-sm text-slate-400">—</p>
          )}
          {successRate !== null && (
            <p className="text-xs text-slate-400 mt-0.5">{successRate}% sucesso (30 runs)</p>
          )}
        </Card>

        <Card className="p-4 border-none shadow-lg rounded-2xl bg-white ring-1 ring-slate-100">
          <p className="text-xs text-slate-500 font-medium mb-1">Msgs enviadas (24h)</p>
          <p className="text-2xl font-black text-slate-800">{totalLast24h}</p>
          <p className="text-xs text-slate-400">todos os blocos</p>
        </Card>

        <Card className="p-4 border-none shadow-lg rounded-2xl bg-white ring-1 ring-slate-100">
          <p className="text-xs text-slate-500 font-medium mb-1">Duração (última)</p>
          <p className="text-base font-bold text-slate-800">{fmtDuration(lastRun?.duration_ms ?? null)}</p>
          {lastRun && (
            <p className="text-xs text-slate-400">{lastRun.total} mensagens</p>
          )}
        </Card>
      </div>

      {/* ── Tabela de execuções ── */}
      <Card className="border-none shadow-xl rounded-3xl bg-white ring-1 ring-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-700">Histórico de execuções</h3>
        </div>

        {loading && runs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">Carregando...</div>
        ) : runs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            Nenhuma execução registrada ainda. Rode o scheduler para começar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500 font-semibold">
                  <th className="px-4 py-2.5 text-left">Data/Hora (BRT)</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                  {BLOCKS.map(b => (
                    <th key={b.key} className="px-3 py-2.5 text-center hidden md:table-cell">
                      {b.label}
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-center font-bold">Total</th>
                  <th className="px-4 py-2.5 text-center hidden sm:table-cell">Duração</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run, i) => (
                  <tr
                    key={run.id}
                    className={cn(
                      "border-t border-slate-50 hover:bg-slate-50/80 transition-colors",
                      run.status === "error" && "bg-red-50/60"
                    )}
                  >
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="font-medium text-slate-700">{fmtTime(run.ran_at)}</div>
                      <div className="text-xs text-slate-400">{timeAgo(run.ran_at)}</div>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {run.status === "success" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 inline" />
                      ) : (
                        <div title={run.error_message ?? ""}>
                          <XCircle className="h-4 w-4 text-red-500 inline" />
                        </div>
                      )}
                    </td>
                    {BLOCKS.map(b => (
                      <td key={b.key} className="px-3 py-2.5 text-center hidden md:table-cell">
                        <span className={cn(
                          "font-bold",
                          run[b.key] > 0 ? b.color : "text-slate-300"
                        )}>
                          {run[b.key]}
                        </span>
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-center">
                      <Badge className={cn(
                        "text-xs font-bold",
                        run.total > 0
                          ? "bg-slate-900 text-white"
                          : "bg-slate-100 text-slate-400"
                      )}>
                        {run.total}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-center text-xs text-slate-400 hidden sm:table-cell">
                      {fmtDuration(run.duration_ms)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Legenda de blocos ── */}
      <div className="flex flex-wrap gap-4 px-1">
        {BLOCKS.map(b => (
          <div key={b.key} className="flex items-center gap-1.5">
            <b.icon className={cn("h-3.5 w-3.5", b.color)} />
            <span className="text-xs text-slate-500">
              <strong className="text-slate-700">{b.label}:</strong>{" "}
              {b.key === "critical" && "leads que responderam e foram ignorados"}
              {b.key === "cold" && "welcome msg para leads novos"}
              {b.key === "cadence" && "cadência de follow-up"}
              {b.key === "stale" && "leads parados sem interação"}
              {b.key === "sentinela" && "mensagens da IA Sentinela"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
