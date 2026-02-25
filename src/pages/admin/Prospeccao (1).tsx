import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import {
  Smartphone, Plus, Pencil, Trash2, Wifi, WifiOff, Clock,
  CheckCircle2, Users, Target, MessageSquare, Crown, X, Save,
  Flame, Upload, FileSpreadsheet, AlertTriangle, BookOpen,
  Layers, RefreshCw, Lightbulb, Play, Pause, BarChart2
} from "lucide-react";

interface ProspectInstance {
  id: string; name: string; phone: string; evolution_instance: string;
  status: string; daily_limit: number; sent_today: number; created_at: string;
}
interface ProspectLead {
  id: string; name: string; phone: string; source: string | null;
  interest: string | null; status: string; attempt_count: number;
  last_message_at: string | null; qualified_at: string | null;
  qualification_summary: string | null; created_at: string;
  campaign_id: string | null; dispatched_at: string | null;
}
interface ProspectCampaign {
  id: string; name: string; status: string;
  interval_minutes: number; max_attempts: number;
  instance_id: string | null; script_id: string | null;
  total_leads: number; sent_count: number; responded_count: number;
  created_at: string; started_at: string | null; finished_at: string | null;
}
interface DistributionQueue {
  id: string; name: string; accepts_reactivated: boolean;
  sla_minutes: number; broker_ids: string[];
}
interface Profile {
  id: string; first_name: string; last_name: string | null; role: string;
}
interface ProspectScript {
  id: string; name: string; description: string | null;
  is_active: boolean; created_at: string;
}
interface ScriptStep {
  id: string; script_id: string; step_number: number;
  objective: string; tone: string | null; qualification_criteria: string | null;
}

