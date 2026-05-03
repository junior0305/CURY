import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  FlaskConical, Trophy, MessageCircle, Inbox, Repeat, Sparkles,
  RefreshCw, Pause, Play, AlertTriangle, CheckCircle2, Loader2,
  TrendingUp, TrendingDown, Search, Filter,
} from "lucide-react";

type Kind = "prospecting" | "welcome" | "cadence_step";
type Lifecycle = "active" | "testing" | "paused";
type SubTab = "overview" | "prospecting" | "welcome" | "cadence_step" | "variations" | "config";

interface TemplateStat {
  kind: Kind;
  id: string;
  name: string;
  message: string;
  segment: string | null;
  sent: number;
  responded: number;
  qualified: number;
  opted_out: number;
  is_active: boolean;
  is_draft: boolean;
  ai_generated: boolean;
  parent_id: string | null;
  last_used_at: string | null;
  auto_paused_at: string | null;
  auto_paused_reason: string | null;
  created_at: string;
  smooth_qualified_rate: number;
  smooth_response_rate: number;
  opt_out_rate: number;
  qualified_rate_raw: number;
  response_rate_raw: number;
  score: number;
  lifecycle_status: Lifecycle;
}

const KIND_META: Record<Kind, { label: string; icon: any; color: string }> = {
  prospecting:  { label: "Prospecção",   icon: MessageCircle, color: "blue" },
  welcome:      { label: "Boas-vindas",  icon: Inbox,         color: "emerald" },
  cadence_step: { label: "Cadência",     icon: Repeat,        color: "purple" },
};

const STATUS_META: Record<Lifecycle, { label: string; cls: string; icon: any }> = {
  active:  { label: "Ativo",      cls: "bg-emerald-900/40 text-emerald-200 border-emerald-500/40", icon: CheckCircle2 },
  testing: { label: "Em teste",   cls: "bg-cyan-900/40 text-cyan-200 border-cyan-500/40",          icon: FlaskConical },
  paused:  { label: "Pausado",    cls: "bg-zinc-900/60 text-zinc-200 border-zinc-500/40",          icon: Pause },
};

function tierFromScore(score: number, lifecycle: Lifecycle, sent: number): "champion" | "strong" | "average" | "weak" | "untested" | "paused" {
  if (lifecycle === "paused") return "paused";
  if (sent < 30) return "untested";
  if (score >= 50) return "champion";
  if (score >= 30) return "strong";
  if (score >= 15) return "average";
  return "weak";
}

