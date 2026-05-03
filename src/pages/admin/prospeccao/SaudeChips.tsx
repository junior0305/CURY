import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Shield, AlertTriangle, Ban, Settings as SettingsIcon, RefreshCw,
  Activity, Search, Plus, Trash2, Pause, Play, Power, Loader2, X,
  CheckCircle2, XCircle, Clock, Smartphone, History,
} from "lucide-react";

type SubTab = "bots" | "blocklist" | "bans" | "config";

interface Bot {
  id: string;
  name: string;
  instance_name: string | null;
  status: string | null;
  health_score: number | null;
  daily_limit: number | null;
  messages_today: number | null;
  warmup_until: string | null;
  paused_safety_at: string | null;
  paused_safety_reason: string | null;
  created_at: string;
  total_messages_sent: number | null;
  // Calculados
  ageDays: number;
  effectiveCap: number;
  capStage: "warmup_1_7" | "warmup_8_30" | "mature";
  capPct: number;
  campaignSendsToday: number;
  optOuts30d: number;
  responseRate: number;
  computedScore: number;
  status_label: "healthy" | "at_risk" | "critical" | "paused" | "warmup";
}

interface BlocklistRow {
  phone: string;
  reason: string;
  source: string;
  created_at: string;
  notes: string | null;
}

interface HealthEvent {
  id: string;
  bot_instance_id: string;
  event: string;
  reason: string | null;
  metrics_snapshot: any;
  created_at: string;
  bot_name?: string;
}

interface SystemConfig {
  chip_health_enabled: boolean;
  chip_cap_warmup_d1_7: number;
  chip_cap_warmup_d8_30: number;
  chip_cap_mature: number;
  chip_optout_abs_threshold_24h: number;
  chip_optout_pct_threshold_24h: number;
  chip_optout_pct_min_count: number;
  chip_send_window_start: number;
  chip_send_window_end: number;
  chip_blocklist_auto_enabled: boolean;
  chip_typing_simulation_enabled: boolean;
  chip_typing_min_ms: number;
  chip_typing_max_ms: number;
}

const DEFAULT_CONFIG: SystemConfig = {
  chip_health_enabled: false,
  chip_cap_warmup_d1_7: 30,
  chip_cap_warmup_d8_30: 80,
  chip_cap_mature: 150,
  chip_optout_abs_threshold_24h: 3,
  chip_optout_pct_threshold_24h: 5,
  chip_optout_pct_min_count: 2,
  chip_send_window_start: 7,
  chip_send_window_end: 22,
  chip_blocklist_auto_enabled: true,
  chip_typing_simulation_enabled: true,
  chip_typing_min_ms: 3000,
  chip_typing_max_ms: 8000,
};

