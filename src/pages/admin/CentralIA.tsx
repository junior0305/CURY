import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  Brain, Shield, Bot, Plus, Trash2, ChevronUp, ChevronDown,
  RefreshCw, Play, Save, DollarSign, Clock, Zap,
  CheckCircle2, XCircle, AlertTriangle, SkipForward, Settings2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type CentralTab = "cerebro" | "sentinela" | "coach";

interface CerebroRun {
  id: string;
  ran_at: string;
  status: string;
  processed: number;
  rescheduled: number;
  cancelled: number;
  skipped: number;
  duration_ms: number | null;
}

interface SentinelaConfig {
  id?: string;
  is_enabled: boolean;
  provider: string;
  model_name: string;
  max_tokens: number;
  monthly_budget_usd: number;
  monthly_spent_usd: number;
  window_start_brt: string;
  window_end_brt: string;
  stale_threshold_h: number;
  max_messages_session: number;
  default_profile_id: string | null;
}

interface ProfileMapRow {
  id?: string;
  match_field: "tag" | "source";
  match_value: string;
  profile_id: string;
  priority: number;
}

interface AIProfile { id: string; name: string; }

interface LLMConfig {
  id: string;
  provider: "anthropic" | "openai" | "gemini";
  model_name: string;
  max_tokens: number;
  is_active: boolean;
  priority: number;
}

interface QueueStats { pending: number; processing: number; completed: number; failed: number; skipped: number; }

interface RecentAnalysis {
  id: string;
  broker_id: string;
  broker_name: string;
  quality_score: number | null;
  severity: string | null;
  total_leads_analyzed: number;
  created_at: string;
  summary: string;
}

// ── Constantes ────────────────────────────────────────────────────────────────