const INSTANCE_STATUS: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  ACTIVE:  { label: "Ativo",       color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", icon: Wifi    },
  WARMING: { label: "Aquecendo",   color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20",     icon: Flame   },
  BLOCKED: { label: "Bloqueado",   color: "text-rose-400",    bg: "bg-rose-500/10 border-rose-500/20",       icon: WifiOff },
  RESTING: { label: "Descansando", color: "text-gray-400",    bg: "bg-gray-500/10 border-gray-500/20",       icon: Clock   },
};
const CAMPAIGN_STATUS: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  PENDING:  { label: "Aguardando", color: "text-gray-400",    bg: "bg-gray-500/10 border-gray-500/20",       icon: Clock        },
  RUNNING:  { label: "Disparando", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", icon: Play         },
  PAUSED:   { label: "Pausada",    color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20",     icon: Pause        },
  FINISHED: { label: "Concluída",  color: "text-indigo-400",  bg: "bg-indigo-500/10 border-indigo-500/20",   icon: CheckCircle2 },
};
const PROSPECT_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  PROSPECTING:  { label: "Em Prospecção", color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20"       },
  QUALIFIED:    { label: "Qualificado",   color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  DISQUALIFIED: { label: "Desqualif.",    color: "text-gray-500",    bg: "bg-gray-500/10 border-gray-500/20"       },
  ENTERED_CRM:  { label: "No CRM",        color: "text-indigo-400",  bg: "bg-indigo-500/10 border-indigo-500/20"   },
};
const EMPTY_INSTANCE = { name: "", phone: "", evolution_instance: "", status: "WARMING", daily_limit: 30 };
const EMPTY_STEP = { step_number: 1, objective: "", tone: "", qualification_criteria: "" };

export function Prospeccao() {
  const qc = useQueryClient();
  const [view, setView] = useState<"instances"|"campaigns"|"prospects"|"scripts"|"queue">("instances");
  const [editingInstance, setEditingInstance] = useState<(typeof EMPTY_INSTANCE & { id?: string }) | null>(null);
  const [selectedScript, setSelectedScript] = useState<ProspectScript | null>(null);
  const [editingStep, setEditingStep] = useState<(typeof EMPTY_STEP & { id?: string; script_id?: string }) | null>(null);
  const [uploadData, setUploadData] = useState<any[]>([]);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [uploadScriptId, setUploadScriptId] = useState<string>("");
  const [uploadInstanceId, setUploadInstanceId] = useState<string>("");
  const [intervalMinutes, setIntervalMinutes] = useState<number>(60);
  const [maxAttempts, setMaxAttempts] = useState<number>(5);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<ProspectCampaign | null>(null);
  const [newScriptName, setNewScriptName] = useState("");
  const [newScriptDesc, setNewScriptDesc] = useState("");
  const [showNewScript, setShowNewScript] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: instances = [], isLoading: loadingInstances } = useQuery<ProspectInstance[]>({
    queryKey: ["prospect-instances"],
    queryFn: async () => { const { data } = await supabase.from("prospect_instances").select("*").order("created_at"); return data || []; },
  });
  const { data: campaigns = [], isLoading: loadingCampaigns } = useQuery<ProspectCampaign[]>({
    queryKey: ["prospect-campaigns"],
    queryFn: async () => { const { data } = await supabase.from("prospect_campaigns").select("*").order("created_at", { ascending: false }); return data || []; },
    refetchInterval: view === "campaigns" ? 15000 : false,
  });
  const { data: prospects = [] } = useQuery<ProspectLead[]>({
    queryKey: ["prospect-leads", selectedCampaign?.id],
    queryFn: async () => {
      let q = supabase.from("prospect_leads").select("*").order("created_at", { ascending: false }).limit(200);
      if (selectedCampaign) q = q.eq("campaign_id", selectedCampaign.id);
      const { data } = await q;
      return data || [];
    },
    enabled: view === "prospects",
  });
  const { data: queues = [] } = useQuery<DistributionQueue[]>({
    queryKey: ["distribution-queues"],
    queryFn: async () => { const { data } = await supabase.from("distribution_queues").select("*").order("name"); return data || []; },
    enabled: view === "queue",
  });
  const { data: brokers = [] } = useQuery<Profile[]>({
    queryKey: ["brokers-list"],
    queryFn: async () => { const { data } = await supabase.from("profiles").select("id, first_name, last_name, role").eq("role", "BROKER").order("first_name"); return data || []; },
    enabled: view === "queue",
  });
  const { data: scripts = [] } = useQuery<ProspectScript[]>({
    queryKey: ["prospect-scripts"],
    queryFn: async () => { const { data } = await supabase.from("prospect_scripts").select("*").order("created_at"); return data || []; },
    enabled: view === "scripts",
  });
  const { data: scriptsForUpload = [] } = useQuery<ProspectScript[]>({
    queryKey: ["prospect-scripts-upload"],
    queryFn: async () => { const { data } = await supabase.from("prospect_scripts").select("*").eq("is_active", true).order("name"); return data || []; },
  });
  const { data: instancesForUpload = [] } = useQuery<ProspectInstance[]>({
    queryKey: ["prospect-instances-upload"],
    queryFn: async () => { const { data } = await supabase.from("prospect_instances").select("*").order("name"); return data || []; },
  });
  const { data: steps = [] } = useQuery<ScriptStep[]>({
    queryKey: ["script-steps", selectedScript?.id],
    queryFn: async () => { const { data } = await supabase.from("prospect_script_steps").select("*").eq("script_id", selectedScript!.id).order("step_number"); return data || []; },
    enabled: !!selectedScript,
  });

  const saveInstance = useMutation({
    mutationFn: async (d: typeof EMPTY_INSTANCE & { id?: string }) => {
      const p = { name: d.name, phone: d.phone, evolution_instance: d.evolution_instance, status: d.status, daily_limit: d.daily_limit };
      if (d.id) await supabase.from("prospect_instances").update(p).eq("id", d.id);
      else await supabase.from("prospect_instances").insert({ ...p, sent_today: 0 });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["prospect-instances"] }); setEditingInstance(null); },
  });
  const deleteInstance = useMutation({
    mutationFn: async (id: string) => { await supabase.from("prospect_instances").delete().eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prospect-instances"] }),
  });
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => { await supabase.from("prospect_instances").update({ status }).eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prospect-instances"] }),
  });
  const updateCampaignStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const patch: any = { status };
      if (status === "RUNNING") patch.started_at = new Date().toISOString();
      if (status === "FINISHED") patch.finished_at = new Date().toISOString();
      await supabase.from("prospect_campaigns").update(patch).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prospect-campaigns"] }),
  });
  const deleteCampaign = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("prospect_leads").update({ campaign_id: null }).eq("campaign_id", id);
      await supabase.from("prospect_campaigns").delete().eq("id", id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["prospect-campaigns"] }); qc.invalidateQueries({ queryKey: ["prospect-leads"] }); },
  });
  const setReactivationQueue = useMutation({
    mutationFn: async ({ queueId, sla }: { queueId: string; sla: number }) => {
      await supabase.from("distribution_queues").update({ accepts_reactivated: false }).neq("id", "none");
      await supabase.from("distribution_queues").update({ accepts_reactivated: true, sla_minutes: sla }).eq("id", queueId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["distribution-queues"] }),
  });
  const toggleBroker = useMutation({
    mutationFn: async ({ queueId, brokerId, currentIds }: { queueId: string; brokerId: string; currentIds: string[] }) => {
      const newIds = currentIds.includes(brokerId) ? currentIds.filter(id => id !== brokerId) : [...currentIds, brokerId];
      await supabase.from("distribution_queues").update({ broker_ids: newIds }).eq("id", queueId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["distribution-queues"] }),
  });
  const createScript = useMutation({
    mutationFn: async () => {
      const { data } = await supabase.from("prospect_scripts").insert({ name: newScriptName, description: newScriptDesc }).select().single();
      return data;
    },
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ["prospect-scripts"] }); setSelectedScript(data); setShowNewScript(false); setNewScriptName(""); setNewScriptDesc(""); },
  });
  const saveStep = useMutation({
    mutationFn: async (d: typeof EMPTY_STEP & { id?: string; script_id?: string }) => {
      const p = { script_id: d.script_id || selectedScript?.id, step_number: d.step_number, objective: d.objective, tone: d.tone || null, qualification_criteria: d.qualification_criteria || null };
      if (d.id) await supabase.from("prospect_script_steps").update(p).eq("id", d.id);
      else await supabase.from("prospect_script_steps").insert(p);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["script-steps", selectedScript?.id] }); setEditingStep(null); },
  });
  const deleteStep = useMutation({
    mutationFn: async (id: string) => { await supabase.from("prospect_script_steps").delete().eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["script-steps", selectedScript?.id] }),
  });
  const qualifyProspect = useMutation({
    mutationFn: async (prospect: ProspectLead) => {
      const { data: queue } = await supabase.from("distribution_queues").select("*").eq("accepts_reactivated", true).single();
      if (!queue?.broker_ids?.length) throw new Error("Nenhuma fila configurada");
      const idx = (queue.last_assigned_index || 0) % queue.broker_ids.length;
      const brokerId = queue.broker_ids[idx];
      const slaDeadline = new Date(Date.now() + (queue.sla_minutes || 15) * 60000).toISOString();
      const { data: newLead } = await supabase.from("leads").insert({
        name: prospect.name, phone: prospect.phone, status: "REATIVADO",
        broker_id: brokerId, tag: prospect.interest || null,
        reactivated_at: new Date().toISOString(),
        qualification_summary: prospect.qualification_summary,
        sla_deadline: slaDeadline, last_interaction_at: new Date().toISOString(),
      }).select().single();
      await supabase.from("prospect_leads").update({ status: "ENTERED_CRM", crm_lead_id: newLead.id, qualified_at: new Date().toISOString() }).eq("id", prospect.id);
      await supabase.from("distribution_queues").update({ last_assigned_index: idx + 1 }).eq("id", queue.id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["prospect-leads"] }); qc.invalidateQueries({ queryKey: ["distribution-queues"] }); },
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const errors: string[] = [];
        const valid: any[] = [];
        const normalize = (s: string) => s.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const getField = (row: any, ...keys: string[]) => {
          const rowNorm: Record<string, any> = {};
          Object.keys(row).forEach(k => { rowNorm[normalize(k)] = row[k]; });
          for (const k of keys) { if (rowNorm[normalize(k)] !== undefined) return rowNorm[normalize(k)]; }
          return "";
        };
        rows.forEach((row, i) => {
          const name = getField(row, "nome", "name").toString().trim();
          const rawPhone = getField(row, "telefone", "phone", "fone").toString();
          const phone = rawPhone.replace(/\D/g, "");
          if (!name) { errors.push(`Linha ${i + 2}: nome obrigatório`); return; }
          if (!phone || phone.length < 10) { errors.push(`Linha ${i + 2}: telefone inválido (${rawPhone || "vazio"})`); return; }
          valid.push({
            name,
            phone: phone.startsWith("55") ? phone : "55" + phone,
            interest: getField(row, "interesse", "interest").toString().trim() || null,
            source: getField(row, "origem", "source").toString().trim() || null,
          });
        });
        setUploadData(valid);
        setUploadErrors(errors);
      } catch {
        setUploadErrors(["Erro ao ler o arquivo. Verifique se é um .xlsx válido."]);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleCreateCampaign = async () => {
    if (!uploadData.length || !campaignName || !uploadInstanceId) return;
    setUploading(true);
    try {
      const { data: campaign, error } = await supabase.from("prospect_campaigns").insert({
        name: campaignName, status: "PENDING",
        interval_minutes: intervalMinutes, max_attempts: maxAttempts,
        instance_id: uploadInstanceId || null, script_id: uploadScriptId || null,
        total_leads: uploadData.length, sent_count: 0, responded_count: 0,
      }).select().single();
      if (error) throw error;
      await supabase.from("prospect_leads").insert(
        uploadData.map(d => ({
          ...d, status: "PROSPECTING", attempt_count: 0, current_step: 1,
          campaign_id: campaign.id, instance_id: uploadInstanceId || null,
          script_id: uploadScriptId || null, dispatched_at: null,
          next_contact_at: new Date().toISOString(),
        }))
      );
      qc.invalidateQueries({ queryKey: ["prospect-campaigns"] });
      qc.invalidateQueries({ queryKey: ["prospect-leads"] });
      setUploadData([]); setUploadErrors([]);
      setCampaignName(""); setUploadScriptId(""); setUploadInstanceId("");
      setIntervalMinutes(60); setMaxAttempts(5);
      if (fileRef.current) fileRef.current.value = "";
      setShowNewCampaign(false);
    } finally { setUploading(false); }
  };

  const activeInstances = instances.filter(i => i.status === "ACTIVE").length;
  const totalSentToday = instances.reduce((a, i) => a + (i.sent_today || 0), 0);
  const runningCampaigns = campaigns.filter(c => c.status === "RUNNING").length;
  const totalLeadsCampaigns = campaigns.filter(c => c.status === "RUNNING").reduce((a, c) => a + ((c.total_leads || 0) - (c.sent_count || 0)), 0);
  const activeQueue = queues.find(q => q.accepts_reactivated);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
            <div className="p-2 bg-emerald-600/20 border border-emerald-500/20 rounded-xl">
              <Target className="w-5 h-5 text-emerald-400" />
            </div>
            Prospecção
          </h2>
          <p className="text-sm text-gray-500 mt-1 ml-14">Instâncias, campanhas, roteiros e fila de reativação</p>
        </div>
        {view === "instances" && (
          <Button onClick={() => setEditingInstance({ ...EMPTY_INSTANCE })} className="bg-emerald-600 hover:bg-emerald-500 font-bold">
            <Plus className="w-4 h-4 mr-2" /> Nova Instância
          </Button>
        )}
        {view === "campaigns" && (
          <Button onClick={() => setShowNewCampaign(true)} className="bg-emerald-600 hover:bg-emerald-500 font-bold">
            <Plus className="w-4 h-4 mr-2" /> Nova Campanha
          </Button>
        )}
        {view === "scripts" && (
          <Button onClick={() => setShowNewScript(true)} className="bg-indigo-600 hover:bg-indigo-500 font-bold">
            <Plus className="w-4 h-4 mr-2" /> Novo Roteiro
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Instâncias Ativas", value: activeInstances,      icon: Wifi,          color: "text-emerald-400" },
          { label: "Disparos Hoje",     value: totalSentToday,       icon: MessageSquare, color: "text-blue-400"    },
          { label: "Campanhas Ativas",  value: runningCampaigns,     icon: Play,          color: "text-amber-400"   },
          { label: "Leads na Fila",     value: totalLeadsCampaigns,  icon: Users,         color: "text-indigo-400"  },
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
      <div className="flex flex-wrap gap-1 bg-slate-800/60 border border-gray-700/40 rounded-xl p-1 w-fit">
        {[
          { key: "instances",  label: "Instâncias", icon: Smartphone  },
          { key: "campaigns",  label: "Campanhas",  icon: BarChart2   },
          { key: "prospects",  label: "Prospects",  icon: Users       },
          { key: "scripts",    label: "Roteiros",   icon: BookOpen    },
          { key: "queue",      label: "Fila Reativ.",icon: Crown      },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setView(key as any)}
            className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
              view === key ? "bg-slate-700 text-white shadow" : "text-gray-500 hover:text-gray-300")}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {/* ── INSTÂNCIAS ─────────────────────────────────────────────────────────── */}
      {view === "instances" && (
        <div className="space-y-4">
          {editingInstance && (
            <div className="bg-slate-800/60 border border-gray-700/50 rounded-2xl p-6 space-y-4">
              <h3 className="font-black text-white">{editingInstance.id ? "Editar Instância" : "Nova Instância"}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { key: "name",               label: "Nome",               placeholder: "Prospecção 01"   },
                  { key: "phone",              label: "Número",             placeholder: "5511999990001"   },
                  { key: "evolution_instance", label: "Instância Evolution", placeholder: "prospeccao-01" },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">{label}</label>
                    <input value={(editingInstance as any)[key]} onChange={e => setEditingInstance(f => ({ ...f!, [key]: e.target.value }))}
                      placeholder={placeholder} className="w-full bg-slate-900 border border-gray-700/60 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-emerald-500/60 transition-colors" />
                  </div>
                ))}
                <div>
                  <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">Status</label>
                  <select value={editingInstance.status} onChange={e => setEditingInstance(f => ({ ...f!, status: e.target.value }))}
                    className="w-full bg-slate-900 border border-gray-700/60 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500/60">
                    {Object.entries(INSTANCE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">Limite Diário</label>
                  <input type="number" min={5} max={200} value={editingInstance.daily_limit}
                    onChange={e => setEditingInstance(f => ({ ...f!, daily_limit: Number(e.target.value) }))}
                    className="w-full bg-slate-900 border border-gray-700/60 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500/60" />
                  <p className="text-[11px] text-gray-600 mt-1.5">💡 Instâncias novas: comece com 15-20. Aumente 10/semana.</p>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-gray-700/40">
                <Button variant="ghost" onClick={() => setEditingInstance(null)} className="text-gray-400 border border-gray-700/40"><X className="w-4 h-4 mr-2" />Cancelar</Button>
                <Button onClick={() => saveInstance.mutate(editingInstance)} disabled={!editingInstance.name || !editingInstance.phone || !editingInstance.evolution_instance} className="bg-emerald-600 hover:bg-emerald-500 font-bold"><Save className="w-4 h-4 mr-2" />Salvar</Button>
              </div>
            </div>
          )}
          {loadingInstances ? (
            <div className="flex items-center justify-center py-20"><RefreshCw className="w-5 h-5 text-emerald-400 animate-spin" /></div>
          ) : instances.length === 0 && !editingInstance ? (
            <div className="flex flex-col items-center justify-center py-20 bg-slate-800/20 border border-gray-700/20 border-dashed rounded-2xl text-gray-600">
              <Smartphone className="w-12 h-12 mb-3 opacity-20" /><p className="font-bold">Nenhuma instância cadastrada.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {instances.map(inst => {
                const sc = INSTANCE_STATUS[inst.status] || INSTANCE_STATUS.RESTING;
                const StatusIcon = sc.icon;
                const pct = inst.daily_limit > 0 ? Math.round((inst.sent_today / inst.daily_limit) * 100) : 0;
                return (
                  <div key={inst.id} className="bg-slate-800/40 border border-gray-700/40 rounded-2xl p-5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className={cn("p-3 rounded-xl border shrink-0", sc.bg)}><StatusIcon className={cn("w-5 h-5", sc.color)} /></div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-white">{inst.name}</span>
                            <Badge className={cn("text-[10px] border", sc.bg, sc.color)}>{sc.label}</Badge>
                          </div>
                          <div className="flex items-center gap-4 mt-1 flex-wrap">
                            <span className="text-xs text-gray-500 font-mono">{inst.phone}</span>
                            <span className="text-xs text-gray-600">Instância: <span className="text-gray-400">{inst.evolution_instance}</span></span>
                          </div>
                          <div className="mt-3 flex items-center gap-3">
                            <div className="flex-1 bg-slate-700/60 rounded-full h-1.5 overflow-hidden">
                              <div className={cn("h-full rounded-full transition-all", pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            <span className="text-[11px] text-gray-500 shrink-0">{inst.sent_today}/{inst.daily_limit} hoje</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <select value={inst.status} onChange={e => updateStatus.mutate({ id: inst.id, status: e.target.value })}
                          className="bg-slate-700/60 border border-gray-600/40 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none">
                          {Object.entries(INSTANCE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                        <button onClick={() => setEditingInstance({ id: inst.id, name: inst.name, phone: inst.phone, evolution_instance: inst.evolution_instance, status: inst.status, daily_limit: inst.daily_limit })}
                          className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-slate-700/60 transition-colors"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => { if (confirm("Deletar esta instância?")) deleteInstance.mutate(inst.id); }}
                          className="p-2 rounded-lg text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── CAMPANHAS ──────────────────────────────────────────────────────────── */}
      {view === "campaigns" && (
        <div className="space-y-5">
          {showNewCampaign && (
            <div className="bg-slate-800/60 border border-gray-700/50 rounded-2xl p-6 space-y-5">
              <h3 className="font-black text-white flex items-center gap-2"><BarChart2 className="w-4 h-4 text-emerald-400" />Nova Campanha</h3>
              <div>
                <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">Nome da Campanha *</label>
                <input value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="Ex: Leads Março — Zona Sul"
                  className="w-full bg-slate-900 border border-gray-700/60 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-emerald-500/60" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">Instância de Envio *</label>
                  <select value={uploadInstanceId} onChange={e => setUploadInstanceId(e.target.value)}
                    className="w-full bg-slate-900 border border-gray-700/60 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500/60">
                    <option value="">Selecione a instância...</option>
                    {instancesForUpload.map(i => <option key={i.id} value={i.id}>{i.name} — {i.status}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">Roteiro</label>
                  <select value={uploadScriptId} onChange={e => setUploadScriptId(e.target.value)}
                    className="w-full bg-slate-900 border border-gray-700/60 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500/60">
                    <option value="">Sem roteiro específico</option>
                    {scriptsForUpload.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">Intervalo entre Disparos (min)</label>
                  <input type="number" min={5} max={1440} value={intervalMinutes} onChange={e => setIntervalMinutes(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-gray-700/60 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500/60" />
                  <p className="text-[11px] text-gray-600 mt-1.5">💡 60 min = 1h entre cada envio</p>
                </div>
                <div>
                  <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">Máx. Tentativas por Lead</label>
                  <input type="number" min={1} max={10} value={maxAttempts} onChange={e => setMaxAttempts(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-gray-700/60 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500/60" />
                </div>
              </div>
              <div>
                <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">Planilha de Leads *</label>
                <div onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-gray-700/60 hover:border-emerald-500/40 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-colors group">
                  <Upload className="w-8 h-8 text-gray-600 group-hover:text-emerald-500 transition-colors mb-2" />
                  <p className="font-bold text-gray-400 group-hover:text-white transition-colors text-sm">
                    {uploadData.length > 0 ? `✓ ${uploadData.length} leads carregados` : "Clique para selecionar a planilha"}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">Colunas: nome · telefone · interesse · origem</p>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
                </div>
              </div>
              {uploadErrors.length > 0 && (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 space-y-1">
                  <p className="text-xs font-black text-rose-400 flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5" />{uploadErrors.length} linha(s) com problema</p>
                  {uploadErrors.slice(0, 5).map((e, i) => <p key={i} className="text-xs text-rose-300/70">{e}</p>)}
                  {uploadErrors.length > 5 && <p className="text-xs text-rose-400">... e mais {uploadErrors.length - 5} erros</p>}
                </div>
              )}
              {uploadData.length > 0 && (
                <div className="bg-slate-900/60 border border-gray-700/30 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-gray-700/40">
                      {["Nome", "Telefone", "Interesse", "Origem"].map(h => <th key={h} className="px-4 py-2 text-left text-gray-500 font-black uppercase tracking-wider">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {uploadData.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-b border-gray-800/40">
                          <td className="px-4 py-2 text-white font-bold">{row.name}</td>
                          <td className="px-4 py-2 text-gray-400 font-mono">{row.phone}</td>
                          <td className="px-4 py-2 text-gray-500">{row.interest || "—"}</td>
                          <td className="px-4 py-2 text-gray-500">{row.source || "—"}</td>
                        </tr>
                      ))}
                      {uploadData.length > 5 && <tr><td colSpan={4} className="px-4 py-2 text-center text-gray-600">... e mais {uploadData.length - 5} leads</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2 border-t border-gray-700/40">
                <Button variant="ghost" onClick={() => { setShowNewCampaign(false); setUploadData([]); setUploadErrors([]); if (fileRef.current) fileRef.current.value = ""; }}
                  className="text-gray-400 border border-gray-700/40"><X className="w-4 h-4 mr-2" />Cancelar</Button>
                <Button onClick={handleCreateCampaign} disabled={uploading || !campaignName || !uploadInstanceId || uploadData.length === 0}
                  className="bg-emerald-600 hover:bg-emerald-500 font-bold disabled:opacity-40">
                  {uploading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  {uploading ? "Criando..." : `Criar Campanha (${uploadData.length} leads)`}
                </Button>
              </div>
            </div>
          )}

          {loadingCampaigns ? (
            <div className="flex items-center justify-center py-20"><RefreshCw className="w-5 h-5 text-emerald-400 animate-spin" /></div>
          ) : campaigns.length === 0 && !showNewCampaign ? (
            <div className="flex flex-col items-center justify-center py-20 bg-slate-800/20 border border-gray-700/20 border-dashed rounded-2xl text-gray-600">
              <BarChart2 className="w-12 h-12 mb-3 opacity-20" />
              <p className="font-bold">Nenhuma campanha criada.</p>
              <p className="text-sm mt-1">Clique em "Nova Campanha" e importe sua planilha.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map(camp => {
                const sc = CAMPAIGN_STATUS[camp.status] || CAMPAIGN_STATUS.PENDING;
                const StatusIcon = sc.icon;
                const pct = camp.total_leads > 0 ? Math.round((camp.sent_count / camp.total_leads) * 100) : 0;
                const inst = instancesForUpload.find(i => i.id === camp.instance_id);
                return (
                  <div key={camp.id} className="bg-slate-800/40 border border-gray-700/40 rounded-2xl p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        <div className={cn("p-3 rounded-xl border shrink-0", sc.bg)}><StatusIcon className={cn("w-5 h-5", sc.color)} /></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-black text-white">{camp.name}</span>
                            <Badge className={cn("text-[10px] border", sc.bg, sc.color)}>{sc.label}</Badge>
                          </div>
                          <div className="flex items-center gap-4 flex-wrap text-xs text-gray-500 mb-3">
                            {inst && <span>Instância: <span className="text-gray-400">{inst.name}</span></span>}
                            <span>Intervalo: <span className="text-gray-400">{camp.interval_minutes}min</span></span>
                            <span>Tentativas: <span className="text-gray-400">{camp.max_attempts}</span></span>
                            <span>Responderam: <span className="text-emerald-400 font-bold">{camp.responded_count}</span></span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 bg-slate-700/60 rounded-full h-2 overflow-hidden">
                              <div className={cn("h-full rounded-full transition-all", pct >= 100 ? "bg-indigo-500" : "bg-emerald-500")} style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            <span className="text-[11px] text-gray-500 shrink-0">{camp.sent_count}/{camp.total_leads} enviados ({pct}%)</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {camp.status === "PENDING" && (
                          <Button size="sm" onClick={() => updateCampaignStatus.mutate({ id: camp.id, status: "RUNNING" })}
                            className="h-8 px-3 bg-emerald-600 hover:bg-emerald-500 text-xs font-bold">
                            <Play className="w-3.5 h-3.5 mr-1" />Iniciar
                          </Button>
                        )}
                        {camp.status === "RUNNING" && (
                          <Button size="sm" onClick={() => updateCampaignStatus.mutate({ id: camp.id, status: "PAUSED" })}
                            className="h-8 px-3 bg-amber-600 hover:bg-amber-500 text-xs font-bold">
                            <Pause className="w-3.5 h-3.5 mr-1" />Pausar
                          </Button>
                        )}
                        {camp.status === "PAUSED" && (
                          <Button size="sm" onClick={() => updateCampaignStatus.mutate({ id: camp.id, status: "RUNNING" })}
                            className="h-8 px-3 bg-emerald-600 hover:bg-emerald-500 text-xs font-bold">
                            <Play className="w-3.5 h-3.5 mr-1" />Retomar
                          </Button>
                        )}
                        <button onClick={() => { setSelectedCampaign(camp); setView("prospects"); }}
                          className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-slate-700/60 transition-colors" title="Ver leads">
                          <Users className="w-4 h-4" />
                        </button>
                        <button onClick={() => { if (confirm(`Deletar campanha "${camp.name}"? Os leads serão desvinculados.`)) deleteCampaign.mutate(camp.id); }}
                          className="p-2 rounded-lg text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── PROSPECTS ──────────────────────────────────────────────────────────── */}
      {view === "prospects" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <select value={selectedCampaign?.id || ""} onChange={e => {
              const c = campaigns.find(c => c.id === e.target.value) || null;
              setSelectedCampaign(c);
              qc.invalidateQueries({ queryKey: ["prospect-leads", c?.id] });
            }} className="bg-slate-800 border border-gray-700/60 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500/60">
              <option value="">Todos os leads</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {selectedCampaign && (
              <button onClick={() => { setSelectedCampaign(null); qc.invalidateQueries({ queryKey: ["prospect-leads", undefined] }); }}
                className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1">
                <X className="w-3 h-3" />Limpar filtro
              </button>
            )}
          </div>
          {prospects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-slate-800/20 border border-gray-700/20 border-dashed rounded-2xl text-gray-600">
              <Users className="w-12 h-12 mb-3 opacity-20" /><p className="font-bold">Nenhum prospect.</p>
              <p className="text-sm mt-1">Crie uma campanha na aba Campanhas.</p>
            </div>
          ) : prospects.map(p => {
            const sc = PROSPECT_STATUS[p.status] || PROSPECT_STATUS.PROSPECTING;
            return (
              <div key={p.id} className="bg-slate-800/40 border border-gray-700/40 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-black text-white">{p.name}</span>
                      <Badge className={cn("text-[10px] border", sc.bg, sc.color)}>{sc.label}</Badge>
                      {p.dispatched_at
                        ? <span className="text-xs text-emerald-600">✓ Disparado</span>
                        : <span className="text-xs text-gray-600">Aguardando</span>}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs text-gray-500 font-mono">{p.phone}</span>
                      {p.interest && <span className="text-xs text-gray-500">Interesse: <span className="text-gray-400">{p.interest}</span></span>}
                    </div>
                    {p.qualification_summary && (
                      <p className="text-xs text-gray-500 mt-2 bg-slate-900/40 rounded-lg px-3 py-2 border border-gray-700/30">{p.qualification_summary}</p>
                    )}
                  </div>
                  {p.status === "QUALIFIED" && (
                    <Button size="sm" onClick={() => qualifyProspect.mutate(p)} className="h-8 px-3 bg-indigo-600 hover:bg-indigo-500 text-xs font-bold shrink-0">
                      <Crown className="w-3.5 h-3.5 mr-1" />Enviar ao CRM
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── ROTEIROS ───────────────────────────────────────────────────────────── */}
      {view === "scripts" && (
        <div className="space-y-4">
          {showNewScript && (
            <div className="bg-slate-800/60 border border-gray-700/50 rounded-2xl p-6 space-y-4">
              <h3 className="font-black text-white">Novo Roteiro</h3>
              <div>
                <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">Nome *</label>
                <input value={newScriptName} onChange={e => setNewScriptName(e.target.value)} placeholder="Ex: Roteiro Apartamentos"
                  className="w-full bg-slate-900 border border-gray-700/60 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500/60" />
              </div>
              <div>
                <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">Descrição</label>
                <textarea value={newScriptDesc} onChange={e => setNewScriptDesc(e.target.value)} rows={2} placeholder="Opcional..."
                  className="w-full bg-slate-900 border border-gray-700/60 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500/60 resize-none" />
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-gray-700/40">
                <Button variant="ghost" onClick={() => setShowNewScript(false)} className="text-gray-400 border border-gray-700/40"><X className="w-4 h-4 mr-2" />Cancelar</Button>
                <Button onClick={() => createScript.mutate()} disabled={!newScriptName} className="bg-indigo-600 hover:bg-indigo-500 font-bold"><Save className="w-4 h-4 mr-2" />Criar Roteiro</Button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {scripts.map(script => (
              <button key={script.id} onClick={() => setSelectedScript(script === selectedScript ? null : script)}
                className={cn("text-left rounded-2xl border p-4 transition-all", selectedScript?.id === script.id ? "bg-indigo-500/10 border-indigo-500/30" : "bg-slate-800/40 border-gray-700/40 hover:border-gray-600")}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-black text-white text-sm">{script.name}</p>
                    {script.description && <p className="text-xs text-gray-500 mt-1">{script.description}</p>}
                  </div>
                  <Badge className={cn("text-[10px] shrink-0", script.is_active ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-gray-500/10 text-gray-500 border-gray-500/20")}>
                    {script.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
              </button>
            ))}
            {scripts.length === 0 && !showNewScript && (
              <div className="col-span-full flex flex-col items-center justify-center py-16 bg-slate-800/20 border border-gray-700/20 border-dashed rounded-2xl text-gray-600">
                <BookOpen className="w-10 h-10 mb-3 opacity-20" /><p className="font-bold">Nenhum roteiro criado ainda.</p>
              </div>
            )}
          </div>
          {selectedScript && (
            <>
              <div className="flex items-center justify-between pt-2">
                <p className="text-sm font-black text-white flex items-center gap-2"><Layers className="w-4 h-4 text-indigo-400" />Etapas — {selectedScript.name}</p>
                <Button size="sm" onClick={() => setEditingStep({ ...EMPTY_STEP, step_number: steps.length + 1, script_id: selectedScript.id })}
                  className="h-8 px-3 bg-indigo-600 hover:bg-indigo-500 text-xs font-bold"><Plus className="w-3.5 h-3.5 mr-1" />Nova Etapa</Button>
              </div>
              {editingStep && (
                <div className="bg-slate-800/60 border border-gray-700/50 rounded-2xl p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">Nº da Etapa</label>
                      <input type="number" min={1} value={editingStep.step_number} onChange={e => setEditingStep(f => ({ ...f!, step_number: Number(e.target.value) }))}
                        className="w-full bg-slate-900 border border-gray-700/60 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500/60" />
                    </div>
                    <div>
                      <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">Tom</label>
                      <input value={editingStep.tone} onChange={e => setEditingStep(f => ({ ...f!, tone: e.target.value }))} placeholder="Ex: Casual, Curioso, Urgente"
                        className="w-full bg-slate-900 border border-gray-700/60 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500/60" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">Objetivo *</label>
                    <textarea rows={3} value={editingStep.objective} onChange={e => setEditingStep(f => ({ ...f!, objective: e.target.value }))} placeholder="O que o agente deve conseguir nesta etapa?"
                      className="w-full bg-slate-900 border border-gray-700/60 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500/60 resize-none" />
                  </div>
                  <div>
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">
                      <Lightbulb className="w-3 h-3 inline mr-1 text-amber-400" />Critério para Avançar
                    </label>
                    <input value={editingStep.qualification_criteria || ""} onChange={e => setEditingStep(f => ({ ...f!, qualification_criteria: e.target.value }))}
                      placeholder="Ex: Lead confirmou interesse em visitar"
                      className="w-full bg-slate-900 border border-gray-700/60 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500/60" />
                  </div>
                  <div className="flex justify-end gap-3 pt-2 border-t border-gray-700/40">
                    <Button variant="ghost" onClick={() => setEditingStep(null)} className="text-gray-400 border border-gray-700/40"><X className="w-4 h-4 mr-2" />Cancelar</Button>
                    <Button onClick={() => saveStep.mutate(editingStep)} disabled={!editingStep.objective} className="bg-indigo-600 hover:bg-indigo-500 font-bold"><Save className="w-4 h-4 mr-2" />Salvar Etapa</Button>
                  </div>
                </div>
              )}
              {steps.length === 0 && !editingStep ? (
                <div className="text-center py-12 bg-slate-800/20 border border-gray-700/20 border-dashed rounded-2xl text-gray-600">
                  <Layers className="w-8 h-8 mx-auto mb-2 opacity-20" /><p className="font-bold text-sm">Nenhuma etapa ainda.</p>
                </div>
              ) : steps.map(step => (
                <div key={step.id} className="bg-slate-800/40 border border-gray-700/40 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg shrink-0 min-w-[36px] text-center">
                        <span className="text-indigo-400 font-black text-sm">{step.step_number}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">{step.objective}</p>
                        {step.tone && <p className="text-xs text-gray-600 mt-2">Tom: <span className="text-gray-500">{step.tone}</span></p>}
                        {step.qualification_criteria && <p className="text-xs text-emerald-600 mt-1">✓ Avança quando: <span className="text-emerald-500/80">{step.qualification_criteria}</span></p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setEditingStep({ id: step.id, script_id: step.script_id, step_number: step.step_number, objective: step.objective, tone: step.tone || "", qualification_criteria: step.qualification_criteria || "" })}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-slate-700/60 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => { if (confirm("Deletar etapa?")) deleteStep.mutate(step.id); }}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── FILA DE REATIVAÇÃO ─────────────────────────────────────────────────── */}
      {view === "queue" && (
        <div className="space-y-4">
          {activeQueue && (
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <Crown className="w-5 h-5 text-indigo-400" />
                <div>
                  <p className="font-black text-white">Fila Ativa: {activeQueue.name}</p>
                  <p className="text-xs text-gray-500">SLA de {activeQueue.sla_minutes} min · {activeQueue.broker_ids?.length || 0} corretores</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {(activeQueue.broker_ids || []).map(bid => {
                  const b = brokers.find(br => br.id === bid);
                  return b ? <span key={bid} className="px-3 py-1 bg-indigo-500/20 border border-indigo-500/20 rounded-full text-xs font-bold text-indigo-300">{b.first_name} {b.last_name || ""}</span> : null;
                })}
              </div>
            </div>
          )}
          <div className="space-y-3">
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Escolher Fila</p>
            {queues.map(queue => (
              <div key={queue.id} className={cn("rounded-2xl border p-5 transition-all", queue.accepts_reactivated ? "bg-indigo-500/10 border-indigo-500/30" : "bg-slate-800/40 border-gray-700/40")}>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-white">{queue.name}</span>
                      {queue.accepts_reactivated && <Badge className="text-[10px] border bg-indigo-500/10 text-indigo-400 border-indigo-500/20">● Ativa</Badge>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{queue.broker_ids?.length || 0} corretores · SLA {queue.sla_minutes}min</p>
                  </div>
                  {!queue.accepts_reactivated && (
                    <Button size="sm" onClick={() => setReactivationQueue.mutate({ queueId: queue.id, sla: queue.sla_minutes || 15 })}
                      className="h-8 px-3 bg-slate-700 hover:bg-indigo-600 text-xs font-bold border border-gray-600/40 hover:border-indigo-500/40 transition-all">
                      Ativar esta fila
                    </Button>
                  )}
                </div>
                <div className="mb-4">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block">SLA — minutos para atender</label>
                  <div className="flex items-center gap-3">
                    <input type="number" min={5} max={120} defaultValue={queue.sla_minutes || 15}
                      onBlur={async e => { await supabase.from("distribution_queues").update({ sla_minutes: Number(e.target.value) }).eq("id", queue.id); qc.invalidateQueries({ queryKey: ["distribution-queues"] }); }}
                      className="w-20 bg-slate-900 border border-gray-700/60 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500/60" />
                    <span className="text-xs text-gray-500">minutos antes de redistribuir</span>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Corretores nesta fila</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {brokers.map(broker => {
                      const inQueue = (queue.broker_ids || []).includes(broker.id);
                      return (
                        <button key={broker.id} onClick={() => toggleBroker.mutate({ queueId: queue.id, brokerId: broker.id, currentIds: queue.broker_ids || [] })}
                          className={cn("flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-bold transition-all text-left",
                            inQueue ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-slate-800/60 border-gray-700/40 text-gray-500 hover:text-gray-300 hover:border-gray-600")}>
                          <div className={cn("w-2 h-2 rounded-full shrink-0", inQueue ? "bg-emerald-400" : "bg-gray-600")} />
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
                <Users className="w-10 h-10 mb-3 opacity-20" /><p className="font-bold">Nenhuma fila criada ainda.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
