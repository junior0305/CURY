import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertTriangle,
  Bot,
  Brain,
  CheckCircle2,
  ChevronUp,
  ChevronDown,
  Clock,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  Zap,
  XCircle,
  SkipForward,
  Play,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface LLMConfig {
  id: string;
  provider: "anthropic" | "openai" | "gemini";
  model_name: string;
  max_tokens: number;
  is_active: boolean;
  priority: number;
  created_at: string;
}

interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  skipped: number;
}

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

const PROVIDERS = [
  {
    value: "anthropic",
    label: "Anthropic (Claude)",
    color: "text-orange-400",
    models: [
      "claude-haiku-4-5-20251001",
      "claude-sonnet-4-6",
      "claude-opus-4-6",
    ],
  },
  {
    value: "openai",
    label: "OpenAI (GPT)",
    color: "text-green-400",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"],
  },
  {
    value: "gemini",
    label: "Google (Gemini)",
    color: "text-blue-400",
    models: ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"],
  },
];

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-green-500/20 text-green-400 border-green-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  high: "bg-red-500/20 text-red-400 border-red-500/30",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function AICoach() {
  const { toast } = useToast();

  const [configs, setConfigs] = useState<LLMConfig[]>([]);
  const [stats, setStats] = useState<QueueStats>({ pending: 0, processing: 0, completed: 0, failed: 0, skipped: 0 });
  const [analyses, setAnalyses] = useState<RecentAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  // Sheet de novo LLM
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editItem, setEditItem] = useState<LLMConfig | null>(null);
  const [form, setForm] = useState({ provider: "anthropic", model_name: "claude-haiku-4-5-20251001", max_tokens: 1000, is_active: true });

  // ── Carrega dados ──────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    const [
      { data: cfgData },
      { data: qData },
      { data: anaData },
    ] = await Promise.all([
      supabase.from("ai_coach_llm_config").select("*").order("priority"),
      supabase.from("ai_coach_queue").select("status"),
      supabase
        .from("ai_coach_analysis")
        .select("id, broker_id, quality_score, severity, total_leads_analyzed, created_at, summary, profiles(first_name, full_name)")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    setConfigs((cfgData as LLMConfig[]) || []);

    if (qData) {
      const s: QueueStats = { pending: 0, processing: 0, completed: 0, failed: 0, skipped: 0 };
      for (const r of qData) {
        if (r.status in s) s[r.status as keyof QueueStats]++;
      }
      setStats(s);
    }

    setAnalyses(
      (anaData || []).map((a: any) => ({
        ...a,
        broker_name: a.profiles?.first_name || a.profiles?.full_name || "—",
      }))
    );

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Salvar LLM ─────────────────────────────────────────────────────────────

  const handleSave = async () => {
    const maxPriority = configs.length > 0 ? Math.max(...configs.map(c => c.priority)) : 0;
    const payload = {
      provider: form.provider,
      model_name: form.model_name,
      max_tokens: form.max_tokens,
      is_active: form.is_active,
      priority: editItem ? editItem.priority : maxPriority + 1,
    };

    let error;
    if (editItem) {
      ({ error } = await supabase.from("ai_coach_llm_config").update(payload).eq("id", editItem.id));
    } else {
      ({ error } = await supabase.from("ai_coach_llm_config").insert(payload));
    }

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editItem ? "LLM atualizado" : "LLM adicionado" });
      setSheetOpen(false);
      setEditItem(null);
      load();
    }
  };

  // ── Toggle ativo ───────────────────────────────────────────────────────────

  const toggleActive = async (cfg: LLMConfig) => {
    await supabase.from("ai_coach_llm_config").update({ is_active: !cfg.is_active }).eq("id", cfg.id);
    load();
  };

  // ── Mover prioridade ───────────────────────────────────────────────────────

  const movePriority = async (cfg: LLMConfig, dir: "up" | "down") => {
    const sorted = [...configs].sort((a, b) => a.priority - b.priority);
    const idx = sorted.findIndex(c => c.id === cfg.id);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const a = sorted[idx];
    const b = sorted[swapIdx];
    await Promise.all([
      supabase.from("ai_coach_llm_config").update({ priority: b.priority }).eq("id", a.id),
      supabase.from("ai_coach_llm_config").update({ priority: a.priority }).eq("id", b.id),
    ]);
    load();
  };

  // ── Deletar ────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    await supabase.from("ai_coach_llm_config").delete().eq("id", id);
    toast({ title: "LLM removido" });
    load();
  };

  // ── Rodar análise manualmente ──────────────────────────────────────────────

  const runAnalysis = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai_coach_processor", { body: {} });
      if (error) throw error;
      toast({
        title: "Análise concluída",
        description: `${data?.processed ?? 0} corretores analisados, ${data?.errors ?? 0} erros`,
      });
      load();
    } catch (e: any) {
      toast({ title: "Erro na análise", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  // ── Abrir sheet para editar ────────────────────────────────────────────────

  const openEdit = (cfg: LLMConfig) => {
    setEditItem(cfg);
    setForm({ provider: cfg.provider, model_name: cfg.model_name, max_tokens: cfg.max_tokens, is_active: cfg.is_active });
    setSheetOpen(true);
  };

  const openNew = () => {
    setEditItem(null);
    setForm({ provider: "anthropic", model_name: "claude-haiku-4-5-20251001", max_tokens: 1000, is_active: true });
    setSheetOpen(true);
  };

  const sorted = [...configs].sort((a, b) => a.priority - b.priority);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <Brain className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">AI Coach — Qualidade dos Corretores</h2>
            <p className="text-xs text-white/50">Analisa conversas e gera feedback automático por corretor</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("w-4 h-4 mr-1", loading && "animate-spin")} />
            Atualizar
          </Button>
          <Button
            size="sm"
            onClick={runAnalysis}
            disabled={running || configs.filter(c => c.is_active).length === 0}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {running ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Play className="w-4 h-4 mr-1" />}
            Analisar agora
          </Button>
        </div>
      </div>

      {/* ── Stats da fila ── */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "Pendentes", value: stats.pending, icon: Clock, color: "text-yellow-400" },
          { label: "Processando", value: stats.processing, icon: RefreshCw, color: "text-blue-400" },
          { label: "Concluídos", value: stats.completed, icon: CheckCircle2, color: "text-green-400" },
          { label: "Falhou", value: stats.failed, icon: XCircle, color: "text-red-400" },
          { label: "Sem dados", value: stats.skipped, icon: SkipForward, color: "text-white/40" },
        ].map(s => (
          <Card key={s.label} className="bg-white/5 border-white/10">
            <CardContent className="p-3 flex items-center gap-2">
              <s.icon className={cn("w-4 h-4 shrink-0", s.color)} />
              <div>
                <p className="text-lg font-bold text-white">{s.value}</p>
                <p className="text-[10px] text-white/40 uppercase tracking-wider">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── LLMs configurados ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Provedores LLM</h3>
          <Button size="sm" variant="outline" onClick={openNew}>
            <Plus className="w-4 h-4 mr-1" /> Adicionar
          </Button>
        </div>

        {configs.length === 0 ? (
          <Card className="bg-yellow-500/10 border-yellow-500/20">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-yellow-300">Nenhum LLM configurado</p>
                <p className="text-xs text-yellow-400/70">Adicione pelo menos um provedor para ativar o AI Coach.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {sorted.map((cfg, idx) => {
              const prov = PROVIDERS.find(p => p.value === cfg.provider);
              return (
                <Card key={cfg.id} className={cn("bg-white/5 border-white/10 transition-all", cfg.is_active && "border-purple-500/30 bg-purple-500/5")}>
                  <CardContent className="p-3 flex items-center gap-3">
                    {/* Prioridade */}
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => movePriority(cfg, "up")} disabled={idx === 0} className="text-white/30 hover:text-white/70 disabled:opacity-20">
                        <ChevronUp className="w-3 h-3" />
                      </button>
                      <span className="text-xs text-white/30 text-center">{idx + 1}</span>
                      <button onClick={() => movePriority(cfg, "down")} disabled={idx === sorted.length - 1} className="text-white/30 hover:text-white/70 disabled:opacity-20">
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn("text-sm font-semibold", prov?.color)}>{prov?.label}</span>
                        {idx === 0 && cfg.is_active && (
                          <Badge className="text-[9px] bg-purple-500/20 text-purple-300 border-purple-500/30 h-4 px-1">PRIMÁRIO</Badge>
                        )}
                        {idx > 0 && cfg.is_active && (
                          <Badge className="text-[9px] bg-white/10 text-white/50 border-white/10 h-4 px-1">FALLBACK {idx}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-white/40 font-mono">{cfg.model_name} · max {cfg.max_tokens} tokens</p>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-2">
                      <Switch checked={cfg.is_active} onCheckedChange={() => toggleActive(cfg)} />
                      <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => openEdit(cfg)}>
                        <Settings2 className="w-3.5 h-3.5 text-white/50" />
                      </Button>
                      <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => handleDelete(cfg.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-red-400/60 hover:text-red-400" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Explicação do fallback */}
        {configs.filter(c => c.is_active).length > 1 && (
          <p className="text-xs text-white/30 mt-2 flex items-center gap-1">
            <Zap className="w-3 h-3" />
            Se o LLM primário falhar por saldo ou erro, o sistema tenta automaticamente o próximo. Você será notificado quando isso ocorrer.
          </p>
        )}
      </div>

      {/* ── Análises recentes ── */}
      {analyses.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-3">Análises Recentes</h3>
          <div className="space-y-2">
            {analyses.map(a => (
              <Card key={a.id} className="bg-white/5 border-white/10">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-white/50" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-white">{a.broker_name}</span>
                      {a.severity && (
                        <Badge className={cn("text-[9px] h-4 px-1 border", SEVERITY_COLORS[a.severity] || "bg-white/10 text-white/50")}>
                          {a.severity.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-white/40 truncate">{a.summary || "—"}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {a.quality_score != null && (
                      <p className={cn(
                        "text-lg font-bold",
                        a.quality_score >= 70 ? "text-green-400" : a.quality_score >= 40 ? "text-yellow-400" : "text-red-400"
                      )}>
                        {a.quality_score}
                      </p>
                    )}
                    <p className="text-[10px] text-white/30">{timeAgo(a.created_at)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Sheet: Adicionar/Editar LLM ── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="bg-[#1a1a2e] border-white/10 text-white">
          <SheetHeader>
            <SheetTitle className="text-white">{editItem ? "Editar LLM" : "Adicionar LLM"}</SheetTitle>
            <SheetDescription className="text-white/50">
              Configure o provedor e modelo a ser usado pelo AI Coach.
              A API key deve estar configurada nos secrets do Supabase.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 mt-6">
            <div className="space-y-1.5">
              <Label className="text-white/70">Provedor</Label>
              <Select
                value={form.provider}
                onValueChange={v => {
                  const prov = PROVIDERS.find(p => p.value === v);
                  setForm(f => ({ ...f, provider: v, model_name: prov?.models[0] || "" }));
                }}
              >
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a2e] border-white/10">
                  {PROVIDERS.map(p => (
                    <SelectItem key={p.value} value={p.value} className="text-white hover:bg-white/10">
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-white/70">Modelo</Label>
              <Select value={form.model_name} onValueChange={v => setForm(f => ({ ...f, model_name: v }))}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a2e] border-white/10">
                  {PROVIDERS.find(p => p.value === form.provider)?.models.map(m => (
                    <SelectItem key={m} value={m} className="text-white hover:bg-white/10 font-mono text-xs">
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-white/70">Máx. tokens de resposta</Label>
              <Input
                type="number"
                value={form.max_tokens}
                onChange={e => setForm(f => ({ ...f, max_tokens: Number(e.target.value) }))}
                className="bg-white/5 border-white/10 text-white"
                min={100}
                max={4000}
              />
              <p className="text-xs text-white/30">Recomendado: 800–1500. Mais tokens = mais custo.</p>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-white/70">Ativo</Label>
              <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
            </div>

            <div className="bg-white/5 rounded-lg p-3 text-xs text-white/40 space-y-1">
              <p className="text-white/60 font-semibold">Secrets necessários no Supabase:</p>
              {form.provider === "anthropic" && <p className="font-mono">ANTHROPIC_API_KEY</p>}
              {form.provider === "openai" && <p className="font-mono">OPENAI_API_KEY</p>}
              {form.provider === "gemini" && <p className="font-mono">GEMINI_API_KEY</p>}
              <p>Configure em: Project Settings → Edge Functions → Secrets</p>
            </div>

            <Button onClick={handleSave} className="w-full bg-purple-600 hover:bg-purple-700 text-white">
              {editItem ? "Salvar alterações" : "Adicionar LLM"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