const LLM_PROVIDERS = [
  { value: "anthropic", label: "Anthropic (Claude)", color: "text-orange-400",
    models: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-6"] },
  { value: "openai",    label: "OpenAI (GPT)",       color: "text-green-400",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"] },
  { value: "gemini",    label: "Google (Gemini)",    color: "text-blue-400",
    models: ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"] },
];

const SEVERITY_COLORS: Record<string, string> = {
  low:    "bg-green-500/20 text-green-400 border-green-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  high:   "bg-red-500/20 text-red-400 border-red-500/30",
};

const DEFAULT_SENTINELA: SentinelaConfig = {
  is_enabled: false, provider: "gemini", model_name: "gemini-2.0-flash",
  max_tokens: 300, monthly_budget_usd: 10, monthly_spent_usd: 0,
  window_start_brt: "18:00", window_end_brt: "21:30",
  stale_threshold_h: 48, max_messages_session: 6, default_profile_id: null,
};

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

function fmtDuration(ms: number | null) {
  if (!ms) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

// ── Seção Cérebro ─────────────────────────────────────────────────────────────

function CerebroSection() {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [runs, setRuns] = useState<CerebroRun[]>([]);
  const [queuePending, setQueuePending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: cfg }, { data: runData }, { count }] = await Promise.all([
      supabase.from("system_settings").select("value").eq("key", "cerebro_enabled").maybeSingle(),
      supabase.from("cerebro_runs").select("*").order("ran_at", { ascending: false }).limit(10),
      supabase.from("lead_activation_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    setEnabled(cfg?.value === true || cfg?.value === "true");
    setRuns(runData || []);
    setQueuePending(count || 0);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (val: boolean) => {
    setToggling(true);
    await supabase.from("system_settings").upsert({ key: "cerebro_enabled", value: String(val) }, { onConflict: "key" });
    toast({ title: val ? "Cérebro ativado" : "Cérebro desativado" });
    setToggling(false);
    load();
  };

  const lastRun = runs[0];

  return (
    <div className="space-y-5">
      {/* Status card */}
      <Card className={cn("border-2", enabled ? "border-emerald-500/40 bg-emerald-950/10" : "border-slate-700/50 bg-slate-800/40")}>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center",
                enabled ? "bg-emerald-500/20" : "bg-slate-700/50")}>
                <Brain className={cn("w-5 h-5", enabled ? "text-emerald-400" : "text-slate-500")} />
              </div>
              <div>
                <p className="text-white font-bold">Cérebro Central</p>
                <p className="text-xs text-slate-500">Fila inteligente de ativação de leads</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">{enabled ? "Ativo" : "Inativo"}</span>
              <Switch checked={enabled} onCheckedChange={toggle} disabled={toggling} />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-slate-900/50 rounded-lg p-3 text-center">
              <div className="text-xl font-black text-amber-400">{queuePending}</div>
              <p className="text-xs text-slate-500 mt-0.5">Na fila</p>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-3 text-center">
              <div className="text-xl font-black text-white">{lastRun?.processed ?? "—"}</div>
              <p className="text-xs text-slate-500 mt-0.5">Última execução</p>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-3 text-center">
              <div className="text-xl font-black text-slate-300">{lastRun?.rescheduled ?? "—"}</div>
              <p className="text-xs text-slate-500 mt-0.5">Reagendados</p>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-3 text-center">
              <div className="text-sm font-bold text-slate-400">{lastRun ? timeAgo(lastRun.ran_at) : "Nunca"}</div>
              <p className="text-xs text-slate-500 mt-0.5">Última execução</p>
            </div>
          </div>

          {!enabled && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-300">
              Com o Cérebro inativo, os Blocos 1–4 do Scheduler estão ativos (follow-up reativo). Ative o Cérebro para usar a fila inteligente pró-ativa.
            </div>
          )}
          {enabled && (
            <div className="bg-slate-700/30 border border-slate-600/30 rounded-lg p-3 text-xs text-slate-400">
              Modelo: <strong className="text-slate-300">Gemini 2.0 Flash</strong> (hardcoded) — analisa cada conversa antes de enviar mensagem. Os Blocos 1–4 do Scheduler ficam desativados enquanto o Cérebro está ativo.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Histórico */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-bold text-slate-300">Histórico de execuções</h4>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}
            className="text-slate-500 h-7 text-xs gap-1">
            <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} /> Atualizar
          </Button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-500 gap-2 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin" /> Carregando...
          </div>
        ) : runs.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm">
            <Brain className="w-10 h-10 mx-auto mb-2 opacity-20" />
            Nenhuma execução registrada. O Cérebro ainda não rodou.
          </div>
        ) : (
          <div className="space-y-1.5">
            {runs.map(run => (
              <div key={run.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/40 text-xs">
                <div className={cn("w-2 h-2 rounded-full shrink-0",
                  run.status === "success" ? "bg-emerald-400" :
                  run.status === "error" ? "bg-red-500" : "bg-yellow-400")} />
                <span className="text-slate-400 w-28 shrink-0">{new Date(run.ran_at).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit", timeZone:"America/Sao_Paulo" })}</span>
                <span className="text-emerald-400 font-mono w-14 shrink-0">{run.processed} ok</span>
                <span className="text-yellow-400 font-mono w-16 shrink-0">{run.rescheduled} retry</span>
                <span className="text-slate-500 font-mono w-20 shrink-0">{run.cancelled} cancel</span>
                <span className="text-slate-600 font-mono ml-auto">{fmtDuration(run.duration_ms)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Seção Sentinela ───────────────────────────────────────────────────────────

function SentinelaSection() {
  const { toast } = useToast();
  const [config, setConfig] = useState<SentinelaConfig>(DEFAULT_SENTINELA);
  const [profileMap, setProfileMap] = useState<ProfileMapRow[]>([]);
  const [profiles, setProfiles] = useState<AIProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: cfg }, { data: maps }, { data: profs }] = await Promise.all([
      supabase.from("ai_sentinela_config").select("*").maybeSingle(),
      supabase.from("ai_sentinela_profile_map").select("*").order("priority", { ascending: false }),
      supabase.from("ai_profiles").select("id,name").eq("is_active", true).order("name"),
    ]);
    if (cfg) setConfig(cfg);
    setProfileMap(maps || []);
    setProfiles(profs || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("ai_sentinela_config").upsert(
        { ...config, updated_at: new Date().toISOString() },
        { onConflict: "_singleton" }
      );
      if (error) throw error;
      await supabase.from("ai_sentinela_profile_map").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      const valid = profileMap.filter(r => r.match_value && r.profile_id);
      if (valid.length > 0) {
        const { error: mapErr } = await supabase.from("ai_sentinela_profile_map").insert(
          valid.map(({ id: _id, ...r }) => r)
        );
        if (mapErr) throw mapErr;
      }
      toast({ title: "Sentinela salva!" });
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addRow = () => setProfileMap([...profileMap, { match_field: "tag", match_value: "", profile_id: "", priority: 0 }]);
  const removeRow = (i: number) => setProfileMap(profileMap.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: string, value: any) => {
    const rows = [...profileMap];
    rows[i] = { ...rows[i], [field]: value };
    setProfileMap(rows);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-slate-500 gap-2">
      <RefreshCw className="w-5 h-5 animate-spin" /> Carregando...
    </div>
  );

  const spentPct = config.monthly_budget_usd > 0 ? Math.min(100, (config.monthly_spent_usd / config.monthly_budget_usd) * 100) : 0;
  const budgetColor = spentPct >= 100 ? "bg-red-500" : spentPct >= 80 ? "bg-yellow-500" : "bg-emerald-500";
  const budgetText = spentPct >= 100 ? "text-red-400" : spentPct >= 80 ? "text-yellow-400" : "text-emerald-400";

  return (
    <div className="space-y-5">
      {/* Orçamento */}
      <Card className="border-2 border-orange-500/30 bg-orange-950/10">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-orange-400" />
              <span className="text-sm font-bold text-orange-300">Orçamento mensal</span>
            </div>
            <span className={cn("text-sm font-mono font-bold", budgetText)}>
              ${config.monthly_spent_usd.toFixed(4)} / ${config.monthly_budget_usd.toFixed(2)}
            </span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2">
            <div className={cn("h-2 rounded-full transition-all", budgetColor)} style={{ width: `${spentPct}%` }} />
          </div>
        </CardContent>
      </Card>

      {/* Toggle + LLM */}
      <Card className="border-slate-700/50 bg-slate-800/40">
        <CardContent className="pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-bold flex items-center gap-2">
                <Shield className="w-4 h-4 text-orange-400" />Sentinela IA
              </p>
              <p className="text-xs text-slate-500">Agente LLM autônomo para leads parados</p>
            </div>
            <Switch checked={config.is_enabled} onCheckedChange={v => setConfig({ ...config, is_enabled: v })} />
          </div>
          <div>
            <Label className="text-slate-400 text-xs uppercase">Modelo LLM</Label>
            <Select
              value={`${config.provider}::${config.model_name}`}
              onValueChange={v => {
                const [provider, model_name] = v.split("::");
                setConfig({ ...config, provider, model_name });
              }}
            >
              <SelectTrigger className="bg-slate-900 border-slate-600 text-white mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-600">
                <SelectItem value="gemini::gemini-2.0-flash">Gemini 2.0 Flash — ~$0.0004/conversa</SelectItem>
                <SelectItem value="anthropic::claude-haiku-4-5">Claude Haiku 4.5 — ~$0.003/conversa</SelectItem>
                <SelectItem value="anthropic::claude-sonnet-4-6">Claude Sonnet 4.6 — ~$0.010/conversa</SelectItem>
                <SelectItem value="openai::gpt-4o-mini">GPT-4o Mini — ~$0.001/conversa</SelectItem>
                <SelectItem value="openai::gpt-4o">GPT-4o — ~$0.008/conversa</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Parâmetros */}
      <Card className="border-slate-700/50 bg-slate-800/40">
        <CardContent className="pt-4">
          <Label className="text-slate-400 text-xs uppercase mb-3 block">Parâmetros operacionais</Label>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Orçamento mensal (USD)", field: "monthly_budget_usd", type: "number", min: 0, step: 0.5 },
              { label: "Inatividade mínima (horas)", field: "stale_threshold_h", type: "number", min: 1 },
              { label: "Início da janela (BRT)", field: "window_start_brt", type: "time" },
              { label: "Fim da janela (BRT)", field: "window_end_brt", type: "time" },
              { label: "Máx mensagens por sessão", field: "max_messages_session", type: "number", min: 1, max: 20 },
              { label: "Máx tokens por resposta", field: "max_tokens", type: "number", min: 50, max: 1000 },
            ].map(({ label, field, type, ...rest }) => (
              <div key={field}>
                <Label className="text-slate-400 text-xs">{label}</Label>
                <Input
                  type={type}
                  value={(config as any)[field]}
                  onChange={e => setConfig({ ...config, [field]: type === "number" ? parseFloat(e.target.value) || 0 : e.target.value })}
                  className="bg-slate-900 border-slate-600 text-white mt-1"
                  {...rest}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Perfil padrão */}
      <Card className="border-slate-700/50 bg-slate-800/40">
        <CardContent className="pt-4">
          <Label className="text-slate-400 text-xs uppercase mb-2 block">Perfil de IA padrão</Label>
          <Select
            value={config.default_profile_id || "none"}
            onValueChange={v => setConfig({ ...config, default_profile_id: v === "none" ? null : v })}
          >
            <SelectTrigger className="bg-slate-900 border-slate-600 text-white">
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-600">
              <SelectItem value="none">Nenhum (Sentinela inativa sem perfil)</SelectItem>
              {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-500 mt-1">Usado quando nenhum mapeamento tag/source corresponder ao lead</p>
        </CardContent>
      </Card>

      {/* Mapeamentos */}
      <Card className="border-slate-700/50 bg-slate-800/40">
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-slate-400 text-xs uppercase">Mapeamentos tag/source → perfil</Label>
            <Button onClick={addRow} size="sm" variant="outline"
              className="border-orange-500/30 text-orange-400 hover:bg-orange-900/20 h-7 text-xs gap-1">
              <Plus className="w-3 h-3" /> Adicionar
            </Button>
          </div>
          {profileMap.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-3">Nenhum mapeamento. Todos os leads usarão o perfil padrão.</p>
          ) : (
            <div className="space-y-2">
              {profileMap.map((row, i) => (
                <div key={i} className="grid grid-cols-[110px_1fr_1fr_70px_32px] gap-2 items-center">
                  <Select value={row.match_field} onValueChange={v => updateRow(i, "match_field", v)}>
                    <SelectTrigger className="bg-slate-900 border-slate-600 text-white text-xs h-7">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-600">
                      <SelectItem value="tag">tag</SelectItem>
                      <SelectItem value="source">source</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input placeholder="valor (ex: mcmv)" value={row.match_value}
                    onChange={e => updateRow(i, "match_value", e.target.value)}
                    className="bg-slate-900 border-slate-600 text-white text-xs h-7" />
                  <Select value={row.profile_id || "none"} onValueChange={v => updateRow(i, "profile_id", v === "none" ? "" : v)}>
                    <SelectTrigger className="bg-slate-900 border-slate-600 text-white text-xs h-7">
                      <SelectValue placeholder="Perfil..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-600">
                      <SelectItem value="none">Selecione...</SelectItem>
                      {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="number" placeholder="prio" value={row.priority}
                    onChange={e => updateRow(i, "priority", parseInt(e.target.value) || 0)}
                    className="bg-slate-900 border-slate-600 text-white text-xs h-7" />
                  <Button onClick={() => removeRow(i)} variant="ghost" size="sm"
                    className="text-red-400 hover:bg-red-900/20 h-7 w-7 p-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="bg-orange-600 hover:bg-orange-500 font-bold gap-2">
          <Save className="w-4 h-4" />
          {saving ? "Salvando..." : "Salvar configuração"}
        </Button>
      </div>
    </div>
  );
}

// ── Seção AI Coach ────────────────────────────────────────────────────────────

function AICoachSection() {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<LLMConfig[]>([]);
  const [stats, setStats] = useState<QueueStats>({ pending: 0, processing: 0, completed: 0, failed: 0, skipped: 0 });
  const [analyses, setAnalyses] = useState<RecentAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editItem, setEditItem] = useState<LLMConfig | null>(null);
  const [form, setForm] = useState({ provider: "anthropic", model_name: "claude-haiku-4-5-20251001", max_tokens: 1000, is_active: true });

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: cfgData }, { data: qData }, { data: anaData }] = await Promise.all([
      supabase.from("ai_coach_llm_config").select("*").order("priority"),
      supabase.from("ai_coach_queue").select("status"),
      supabase.from("ai_coach_analysis")
        .select("id, broker_id, quality_score, severity, total_leads_analyzed, created_at, summary, profiles(first_name, full_name)")
        .order("created_at", { ascending: false })
        .limit(15),
    ]);

    setConfigs((cfgData as LLMConfig[]) || []);
    if (qData) {
      const s: QueueStats = { pending: 0, processing: 0, completed: 0, failed: 0, skipped: 0 };
      for (const r of qData) { if (r.status in s) s[r.status as keyof QueueStats]++; }
      setStats(s);
    }
    setAnalyses((anaData || []).map((a: any) => ({
      ...a,
      broker_name: a.profiles?.first_name || a.profiles?.full_name || "—",
    })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    const maxPriority = configs.length > 0 ? Math.max(...configs.map(c => c.priority)) : 0;
    const payload = { ...form, priority: editItem ? editItem.priority : maxPriority + 1 };
    let error;
    if (editItem) ({ error } = await supabase.from("ai_coach_llm_config").update(payload).eq("id", editItem.id));
    else ({ error } = await supabase.from("ai_coach_llm_config").insert(payload));
    if (error) toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    else { toast({ title: editItem ? "LLM atualizado" : "LLM adicionado" }); setSheetOpen(false); setEditItem(null); load(); }
  };

  const toggleActive = async (cfg: LLMConfig) => {
    await supabase.from("ai_coach_llm_config").update({ is_active: !cfg.is_active }).eq("id", cfg.id);
    load();
  };

  const movePriority = async (cfg: LLMConfig, dir: "up" | "down") => {
    const sorted = [...configs].sort((a, b) => a.priority - b.priority);
    const idx = sorted.findIndex(c => c.id === cfg.id);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx]; const b = sorted[swapIdx];
    await Promise.all([
      supabase.from("ai_coach_llm_config").update({ priority: b.priority }).eq("id", a.id),
      supabase.from("ai_coach_llm_config").update({ priority: a.priority }).eq("id", b.id),
    ]);
    load();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("ai_coach_llm_config").delete().eq("id", id);
    toast({ title: "LLM removido" });
    load();
  };

  const runAnalysis = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai_coach_processor", { body: {} });
      if (error) throw error;
      toast({ title: "Análise concluída", description: `${data?.processed ?? 0} corretores analisados` });
      load();
    } catch (e: any) {
      toast({ title: "Erro na análise", description: e.message, variant: "destructive" });
    } finally { setRunning(false); }
  };

  const openEdit = (cfg: LLMConfig) => {
    setEditItem(cfg);
    setForm({ provider: cfg.provider, model_name: cfg.model_name, max_tokens: cfg.max_tokens, is_active: cfg.is_active });
    setSheetOpen(true);
  };

  const sorted = [...configs].sort((a, b) => a.priority - b.priority);
  const selectedProvider = LLM_PROVIDERS.find(p => p.value === form.provider);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-white font-bold">AI Coach — Qualidade dos Corretores</h3>
            <p className="text-xs text-slate-500">Analisa conversas CRM e gera relatório de performance por corretor</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={load} variant="outline" size="sm"
            className="border-slate-700 text-slate-400 hover:text-white gap-1.5 text-xs">
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} /> Atualizar
          </Button>
          <Button onClick={runAnalysis} disabled={running || loading}
            className="bg-purple-600 hover:bg-purple-500 gap-1.5 text-xs">
            <Play className={cn("w-3.5 h-3.5", running && "animate-spin")} />
            {running ? "Analisando..." : "Analisar agora"}
          </Button>
        </div>
      </div>

      {/* Fila stats */}
      <div className="grid grid-cols-5 gap-2">
        {[
          { label: "Pendentes", value: stats.pending, icon: Clock, color: "text-amber-400" },
          { label: "Processando", value: stats.processing, icon: RefreshCw, color: "text-blue-400" },
          { label: "Concluídos", value: stats.completed, icon: CheckCircle2, color: "text-emerald-400" },
          { label: "Falhou", value: stats.failed, icon: XCircle, color: "text-red-400" },
          { label: "Pulados", value: stats.skipped, icon: SkipForward, color: "text-slate-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border-slate-700/50 bg-slate-800/40">
            <CardContent className="p-3 text-center">
              <Icon className={cn("w-4 h-4 mx-auto mb-1", color)} />
              <div className={cn("text-lg font-black", color)}>{value}</div>
              <p className="text-[10px] text-slate-500">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Provedores LLM */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-bold text-slate-300 flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-purple-400" /> Provedores LLM
          </h4>
          <Button onClick={() => { setEditItem(null); setForm({ provider: "anthropic", model_name: "claude-haiku-4-5-20251001", max_tokens: 1000, is_active: true }); setSheetOpen(true); }}
            size="sm" className="bg-purple-600 hover:bg-purple-500 gap-1 text-xs h-7">
            <Plus className="w-3 h-3" /> Adicionar
          </Button>
        </div>
        {sorted.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-sm border border-dashed border-slate-700 rounded-lg">
            <Bot className="w-10 h-10 mx-auto mb-2 opacity-20" />
            Nenhum provedor configurado. Adicione ao menos um para o AI Coach funcionar.
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((cfg, idx) => {
              const prov = LLM_PROVIDERS.find(p => p.value === cfg.provider);
              const isPrimary = idx === 0 && cfg.is_active;
              const isFallback = idx > 0 && cfg.is_active;
              return (
                <div key={cfg.id} className={cn(
                  "flex items-center gap-3 p-3 rounded-xl border transition-all",
                  cfg.is_active ? "border-purple-500/30 bg-purple-950/10" : "border-slate-700/40 bg-slate-800/30 opacity-60"
                )}>
                  <div className="flex flex-col gap-0.5">
                    <Button variant="ghost" size="sm" onClick={() => movePriority(cfg, "up")} disabled={idx === 0}
                      className="h-4 w-4 p-0 text-slate-500 hover:text-white"><ChevronUp className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => movePriority(cfg, "down")} disabled={idx === sorted.length - 1}
                      className="h-4 w-4 p-0 text-slate-500 hover:text-white"><ChevronDown className="w-3 h-3" /></Button>
                  </div>
                  <span className="text-xs font-black text-slate-500 w-4 text-center">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("text-sm font-bold", prov?.color || "text-white")}>{prov?.label || cfg.provider}</span>
                      {isPrimary && <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">Principal</Badge>}
                      {isFallback && <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">Fallback</Badge>}
                      {!cfg.is_active && <Badge className="bg-slate-600/20 text-slate-500 border-slate-600/30 text-[10px]">Inativo</Badge>}
                    </div>
                    <p className="text-xs text-slate-500 font-mono">{cfg.model_name} · {cfg.max_tokens} tokens</p>
                  </div>
                  <Switch checked={cfg.is_active} onCheckedChange={() => toggleActive(cfg)} />
                  <Button variant="ghost" size="sm" onClick={() => openEdit(cfg)}
                    className="text-slate-400 hover:text-white h-7 w-7 p-0"><Settings2 className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(cfg.id)}
                    className="text-red-400 hover:bg-red-900/20 h-7 w-7 p-0"><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Análises recentes */}
      <div>
        <h4 className="text-sm font-bold text-slate-300 mb-2">Análises recentes</h4>
        {analyses.length === 0 ? (
          <p className="text-center text-slate-500 text-sm py-6 border border-dashed border-slate-700 rounded-lg">
            Nenhuma análise ainda. Configure os provedores e clique em "Analisar agora".
          </p>
        ) : (
          <div className="space-y-2">
            {analyses.map(a => (
              <div key={a.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/40">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center text-sm font-black shrink-0",
                  (a.quality_score ?? 0) >= 80 ? "bg-emerald-900/40 text-emerald-300" :
                  (a.quality_score ?? 0) >= 60 ? "bg-yellow-900/40 text-yellow-300" : "bg-red-900/40 text-red-300"
                )}>
                  {a.quality_score ?? "—"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white">{a.broker_name}</span>
                    {a.severity && (
                      <Badge className={cn("border text-[10px]", SEVERITY_COLORS[a.severity] || "")}>
                        {a.severity}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate">{a.summary || `${a.total_leads_analyzed} leads analisados`}</p>
                </div>
                <span className="text-[11px] text-slate-600 shrink-0">{timeAgo(a.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sheet add/edit LLM */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="bg-slate-900 border-slate-700 text-white">
          <SheetHeader>
            <SheetTitle className="text-white">{editItem ? "Editar provedor LLM" : "Adicionar provedor LLM"}</SheetTitle>
            <SheetDescription className="text-slate-400">Configure o modelo e prioridade de fallback</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div>
              <Label className="text-slate-400 text-xs uppercase">Provedor</Label>
              <Select value={form.provider} onValueChange={v => setForm({ ...form, provider: v, model_name: LLM_PROVIDERS.find(p => p.value === v)?.models[0] || "" })}>
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  {LLM_PROVIDERS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-400 text-xs uppercase">Modelo</Label>
              <Select value={form.model_name} onValueChange={v => setForm({ ...form, model_name: v })}>
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  {selectedProvider?.models.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-400 text-xs uppercase">Máx tokens</Label>
              <Input type="number" min={100} max={4000} value={form.max_tokens}
                onChange={e => setForm({ ...form, max_tokens: parseInt(e.target.value) || 1000 })}
                className="bg-slate-800 border-slate-600 text-white mt-1" />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
              <Label className="text-slate-300">Ativo</Label>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 text-xs text-slate-400 space-y-1">
              <p className="font-semibold text-slate-300">Dica de chave API:</p>
              {form.provider === "anthropic" && <p>Variável: <code className="bg-slate-700 px-1 rounded">ANTHROPIC_API_KEY</code> — console.anthropic.com</p>}
              {form.provider === "openai" && <p>Variável: <code className="bg-slate-700 px-1 rounded">OPENAI_API_KEY</code> — platform.openai.com</p>}
              {form.provider === "gemini" && <p>Variável: <code className="bg-slate-700 px-1 rounded">GEMINI_API_KEY</code> — aistudio.google.com</p>}
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setSheetOpen(false)}
                className="flex-1 border-slate-700 text-slate-400">Cancelar</Button>
              <Button onClick={handleSave} className="flex-1 bg-purple-600 hover:bg-purple-500 font-bold">
                <Save className="w-4 h-4 mr-2" />{editItem ? "Salvar" : "Adicionar"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function CentralIA() {
  const [tab, setTab] = useState<CentralTab>("cerebro");

  const tabs: { value: CentralTab; label: string; icon: React.ElementType; color: string }[] = [
    { value: "cerebro",   label: "Cérebro",   icon: Brain,  color: "data-[state=active]:bg-emerald-900/40 data-[state=active]:text-emerald-300 data-[state=active]:border-emerald-500/50" },
    { value: "sentinela", label: "Sentinela", icon: Shield, color: "data-[state=active]:bg-orange-900/40 data-[state=active]:text-orange-300 data-[state=active]:border-orange-500/50" },
    { value: "coach",     label: "AI Coach",  icon: Bot,    color: "data-[state=active]:bg-purple-900/40 data-[state=active]:text-purple-300 data-[state=active]:border-purple-500/50" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-white flex items-center gap-2">
          <Brain className="w-6 h-6 text-emerald-400" />
          Central de IA
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">Configure e monitore todos os sistemas de inteligência artificial</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 bg-slate-900/80 border border-slate-700/50 rounded-xl p-1">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.value}
              data-state={tab === t.value ? "active" : "inactive"}
              onClick={() => setTab(t.value)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold transition-all border border-transparent",
                "text-slate-500 hover:text-slate-300",
                t.color
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      {tab === "cerebro"   && <CerebroSection />}
      {tab === "sentinela" && <SentinelaSection />}
      {tab === "coach"     && <AICoachSection />}
    </div>
  );
}