function ageDaysFromIso(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function statusLabel(bot: Bot, config: SystemConfig): Bot["status_label"] {
  if (bot.paused_safety_at) return "paused";
  if (bot.warmup_until && new Date(bot.warmup_until) > new Date()) return "warmup";
  if (bot.computedScore < 40) return "critical";
  if (bot.computedScore < 70) return "at_risk";
  return "healthy";
}

const STATUS_META: Record<Bot["status_label"], { label: string; bg: string; text: string; ring: string; icon: any }> = {
  healthy: { label: "Saudável",  bg: "bg-emerald-900/40", text: "text-emerald-200", ring: "border-emerald-500/40", icon: CheckCircle2 },
  at_risk: { label: "Em risco",  bg: "bg-amber-900/40",   text: "text-amber-200",   ring: "border-amber-500/40",   icon: AlertTriangle },
  critical:{ label: "Crítico",   bg: "bg-red-900/40",     text: "text-red-200",     ring: "border-red-500/40",     icon: XCircle },
  paused:  { label: "Pausado",   bg: "bg-zinc-900/60",    text: "text-zinc-200",    ring: "border-zinc-500/40",    icon: Pause },
  warmup:  { label: "Warm-up",   bg: "bg-cyan-900/40",    text: "text-cyan-200",    ring: "border-cyan-500/40",    icon: Clock },
};

export default function SaudeChips() {
  const [tab, setTab] = useState<SubTab>("bots");
  const [loading, setLoading] = useState(false);
  const [bots, setBots] = useState<Bot[]>([]);
  const [blocklist, setBlocklist] = useState<BlocklistRow[]>([]);
  const [bans, setBans] = useState<HealthEvent[]>([]);
  const [config, setConfig] = useState<SystemConfig>(DEFAULT_CONFIG);
  const [filter, setFilter] = useState<"all" | Bot["status_label"]>("all");
  const [search, setSearch] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  // ── Loaders ───────────────────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    const { data } = await supabase
      .from("system_settings")
      .select("key, value")
      .like("key", "chip_%");
    const out = { ...DEFAULT_CONFIG };
    (data || []).forEach((r: any) => {
      const v = typeof r.value === "string" ? r.value.replace(/^"|"$/g, "") : r.value;
      if (r.key in out) (out as any)[r.key] = typeof DEFAULT_CONFIG[r.key as keyof SystemConfig] === "boolean"
        ? (v === true || v === "true")
        : Number(v);
    });
    setConfig(out);
    return out;
  }, []);

  const loadBots = useCallback(async (cfg: SystemConfig) => {
    const { data: rawBots } = await supabase
      .from("bot_instances")
      .select("id, name, instance_name, status, health_score, daily_limit, messages_today, warmup_until, paused_safety_at, paused_safety_reason, created_at, total_messages_sent")
      .order("name");
    if (!rawBots) { setBots([]); return; }

    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);

    // Para cada bot calcular: campaignSendsToday + optOuts30d + responseRate + score
    const enriched: Bot[] = await Promise.all(rawBots.map(async (b: any) => {
      const ageDays = ageDaysFromIso(b.created_at);
      let cap: number;
      let stage: Bot["capStage"];
      if (b.daily_limit && b.daily_limit > 0) { cap = b.daily_limit; stage = ageDays > 30 ? "mature" : ageDays > 7 ? "warmup_8_30" : "warmup_1_7"; }
      else if (b.warmup_until && new Date(b.warmup_until) > new Date()) { cap = cfg.chip_cap_warmup_d1_7; stage = "warmup_1_7"; }
      else if (ageDays <= 7) { cap = cfg.chip_cap_warmup_d1_7; stage = "warmup_1_7"; }
      else if (ageDays <= 30) { cap = cfg.chip_cap_warmup_d8_30; stage = "warmup_8_30"; }
      else { cap = cfg.chip_cap_mature; stage = "mature"; }

      // Campaign sends today
      const { count: sendsToday } = await supabase
        .from("ia_messages")
        .select("id, ia_conversations!inner(bot_instance_id)", { count: "exact", head: true })
        .eq("direction", "outgoing")
        .in("send_source", ["campaign", "ai_qualification"])
        .gte("sent_at", startOfDay.toISOString())
        .eq("ia_conversations.bot_instance_id", b.id);

      // Opt-outs 30d (inbounds opt_out cuja conversa pertence a esse bot)
      const { count: optOuts } = await supabase
        .from("ia_messages")
        .select("id, ia_conversations!inner(bot_instance_id)", { count: "exact", head: true })
        .eq("direction", "incoming")
        .gte("created_at", thirtyDaysAgo.toISOString())
        .eq("ia_conversations.bot_instance_id", b.id)
        .or("message_text.ilike.%nao quero%,message_text.ilike.%não quero%,message_text.ilike.%para de%,message_text.ilike.%pare de%,message_text.ilike.%descadastr%,message_text.ilike.%remov%,message_text.ilike.%sem interesse%");

      // Response rate (incoming/outgoing) últimos 7d
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
      const { count: out7d } = await supabase
        .from("ia_messages")
        .select("id, ia_conversations!inner(bot_instance_id)", { count: "exact", head: true })
        .eq("direction", "outgoing")
        .gte("created_at", sevenDaysAgo.toISOString())
        .eq("ia_conversations.bot_instance_id", b.id);
      const { count: in7d } = await supabase
        .from("ia_messages")
        .select("id, ia_conversations!inner(bot_instance_id)", { count: "exact", head: true })
        .eq("direction", "incoming")
        .gte("created_at", sevenDaysAgo.toISOString())
        .eq("ia_conversations.bot_instance_id", b.id);
      const responseRate = (out7d || 0) > 0 ? Math.round(((in7d || 0) / (out7d || 1)) * 100) : 0;

      // Score determinístico (0-100)
      let score = 100;
      const capPct = cap > 0 ? (sendsToday || 0) / cap : 0;
      if (capPct > 0.95) score -= 20;
      else if (capPct > 0.8) score -= 10;
      const optOutCount = optOuts || 0;
      score -= Math.min(50, optOutCount * 8);
      if (responseRate < 5) score -= 15;
      else if (responseRate < 10) score -= 5;
      if (b.status !== "active" && b.status !== "open") score -= 25;
      if (b.paused_safety_at) score = Math.min(score, 30);
      score = Math.max(0, Math.min(100, score));

      const enriched: Bot = {
        ...b,
        ageDays,
        effectiveCap: cap,
        capStage: stage,
        capPct: Math.round(capPct * 100),
        campaignSendsToday: sendsToday || 0,
        optOuts30d: optOutCount,
        responseRate,
        computedScore: score,
        status_label: "healthy",
      };
      enriched.status_label = statusLabel(enriched, cfg);
      return enriched;
    }));

    setBots(enriched);
  }, []);

  const loadBlocklist = useCallback(async () => {
    const { data } = await supabase
      .from("phone_blocklist")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setBlocklist((data || []) as BlocklistRow[]);
  }, []);

  const loadBans = useCallback(async () => {
    const { data } = await supabase
      .from("bot_health_events")
      .select("*, bot_instances(name)")
      .in("event", ["paused_auto", "paused_manual", "banned"])
      .order("created_at", { ascending: false })
      .limit(100);
    setBans((data || []).map((e: any) => ({ ...e, bot_name: e.bot_instances?.name })));
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await loadConfig();
      await Promise.all([loadBots(cfg), loadBlocklist(), loadBans()]);
    } catch (e: any) {
      toast.error("Erro ao carregar: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [loadConfig, loadBots, loadBlocklist, loadBans]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const s = { healthy: 0, at_risk: 0, critical: 0, paused: 0, banned30d: 0 };
    bots.forEach(b => { s[b.status_label === "warmup" ? "healthy" : b.status_label]++; });
    s.banned30d = bans.filter(e => e.event === "banned" && Date.now() - new Date(e.created_at).getTime() < 30 * 24 * 3600 * 1000).length;
    return s;
  }, [bots, bans]);

  // ── Ações ─────────────────────────────────────────────────────────────────
  async function pauseBot(bot: Bot, manual = true) {
    const { error } = await supabase
      .from("bot_instances")
      .update({ paused_safety_at: new Date().toISOString(), paused_safety_reason: manual ? "Pausado manualmente pelo admin" : "Pausado automático" })
      .eq("id", bot.id);
    if (error) return toast.error("Falha ao pausar: " + error.message);
    await supabase.from("bot_health_events").insert({
      bot_instance_id: bot.id,
      event: "paused_manual",
      reason: "Admin pausou via aba Saúde",
      metrics_snapshot: { sendsToday: bot.campaignSendsToday, optOuts30d: bot.optOuts30d, score: bot.computedScore },
    });
    toast.success(`${bot.name} pausado`);
    loadAll();
  }

  async function resumeBot(bot: Bot) {
    const { error } = await supabase
      .from("bot_instances")
      .update({ paused_safety_at: null, paused_safety_reason: null })
      .eq("id", bot.id);
    if (error) return toast.error("Falha ao reativar: " + error.message);
    await supabase.from("bot_health_events").insert({
      bot_instance_id: bot.id,
      event: "reactivated",
      reason: "Admin reativou via aba Saúde",
    });
    toast.success(`${bot.name} reativado`);
    loadAll();
  }

  async function removeFromBlocklist(phone: string) {
    if (!confirm(`Remover ${phone} da blocklist? Esse número poderá receber mensagens novamente.`)) return;
    const { error } = await supabase.from("phone_blocklist").delete().eq("phone", phone);
    if (error) return toast.error("Falha: " + error.message);
    toast.success("Removido da blocklist");
    loadBlocklist();
  }

  async function addToBlocklist() {
    const phone = prompt("Telefone (apenas dígitos, com 55 e DDD):");
    if (!phone) return;
    const clean = phone.replace(/\D/g, "");
    if (clean.length < 10) return toast.error("Telefone inválido");
    const reason = prompt("Motivo:", "manual") || "manual";
    const { error } = await supabase.from("phone_blocklist").insert({ phone: clean, reason, source: "admin", notes: "Adicionado manualmente" });
    if (error) return toast.error("Falha: " + error.message);
    toast.success("Adicionado à blocklist");
    loadBlocklist();
  }

  async function saveConfig(patch: Partial<SystemConfig>) {
    setSavingConfig(true);
    try {
      const updates = Object.entries(patch).map(([key, value]) => {
        const json = typeof value === "boolean" ? (value ? "true" : "false") : String(value);
        return supabase.from("system_settings").upsert({ key, value: json }, { onConflict: "key" });
      });
      await Promise.all(updates);
      toast.success("Configurações salvas");
      setConfig({ ...config, ...patch });
    } catch (e: any) {
      toast.error("Falha ao salvar: " + e.message);
    } finally {
      setSavingConfig(false);
    }
  }

  // ── Filtragem ─────────────────────────────────────────────────────────────
  const filteredBots = useMemo(() => {
    return bots.filter(b => {
      if (filter !== "all" && b.status_label !== filter) return false;
      if (search && !(b.name || "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [bots, filter, search]);

  const filteredBlocklist = useMemo(() => {
    if (!search) return blocklist;
    return blocklist.filter(b => b.phone.includes(search) || (b.reason || "").includes(search));
  }, [blocklist, search]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-cyan-400" />
            Saúde dos Chips
            {!config.chip_health_enabled && (
              <span className="ml-2 px-2 py-0.5 text-[10px] uppercase tracking-wider rounded bg-amber-900/50 text-amber-200 border border-amber-500/40">
                Modo registro · proteção desligada
              </span>
            )}
          </h2>
          <p className="text-xs text-gray-500">Monitoramento de chips contra banimento, blocklist global e auditoria.</p>
        </div>
        <button onClick={loadAll} disabled={loading} className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-200 text-sm flex items-center gap-2 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Saudáveis" value={stats.healthy} color="emerald" icon={CheckCircle2} />
        <StatCard label="Em risco" value={stats.at_risk} color="amber" icon={AlertTriangle} />
        <StatCard label="Críticos" value={stats.critical} color="red" icon={XCircle} />
        <StatCard label="Pausados" value={stats.paused} color="zinc" icon={Pause} />
        <StatCard label="Bans 30d" value={stats.banned30d} color="purple" icon={Ban} />
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-slate-900/60 p-1 rounded-lg border border-gray-700/50 w-fit">
        {([
          ["bots", "Bots", Smartphone],
          ["blocklist", "Blocklist", Ban],
          ["bans", "Histórico", History],
          ["config", "Configurações", SettingsIcon],
        ] as const).map(([k, l, Icon]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-2 rounded text-sm font-medium flex items-center gap-2 transition-colors ${tab === k ? "bg-cyan-900/60 text-cyan-200 border border-cyan-500/40" : "text-gray-400 hover:text-gray-200 hover:bg-slate-800/60"}`}>
            <Icon className="w-4 h-4" />
            {l}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {tab === "bots" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar bot..."
                className="w-full bg-slate-900/60 border border-gray-700/50 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder:text-gray-500" />
            </div>
            <div className="flex gap-1">
              {(["all", "healthy", "at_risk", "critical", "paused", "warmup"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${filter === f ? "bg-cyan-900/60 text-cyan-200 border border-cyan-500/40" : "bg-slate-800 text-gray-400 hover:text-gray-200"}`}>
                  {f === "all" ? "Todos" : f === "healthy" ? "Saudáveis" : f === "at_risk" ? "Em risco" : f === "critical" ? "Críticos" : f === "paused" ? "Pausados" : "Warm-up"}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-900/40 border border-gray-700/50 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-900/80 text-gray-400 text-xs uppercase">
                  <tr>
                    <th className="text-left px-3 py-2">Bot</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-right px-3 py-2">Idade</th>
                    <th className="text-right px-3 py-2">Disparos hoje / cap</th>
                    <th className="text-right px-3 py-2">Resp 7d</th>
                    <th className="text-right px-3 py-2">Opt-out 30d</th>
                    <th className="text-right px-3 py-2">Score</th>
                    <th className="text-right px-3 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBots.length === 0 && (
                    <tr><td colSpan={8} className="text-center text-gray-500 py-6">{loading ? "Carregando..." : "Nenhum bot"}</td></tr>
                  )}
                  {filteredBots.map(b => {
                    const meta = STATUS_META[b.status_label];
                    const Icon = meta.icon;
                    const capColor = b.capPct > 95 ? "text-red-300" : b.capPct > 80 ? "text-amber-300" : "text-gray-300";
                    return (
                      <tr key={b.id} className="border-t border-gray-700/40 hover:bg-slate-900/40">
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-100">{b.name}</div>
                          <div className="text-[11px] text-gray-500">{b.instance_name || "—"}</div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border ${meta.bg} ${meta.text} ${meta.ring}`}>
                            <Icon className="w-3 h-3" /> {meta.label}
                          </span>
                          {b.paused_safety_at && (
                            <div className="text-[10px] text-zinc-400 mt-1 truncate max-w-[160px]" title={b.paused_safety_reason || ""}>
                              {b.paused_safety_reason || "Pausado"}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-300">{b.ageDays}d</td>
                        <td className={`px-3 py-2 text-right font-mono ${capColor}`}>
                          {b.campaignSendsToday}/{b.effectiveCap}
                          <div className="text-[10px] text-gray-500">{b.capPct}%</div>
                        </td>
                        <td className="px-3 py-2 text-right text-gray-300">{b.responseRate}%</td>
                        <td className={`px-3 py-2 text-right ${b.optOuts30d >= 5 ? "text-red-300" : b.optOuts30d >= 2 ? "text-amber-300" : "text-gray-300"}`}>
                          {b.optOuts30d}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className={`inline-block min-w-[40px] px-2 py-0.5 rounded text-xs font-semibold ${b.computedScore >= 70 ? "bg-emerald-900/50 text-emerald-200" : b.computedScore >= 40 ? "bg-amber-900/50 text-amber-200" : "bg-red-900/50 text-red-200"}`}>
                            {b.computedScore}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {b.paused_safety_at ? (
                            <button onClick={() => resumeBot(b)} className="text-emerald-300 hover:text-emerald-200 inline-flex items-center gap-1 text-xs">
                              <Play className="w-3 h-3" /> Reativar
                            </button>
                          ) : (
                            <button onClick={() => pauseBot(b)} className="text-amber-300 hover:text-amber-200 inline-flex items-center gap-1 text-xs">
                              <Pause className="w-3 h-3" /> Pausar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "blocklist" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar telefone ou motivo..."
                className="w-full bg-slate-900/60 border border-gray-700/50 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder:text-gray-500" />
            </div>
            <button onClick={addToBlocklist} className="px-3 py-2 rounded-lg bg-red-900/40 hover:bg-red-900/60 border border-red-500/40 text-red-200 text-sm flex items-center gap-2">
              <Plus className="w-4 h-4" /> Bloquear número
            </button>
          </div>

          <div className="bg-slate-900/40 border border-gray-700/50 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-slate-900/80 text-xs text-gray-400 flex items-center justify-between">
              <span>{filteredBlocklist.length} de {blocklist.length} bloqueados</span>
              {blocklist.length === 0 && <span>Quando alguém responder "para de me chamar", aparece aqui</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-900/80 text-gray-400 text-xs uppercase">
                  <tr>
                    <th className="text-left px-3 py-2">Telefone</th>
                    <th className="text-left px-3 py-2">Motivo</th>
                    <th className="text-left px-3 py-2">Origem</th>
                    <th className="text-left px-3 py-2">Quando</th>
                    <th className="text-left px-3 py-2">Notas</th>
                    <th className="text-right px-3 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBlocklist.length === 0 && (
                    <tr><td colSpan={6} className="text-center text-gray-500 py-6">Nenhum telefone na blocklist</td></tr>
                  )}
                  {filteredBlocklist.map(b => (
                    <tr key={b.phone} className="border-t border-gray-700/40 hover:bg-slate-900/40">
                      <td className="px-3 py-2 font-mono text-gray-200">{b.phone}</td>
                      <td className="px-3 py-2"><ReasonBadge reason={b.reason} /></td>
                      <td className="px-3 py-2 text-xs text-gray-400">{b.source === "auto" ? "🤖 auto" : "👤 admin"}</td>
                      <td className="px-3 py-2 text-xs text-gray-400">{relativeTime(b.created_at)}</td>
                      <td className="px-3 py-2 text-xs text-gray-500 max-w-[280px] truncate" title={b.notes || ""}>{b.notes || "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => removeFromBlocklist(b.phone)} className="text-red-300 hover:text-red-200 inline-flex items-center gap-1 text-xs">
                          <Trash2 className="w-3 h-3" /> Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "bans" && (
        <div className="bg-slate-900/40 border border-gray-700/50 rounded-xl overflow-hidden">
          <div className="px-3 py-2 bg-slate-900/80 text-xs text-gray-400">
            {bans.length} eventos · pausas automáticas, manuais e bans confirmados
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/80 text-gray-400 text-xs uppercase">
                <tr>
                  <th className="text-left px-3 py-2">Quando</th>
                  <th className="text-left px-3 py-2">Bot</th>
                  <th className="text-left px-3 py-2">Evento</th>
                  <th className="text-left px-3 py-2">Motivo</th>
                  <th className="text-left px-3 py-2">Métricas</th>
                </tr>
              </thead>
              <tbody>
                {bans.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-gray-500 py-6">Nenhum evento ainda</td></tr>
                )}
                {bans.map(e => (
                  <tr key={e.id} className="border-t border-gray-700/40 hover:bg-slate-900/40">
                    <td className="px-3 py-2 text-xs text-gray-400">{relativeTime(e.created_at)}</td>
                    <td className="px-3 py-2 text-gray-200">{e.bot_name || "—"}</td>
                    <td className="px-3 py-2"><EventBadge event={e.event} /></td>
                    <td className="px-3 py-2 text-xs text-gray-400 max-w-[300px] truncate" title={e.reason || ""}>{e.reason || "—"}</td>
                    <td className="px-3 py-2 text-xs text-gray-500 font-mono max-w-[280px] truncate" title={JSON.stringify(e.metrics_snapshot)}>
                      {e.metrics_snapshot ? `score=${e.metrics_snapshot.score ?? "?"} sends=${e.metrics_snapshot.sendsToday ?? "?"} optouts=${e.metrics_snapshot.optOuts30d ?? "?"}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "config" && (
        <ConfigPanel config={config} onSave={saveConfig} saving={savingConfig} />
      )}
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function StatCard({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: any }) {
  const map: Record<string, string> = {
    emerald: "from-emerald-900/40 to-emerald-900/10 border-emerald-500/30 text-emerald-300",
    amber:   "from-amber-900/40 to-amber-900/10 border-amber-500/30 text-amber-300",
    red:     "from-red-900/40 to-red-900/10 border-red-500/30 text-red-300",
    zinc:    "from-zinc-900/60 to-zinc-900/20 border-zinc-500/30 text-zinc-300",
    purple:  "from-purple-900/40 to-purple-900/10 border-purple-500/30 text-purple-300",
  };
  return (
    <div className={`bg-gradient-to-br ${map[color]} border rounded-xl p-3`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider opacity-70">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function ReasonBadge({ reason }: { reason: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    opt_out:      { label: "Opt-out",       cls: "bg-red-900/40 text-red-200 border-red-500/40" },
    reported:     { label: "Denunciado",    cls: "bg-purple-900/40 text-purple-200 border-purple-500/40" },
    manual:       { label: "Manual",        cls: "bg-zinc-900/60 text-zinc-200 border-zinc-500/40" },
    no_whatsapp:  { label: "Sem WA",        cls: "bg-gray-900/60 text-gray-300 border-gray-500/40" },
    banned:       { label: "Banido",        cls: "bg-red-950/60 text-red-300 border-red-700/40" },
  };
  const m = map[reason] || { label: reason, cls: "bg-slate-900 text-gray-300 border-gray-700/40" };
  return <span className={`px-2 py-0.5 rounded text-xs border ${m.cls}`}>{m.label}</span>;
}

function EventBadge({ event }: { event: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    paused_auto:    { label: "Auto-pausa",   cls: "bg-amber-900/40 text-amber-200 border-amber-500/40" },
    paused_manual:  { label: "Pausa manual", cls: "bg-zinc-900/60 text-zinc-200 border-zinc-500/40" },
    reactivated:    { label: "Reativado",    cls: "bg-emerald-900/40 text-emerald-200 border-emerald-500/40" },
    warmup_started: { label: "Warm-up",      cls: "bg-cyan-900/40 text-cyan-200 border-cyan-500/40" },
    warmup_completed:{ label: "Warm-up ok",  cls: "bg-emerald-900/40 text-emerald-200 border-emerald-500/40" },
    banned:         { label: "Banido",       cls: "bg-red-950/60 text-red-300 border-red-700/40" },
  };
  const m = map[event] || { label: event, cls: "bg-slate-900 text-gray-300 border-gray-700/40" };
  return <span className={`px-2 py-0.5 rounded text-xs border ${m.cls}`}>{m.label}</span>;
}

function ConfigPanel({ config, onSave, saving }: { config: SystemConfig; onSave: (p: Partial<SystemConfig>) => void; saving: boolean }) {
  const [draft, setDraft] = useState<SystemConfig>(config);
  useEffect(() => setDraft(config), [config]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(config);

  const Field = ({ label, value, onChange, hint, type = "number" }: { label: string; value: any; onChange: (v: any) => void; hint?: string; type?: string }) => (
    <div>
      <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(type === "number" ? Number(e.target.value) : e.target.value)}
        className="w-full bg-slate-900/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200" />
      {hint && <p className="text-[11px] text-gray-500 mt-1">{hint}</p>}
    </div>
  );

  const Toggle = ({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) => (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/40 border border-gray-700/40">
      <button onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${value ? "bg-emerald-600" : "bg-gray-700"}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${value ? "translate-x-5" : ""}`} />
      </button>
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-200">{label}</div>
        {hint && <div className="text-xs text-gray-500 mt-0.5">{hint}</div>}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3">
        <Toggle
          label="Sistema de Saúde dos Chips ativado"
          value={draft.chip_health_enabled}
          onChange={(v) => setDraft({ ...draft, chip_health_enabled: v })}
          hint="Quando desligado, o sistema apenas REGISTRA send_source nas mensagens. Quando ligado, bloqueia envios fora do cap, fora do horário, pra blocklist e de chips pausados."
        />
        <Toggle
          label="Auto-bloqueio de telefones em opt-out"
          value={draft.chip_blocklist_auto_enabled}
          onChange={(v) => setDraft({ ...draft, chip_blocklist_auto_enabled: v })}
          hint='Quando lead responde "para de me chamar" em conversa de campanha, adiciona o telefone na blocklist global automaticamente.'
        />
      </div>

      <div className="bg-slate-900/40 border border-gray-700/50 rounded-xl p-4">
        <h3 className="text-sm font-bold text-gray-200 mb-3">Cap diário por chip (cold outreach)</h3>
        <p className="text-xs text-gray-500 mb-4">Conta apenas mensagens de campanha e qualificação IA. Mensagens orgânicas (corretor, resposta a lead) não consomem o cap.</p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Chip 1-7 dias" value={draft.chip_cap_warmup_d1_7} onChange={(v) => setDraft({ ...draft, chip_cap_warmup_d1_7: v })} hint="Warm-up inicial" />
          <Field label="Chip 8-30 dias" value={draft.chip_cap_warmup_d8_30} onChange={(v) => setDraft({ ...draft, chip_cap_warmup_d8_30: v })} hint="Aquecimento" />
          <Field label="Chip >30 dias" value={draft.chip_cap_mature} onChange={(v) => setDraft({ ...draft, chip_cap_mature: v })} hint="Maduro" />
        </div>
      </div>

      <div className="bg-slate-900/40 border border-gray-700/50 rounded-xl p-4">
        <h3 className="text-sm font-bold text-gray-200 mb-3">Threshold de auto-pausa por opt-out (Opção C)</h3>
        <p className="text-xs text-gray-500 mb-4">Pausa o chip se em 24h: ≥{draft.chip_optout_abs_threshold_24h} opt-outs absolutos OU (≥{draft.chip_optout_pct_threshold_24h}% das conversas E ≥{draft.chip_optout_pct_min_count} opt-outs).</p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Threshold absoluto" value={draft.chip_optout_abs_threshold_24h} onChange={(v) => setDraft({ ...draft, chip_optout_abs_threshold_24h: v })} hint="ex: 3 opt-outs em 24h" />
          <Field label="Threshold % (24h)" value={draft.chip_optout_pct_threshold_24h} onChange={(v) => setDraft({ ...draft, chip_optout_pct_threshold_24h: v })} hint="ex: 5% das conversas" />
          <Field label="% mínimo absoluto" value={draft.chip_optout_pct_min_count} onChange={(v) => setDraft({ ...draft, chip_optout_pct_min_count: v })} hint="floor pro %" />
        </div>
      </div>

      <div className="bg-slate-900/40 border border-gray-700/50 rounded-xl p-4">
        <h3 className="text-sm font-bold text-gray-200 mb-3">Janela de envio (BRT)</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Início (hora)" value={draft.chip_send_window_start} onChange={(v) => setDraft({ ...draft, chip_send_window_start: v })} hint="Disparos só a partir desta hora" />
          <Field label="Fim (hora)" value={draft.chip_send_window_end} onChange={(v) => setDraft({ ...draft, chip_send_window_end: v })} hint="Para de disparar nesta hora" />
        </div>
      </div>

      <div className="bg-slate-900/40 border border-gray-700/50 rounded-xl p-4">
        <h3 className="text-sm font-bold text-gray-200 mb-3">Simulação de "digitando..." (humaniza envio)</h3>
        <p className="text-xs text-gray-500 mb-4">Antes de enviar mensagem em campanha, o chip exibe "digitando..." pra simular comportamento humano. Aplica apenas em envios cold (campanha + qualificação IA).</p>
        <Toggle
          label="Mostrar digitando antes do envio"
          value={draft.chip_typing_simulation_enabled}
          onChange={(v) => setDraft({ ...draft, chip_typing_simulation_enabled: v })}
          hint="Tempo aleatório entre min e max abaixo. Adiciona latência por envio."
        />
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Field label="Mín (ms)" value={draft.chip_typing_min_ms} onChange={(v) => setDraft({ ...draft, chip_typing_min_ms: v })} hint="ex: 3000 = 3s" />
          <Field label="Máx (ms)" value={draft.chip_typing_max_ms} onChange={(v) => setDraft({ ...draft, chip_typing_max_ms: v })} hint="ex: 8000 = 8s" />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        {dirty && <span className="text-xs text-amber-300">Alterações pendentes</span>}
        <button disabled={!dirty || saving} onClick={() => onSave(draft)}
          className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium flex items-center gap-2">
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Salvar configurações
        </button>
      </div>
    </div>
  );
}
