import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  Bot, Plus, Pencil, Trash2, Zap, Clock, MessageSquare,
  Shield, AlertTriangle, CheckCircle2, Send, Eye,
  ChevronRight, Activity, Settings, X, Save, FlaskConical,
  Radio, Pause, BookOpen, Coins, ChevronDown,
} from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface AiAgent {
  id: string;
  name: string;
  trigger_type: string;
  trigger_hours: number;
  trigger_status: string | null;
  broker_personality: string;
  message_objective: string;
  max_attempts: number;
  interval_hours: number;
  require_approval: boolean;
  silence_after_reply_hours: number;
  silence_after_broker_activity_hours: number;
  is_active: boolean;
  created_at: string;
}

interface KnowledgeItem {
  id: string;
  agent_id: string;
  title: string;
  content: string;
  category: string | null;
  created_at: string;
}

interface Dispatch {
  id: string;
  lead_id: string;
  broker_id: string;
  message_generated: string;
  status: string;
  attempt_number: number;
  blocked_reason: string | null;
  sent_at: string | null;
  created_at: string;
  ai_agents?: { name: string };
  leads?: { name: string; phone: string };
  profiles?: { first_name: string; last_name: string };
}

const TRIGGER_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  INACTIVITY:     { label: "Inatividade",      icon: "⏳", color: "text-amber-400"  },
  STATUS_CHANGE:  { label: "Mudança de Status", icon: "🔄", color: "text-blue-400"   },
  POST_VISIT:     { label: "Pós-Visita",        icon: "🏠", color: "text-emerald-400"},
  DOCS_REMINDER:  { label: "Docs Pendentes",    icon: "📄", color: "text-purple-400" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:  { label: "Pendente", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
  SENT:     { label: "Enviado",  color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  BLOCKED:  { label: "Bloqueado", color: "text-rose-400",  bg: "bg-rose-500/10 border-rose-500/20"     },
  APPROVED: { label: "Aprovado", color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/20"     },
  FAILED:   { label: "Falhou",   color: "text-gray-500",   bg: "bg-gray-500/10 border-gray-500/20"     },
};

// ── Formulário de agente ───────────────────────────────────────────────────────
const EMPTY_AGENT = {
  name: "",
  trigger_type: "INACTIVITY",
  trigger_hours: 8,
  trigger_status: "",
  broker_personality: "",
  message_objective: "",
  max_attempts: 3,
  interval_hours: 24,
  require_approval: false,
  silence_after_reply_hours: 4,
  silence_after_broker_activity_hours: 2,
  is_active: true,
};

function AgentForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: typeof EMPTY_AGENT & { id?: string };
  onSave: (data: typeof EMPTY_AGENT & { id?: string }) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="bg-slate-800/60 border border-gray-700/50 rounded-2xl p-6 space-y-6">
      {/* Nome */}
      <div>
        <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">
          Nome do Agente
        </label>
        <input
          value={form.name}
          onChange={e => set("name", e.target.value)}
          placeholder="Ex: Follow-up Frio, Reaquecimento 7 dias..."
          className="w-full bg-slate-900 border border-gray-700/60 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500/60 transition-colors"
        />
      </div>

      {/* Gatilho */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">
            Tipo de Gatilho
          </label>
          <select
            value={form.trigger_type}
            onChange={e => set("trigger_type", e.target.value)}
            className="w-full bg-slate-900 border border-gray-700/60 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500/60 transition-colors"
          >
            {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v.icon} {v.label}</option>
            ))}
          </select>
        </div>

        {form.trigger_type === "INACTIVITY" && (
          <div>
            <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">
              Horas de Inatividade
            </label>
            <input
              type="number" min={1} max={168}
              value={form.trigger_hours}
              onChange={e => set("trigger_hours", Number(e.target.value))}
              className="w-full bg-slate-900 border border-gray-700/60 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500/60 transition-colors"
            />
          </div>
        )}

        <div>
          <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">
            Máx. Tentativas
          </label>
          <input
            type="number" min={1} max={10}
            value={form.max_attempts}
            onChange={e => set("max_attempts", Number(e.target.value))}
            className="w-full bg-slate-900 border border-gray-700/60 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500/60 transition-colors"
          />
        </div>

        <div>
          <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">
            Intervalo entre Tentativas (h)
          </label>
          <input
            type="number" min={1} max={168}
            value={form.interval_hours}
            onChange={e => set("interval_hours", Number(e.target.value))}
            className="w-full bg-slate-900 border border-gray-700/60 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500/60 transition-colors"
          />
        </div>
      </div>

      {/* Personalidade do corretor */}
      <div>
        <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block flex items-center gap-2">
          <Bot className="w-3.5 h-3.5 text-indigo-400" />
          Personalidade do Corretor
          <span className="text-gray-600 font-normal normal-case tracking-normal">
            — como ele fala, tom, expressões típicas
          </span>
        </label>
        <textarea
          rows={3}
          value={form.broker_personality}
          onChange={e => set("broker_personality", e.target.value)}
          placeholder="Ex: Sou um corretor descontraído e direto. Falo de forma natural, sem formalidade. Uso expressões como 'cara', 'show', 'tranquilo'. Nunca pareço desesperado para vender..."
          className="w-full bg-slate-900 border border-gray-700/60 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500/60 transition-colors resize-none"
        />
        <p className="text-[11px] text-gray-600 mt-1.5">
          💡 Escreva na primeira pessoa. Esse texto vai direto para a IA como instrução de como ela deve se comportar.
        </p>
      </div>

      {/* Objetivo da mensagem */}
      <div>
        <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
          Objetivo da Mensagem
          <span className="text-gray-600 font-normal normal-case tracking-normal">
            — o que essa mensagem precisa fazer
          </span>
        </label>
        <textarea
          rows={3}
          value={form.message_objective}
          onChange={e => set("message_objective", e.target.value)}
          placeholder="Ex: Reengajar o lead que parou de responder. Ser natural, trazer uma razão para retomar a conversa. Terminar sempre com uma pergunta aberta para forçar resposta. Nunca mais de 3 parágrafos curtos..."
          className="w-full bg-slate-900 border border-gray-700/60 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500/60 transition-colors resize-none"
        />
      </div>

      {/* Janelas de silêncio */}
      <div>
        <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-rose-400" />
          Proteção de Interferência
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-slate-900/60 border border-gray-700/40 rounded-xl p-4">
            <p className="text-xs font-bold text-gray-400 mb-1">
              Silêncio após lead responder
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number" min={1} max={48}
                value={form.silence_after_reply_hours}
                onChange={e => set("silence_after_reply_hours", Number(e.target.value))}
                className="w-20 bg-slate-800 border border-gray-700/60 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500/60"
              />
              <span className="text-xs text-gray-500">horas de pausa</span>
            </div>
          </div>
          <div className="bg-slate-900/60 border border-gray-700/40 rounded-xl p-4">
            <p className="text-xs font-bold text-gray-400 mb-1">
              Silêncio após corretor enviar WhatsApp
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number" min={1} max={48}
                value={form.silence_after_broker_activity_hours}
                onChange={e => set("silence_after_broker_activity_hours", Number(e.target.value))}
                className="w-20 bg-slate-800 border border-gray-700/60 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500/60"
              />
              <span className="text-xs text-gray-500">horas de pausa</span>
            </div>
          </div>
        </div>
      </div>

      {/* Opções extras */}
      <div className="flex items-center justify-between bg-slate-900/60 border border-gray-700/40 rounded-xl px-4 py-3">
        <div>
          <p className="text-sm font-bold text-white">Exigir aprovação antes de enviar</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Cada mensagem gerada ficará pendente até um admin aprovar
          </p>
        </div>
        <Switch
          checked={form.require_approval}
          onCheckedChange={v => set("require_approval", v)}
        />
      </div>

      {/* Ações */}
      <div className="flex justify-end gap-3 pt-2 border-t border-gray-700/40">
        <Button variant="ghost" onClick={onCancel}
          className="text-gray-400 hover:text-white border border-gray-700/40 hover:bg-slate-700/40">
          <X className="w-4 h-4 mr-2" /> Cancelar
        </Button>
        <Button onClick={() => onSave(form)}
          disabled={!form.name || !form.broker_personality || !form.message_objective}
          className="bg-indigo-600 hover:bg-indigo-500 font-bold shadow-lg shadow-indigo-900/40">
          <Save className="w-4 h-4 mr-2" /> Salvar Agente
        </Button>
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────
export function IaBuilder() {
  const qc = useQueryClient();
  const [view, setView] = useState<"agents" | "dispatches" | "knowledge">("agents");
  const [selectedAgentForKnowledge, setSelectedAgentForKnowledge] = useState<string>("");
  const [editingKnowledge, setEditingKnowledge] = useState<Partial<KnowledgeItem> | null>(null);
  const [showKnowledgeForm, setShowKnowledgeForm] = useState(false);
  const [editing, setEditing] = useState<(typeof EMPTY_AGENT & { id?: string }) | null>(null);
  const [previewAgent, setPreviewAgent] = useState<AiAgent | null>(null);

  // Queries
  const { data: agents = [], isLoading } = useQuery<AiAgent[]>({
    queryKey: ["ai-agents"],
    queryFn: async () => {
      const { data } = await supabase.from("ai_agents").select("*").order("created_at");
      return data || [];
    },
  });

  const { data: dispatches = [] } = useQuery<Dispatch[]>({
    queryKey: ["ai-dispatches"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_agent_dispatches")
        .select("*, ai_agents(name), leads(name, phone), profiles(first_name, last_name)")
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: view === "dispatches",
  });

  const { data: knowledgeItems = [] } = useQuery<KnowledgeItem[]>({
    queryKey: ["knowledge-base", selectedAgentForKnowledge],
    queryFn: async () => {
      if (!selectedAgentForKnowledge) return [];
      const { data } = await supabase.from("knowledge_base").select("*").eq("agent_id", selectedAgentForKnowledge).order("category").order("created_at");
      return data || [];
    },
    enabled: view === "knowledge" && !!selectedAgentForKnowledge,
  });

  const saveKnowledge = useMutation({
    mutationFn: async (item: Partial<KnowledgeItem>) => {
      const payload = { agent_id: selectedAgentForKnowledge, title: item.title, content: item.content, category: item.category || null };
      if (item.id) await supabase.from("knowledge_base").update(payload).eq("id", item.id);
      else await supabase.from("knowledge_base").insert(payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["knowledge-base", selectedAgentForKnowledge] }); setEditingKnowledge(null); setShowKnowledgeForm(false); },
  });

  const deleteKnowledge = useMutation({
    mutationFn: async (id: string) => { await supabase.from("knowledge_base").delete().eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["knowledge-base", selectedAgentForKnowledge] }),
  });

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_AGENT & { id?: string }) => {
      const payload = {
        name: data.name,
        trigger_type: data.trigger_type,
        trigger_hours: data.trigger_hours,
        trigger_status: data.trigger_status || null,
        broker_personality: data.broker_personality,
        message_objective: data.message_objective,
        max_attempts: data.max_attempts,
        interval_hours: data.interval_hours,
        require_approval: data.require_approval,
        silence_after_reply_hours: data.silence_after_reply_hours,
        silence_after_broker_activity_hours: data.silence_after_broker_activity_hours,
        is_active: data.is_active,
        updated_at: new Date().toISOString(),
      };
      if (data.id) {
        await supabase.from("ai_agents").update(payload).eq("id", data.id);
      } else {
        await supabase.from("ai_agents").insert(payload);
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ai-agents"] }); setEditing(null); },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      await supabase.from("ai_agents").update({ is_active }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-agents"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("ai_agents").delete().eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-agents"] }),
  });

  const approveDispatch = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("ai_agent_dispatches").update({ status: "APPROVED" }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-dispatches"] }),
  });

  const pendingApprovals = dispatches.filter(d => d.status === "PENDING").length;

  return (
    <div className="space-y-6">

      {/* Header da aba */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
            <div className="p-2 bg-indigo-600/20 border border-indigo-500/20 rounded-xl">
              <Bot className="w-5 h-5 text-indigo-400" />
            </div>
            IA Builder
          </h2>
          <p className="text-sm text-gray-500 mt-1 ml-14">
            Configure agentes de mensagem automática por corretor
          </p>
        </div>

        <div className="flex items-center gap-2">
          {pendingApprovals > 0 && (
            <button onClick={() => setView("dispatches")}
              className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-yellow-400 text-sm font-bold hover:bg-yellow-500/20 transition-colors">
              <AlertTriangle className="w-4 h-4" />
              {pendingApprovals} aguardando aprovação
            </button>
          )}
          <Button
            onClick={() => setEditing({ ...EMPTY_AGENT })}
            className="bg-indigo-600 hover:bg-indigo-500 font-bold shadow-lg shadow-indigo-900/30">
            <Plus className="w-4 h-4 mr-2" /> Novo Agente
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/60 border border-gray-700/40 rounded-xl p-1 w-fit">
        {[
          { key: "agents",     label: "Agentes",    icon: Bot      },
          { key: "dispatches", label: "Disparos",   icon: Activity },
          { key: "knowledge",  label: "Base IA",    icon: BookOpen },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setView(key as any)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
              view === key
                ? "bg-slate-700 text-white shadow"
                : "text-gray-500 hover:text-gray-300"
            )}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* ── VIEW: AGENTES ─────────────────────────────────────────────────── */}
      {view === "agents" && (
        <div className="space-y-4">

          {/* Formulário de edição / criação */}
          {editing && (
            <AgentForm
              initial={editing}
              onSave={(data) => saveMutation.mutate(data)}
              onCancel={() => setEditing(null)}
            />
          )}

          {/* Lista de agentes */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Radio className="w-6 h-6 text-indigo-400 animate-pulse" />
            </div>
          ) : agents.length === 0 && !editing ? (
            <div className="flex flex-col items-center justify-center py-20 bg-slate-800/20 border border-gray-700/20 border-dashed rounded-2xl text-gray-600">
              <Bot className="w-12 h-12 mb-3 opacity-20" />
              <p className="font-bold">Nenhum agente configurado ainda.</p>
              <p className="text-sm mt-1">Crie seu primeiro agente de Follow-up.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {agents.map(agent => {
                const trig = TRIGGER_LABELS[agent.trigger_type];
                return (
                  <div key={agent.id}
                    className={cn(
                      "rounded-2xl border transition-all",
                      agent.is_active
                        ? "bg-slate-800/50 border-gray-700/40"
                        : "bg-slate-900/30 border-gray-800/40 opacity-60"
                    )}>
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        {/* Info principal */}
                        <div className="flex items-start gap-4 flex-1 min-w-0">
                          <div className={cn(
                            "p-3 rounded-xl border shrink-0",
                            agent.is_active
                              ? "bg-indigo-500/10 border-indigo-500/20"
                              : "bg-slate-700/40 border-gray-700/40"
                          )}>
                            <span className="text-xl">{trig?.icon || "🤖"}</span>
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-black text-white">{agent.name}</h3>
                              <Badge className={cn(
                                "text-[10px] border",
                                agent.is_active
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                  : "bg-gray-500/10 text-gray-500 border-gray-500/20"
                              )}>
                                {agent.is_active ? "● Ativo" : "○ Inativo"}
                              </Badge>
                              {agent.require_approval && (
                                <Badge className="text-[10px] border bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                                  ⏳ Requer Aprovação
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center gap-4 mt-2 flex-wrap">
                              <span className={cn("text-xs font-bold flex items-center gap-1", trig?.color || "text-gray-400")}>
                                <Clock className="w-3 h-3" />
                                {trig?.label}
                                {agent.trigger_type === "INACTIVITY" && ` — ${agent.trigger_hours}h sem resposta`}
                              </span>
                              <span className="text-xs text-gray-600 flex items-center gap-1">
                                <Zap className="w-3 h-3" />
                                {agent.max_attempts}x · {agent.interval_hours}h de intervalo
                              </span>
                              <span className="text-xs text-gray-600 flex items-center gap-1">
                                <Shield className="w-3 h-3" />
                                Silêncio: {agent.silence_after_reply_hours}h pós-resposta
                              </span>
                            </div>

                            <p className="text-xs text-gray-500 mt-2 line-clamp-1">
                              <span className="text-gray-600 font-bold">Objetivo:</span> {agent.message_objective}
                            </p>
                          </div>
                        </div>

                        {/* Ações */}
                        <div className="flex items-center gap-2 shrink-0">
                          <Switch
                            checked={agent.is_active}
                            onCheckedChange={v => toggleMutation.mutate({ id: agent.id, is_active: v })}
                          />
                          <button onClick={() => setPreviewAgent(previewAgent?.id === agent.id ? null : agent)}
                            className="p-2 rounded-lg text-gray-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditing({
                              id: agent.id, name: agent.name, trigger_type: agent.trigger_type,
                              trigger_hours: agent.trigger_hours, trigger_status: agent.trigger_status || "",
                              broker_personality: agent.broker_personality, message_objective: agent.message_objective,
                              max_attempts: agent.max_attempts, interval_hours: agent.interval_hours,
                              require_approval: agent.require_approval,
                              silence_after_reply_hours: agent.silence_after_reply_hours,
                              silence_after_broker_activity_hours: agent.silence_after_broker_activity_hours,
                              is_active: agent.is_active,
                            })}
                            className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-slate-700/60 transition-colors">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { if (confirm("Deletar este agente?")) deleteMutation.mutate(agent.id); }}
                            className="p-2 rounded-lg text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Preview expandido */}
                    {previewAgent?.id === agent.id && (
                      <div className="border-t border-gray-700/40 p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-slate-900/60 rounded-xl p-4 border border-gray-700/30">
                          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">
                            Personalidade
                          </p>
                          <p className="text-sm text-gray-400 leading-relaxed">{agent.broker_personality}</p>
                        </div>
                        <div className="bg-slate-900/60 rounded-xl p-4 border border-gray-700/30">
                          <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2">
                            Objetivo da Mensagem
                          </p>
                          <p className="text-sm text-gray-400 leading-relaxed">{agent.message_objective}</p>
                        </div>

                        {/* Como configurar no n8n */}
                        <div className="sm:col-span-2 bg-indigo-500/5 border border-indigo-500/15 rounded-xl p-4">
                          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <Settings className="w-3.5 h-3.5" /> Configuração n8n
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <ConfigItem label="Webhook URL" value="/webhook/ai-followup" mono />
                            <ConfigItem label="Agent ID" value={agent.id} mono />
                            <ConfigItem
                              label="Trigger"
                              value={`${agent.trigger_type} · ${agent.trigger_hours}h`}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Card explicativo do n8n */}
          {agents.length > 0 && !editing && (
            <div className="bg-slate-800/20 border border-gray-700/20 rounded-2xl p-6">
              <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-indigo-400" /> Como o sistema funciona
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                {[
                  { icon: "⏰", label: "Supabase", desc: "Detecta lead inativo pelo campo last_interaction_at" },
                  { icon: "📡", label: "Webhook n8n", desc: "Recebe o evento com dados do lead e do agente" },
                  { icon: "🤖", label: "Anthropic IA", desc: "Gera mensagem personalizada com a voz do corretor" },
                  { icon: "📱", label: "EvolutionAPI", desc: "Dispara no WhatsApp pela instância do corretor" },
                ].map(({ icon, label, desc }) => (
                  <div key={label} className="flex items-start gap-3 bg-slate-800/40 border border-gray-700/30 rounded-xl p-3">
                    <span className="text-xl shrink-0">{icon}</span>
                    <div>
                      <p className="text-xs font-black text-white">{label}</p>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── VIEW: DISPAROS ────────────────────────────────────────────────── */}
      {view === "dispatches" && (
        <div className="space-y-3">
          {dispatches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-slate-800/20 border border-gray-700/20 border-dashed rounded-2xl text-gray-600">
              <Send className="w-12 h-12 mb-3 opacity-20" />
              <p className="font-bold">Nenhum disparo registrado ainda.</p>
            </div>
          ) : (
            dispatches.map(dispatch => {
              const sc = STATUS_CONFIG[dispatch.status] || STATUS_CONFIG.PENDING;
              return (
                <div key={dispatch.id}
                  className="bg-slate-800/40 border border-gray-700/40 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="text-sm font-black text-white">
                          {(dispatch.leads as any)?.name || "Lead"}
                        </span>
                        <ChevronRight className="w-3 h-3 text-gray-600" />
                        <span className="text-xs text-gray-500">
                          {(dispatch.profiles as any)?.first_name} {(dispatch.profiles as any)?.last_name}
                        </span>
                        <Badge className={cn("text-[10px] border", sc.bg, sc.color)}>
                          {sc.label}
                        </Badge>
                        <span className="text-[10px] text-gray-600">
                          Tentativa {dispatch.attempt_number}
                        </span>
                      </div>

                      <div className="bg-slate-900/60 border border-gray-700/30 rounded-lg px-4 py-3 text-sm text-gray-300 leading-relaxed">
                        {dispatch.message_generated}
                      </div>

                      {dispatch.blocked_reason && (
                        <p className="text-xs text-rose-400 mt-2 flex items-center gap-1.5">
                          <Pause className="w-3 h-3" />
                          Bloqueado: {dispatch.blocked_reason}
                        </p>
                      )}

                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-[10px] text-gray-600">
                          Agente: {(dispatch.ai_agents as any)?.name}
                        </span>
                        <span className="text-[10px] text-gray-700">
                          {new Date(dispatch.created_at).toLocaleString("pt-BR")}
                        </span>
                      </div>
                    </div>

                    {dispatch.status === "PENDING" && (
                      <div className="flex flex-col gap-2 shrink-0">
                        <Button size="sm"
                          onClick={() => approveDispatch.mutate(dispatch.id)}
                          className="h-8 px-3 bg-emerald-600 hover:bg-emerald-500 text-xs font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Aprovar
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ── Helper ─────────────────────────────────────────────────────────────────────
function ConfigItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-gray-600 font-bold mb-1">{label}</p>
      <p className={cn(
        "text-xs text-indigo-300 bg-slate-900/60 px-2 py-1.5 rounded-lg border border-indigo-500/10 truncate",
        mono && "font-mono"
      )}>
        {value}
      </p>
    </div>
  );
}
