import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  Smartphone, Plus, Pencil, Trash2, Wifi, WifiOff, Clock,
  AlertTriangle, CheckCircle2, Users, Zap, ChevronRight,
  RefreshCw, Target, MessageSquare, Crown, X, Save,
  Signal, TrendingUp, UserCheck, Flame
} from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface ProspectInstance {
  id: string;
  name: string;
  phone: string;
  evolution_instance: string;
  status: string;
  daily_limit: number;
  sent_today: number;
  last_used_at: string | null;
  blocked_at: string | null;
  created_at: string;
}

interface ProspectLead {
  id: string;
  name: string;
  phone: string;
  source: string | null;
  interest: string | null;
  status: string;
  attempt_count: number;
  last_message_at: string | null;
  qualified_at: string | null;
  qualification_summary: string | null;
  created_at: string;
}

interface DistributionQueue {
  id: string;
  name: string;
  accepts_reactivated: boolean;
  sla_minutes: number;
  broker_ids: string[];
}

interface Profile {
  id: string;
  first_name: string;
  last_name: string | null;
  role: string;
}

// ── Status configs ─────────────────────────────────────────────────────────────
const INSTANCE_STATUS: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  ACTIVE:   { label: "Ativo",       color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", icon: Wifi },
  WARMING:  { label: "Aquecendo",   color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20",     icon: Flame },
  BLOCKED:  { label: "Bloqueado",   color: "text-rose-400",    bg: "bg-rose-500/10 border-rose-500/20",       icon: WifiOff },
  RESTING:  { label: "Descansando", color: "text-gray-400",    bg: "bg-gray-500/10 border-gray-500/20",       icon: Clock },
};

const PROSPECT_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  PROSPECTING:  { label: "Em Prospecção", color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20"    },
  QUALIFIED:    { label: "Qualificado",   color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  DISQUALIFIED: { label: "Desqualificado",color: "text-gray-500",    bg: "bg-gray-500/10 border-gray-500/20"    },
  ENTERED_CRM:  { label: "Entrou no CRM", color: "text-indigo-400",  bg: "bg-indigo-500/10 border-indigo-500/20" },
};

// ── Form vazio ─────────────────────────────────────────────────────────────────
const EMPTY_INSTANCE = {
  name: "",
  phone: "",
  evolution_instance: "",
  status: "WARMING",
  daily_limit: 30,
};

// ── Componente principal ───────────────────────────────────────────────────────
export function Prospeccao() {
  const qc = useQueryClient();
  const [view, setView] = useState<"instances" | "prospects" | "queue">("instances");
  const [editingInstance, setEditingInstance] = useState<(typeof EMPTY_INSTANCE & { id?: string }) | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: instances = [], isLoading: loadingInstances } = useQuery<ProspectInstance[]>({
    queryKey: ["prospect-instances"],
    queryFn: async () => {
      const { data } = await supabase.from("prospect_instances").select("*").order("created_at");
      return data || [];
    },
  });

  const { data: prospects = [], isLoading: loadingProspects } = useQuery<ProspectLead[]>({
    queryKey: ["prospect-leads"],
    queryFn: async () => {
      const { data } = await supabase
        .from("prospect_leads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
    enabled: view === "prospects",
  });

  const { data: queues = [] } = useQuery<DistributionQueue[]>({
    queryKey: ["distribution-queues"],
    queryFn: async () => {
      const { data } = await supabase.from("distribution_queues").select("*").order("name");
      return data || [];
    },
    enabled: view === "queue",
  });

  const { data: brokers = [] } = useQuery<Profile[]>({
    queryKey: ["brokers-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, role")
        .eq("role", "BROKER")
        .order("first_name");
      return data || [];
    },
    enabled: view === "queue",
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const saveInstance = useMutation({
    mutationFn: async (data: typeof EMPTY_INSTANCE & { id?: string }) => {
      const payload = {
        name: data.name,
        phone: data.phone,
        evolution_instance: data.evolution_instance,
        status: data.status,
        daily_limit: data.daily_limit,
      };
      if (data.id) {
        await supabase.from("prospect_instances").update(payload).eq("id", data.id);
      } else {
        await supabase.from("prospect_instances").insert({ ...payload, sent_today: 0 });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["prospect-instances"] }); setEditingInstance(null); },
  });

  const deleteInstance = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("prospect_instances").delete().eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prospect-instances"] }),
  });

  const updateInstanceStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await supabase.from("prospect_instances").update({ status }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prospect-instances"] }),
  });

  const setReactivationQueue = useMutation({
    mutationFn: async ({ queueId, sla }: { queueId: string; sla: number }) => {
      // Desativa todas as filas
      await supabase.from("distribution_queues").update({ accepts_reactivated: false }).neq("id", "none");
      // Ativa só a escolhida
      await supabase.from("distribution_queues").update({ accepts_reactivated: true, sla_minutes: sla }).eq("id", queueId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["distribution-queues"] }),
  });

  const toggleBrokerInQueue = useMutation({
    mutationFn: async ({ queueId, brokerId, currentIds }: { queueId: string; brokerId: string; currentIds: string[] }) => {
      const newIds = currentIds.includes(brokerId)
        ? currentIds.filter(id => id !== brokerId)
        : [...currentIds, brokerId];
      await supabase.from("distribution_queues").update({ broker_ids: newIds }).eq("id", queueId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["distribution-queues"] }),
  });

  const qualifyProspect = useMutation({
    mutationFn: async (prospect: ProspectLead) => {
      // Buscar fila de reativação ativa
      const { data: queue } = await supabase
        .from("distribution_queues")
        .select("*")
        .eq("accepts_reactivated", true)
        .single();

      if (!queue || !queue.broker_ids?.length) throw new Error("Nenhuma fila de reativação configurada");

      // Escolher próximo corretor da fila (round robin simples)
      const brokerIdx = queue.last_assigned_index % queue.broker_ids.length;
      const brokerId = queue.broker_ids[brokerIdx];

      // Criar lead no CRM
      const slaDeadline = new Date(Date.now() + queue.sla_minutes * 60000).toISOString();
      const { data: newLead } = await supabase.from("leads").insert({
        name: prospect.name,
        phone: prospect.phone,
        status: "REATIVADO",
        broker_id: brokerId,
        tag: prospect.interest || null,
        notes: prospect.qualification_summary || null,
        reactivated_at: new Date().toISOString(),
        qualification_summary: prospect.qualification_summary,
        sla_deadline: slaDeadline,
        last_interaction_at: new Date().toISOString(),
      }).select().single();

      // Atualizar prospect
      await supabase.from("prospect_leads").update({
        status: "ENTERED_CRM",
        crm_lead_id: newLead.id,
        qualified_at: new Date().toISOString(),
      }).eq("id", prospect.id);

      // Avançar índice da fila
      await supabase.from("distribution_queues").update({
        last_assigned_index: brokerIdx + 1,
      }).eq("id", queue.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prospect-leads"] });
      qc.invalidateQueries({ queryKey: ["distribution-queues"] });
    },
  });

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const activeInstances = instances.filter(i => i.status === "ACTIVE").length;
  const totalSentToday = instances.reduce((acc, i) => acc + (i.sent_today || 0), 0);
  const qualifiedProspects = prospects.filter(p => p.status === "QUALIFIED").length;
  const inCrm = prospects.filter(p => p.status === "ENTERED_CRM").length;
  const activeQueue = queues.find(q => q.accepts_reactivated);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
            <div className="p-2 bg-emerald-600/20 border border-emerald-500/20 rounded-xl">
              <Target className="w-5 h-5 text-emerald-400" />
            </div>
            Prospecção
          </h2>
          <p className="text-sm text-gray-500 mt-1 ml-14">
            Instâncias de prospecção, leads externos e fila de reativação
          </p>
        </div>

        {view === "instances" && (
          <Button onClick={() => setEditingInstance({ ...EMPTY_INSTANCE })}
            className="bg-emerald-600 hover:bg-emerald-500 font-bold shadow-lg shadow-emerald-900/30">
            <Plus className="w-4 h-4 mr-2" /> Nova Instância
          </Button>
        )}
      </div>

      {/* Stats rápidos */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Instâncias Ativas",  value: activeInstances,   icon: Wifi,        color: "text-emerald-400" },
          { label: "Disparos Hoje",      value: totalSentToday,    icon: MessageSquare,color: "text-blue-400"   },
          { label: "Qualificados",       value: qualifiedProspects, icon: UserCheck,   color: "text-amber-400"  },
          { label: "Entraram no CRM",    value: inCrm,             icon: Crown,        color: "text-indigo-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-slate-800/40 border border-gray-700/40 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={cn("w-4 h-4", color)} />
              <span className="text-xs text-gray-500 font-bold">{label}</span>
            </div>
            <p className={cn("text-2xl font-black", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/60 border border-gray-700/40 rounded-xl p-1 w-fit">
        {[
          { key: "instances", label: "Instâncias",  icon: Smartphone },
          { key: "prospects", label: "Prospects",   icon: Users      },
          { key: "queue",     label: "Fila Reativ.", icon: Crown      },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setView(key as any)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
              view === key ? "bg-slate-700 text-white shadow" : "text-gray-500 hover:text-gray-300"
            )}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* ── VIEW: INSTÂNCIAS ──────────────────────────────────────────────────── */}
      {view === "instances" && (
        <div className="space-y-4">

          {/* Form */}
          {editingInstance && (
            <div className="bg-slate-800/60 border border-gray-700/50 rounded-2xl p-6 space-y-4">
              <h3 className="font-black text-white">
                {editingInstance.id ? "Editar Instância" : "Nova Instância"}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { key: "name",                label: "Nome",              placeholder: "Prospecção 01"   },
                  { key: "phone",               label: "Número",            placeholder: "5511999990001"   },
                  { key: "evolution_instance",  label: "Instância Evolution",placeholder: "prospeccao-01" },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">
                      {label}
                    </label>
                    <input
                      value={(editingInstance as any)[key]}
                      onChange={e => setEditingInstance(f => ({ ...f!, [key]: e.target.value }))}
                      placeholder={placeholder}
                      className="w-full bg-slate-900 border border-gray-700/60 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-emerald-500/60 transition-colors"
                    />
                  </div>
                ))}

                <div>
                  <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">
                    Status Inicial
                  </label>
                  <select
                    value={editingInstance.status}
                    onChange={e => setEditingInstance(f => ({ ...f!, status: e.target.value }))}
                    className="w-full bg-slate-900 border border-gray-700/60 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500/60"
                  >
                    {Object.entries(INSTANCE_STATUS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">
                    Limite Diário de Disparos
                  </label>
                  <input
                    type="number" min={5} max={200}
                    value={editingInstance.daily_limit}
                    onChange={e => setEditingInstance(f => ({ ...f!, daily_limit: Number(e.target.value) }))}
                    className="w-full bg-slate-900 border border-gray-700/60 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500/60"
                  />
                  <p className="text-[11px] text-gray-600 mt-1.5">
                    💡 Instâncias novas: comece com 15-20. Aumente 10 por semana.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-gray-700/40">
                <Button variant="ghost" onClick={() => setEditingInstance(null)}
                  className="text-gray-400 border border-gray-700/40">
                  <X className="w-4 h-4 mr-2" /> Cancelar
                </Button>
                <Button onClick={() => saveInstance.mutate(editingInstance)}
                  disabled={!editingInstance.name || !editingInstance.phone || !editingInstance.evolution_instance}
                  className="bg-emerald-600 hover:bg-emerald-500 font-bold">
                  <Save className="w-4 h-4 mr-2" /> Salvar
                </Button>
              </div>
            </div>
          )}

          {/* Lista */}
          {loadingInstances ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin" />
            </div>
          ) : instances.length === 0 && !editingInstance ? (
            <div className="flex flex-col items-center justify-center py-20 bg-slate-800/20 border border-gray-700/20 border-dashed rounded-2xl text-gray-600">
              <Smartphone className="w-12 h-12 mb-3 opacity-20" />
              <p className="font-bold">Nenhuma instância cadastrada.</p>
              <p className="text-sm mt-1">Adicione a primeira instância de prospecção.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {instances.map(inst => {
                const sc = INSTANCE_STATUS[inst.status] || INSTANCE_STATUS.RESTING;
                const StatusIcon = sc.icon;
                const pct = inst.daily_limit > 0 ? Math.round((inst.sent_today / inst.daily_limit) * 100) : 0;
                return (
                  <div key={inst.id}
                    className="bg-slate-800/40 border border-gray-700/40 rounded-2xl p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className={cn("p-3 rounded-xl border shrink-0", sc.bg)}>
                          <StatusIcon className={cn("w-5 h-5", sc.color)} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-white">{inst.name}</span>
                            <Badge className={cn("text-[10px] border", sc.bg, sc.color)}>
                              {sc.label}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 mt-1 flex-wrap">
                            <span className="text-xs text-gray-500 font-mono">{inst.phone}</span>
                            <span className="text-xs text-gray-600">
                              Instância: <span className="text-gray-400">{inst.evolution_instance}</span>
                            </span>
                          </div>

                          {/* Barra de uso diário */}
                          <div className="mt-3 flex items-center gap-3">
                            <div className="flex-1 bg-slate-700/60 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500"
                                )}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                            <span className="text-[11px] text-gray-500 shrink-0">
                              {inst.sent_today}/{inst.daily_limit} hoje
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Ações */}
                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          value={inst.status}
                          onChange={e => updateInstanceStatus.mutate({ id: inst.id, status: e.target.value })}
                          className="bg-slate-700/60 border border-gray-600/40 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none"
                        >
                          {Object.entries(INSTANCE_STATUS).map(([k, v]) => (
                            <option key={k} value={k}>{v.label}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => setEditingInstance({
                            id: inst.id, name: inst.name, phone: inst.phone,
                            evolution_instance: inst.evolution_instance,
                            status: inst.status, daily_limit: inst.daily_limit,
                          })}
                          className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-slate-700/60 transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { if (confirm("Deletar esta instância?")) deleteInstance.mutate(inst.id); }}
                          className="p-2 rounded-lg text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── VIEW: PROSPECTS ───────────────────────────────────────────────────── */}
      {view === "prospects" && (
        <div className="space-y-3">
          {loadingProspects ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="w-5 h-5 text-blue-400 animate-spin" />
            </div>
          ) : prospects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-slate-800/20 border border-gray-700/20 border-dashed rounded-2xl text-gray-600">
              <Users className="w-12 h-12 mb-3 opacity-20" />
              <p className="font-bold">Nenhum prospect ainda.</p>
              <p className="text-sm mt-1">Os leads trabalhados pelas instâncias aparecerão aqui.</p>
            </div>
          ) : (
            prospects.map(p => {
              const sc = PROSPECT_STATUS[p.status] || PROSPECT_STATUS.PROSPECTING;
              return (
                <div key={p.id} className="bg-slate-800/40 border border-gray-700/40 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-black text-white">{p.name}</span>
                        <Badge className={cn("text-[10px] border", sc.bg, sc.color)}>
                          {sc.label}
                        </Badge>
                        <span className="text-xs text-gray-600">
                          {p.attempt_count} tentativa{p.attempt_count !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs text-gray-500 font-mono">{p.phone}</span>
                        {p.interest && (
                          <span className="text-xs text-gray-600">
                            Interesse: <span className="text-gray-400">{p.interest}</span>
                          </span>
                        )}
                        {p.source && (
                          <span className="text-xs text-gray-600">
                            Origem: <span className="text-gray-400">{p.source}</span>
                          </span>
                        )}
                      </div>
                      {p.qualification_summary && (
                        <p className="text-xs text-gray-500 mt-2 bg-slate-900/40 rounded-lg px-3 py-2 border border-gray-700/30">
                          {p.qualification_summary}
                        </p>
                      )}
                    </div>

                    {p.status === "QUALIFIED" && (
                      <Button size="sm"
                        onClick={() => qualifyProspect.mutate(p)}
                        className="h-8 px-3 bg-indigo-600 hover:bg-indigo-500 text-xs font-bold shrink-0">
                        <Crown className="w-3.5 h-3.5 mr-1" /> Enviar ao CRM
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── VIEW: FILA DE REATIVAÇÃO ──────────────────────────────────────────── */}
      {view === "queue" && (
        <div className="space-y-4">

          {/* Fila ativa atual */}
          {activeQueue && (
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <Crown className="w-5 h-5 text-indigo-400" />
                <div>
                  <p className="font-black text-white">Fila Ativa: {activeQueue.name}</p>
                  <p className="text-xs text-gray-500">
                    SLA de {activeQueue.sla_minutes} minutos · {activeQueue.broker_ids?.length || 0} corretores
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {(activeQueue.broker_ids || []).map(bid => {
                  const b = brokers.find(br => br.id === bid);
                  return b ? (
                    <span key={bid} className="px-3 py-1 bg-indigo-500/20 border border-indigo-500/20 rounded-full text-xs font-bold text-indigo-300">
                      {b.first_name} {b.last_name || ""}
                    </span>
                  ) : null;
                })}
              </div>
            </div>
          )}

          {/* Configurar fila */}
          <div className="space-y-3">
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
              Escolher Fila de Reativação
            </p>
            {queues.map(queue => (
              <div key={queue.id}
                className={cn(
                  "rounded-2xl border p-5 transition-all",
                  queue.accepts_reactivated
                    ? "bg-indigo-500/10 border-indigo-500/30"
                    : "bg-slate-800/40 border-gray-700/40"
                )}>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-white">{queue.name}</span>
                      {queue.accepts_reactivated && (
                        <Badge className="text-[10px] border bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
                          ● Ativa
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {queue.broker_ids?.length || 0} corretores · SLA {queue.sla_minutes}min
                    </p>
                  </div>
                  {!queue.accepts_reactivated && (
                    <Button size="sm"
                      onClick={() => setReactivationQueue.mutate({ queueId: queue.id, sla: queue.sla_minutes || 15 })}
                      className="h-8 px-3 bg-slate-700 hover:bg-indigo-600 text-xs font-bold border border-gray-600/40 hover:border-indigo-500/40 transition-all">
                      Ativar esta fila
                    </Button>
                  )}
                </div>

                {/* SLA */}
                <div className="mb-4">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block">
                    SLA — minutos para atender
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number" min={5} max={120}
                      defaultValue={queue.sla_minutes || 15}
                      onBlur={async e => {
                        await supabase.from("distribution_queues")
                          .update({ sla_minutes: Number(e.target.value) })
                          .eq("id", queue.id);
                        qc.invalidateQueries({ queryKey: ["distribution-queues"] });
                      }}
                      className="w-20 bg-slate-900 border border-gray-700/60 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500/60"
                    />
                    <span className="text-xs text-gray-500">minutos antes de redistribuir</span>
                  </div>
                </div>

                {/* Corretores da fila */}
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">
                    Corretores nesta fila
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {brokers.map(broker => {
                      const inQueue = (queue.broker_ids || []).includes(broker.id);
                      return (
                        <button key={broker.id}
                          onClick={() => toggleBrokerInQueue.mutate({
                            queueId: queue.id,
                            brokerId: broker.id,
                            currentIds: queue.broker_ids || [],
                          })}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-bold transition-all text-left",
                            inQueue
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                              : "bg-slate-800/60 border-gray-700/40 text-gray-500 hover:text-gray-300 hover:border-gray-600"
                          )}>
                          <div className={cn(
                            "w-2 h-2 rounded-full shrink-0",
                            inQueue ? "bg-emerald-400" : "bg-gray-600"
                          )} />
                          {broker.first_name} {broker.last_name || ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}

            {queues.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 bg-slate-800/20 border border-gray-700/20 border-dashed rounded-2xl text-gray-600">
                <Users className="w-10 h-10 mb-3 opacity-20" />
                <p className="font-bold">Nenhuma fila de distribuição criada.</p>
                <p className="text-sm mt-1">Crie filas na aba Webhooks/Distribuição primeiro.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