const TIER_META: Record<string, { label: string; emoji: string; cls: string }> = {
  champion: { label: "Campeão",  emoji: "🏆", cls: "bg-amber-900/40 text-amber-200 border-amber-500/40" },
  strong:   { label: "Forte",    emoji: "💪", cls: "bg-emerald-900/40 text-emerald-200 border-emerald-500/40" },
  average:  { label: "Médio",    emoji: "📊", cls: "bg-slate-800 text-gray-300 border-gray-600/40" },
  weak:     { label: "Fraco",    emoji: "⚠️", cls: "bg-orange-900/40 text-orange-200 border-orange-500/40" },
  untested: { label: "Sem dados", emoji: "🔬", cls: "bg-cyan-900/40 text-cyan-200 border-cyan-500/40" },
  paused:   { label: "Pausado",  emoji: "🛑", cls: "bg-zinc-900/60 text-zinc-300 border-zinc-500/40" },
};

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function AbLab() {
  const [tab, setTab] = useState<SubTab>("overview");
  const [stats, setStats] = useState<TemplateStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | Lifecycle>("all");
  const [recomputing, setRecomputing] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("v_template_stats")
        .select("*")
        .order("score", { ascending: false });
      if (error) throw error;
      setStats((data || []) as TemplateStat[]);
    } catch (e: any) {
      toast.error("Erro ao carregar stats: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  async function recompute() {
    setRecomputing(true);
    try {
      await supabase.rpc("ab_lab_backfill_template_kind");
      const { data } = await supabase.rpc("ab_lab_recompute_template_stats");
      toast.success(`Recalculado: ${JSON.stringify(data || {})}`);
      await loadStats();
    } catch (e: any) {
      toast.error("Falha: " + e.message);
    } finally {
      setRecomputing(false);
    }
  }

  async function pauseTemplate(t: TemplateStat) {
    const reason = prompt("Motivo (opcional):", "Pausado manualmente");
    if (reason === null) return;
    const table = t.kind === "prospecting" ? "prospecting_message_templates"
                : t.kind === "welcome"     ? "welcome_templates"
                : "cadence_steps";
    const { error } = await supabase.from(table).update({
      auto_paused_at: new Date().toISOString(),
      auto_paused_reason: reason || "Pausado manualmente",
    }).eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("Pausado");
    loadStats();
  }

  async function resumeTemplate(t: TemplateStat) {
    const table = t.kind === "prospecting" ? "prospecting_message_templates"
                : t.kind === "welcome"     ? "welcome_templates"
                : "cadence_steps";
    const { error } = await supabase.from(table).update({
      auto_paused_at: null, auto_paused_reason: null,
    }).eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("Reativado");
    loadStats();
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const s = { champion: 0, strong: 0, average: 0, weak: 0, untested: 0, paused: 0, total_sent: 0 };
    stats.forEach(t => {
      const tier = tierFromScore(t.score, t.lifecycle_status, t.sent);
      s[tier]++;
      s.total_sent += t.sent;
    });
    return s;
  }, [stats]);

  const filteredByKind = useCallback((kind: Kind) => {
    return stats.filter(t => {
      if (t.kind !== kind) return false;
      if (filter !== "all" && t.lifecycle_status !== filter) return false;
      if (search && !(t.name || "").toLowerCase().includes(search.toLowerCase()) && !(t.message || "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [stats, filter, search]);

  const variationsPending = useMemo(() => stats.filter(t => t.is_draft && t.ai_generated), [stats]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-fuchsia-400" />
            A/B Lab
          </h2>
          <p className="text-xs text-gray-500">Performance comparada de mensagens, ranking por score e geração de variações pela IA.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={recompute} disabled={recomputing}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-200 text-sm flex items-center gap-2 disabled:opacity-50">
            {recomputing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Recalcular do histórico
          </button>
          <button onClick={loadStats} disabled={loading}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-200 text-sm flex items-center gap-2 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-1 bg-slate-900/60 p-1 rounded-lg border border-gray-700/50 w-fit">
        {([
          ["overview",     "Visão Geral",   Trophy],
          ["prospecting",  "Prospecção",    MessageCircle],
          ["welcome",      "Boas-vindas",   Inbox],
          ["cadence_step", "Cadência",      Repeat],
          ["variations",   `Variações IA${variationsPending.length ? ` (${variationsPending.length})` : ""}`, Sparkles],
        ] as const).map(([k, l, Icon]) => (
          <button key={k} onClick={() => setTab(k as SubTab)}
            className={`px-3 py-2 rounded text-sm font-medium flex items-center gap-2 transition-colors ${tab === k ? "bg-fuchsia-900/60 text-fuchsia-200 border border-fuchsia-500/40" : "text-gray-400 hover:text-gray-200 hover:bg-slate-800/60"}`}>
            <Icon className="w-4 h-4" />
            {l}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <OverviewTab summary={summary} stats={stats} />
      )}

      {(tab === "prospecting" || tab === "welcome" || tab === "cadence_step") && (
        <KindTab
          kind={tab as Kind}
          rows={filteredByKind(tab as Kind)}
          search={search} onSearch={setSearch}
          filter={filter} onFilter={setFilter}
          onPause={pauseTemplate} onResume={resumeTemplate}
          onChanged={loadStats}
        />
      )}

      {tab === "variations" && (
        <VariationsTab stats={stats} onChanged={loadStats} />
      )}
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────

function OverviewTab({ summary, stats }: { summary: any; stats: TemplateStat[] }) {
  const tops = [...stats]
    .filter(t => t.lifecycle_status !== "paused" && t.sent >= 30)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const worsts = [...stats]
    .filter(t => t.lifecycle_status !== "paused" && t.sent >= 30)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <SummaryCard label="🏆 Campeões"   value={summary.champion} color="amber" />
        <SummaryCard label="💪 Fortes"     value={summary.strong}   color="emerald" />
        <SummaryCard label="📊 Médios"     value={summary.average}  color="slate" />
        <SummaryCard label="⚠️ Fracos"     value={summary.weak}     color="orange" />
        <SummaryCard label="🔬 Sem dados"  value={summary.untested} color="cyan" />
        <SummaryCard label="🛑 Pausados"   value={summary.paused}   color="zinc" />
      </div>

      <div className="text-xs text-gray-500 -mb-2">
        💡 Score = 0.7 × qualified rate (suavizado) + 0.2 × response rate (suavizado) − 2 × opt-out rate. Mínimo 30 envios pra entrar no ranking.
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <RankCard title="Top 5 — campeões" rows={tops}    icon={TrendingUp}   accent="emerald" empty="Quando algum template tiver ≥30 envios, aparece aqui" />
        <RankCard title="Atenção — piores" rows={worsts}  icon={TrendingDown} accent="orange"  empty="Sem candidatos a melhoria ainda" />
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  const map: Record<string, string> = {
    amber:   "from-amber-900/40 to-amber-900/10 border-amber-500/30 text-amber-200",
    emerald: "from-emerald-900/40 to-emerald-900/10 border-emerald-500/30 text-emerald-200",
    slate:   "from-slate-800 to-slate-900 border-gray-600/30 text-gray-200",
    orange:  "from-orange-900/40 to-orange-900/10 border-orange-500/30 text-orange-200",
    cyan:    "from-cyan-900/40 to-cyan-900/10 border-cyan-500/30 text-cyan-200",
    zinc:    "from-zinc-900/60 to-zinc-900/20 border-zinc-500/30 text-zinc-200",
  };
  return (
    <div className={`bg-gradient-to-br ${map[color]} border rounded-xl p-3`}>
      <div className="text-xs uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function RankCard({ title, rows, icon: Icon, accent, empty }: { title: string; rows: TemplateStat[]; icon: any; accent: string; empty: string }) {
  const accentMap: Record<string, string> = {
    emerald: "text-emerald-400",
    orange:  "text-orange-400",
  };
  return (
    <div className="bg-slate-900/40 border border-gray-700/50 rounded-xl p-4">
      <h3 className="text-sm font-bold text-gray-200 mb-3 flex items-center gap-2">
        <Icon className={`w-4 h-4 ${accentMap[accent]}`} /> {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-500 italic">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map(t => {
            const meta = KIND_META[t.kind];
            const KindIcon = meta.icon;
            return (
              <li key={`${t.kind}-${t.id}`} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-slate-900/60 border border-gray-700/40">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <KindIcon className="w-3 h-3" /> {meta.label} · {t.sent} envios
                  </div>
                  <div className="text-sm text-gray-100 truncate" title={t.name}>{t.name || "(sem nome)"}</div>
                  <div className="text-[11px] text-gray-500 truncate" title={t.message}>{(t.message || "").substring(0, 100)}</div>
                </div>
                <div className={`text-right ${accentMap[accent]}`}>
                  <div className="text-lg font-black leading-none">{t.score}</div>
                  <div className="text-[10px] uppercase tracking-wider opacity-70">score</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Kind tab (lista de templates por tipo) ───────────────────────────────────

function KindTab({ kind, rows, search, onSearch, filter, onFilter, onPause, onResume, onChanged }: {
  kind: Kind; rows: TemplateStat[]; search: string; onSearch: (s: string) => void;
  filter: "all" | Lifecycle; onFilter: (f: any) => void;
  onPause: (t: TemplateStat) => void; onResume: (t: TemplateStat) => void;
  onChanged: () => void;
}) {
  const [genLoading, setGenLoading] = useState<string | null>(null);

  async function generateVariations(t: TemplateStat) {
    if (!confirm(`Gerar 3 variações da mensagem "${t.name}" via IA?`)) return;
    setGenLoading(t.id);
    try {
      const { data, error } = await supabase.functions.invoke("generate-template-variations", {
        body: { template_id: t.id, kind: t.kind, count: 3 },
      });
      if (error) throw error;
      toast.success(`${data?.created || 0} variações criadas como rascunho — revise na aba "Variações IA"`);
      onChanged();
    } catch (e: any) {
      toast.error("Falha: " + e.message);
    } finally {
      setGenLoading(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Buscar por nome ou conteúdo..."
            className="w-full bg-slate-900/60 border border-gray-700/50 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder:text-gray-500" />
        </div>
        <div className="flex gap-1">
          {(["all", "active", "testing", "paused"] as const).map(f => (
            <button key={f} onClick={() => onFilter(f)}
              className={`px-2 py-1 text-xs rounded transition-colors ${filter === f ? "bg-fuchsia-900/60 text-fuchsia-200 border border-fuchsia-500/40" : "bg-slate-800 text-gray-400 hover:text-gray-200"}`}>
              {f === "all" ? "Todos" : f === "active" ? "Ativos" : f === "testing" ? "Em teste" : "Pausados"}
            </button>
          ))}
        </div>
      </div>

      <div className="text-xs text-gray-500">
        {rows.length} {KIND_META[kind].label.toLowerCase()}.
        {kind !== "prospecting" && rows.every(r => r.sent === 0) && (
          <span className="ml-2 text-amber-300">⚠️ Sem dados ainda — instrumentação foi instalada agora; envios novos serão rastreados.</span>
        )}
      </div>

      <div className="space-y-2">
        {rows.length === 0 && (
          <div className="text-center text-gray-500 py-8">Nenhum template</div>
        )}
        {rows.map(t => {
          const tier = tierFromScore(t.score, t.lifecycle_status, t.sent);
          const tierMeta = TIER_META[tier];
          return (
            <div key={t.id} className="bg-slate-900/40 border border-gray-700/50 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-gray-100">{t.name || "(sem nome)"}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border ${tierMeta.cls}`}>
                      {tierMeta.emoji} {tierMeta.label}
                    </span>
                    {t.ai_generated && (
                      <span className="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider bg-fuchsia-900/40 text-fuchsia-200 border border-fuchsia-500/40">
                        🪄 IA
                      </span>
                    )}
                    {t.is_draft && (
                      <span className="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider bg-amber-900/40 text-amber-200 border border-amber-500/40">
                        📝 rascunho
                      </span>
                    )}
                    {t.segment && (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-gray-400">{t.segment}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-300 whitespace-pre-wrap line-clamp-3 mb-2">{t.message}</p>
                  {t.auto_paused_reason && (
                    <div className="text-[11px] text-zinc-400 mb-2"><AlertTriangle className="inline w-3 h-3 mr-1" />{t.auto_paused_reason}</div>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                    <Metric label="Enviados"    value={t.sent.toString()} />
                    <Metric label="Resp. real"  value={`${t.response_rate_raw}%`}  hint={`${t.responded}/${t.sent}`} />
                    <Metric label="Qual. real"  value={`${t.qualified_rate_raw}%`} hint={`${t.qualified}/${t.sent}`} accent="emerald" />
                    <Metric label="Opt-out"     value={`${t.opt_out_rate}%`}       hint={`${t.opted_out}/${t.sent}`} accent={t.opt_out_rate > 5 ? "red" : "default"} />
                    <Metric label="Último uso"  value={relativeTime(t.last_used_at)} />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <div className={`text-2xl font-black ${t.score >= 50 ? "text-amber-400" : t.score >= 30 ? "text-emerald-400" : t.score >= 15 ? "text-gray-300" : "text-orange-400"}`}>
                    {t.score}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 -mt-1">score</div>
                  <div className="flex gap-1 mt-2">
                    {t.lifecycle_status === "paused" ? (
                      <button onClick={() => onResume(t)} title="Reativar"
                        className="p-1.5 rounded bg-slate-800 hover:bg-emerald-900/40 text-emerald-300 border border-gray-700/40">
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button onClick={() => onPause(t)} title="Pausar"
                        className="p-1.5 rounded bg-slate-800 hover:bg-zinc-900/60 text-zinc-300 border border-gray-700/40">
                        <Pause className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {t.sent >= 30 && (
                      <button onClick={() => generateVariations(t)} disabled={genLoading === t.id} title="Gerar variações com IA"
                        className="p-1.5 rounded bg-slate-800 hover:bg-fuchsia-900/40 text-fuchsia-300 border border-gray-700/40 disabled:opacity-50">
                        {genLoading === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value, hint, accent = "default" }: { label: string; value: string; hint?: string; accent?: "default" | "emerald" | "red" }) {
  const cls = accent === "emerald" ? "text-emerald-300" : accent === "red" ? "text-red-300" : "text-gray-200";
  return (
    <div className="bg-slate-900/60 border border-gray-700/40 rounded px-2 py-1">
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`text-sm font-mono font-semibold ${cls}`}>{value}</div>
      {hint && <div className="text-[10px] text-gray-500">{hint}</div>}
    </div>
  );
}

// ── Variações IA (rascunhos pendentes) ───────────────────────────────────────

function VariationsTab({ stats, onChanged }: { stats: TemplateStat[]; onChanged: () => void }) {
  const drafts = useMemo(() => stats.filter(t => t.is_draft && t.ai_generated), [stats]);
  const parents = useMemo(() => {
    const m = new Map<string, TemplateStat>();
    stats.forEach(t => { if (!t.is_draft) m.set(`${t.kind}-${t.id}`, t); });
    return m;
  }, [stats]);

  async function approve(t: TemplateStat) {
    const table = t.kind === "prospecting" ? "prospecting_message_templates"
                : t.kind === "welcome"     ? "welcome_templates"
                : "cadence_steps";
    const { error } = await supabase.from(table).update({
      is_draft: false, is_active: true,
    }).eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("Variação aprovada e ativada");
    onChanged();
  }

  async function reject(t: TemplateStat) {
    if (!confirm(`Descartar essa variação de "${t.name}"?`)) return;
    const table = t.kind === "prospecting" ? "prospecting_message_templates"
                : t.kind === "welcome"     ? "welcome_templates"
                : "cadence_steps";
    const { error } = await supabase.from(table).delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("Variação descartada");
    onChanged();
  }

  if (drafts.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p>Nenhum rascunho pendente.</p>
        <p className="text-xs mt-1">Use o botão <Sparkles className="inline w-3 h-3" /> num template campeão pra gerar variações.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-gray-400">
        {drafts.length} variação(ões) gerada(s) pela IA aguardando aprovação. Comparando com o template original.
      </div>

      {drafts.map(d => {
        const parent = d.parent_id ? parents.get(`${d.kind}-${d.parent_id}`) : null;
        return (
          <div key={d.id} className="bg-slate-900/40 border border-fuchsia-500/30 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-fuchsia-400" />
                <span className="text-sm font-semibold text-fuchsia-200">{d.name}</span>
                <span className="text-xs text-gray-500">· {KIND_META[d.kind].label}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => reject(d)} className="px-3 py-1.5 rounded text-xs bg-slate-800 hover:bg-red-900/40 text-gray-300 hover:text-red-200 border border-gray-700/40">
                  Descartar
                </button>
                <button onClick={() => approve(d)} className="px-3 py-1.5 rounded text-xs bg-emerald-700 hover:bg-emerald-600 text-white font-medium">
                  Aprovar e ativar
                </button>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">📜 Original {parent ? `(score ${parent.score})` : ""}</div>
                <div className="bg-slate-900/60 border border-gray-700/40 rounded p-3 text-xs text-gray-300 whitespace-pre-wrap">
                  {parent?.message || "(template pai não encontrado)"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-fuchsia-400 mb-1">🪄 Variação proposta</div>
                <div className="bg-fuchsia-950/30 border border-fuchsia-500/30 rounded p-3 text-xs text-gray-100 whitespace-pre-wrap">
                  {d.message}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
