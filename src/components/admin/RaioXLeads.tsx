import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  RefreshCw, ChevronRight, X, AlertTriangle, WifiOff,
  User, Clock, CheckCircle2, XCircle, Loader2, Users,
} from "lucide-react";

function timeAgo(iso?: string | null) {
  if (!iso) return "nunca";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

type FilterKey = "todos" | "parados" | "travada" | "bot_offline" | "humano" | "sem_corretor";

const FILTERS: { key: FilterKey; label: string; color: string }[] = [
  { key: "todos",        label: "Todos",         color: "bg-slate-700 text-slate-300" },
  { key: "parados",      label: "Parados +8h",   color: "bg-amber-900/40 text-amber-400 border-amber-600/30" },
  { key: "travada",      label: "Fila Travada",  color: "bg-red-900/40 text-red-400 border-red-600/30" },
  { key: "bot_offline",  label: "Bot Offline",   color: "bg-orange-900/40 text-orange-400 border-orange-600/30" },
  { key: "humano",       label: "Modo Humano",   color: "bg-violet-900/40 text-violet-400 border-violet-600/30" },
  { key: "sem_corretor", label: "Sem Corretor",  color: "bg-slate-700/60 text-slate-400 border-slate-600/30" },
];

const ACTION_LABELS: Record<string, string> = {
  toque_1: "Toque 1", toque_2: "Toque 2", sentinela: "Sentinela",
  last_chance: "Última Chance", auto_resposta: "Auto Resposta",
  broker_warmup: "Warmup", docs_reminder: "Docs", broker_alert: "Alerta Corretor",
  manager_alert: "Alerta Gerente",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendente",  color: "text-yellow-400" },
  sent:    { label: "Enviado",   color: "text-emerald-400" },
  failed:  { label: "Falhou",    color: "text-red-400" },
  cancelled:{ label: "Cancelado",color: "text-slate-500" },
};

interface Lead {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  broker_id: string | null;
  last_interaction_at: string | null;
  created_at: string;
  broker_name: string | null;
  bot_online: boolean;
  bot_notification_only: boolean;
  modo: string | null;
  last_queue_action: string | null;
  last_queue_status: string | null;
  queue_attempts: number;
  problems: string[];
}

interface QueueItem {
  id: string;
  action_type: string;
  status: string;
  scheduled_for: string;
  last_attempt_at: string | null;
  attempts: number;
  cancel_reason: string | null;
  created_at: string;
}

export default function RaioXLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [selected, setSelected] = useState<Lead | null>(null);
  const [timeline, setTimeline] = useState<QueueItem[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const eightHoursAgo = new Date(Date.now() - 8 * 3600000).toISOString();

      // Busca leads ativos com potencial problema
      const { data: rawLeads } = await supabase
        .from("leads")
        .select("id, name, phone, status, broker_id, last_interaction_at, created_at")
        .not("status", "in", '("CONCLUDED","ABANDONED","EXCLUDED")')
        .or(`last_interaction_at.lt.${eightHoursAgo},last_interaction_at.is.null`)
        .order("last_interaction_at", { ascending: true, nullsFirst: true })
        .limit(200);

      if (!rawLeads?.length) { setLeads([]); setLoading(false); return; }

      const brokerIds = [...new Set(rawLeads.map(l => l.broker_id).filter(Boolean))];
      const leadIds = rawLeads.map(l => l.id);

      // Corretores + bots
      const { data: profiles } = brokerIds.length
        ? await supabase.from("profiles").select("id, first_name, last_name, bot_instance_id").in("id", brokerIds)
        : { data: [] };

      const botIds = [...new Set((profiles || []).map((p: any) => p.bot_instance_id).filter(Boolean))];
      const { data: bots } = botIds.length
        ? await supabase.from("bot_instances").select("id, status, notification_only").in("id", botIds)
        : { data: [] };

      // lead_state (modo)
      const { data: states } = await supabase
        .from("lead_state").select("lead_id, modo").in("lead_id", leadIds);

      // Último item da fila por lead
      const { data: queueItems } = await supabase
        .from("lead_activation_queue")
        .select("lead_id, action_type, status, attempts")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: false });

      // Mapas
      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      const botMap = new Map((bots || []).map((b: any) => [b.id, b]));
      const stateMap = new Map((states || []).map((s: any) => [s.lead_id, s]));

      // Último item por lead
      const lastQueueMap = new Map<string, any>();
      for (const q of (queueItems || [])) {
        if (!lastQueueMap.has(q.lead_id)) lastQueueMap.set(q.lead_id, q);
      }

      const enriched: Lead[] = rawLeads.map(l => {
        const profile = l.broker_id ? profileMap.get(l.broker_id) : null;
        const bot = profile?.bot_instance_id ? botMap.get(profile.bot_instance_id) : null;
        const state = stateMap.get(l.id);
        const lastQ = lastQueueMap.get(l.id);
        const hoursStale = l.last_interaction_at
          ? (Date.now() - new Date(l.last_interaction_at).getTime()) / 3600000
          : (Date.now() - new Date(l.created_at).getTime()) / 3600000;

        const problems: string[] = [];
        if (!l.broker_id) problems.push("sem_corretor");
        if (hoursStale >= 8) problems.push("parados");
        if (lastQ?.status === "failed" && lastQ?.attempts >= 5) problems.push("travada");
        if (bot && bot.status !== "open") problems.push("bot_offline");
        if (bot?.notification_only) problems.push("bot_offline");
        if (state?.modo === "humano_ativo") problems.push("humano");

        return {
          id: l.id,
          name: l.name,
          phone: l.phone,
          status: l.status,
          broker_id: l.broker_id,
          last_interaction_at: l.last_interaction_at,
          created_at: l.created_at,
          broker_name: profile ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() : null,
          bot_online: bot ? bot.status === "open" && !bot.notification_only : false,
          bot_notification_only: bot?.notification_only ?? false,
          modo: state?.modo ?? null,
          last_queue_action: lastQ?.action_type ?? null,
          last_queue_status: lastQ?.status ?? null,
          queue_attempts: lastQ?.attempts ?? 0,
          problems,
        };
      });

      setLeads(enriched);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const openTimeline = async (lead: Lead) => {
    setSelected(lead);
    setLoadingTimeline(true);
    const { data } = await supabase
      .from("lead_activation_queue")
      .select("id, action_type, status, scheduled_for, last_attempt_at, attempts, cancel_reason, created_at")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(30);
    setTimeline(data ?? []);
    setLoadingTimeline(false);
  };

  const filtered = filter === "todos"
    ? leads
    : leads.filter(l => l.problems.includes(filter));

  // Resumo por corretor
  const brokerSummary = new Map<string, { name: string; count: number }>();
  for (const l of leads) {
    const key = l.broker_name ?? "Sem Corretor";
    const prev = brokerSummary.get(key) ?? { name: key, count: 0 };
    brokerSummary.set(key, { ...prev, count: prev.count + 1 });
  }
  const brokerList = [...brokerSummary.values()].sort((a, b) => b.count - a.count);

  const counts = {
    todos:        leads.length,
    parados:      leads.filter(l => l.problems.includes("parados")).length,
    travada:      leads.filter(l => l.problems.includes("travada")).length,
    bot_offline:  leads.filter(l => l.problems.includes("bot_offline")).length,
    humano:       leads.filter(l => l.problems.includes("humano")).length,
    sem_corretor: leads.filter(l => l.problems.includes("sem_corretor")).length,
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
          Raio-X dos Leads — Visão Operacional
        </h3>
        <Button variant="ghost" size="sm" onClick={fetchLeads} disabled={loading}
          className="text-xs text-slate-500 hover:text-white gap-1">
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {/* Resumo por corretor */}
      {brokerList.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {brokerList.map(b => (
            <button key={b.name}
              onClick={() => {/* future: filter by broker */}}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 hover:border-slate-500 transition-colors">
              <Users className="w-3 h-3 text-slate-400" />
              <span className="text-xs text-slate-300">{b.name}</span>
              <span className={cn("text-xs font-bold rounded-full px-1.5",
                b.count >= 10 ? "bg-red-900/60 text-red-400" :
                b.count >= 5  ? "bg-amber-900/60 text-amber-400" :
                "bg-slate-700 text-slate-400"
              )}>{b.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map(f => (
          <button key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-semibold border transition-all",
              filter === f.key ? f.color + " ring-1 ring-white/10" : "bg-transparent border-slate-700 text-slate-500 hover:text-slate-300"
            )}>
            {f.label}
            {counts[f.key] > 0 && (
              <span className="ml-1.5 font-bold">{counts[f.key]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <Card className="bg-slate-900/60 border-slate-700/50 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Carregando...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-slate-500">
            <CheckCircle2 className="w-8 h-8 text-emerald-500/50" />
            <p className="text-sm">Nenhum lead com problema nesse filtro.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500 font-semibold">
                  <th className="px-4 py-3 text-left">Lead</th>
                  <th className="px-3 py-3 text-left hidden sm:table-cell">Corretor</th>
                  <th className="px-3 py-3 text-center">Parado há</th>
                  <th className="px-3 py-3 text-center hidden md:table-cell">Último Agente</th>
                  <th className="px-3 py-3 text-left">Problemas</th>
                  <th className="px-3 py-3 text-center"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(lead => (
                  <tr key={lead.id}
                    className="border-b border-slate-800/40 hover:bg-slate-800/30 transition-colors cursor-pointer"
                    onClick={() => openTimeline(lead)}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-200">{lead.name}</div>
                      <div className="text-slate-600">{lead.phone}</div>
                    </td>
                    <td className="px-3 py-3 hidden sm:table-cell">
                      {lead.broker_name
                        ? <span className="text-slate-300">{lead.broker_name}</span>
                        : <span className="text-slate-600 italic">sem corretor</span>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={cn("font-bold",
                        !lead.last_interaction_at ? "text-slate-500" :
                        (Date.now() - new Date(lead.last_interaction_at).getTime()) > 24 * 3600000 ? "text-red-400" :
                        "text-amber-400"
                      )}>
                        {timeAgo(lead.last_interaction_at ?? lead.created_at)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center hidden md:table-cell">
                      {lead.last_queue_action ? (
                        <div>
                          <div className="text-slate-300">{ACTION_LABELS[lead.last_queue_action] ?? lead.last_queue_action}</div>
                          <div className={cn("font-semibold", STATUS_LABELS[lead.last_queue_status ?? ""]?.color ?? "text-slate-500")}>
                            {STATUS_LABELS[lead.last_queue_status ?? ""]?.label ?? lead.last_queue_status}
                            {lead.queue_attempts > 1 && ` (${lead.queue_attempts}x)`}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {lead.problems.includes("sem_corretor") && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-slate-400 bg-slate-700/60 border border-slate-600/30">
                            <User className="w-2.5 h-2.5" /> Sem corretor
                          </span>
                        )}
                        {lead.problems.includes("parados") && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-amber-400 bg-amber-900/30 border border-amber-600/30">
                            <Clock className="w-2.5 h-2.5" /> Parado
                          </span>
                        )}
                        {lead.problems.includes("travada") && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-red-400 bg-red-900/30 border border-red-600/30">
                            <XCircle className="w-2.5 h-2.5" /> Fila travada
                          </span>
                        )}
                        {lead.problems.includes("bot_offline") && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-orange-400 bg-orange-900/30 border border-orange-600/30">
                            <WifiOff className="w-2.5 h-2.5" />
                            {lead.bot_notification_only ? "Bot restrito" : "Bot offline"}
                          </span>
                        )}
                        {lead.problems.includes("humano") && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-violet-400 bg-violet-900/30 border border-violet-600/30">
                            <User className="w-2.5 h-2.5" /> Modo humano
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <ChevronRight className="w-4 h-4 text-slate-600 inline" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Painel lateral — timeline do lead */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-md bg-slate-950 border-l border-slate-800 h-full overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-slate-950 border-b border-slate-800 px-5 py-4 flex items-start justify-between">
              <div>
                <h3 className="font-bold text-white">{selected.name}</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selected.broker_name ?? "Sem corretor"} · {selected.phone}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              {/* Problemas do lead */}
              <div className="flex flex-wrap gap-1.5 pb-3 border-b border-slate-800">
                {selected.problems.map(p => {
                  const f = FILTERS.find(f => f.key === p);
                  return f ? (
                    <span key={p} className={cn("px-2 py-0.5 rounded-full text-xs border", f.color)}>
                      {f.label}
                    </span>
                  ) : null;
                })}
                {selected.problems.length === 0 && (
                  <span className="text-xs text-emerald-400">Sem problemas identificados</span>
                )}
              </div>

              {/* Timeline da fila */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                  Histórico de Ações dos Agentes
                </p>
                {loadingTimeline ? (
                  <div className="flex items-center gap-2 text-slate-500 py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Carregando...</span>
                  </div>
                ) : timeline.length === 0 ? (
                  <p className="text-sm text-slate-600 py-4">Nenhuma ação registrada ainda.</p>
                ) : (
                  <div className="space-y-2">
                    {timeline.map(item => {
                      const st = STATUS_LABELS[item.status] ?? { label: item.status, color: "text-slate-400" };
                      return (
                        <div key={item.id} className={cn(
                          "p-3 rounded-lg border text-xs",
                          item.status === "sent"      ? "border-emerald-800/40 bg-emerald-900/10" :
                          item.status === "failed"    ? "border-red-800/40 bg-red-900/10" :
                          item.status === "pending"   ? "border-yellow-800/40 bg-yellow-900/10" :
                          "border-slate-800 bg-slate-900/30"
                        )}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-semibold text-slate-200">
                              {ACTION_LABELS[item.action_type] ?? item.action_type}
                            </span>
                            <span className={cn("font-bold", st.color)}>
                              {st.label}
                              {item.attempts > 1 && ` · ${item.attempts}x`}
                            </span>
                          </div>
                          <div className="text-slate-500 space-y-0.5">
                            <div>Agendado: {fmtTime(item.scheduled_for)}</div>
                            {item.last_attempt_at && <div>Última tentativa: {fmtTime(item.last_attempt_at)}</div>}
                            {item.cancel_reason && <div className="text-slate-600">Motivo: {item.cancel_reason}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
