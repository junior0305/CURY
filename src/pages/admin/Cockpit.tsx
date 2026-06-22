import { useEffect, useState, useCallback, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  Activity, RefreshCw, TrendingUp, TrendingDown, UserX, PhoneOff, Target,
  Timer, Shield, Cpu, Users, MapPin, Wifi, WifiOff, Bot, ChevronRight,
  LogIn, UserCheck, Zap, Trophy, RotateCcw, Flag, Lightbulb, Loader2, ExternalLink,
  Megaphone, AlertTriangle, Check,
} from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import CockpitReuniao from "./CockpitReuniao";

// ─── Types (espelham o RPC cockpit_v2) ───────────────────────────────────────

interface BrokerRow {
  broker_id: string;
  name: string | null;
  recebidos: number; trabalhados: number; parados: number;
  ignorados: number; visitas: number; vendas: number;
  last_seen: string | null;
}
interface ManagerRow {
  manager_id: string | null;
  manager_name: string;
  recebidos: number; trabalhados: number; parados: number;
  ignorados: number; visitas: number; vendas: number;
  brokers: BrokerRow[];
}
interface GoalsData {
  has_goals: boolean;
  month_label: string;
  days_in_month: number; days_elapsed: number; days_left: number;
  geral: { target: number; realized: number; pct: number; gap: number };
  teams: { manager_name: string; team_name: string; target: number; realized: number; pct: number; gap: number }[];
}

interface CockpitData {
  mode: string;
  period_start: string;
  period_end: string;
  generated_at: string;
  entrada: {
    hoje: number; periodo: number; periodo_prev: number;
    sem_corretor: number; nunca_tocados: number;
    regioes: { regiao: string; n: number }[];
  };
  adocao: {
    online_agora: number; logaram_hoje: number; ativos_24h: number;
    sumidos: number; total_ops: number; tocaram_hoje: number;
    sumidos_list: { name: string | null; last_seen: string | null }[];
    chips_online: number; chips_offline: number;
  };
  gerencias: ManagerRow[];
  velocidade: { b1: number; b2: number; b3: number; b4: number };
  automacao: { followup_auto: number; leads_responderam: number; resgates: number; conversas_ia: number };
  saida: { vendas: number; visitas: number; recebidos: number; parados: number; ignorados: number; conversao: number };
  tendencia: { date: string; received: number; concluded: number }[];
}

type Mode = "today" | "7d" | "month" | "custom";
const MODE_LABEL: Record<Mode, string> = { today: "Hoje", "7d": "7 dias", month: "Mês vigente", custom: "Personalizado" };
const MONTHS_PT = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
function monthLabelPt(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso || "");
  if (!m) return iso;
  return `${MONTHS_PT[parseInt(m[2], 10) - 1]}/${m[1]}`;
}

// ─── Animated Counter ────────────────────────────────────────────────────────

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = display, end = value, diff = end - start;
    if (diff === 0) return;
    const steps = 18; let step = 0;
    const id = setInterval(() => {
      step++;
      setDisplay(Math.round(start + diff * (step / steps)));
      if (step >= steps) { clearInterval(id); setDisplay(end); }
    }, 22);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <>{display}</>;
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

const CARD_THEMES = {
  cyan:    { border: "#00D4FF", glow: "rgba(0,212,255,0.15)", text: "#00D4FF", bg: "rgba(0,212,255,0.05)" },
  red:     { border: "#EF4444", glow: "rgba(239,68,68,0.18)", text: "#F87171", bg: "rgba(239,68,68,0.06)" },
  amber:   { border: "#F59E0B", glow: "rgba(245,158,11,0.15)", text: "#FCD34D", bg: "rgba(245,158,11,0.05)" },
  emerald: { border: "#10B981", glow: "rgba(16,185,129,0.15)", text: "#34D399", bg: "rgba(16,185,129,0.05)" },
  purple:  { border: "#7C3AED", glow: "rgba(124,58,237,0.18)", text: "#A78BFA", bg: "rgba(124,58,237,0.06)" },
  slate:   { border: "#334155", glow: "rgba(51,65,85,0.1)",    text: "#94A3B8", bg: "rgba(15,23,42,0.5)" },
};
type CardTheme = keyof typeof CARD_THEMES;

function StatCard({
  label, value, sub, icon: Icon, theme, pulse, delay = 0, onClick,
}: {
  label: string; value: number | string; sub?: React.ReactNode;
  icon: React.ElementType; theme: CardTheme; pulse?: boolean; delay?: number; onClick?: () => void;
}) {
  const t = CARD_THEMES[theme];
  const isNum = typeof value === "number";
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      onClick={onClick}
      className={cn("relative rounded-2xl p-4 flex flex-col gap-2 overflow-hidden", onClick && "cursor-pointer hover:brightness-125 transition")}
      style={{ background: t.bg, border: `1px solid ${t.border}40`, boxShadow: `0 0 20px ${t.glow}, inset 0 1px 0 ${t.border}10` }}
    >
      <div className="absolute top-0 left-4 right-4 h-px" style={{ background: `linear-gradient(90deg, transparent, ${t.border}80, transparent)` }} />
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#475569" }}>{label}</span>
        <Icon className={cn("w-4 h-4", pulse && "animate-pulse")} style={{ color: t.text }} />
      </div>
      <p className="text-3xl font-black" style={{ color: t.text, textShadow: `0 0 20px ${t.border}60` }}>
        {isNum ? <AnimatedNumber value={value as number} /> : value}
      </p>
      {sub && <p className="text-[10px]" style={{ color: "#475569" }}>{sub}</p>}
    </motion.div>
  );
}

// ─── Section Title ────────────────────────────────────────────────────────────

function SectionTitle({ children, icon: Icon, color = "#00D4FF", right }: {
  children: React.ReactNode; icon?: React.ElementType; color?: string; right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="flex items-center gap-2 px-3 py-1 rounded-full" style={{ border: `1px solid ${color}30`, background: `${color}08` }}>
        {Icon && <Icon className="w-3 h-3" style={{ color }} />}
        <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap" style={{ color }}>{children}</span>
      </div>
      <div className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${color}40, transparent)` }} />
      {right}
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function sinceDays(iso: string | null): string {
  if (!iso) return "nunca logou";
  const d = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (d < 1) return "hoje";
  const days = Math.floor(d);
  return `há ${days}d`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Cockpit() {
  const [mode, setMode] = useState<Mode>("7d");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [data, setData] = useState<CockpitData | null>(null);
  const [goals, setGoals] = useState<GoalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showSumidos, setShowSumidos] = useState(false);
  const [view, setView] = useState<"operacao" | "reuniao">("operacao");
  // dica: por escopo ('geral' ou manager_id) → texto; e loading por escopo
  const [dicas, setDicas] = useState<Record<string, string>>({});
  const [dicaLoading, setDicaLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params: { p_mode: Mode; p_start?: string; p_end?: string } = { p_mode: mode };
    if (mode === "custom") {
      if (!customStart || !customEnd) { setLoading(false); return; }
      params.p_start = customStart; params.p_end = customEnd;
    }
    const [{ data: rpc, error }, { data: g }] = await Promise.all([
      supabase.rpc("cockpit_v2", params),
      supabase.rpc("cockpit_goals"),
    ]);
    if (!error && rpc) setData(rpc as CockpitData);
    if (g) setGoals(g as GoalsData);
    setLastRefresh(new Date());
    setLoading(false);
  }, [mode, customStart, customEnd]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  // ── Devedores (chicote acionável) ───────────────────────────────────────────
  type DevBroker = { broker_id: string; name: string | null; gerencia: string; count: number; worst_days: number; avg_days: number; has_phone: boolean; is_active: boolean; leads: { name: string; days: number }[] };
  const [showDev, setShowDev] = useState(false);
  const [dev, setDev] = useState<{ total: number; brokers_count: number; brokers: DevBroker[] } | null>(null);
  const [devLoading, setDevLoading] = useState(false);
  const [cobrando, setCobrando] = useState<string | null>(null);
  const [cobrado, setCobrado] = useState<Record<string, boolean>>({});

  const loadDev = useCallback(async () => {
    setDevLoading(true);
    const { data, error } = await supabase.rpc("cockpit_devedores", { p_limit: 50 });
    if (!error && data) setDev(data as any);
    setDevLoading(false);
  }, []);

  const cobrar = useCallback(async (b: DevBroker) => {
    setCobrando(b.broker_id);
    const { data, error } = await supabase.functions.invoke("cockpit-cobrar", { body: { broker_id: b.broker_id } });
    setCobrando(null);
    if (error || !data?.success) { showError("Não cobrou: " + (error?.message || data?.error || "erro")); return; }
    if (data.nothing) { showSuccess(`${b.name} já está em dia 🎉`); setCobrado(c => ({ ...c, [b.broker_id]: true })); return; }
    showSuccess(`Cobrado ${data.broker}: corretor ${data.broker_sent ? "✓" : "✗"} · gerente ${data.manager_sent ? "✓" : "—"}`);
    setCobrado(c => ({ ...c, [b.broker_id]: true }));
  }, []);

  const gerarDica = useCallback(async (scope: string, force = false) => {
    setDicaLoading(scope);
    const { data: res, error } = await supabase.functions.invoke("cockpit-meta-dica", { body: { scope, force } });
    if (!error && res?.dica) setDicas(d => ({ ...d, [scope]: res.dica }));
    else setDicas(d => ({ ...d, [scope]: "Não consegui gerar a dica agora. Tente de novo." }));
    setDicaLoading(null);
  }, []);

  const e = data?.entrada;
  const a = data?.adocao;
  const v = data?.velocidade;
  const speedTotal = v ? v.b1 + v.b2 + v.b3 + v.b4 : 0;
  const speedBuckets = v ? [
    { label: "< 1 hora",   count: v.b1, neon: "#10B981" },
    { label: "1h – 4h",    count: v.b2, neon: "#38BDF8" },
    { label: "4h – 24h",   count: v.b3, neon: "#F59E0B" },
    { label: "> 24 horas", count: v.b4, neon: "#EF4444" },
  ] : [];
  const entradaDelta = e && e.periodo_prev > 0
    ? Math.round(((e.periodo - e.periodo_prev) / e.periodo_prev) * 100) : null;
  const maxRegiao = Math.max(...(e?.regioes.map(r => r.n) ?? [1]), 1);
  const maxTrend = Math.max(...(data?.tendencia.map(d => d.received) ?? [1]), 1);
  const tocaramPct = a && a.total_ops > 0 ? Math.round((a.tocaram_hoje / a.total_ops) * 100) : 0;
  // Metas — ritmo
  const gg = goals?.geral;
  const perDayNeeded = goals && gg && goals.days_left > 0 ? gg.gap / goals.days_left : null;
  const expectedByNow = gg && goals && goals.days_in_month > 0 ? gg.target * (goals.days_elapsed / goals.days_in_month) : 0;
  const onPace = gg ? gg.realized >= expectedByNow : false;
  const teamMgrId = (name: string) => data?.gerencias.find(g => g.manager_name === name)?.manager_id ?? name;
  const gotoMetas = () => window.dispatchEvent(new CustomEvent("cockpit-goto-tab", { detail: { group: "financeiro", sub: "metas" } }));

  return (
    <div className="p-4 md:p-6 space-y-9">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black uppercase tracking-[0.15em] flex items-center gap-2"
            style={{ color: "#fff", textShadow: "0 0 20px rgba(0,212,255,0.4)" }}>
            <Activity className="w-5 h-5" style={{ color: "#00D4FF" }} />
            Cockpit
          </h2>
          <p className="text-[10px] uppercase tracking-widest mt-0.5" style={{ color: "#334155" }}>
            Entrada → Adoção → Execução → Saída · atualizado {formatDistanceToNow(lastRefresh, { locale: ptBR, addSuffix: true })}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* seletor Operação | Reunião */}
          <div className="flex p-1 gap-1 rounded-xl" style={{ background: "rgba(8,11,20,0.8)", border: "1px solid #1E293B" }}>
            {(["operacao", "reuniao"] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className="px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all"
                style={view === v ? { background: "linear-gradient(135deg, #0066FF, #00D4FF)", color: "#fff", boxShadow: "0 0 12px rgba(0,212,255,0.35)" } : { color: "#475569" }}>
                {v === "operacao" ? "Operação" : "Reunião"}
              </button>
            ))}
          </div>
          {view === "operacao" && (<>
          <div className="flex p-1 gap-1 rounded-xl" style={{ background: "rgba(8,11,20,0.8)", border: "1px solid #1E293B" }}>
            {(["today", "7d", "month", "custom"] as Mode[]).map(m => (
              <button key={m} onClick={() => setMode(m)}
                className="px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all"
                style={mode === m ? { background: "linear-gradient(135deg, #0066FF, #00D4FF)", color: "#fff", boxShadow: "0 0 12px rgba(0,212,255,0.35)" } : { color: "#475569" }}>
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
          {mode === "custom" && (
            <div className="flex items-center gap-1.5">
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                className="px-2 py-1.5 rounded-lg text-xs bg-slate-900 border border-slate-700 text-slate-200" />
              <span className="text-slate-600 text-xs">→</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                className="px-2 py-1.5 rounded-lg text-xs bg-slate-900 border border-slate-700 text-slate-200" />
            </div>
          )}
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-30"
            style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.2)", color: "#00D4FF" }}>
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            {loading ? "Carregando" : "Atualizar"}
          </button>
          </>)}
        </div>
      </motion.div>

      {view === "reuniao" && <CockpitReuniao />}
      {view === "operacao" && (<Fragment>

      {/* ── 0. METAS (placar do mês) ────────────────────────────────────────── */}
      <div>
        <SectionTitle icon={Flag} color="#10B981"
          right={
            <button onClick={() => gerarDica("geral")} disabled={dicaLoading === "geral"}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40"
              style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.35)", color: "#FCD34D" }}>
              {dicaLoading === "geral" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lightbulb className="w-3 h-3" />}
              Dica da IA
            </button>
          }>
          Metas — {goals ? monthLabelPt(goals.month_label) : "mês vigente"}
        </SectionTitle>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Placar geral */}
          <div className="lg:col-span-2 rounded-2xl p-5" style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.25)" }}>
            {goals?.has_goals ? (
              <>
                <div className="flex items-end justify-between flex-wrap gap-3 mb-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#475569" }}>Vendas no mês · meta geral</p>
                    <p className="text-4xl font-black" style={{ color: "#34D399", textShadow: "0 0 20px rgba(16,185,129,0.4)" }}>
                      <AnimatedNumber value={gg!.realized} /> <span className="text-slate-600 text-2xl">/ {gg!.target}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider"
                      style={onPace ? { background: "rgba(16,185,129,0.15)", color: "#34D399" } : { background: "rgba(239,68,68,0.12)", color: "#F87171" }}>
                      {onPace ? "No ritmo" : "Atrás do ritmo"}
                    </span>
                    <p className="text-[11px] mt-1.5" style={{ color: "#64748B" }}>
                      faltam <b style={{ color: "#FCD34D" }}>{gg!.gap}</b> em {goals.days_left}d
                      {perDayNeeded !== null && perDayNeeded > 0 && <> · <b style={{ color: "#FCD34D" }}>{perDayNeeded.toFixed(1)}/dia</b></>}
                    </p>
                  </div>
                </div>
                <div className="h-3 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.min(100, gg!.pct)}%` }}
                    transition={{ duration: 0.9 }} style={{ background: "linear-gradient(90deg, #059669, #34D399)" }} />
                </div>
                <p className="text-[10px] mt-1.5" style={{ color: "#475569" }}>{gg!.pct}% da meta · dia {goals.days_elapsed} de {goals.days_in_month}</p>
              </>
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#475569" }}>Vendas no mês (sem meta definida)</p>
                  <p className="text-4xl font-black" style={{ color: "#34D399" }}><AnimatedNumber value={gg?.realized ?? 0} /></p>
                </div>
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl flex-wrap"
                  style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)" }}>
                  <span className="text-xs font-bold" style={{ color: "#FCD34D" }}>
                    ⚠ Metas de {goals ? monthLabelPt(goals.month_label) : "junho"} não definidas — sem meta não dá pra medir "perto/longe".
                  </span>
                  <button onClick={gotoMetas}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider ml-auto"
                    style={{ background: "rgba(245,158,11,0.18)", color: "#FCD34D" }}>
                    Definir em Financeiro › Metas <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Dica da IA */}
          <div className="rounded-2xl p-4 flex flex-col" style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.25)" }}>
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-3.5 h-3.5" style={{ color: "#FCD34D" }} />
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#FCD34D" }}>Dica da IA — o que fazer</span>
            </div>
            {dicas["geral"] ? (
              <>
                <p className="text-sm leading-relaxed flex-1" style={{ color: "#E2E8F0" }}>{dicas["geral"]}</p>
                <button onClick={() => gerarDica("geral", true)} disabled={dicaLoading === "geral"}
                  className="mt-2 self-start flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold disabled:opacity-40" style={{ color: "#64748B" }}>
                  <RefreshCw className={cn("w-2.5 h-2.5", dicaLoading === "geral" && "animate-spin")} /> Atualizar dica
                </button>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                {dicaLoading === "geral"
                  ? <span className="flex items-center gap-2 text-xs" style={{ color: "#64748B" }}><Loader2 className="w-3.5 h-3.5 animate-spin" /> pensando…</span>
                  : <button onClick={() => gerarDica("geral")} className="text-xs font-bold px-3 py-2 rounded-lg" style={{ background: "rgba(245,158,11,0.12)", color: "#FCD34D" }}>💡 Gerar dica pra bater a meta</button>}
              </div>
            )}
          </div>
        </div>

        {/* Metas por equipe */}
        {goals?.has_goals && goals.teams.length > 0 && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {goals.teams.map((tm, i) => {
              const scope = teamMgrId(tm.manager_name);
              return (
                <motion.div key={tm.manager_name + i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className="rounded-2xl p-4" style={{ background: "rgba(8,11,20,0.6)", border: "1px solid #1E293B" }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-black text-white">{tm.manager_name}</span>
                    <button onClick={() => gerarDica(scope)} disabled={dicaLoading === scope}
                      className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider disabled:opacity-40" style={{ color: "#FCD34D" }}>
                      {dicaLoading === scope ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Lightbulb className="w-2.5 h-2.5" />} dica
                    </button>
                  </div>
                  <p className="text-2xl font-black mb-2" style={{ color: tm.pct >= 100 ? "#34D399" : "#E2E8F0" }}>
                    {tm.realized}<span className="text-slate-600 text-lg"> / {tm.target}</span>
                  </p>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                    <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${Math.min(100, tm.pct)}%` }}
                      transition={{ duration: 0.8, delay: i * 0.05 }}
                      style={{ background: tm.pct >= 100 ? "#34D399" : tm.pct >= 60 ? "linear-gradient(90deg,#059669,#34D399)" : "linear-gradient(90deg,#B45309,#F59E0B)" }} />
                  </div>
                  <p className="text-[10px] mt-1.5" style={{ color: "#475569" }}>{tm.pct}% · faltam {tm.gap}</p>
                  {dicas[scope] && <p className="text-[11px] leading-snug mt-2 pt-2 border-t border-slate-800" style={{ color: "#CBD5E1" }}>💡 {dicas[scope]}</p>}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 1. ENTRADA ──────────────────────────────────────────────────────── */}
      <div>
        <SectionTitle icon={Zap} color="#00D4FF">Entrada — o combustível</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="grid grid-cols-2 gap-3 lg:col-span-2">
            <StatCard delay={0}    label="Leads hoje"     value={e?.hoje ?? 0}    icon={Activity} theme="cyan" />
            <StatCard delay={0.05} label={`Leads (${MODE_LABEL[mode]})`} value={e?.periodo ?? 0} icon={TrendingUp} theme="cyan"
              sub={entradaDelta !== null ? (
                <span className="flex items-center gap-1" style={{ color: entradaDelta >= 0 ? "#34D399" : "#F87171" }}>
                  {entradaDelta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {entradaDelta >= 0 ? "+" : ""}{entradaDelta}% vs período anterior
                </span>
              ) : "—"} />
            <StatCard delay={0.1}  label="Sem corretor"   value={e?.sem_corretor ?? 0}  icon={UserX}    theme={(e?.sem_corretor ?? 0) > 0 ? "red" : "emerald"} pulse={(e?.sem_corretor ?? 0) > 0} sub="precisam distribuir" />
            <StatCard delay={0.15} label="Nunca tocados"  value={e?.nunca_tocados ?? 0} icon={PhoneOff} theme={(e?.nunca_tocados ?? 0) > 0 ? "red" : "emerald"} pulse={(e?.nunca_tocados ?? 0) > 0} sub="corretor nunca chamou" />
          </div>
          {/* Regiões */}
          <div className="rounded-2xl p-4" style={{ background: "rgba(8,11,20,0.6)", border: "1px solid #1E293B" }}>
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-3.5 h-3.5" style={{ color: "#00D4FF" }} />
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#64748B" }}>Origem / Região dos leads</span>
            </div>
            <div className="space-y-2">
              {(e?.regioes ?? []).map((r, i) => (
                <div key={r.regiao + i} className="space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold truncate max-w-[70%]" style={{ color: "#94A3B8" }}>{r.regiao}</span>
                    <span className="text-[11px] font-black tabular-nums" style={{ color: "#00D4FF" }}>{r.n}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                    <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${(r.n / maxRegiao) * 100}%` }}
                      transition={{ duration: 0.7, delay: i * 0.04 }} style={{ background: "linear-gradient(90deg, #0066FF, #00D4FF)" }} />
                  </div>
                </div>
              ))}
              {(e?.regioes?.length ?? 0) === 0 && <p className="text-xs text-center py-3" style={{ color: "#334155" }}>Sem dados</p>}
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. ADOÇÃO ───────────────────────────────────────────────────────── */}
      <div>
        <SectionTitle icon={UserCheck} color="#A78BFA">Adoção — o batimento da operação</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard delay={0}    label="Online agora"   value={a?.online_agora ?? 0} icon={Wifi}  theme={(a?.online_agora ?? 0) > 0 ? "emerald" : "slate"} pulse={(a?.online_agora ?? 0) > 0} sub="≤ 15 min" />
          <StatCard delay={0.05} label="Logaram hoje"   value={a?.logaram_hoje ?? 0} icon={LogIn} theme="purple" />
          <StatCard delay={0.1}  label="Ativos 24h"     value={a?.ativos_24h ?? 0}   icon={Users} theme="purple" sub={`de ${a?.total_ops ?? 0} corretores`} />
          <StatCard delay={0.15} label="Sumidos +3 dias" value={a?.sumidos ?? 0}     icon={UserX} theme={(a?.sumidos ?? 0) > 0 ? "red" : "emerald"} pulse={(a?.sumidos ?? 0) > 0} sub="clique p/ cobrar" onClick={() => setShowSumidos(s => !s)} />
          <StatCard delay={0.2}  label="Tocaram lead hoje" value={`${tocaramPct}%`}   icon={Target} theme={tocaramPct >= 50 ? "emerald" : "amber"} sub={`${a?.tocaram_hoje ?? 0} corretores`} />
          <StatCard delay={0.25} label="Chips online"   value={a?.chips_online ?? 0} icon={a && a.chips_offline > a.chips_online ? WifiOff : Wifi} theme={a && a.chips_offline > a.chips_online ? "amber" : "emerald"} sub={`${a?.chips_offline ?? 0} offline`} />
        </div>

        {/* Lista de sumidos (drill) */}
        <AnimatePresence>
          {showSumidos && a && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="mt-3 rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.04)" }}>
              <div className="px-4 py-2 text-[10px] font-black uppercase tracking-widest" style={{ color: "#F87171" }}>
                Corretores sem login há 3+ dias — cobrar
              </div>
              <div className="flex flex-wrap gap-2 p-3">
                {a.sumidos_list.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 px-2.5 py-1 rounded-lg" style={{ background: "rgba(8,11,20,0.6)", border: "1px solid #1E293B" }}>
                    <span className="text-xs font-bold text-white">{s.name || "—"}</span>
                    <span className="text-[10px]" style={{ color: s.last_seen ? "#64748B" : "#F87171" }}>{sinceDays(s.last_seen)}</span>
                  </div>
                ))}
                {a.sumidos_list.length === 0 && <p className="text-xs" style={{ color: "#334155" }}>Ninguém sumido 🎉</p>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── 3. EXECUÇÃO por gerência (drill corretor) ───────────────────────── */}
      <div>
        <SectionTitle icon={Shield} color="#F59E0B">Execução — por gerência (clique p/ abrir corretores)</SectionTitle>
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #1E293B" }}>
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr style={{ background: "rgba(8,11,20,0.9)", borderBottom: "1px solid #1E293B" }}>
                {["Gerência", "Recebidos", "Trabalhados", "Parados", "Ignorados", "Visitas", "Vendas"].map((h, i) => (
                  <th key={h} className={cn("px-4 py-3 text-[10px] font-black uppercase tracking-widest", i === 0 ? "text-left" : "text-center")} style={{ color: "#334155" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.gerencias ?? []).map((g, gi) => {
                const key = g.manager_id ?? "none";
                const open = expanded === key;
                const trabPct = g.recebidos > 0 ? Math.round((g.trabalhados / g.recebidos) * 100) : 0;
                return (
                  <Fragment key={key}>
                    <motion.tr
                      initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: gi * 0.04 }}
                      onClick={() => setExpanded(open ? null : key)}
                      className="cursor-pointer hover:bg-white/[0.03] transition-colors"
                      style={{ borderBottom: "1px solid #0F172A", background: open ? "rgba(245,158,11,0.05)" : "transparent" }}>
                      <td className="px-4 py-3 font-black text-white">
                        <div className="flex items-center gap-2">
                          <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-90")} style={{ color: "#F59E0B" }} />
                          {g.manager_name}
                          <span className="text-[10px] font-normal" style={{ color: "#475569" }}>· {g.brokers.length}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-black text-white">{g.recebidos}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-black" style={{ color: trabPct >= 70 ? "#34D399" : trabPct >= 40 ? "#FCD34D" : "#F87171" }}>{g.trabalhados}</span>
                          <span className="text-[9px]" style={{ color: "#475569" }}>{trabPct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-black" style={{ color: g.parados > 0 ? "#FCD34D" : "#334155" }}>{g.parados}</td>
                      <td className="px-4 py-3 text-center font-black" style={{ color: g.ignorados > 0 ? "#F87171" : "#334155" }}>{g.ignorados}</td>
                      <td className="px-4 py-3 text-center font-black" style={{ color: "#A78BFA" }}>{g.visitas}</td>
                      <td className="px-4 py-3 text-center font-black text-base" style={{ color: g.vendas > 0 ? "#34D399" : "#334155" }}>{g.vendas}</td>
                    </motion.tr>
                    <AnimatePresence>
                      {open && g.brokers.map((b, bi) => {
                        const stale = !b.last_seen || (Date.now() - new Date(b.last_seen).getTime()) / 86400000 >= 3;
                        return (
                          <motion.tr key={b.broker_id}
                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                            transition={{ delay: bi * 0.02 }}
                            style={{ borderBottom: "1px solid #0F172A", background: "rgba(8,11,20,0.5)" }}>
                            <td className="pl-11 pr-4 py-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] font-bold" style={{ color: "#CBD5E1" }}>{b.name || "—"}</span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: stale ? "#F87171" : "#34D399", background: stale ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)" }}>
                                  {sinceDays(b.last_seen)}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-2 text-center text-slate-300">{b.recebidos}</td>
                            <td className="px-4 py-2 text-center text-slate-300">{b.trabalhados}</td>
                            <td className="px-4 py-2 text-center" style={{ color: b.parados > 0 ? "#FCD34D" : "#475569" }}>{b.parados}</td>
                            <td className="px-4 py-2 text-center" style={{ color: b.ignorados > 0 ? "#F87171" : "#475569" }}>{b.ignorados}</td>
                            <td className="px-4 py-2 text-center" style={{ color: "#A78BFA" }}>{b.visitas}</td>
                            <td className="px-4 py-2 text-center font-bold" style={{ color: b.vendas > 0 ? "#34D399" : "#475569" }}>{b.vendas}</td>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  </Fragment>
                );
              })}
              {(data?.gerencias?.length ?? 0) === 0 && (
                <tr><td colSpan={7} className="text-center py-8" style={{ color: "#334155" }}>Sem dados de gerência.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Velocidade de atendimento */}
        <div className="mt-4 rounded-2xl p-5" style={{ background: "rgba(8,11,20,0.6)", border: "1px solid #1E293B" }}>
          <div className="flex items-center gap-2 mb-4">
            <Timer className="w-3.5 h-3.5" style={{ color: "#10B981" }} />
            <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#10B981" }}>Velocidade de Atendimento</span>
            <span className="text-[10px]" style={{ color: "#334155" }}>(criação do lead → 1º contato)</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {speedBuckets.map((bk, i) => {
              const pct = speedTotal > 0 ? Math.round((bk.count / speedTotal) * 100) : 0;
              return (
                <div key={bk.label} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold" style={{ color: "#64748B" }}>{bk.label}</span>
                    <span className="text-xs font-black" style={{ color: bk.neon }}>{bk.count} · {pct}%</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                    <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.9, delay: i * 0.1 + 0.2 }} style={{ background: `linear-gradient(90deg, ${bk.neon}60, ${bk.neon})` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── 4. AUTOMAÇÃO ────────────────────────────────────────────────────── */}
      <div>
        <SectionTitle icon={Cpu} color="#7C3AED">Automação — o que a Comandra fez</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard delay={0}    label="Resgates Comandra" value={data?.automacao.resgates ?? 0}        icon={RotateCcw} theme="purple"  sub="leads ignorados reativados" />
          <StatCard delay={0.05} label="Leads responderam"  value={data?.automacao.leads_responderam ?? 0} icon={Zap}    theme="emerald" sub="no período" />
          <StatCard delay={0.1}  label="Disparos auto"      value={data?.automacao.followup_auto ?? 0}   icon={RefreshCw} theme="cyan" />
          <StatCard delay={0.15} label="Conversas IA"       value={data?.automacao.conversas_ia ?? 0}    icon={Bot}    theme="slate" />
        </div>
      </div>

      {/* ── 5. SAÍDA ────────────────────────────────────────────────────────── */}
      <div>
        <SectionTitle icon={Trophy} color="#10B981">Saída — resultado</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard delay={0}    label="Visitas"   value={data?.saida.visitas ?? 0} icon={Users}      theme="purple"  sub="CRM + secretária" />
          <StatCard delay={0.05} label="Vendas"    value={data?.saida.vendas ?? 0}  icon={Trophy}     theme="emerald" sub="CRM + secretária" />
          <StatCard delay={0.1}  label="Conversão" value={`${data?.saida.conversao ?? 0}%`} icon={Target} theme={(data?.saida.conversao ?? 0) >= 3 ? "emerald" : "amber"} sub="leads → venda" />
          <StatCard delay={0.15} label="Ignorados (chicote)" value={data?.saida.ignorados ?? 0} icon={PhoneOff} theme={(data?.saida.ignorados ?? 0) > 0 ? "red" : "emerald"} sub="clique p/ cobrar quem deve" onClick={() => { setShowDev(s => !s); if (!dev) loadDev(); }} />
        </div>

        {/* Painel: quem está devendo (chicote acionável) */}
        <AnimatePresence>
          {showDev && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="mb-4 rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.03)" }}>
              <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: "rgba(239,68,68,0.2)" }}>
                <span className="text-[11px] font-black uppercase tracking-widest flex items-center gap-2" style={{ color: "#F87171" }}>
                  <AlertTriangle className="w-3.5 h-3.5" /> Quem está devendo
                  {dev && <span className="text-slate-500 font-bold normal-case tracking-normal">· {dev.total} leads · {dev.brokers_count} corretores</span>}
                </span>
                <button onClick={loadDev} disabled={devLoading} className="p-1 rounded text-slate-500 hover:text-slate-300">
                  <RefreshCw className={cn("w-3.5 h-3.5", devLoading && "animate-spin")} />
                </button>
              </div>
              {devLoading && !dev ? (
                <p className="py-8 text-center text-sm flex items-center justify-center gap-2" style={{ color: "#64748B" }}><Loader2 className="w-4 h-4 animate-spin" /> puxando devedores…</p>
              ) : (
                <div className="max-h-[460px] overflow-y-auto divide-y" style={{ borderColor: "#1E293B" }}>
                  {(dev?.brokers ?? []).map((b, i) => {
                    const done = cobrado[b.broker_id];
                    return (
                      <div key={b.broker_id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderColor: "#0F172A" }}>
                        <span className="text-xs font-mono w-5 text-center" style={{ color: "#475569" }}>{i + 1}</span>
                        <div className="text-2xl font-black tabular-nums w-9 text-center" style={{ color: b.count >= 6 ? "#F87171" : b.count >= 3 ? "#FCD34D" : "#94A3B8" }}>{b.count}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-white truncate">{b.name || "—"}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(124,58,237,0.15)", color: "#A78BFA" }}>{b.gerencia}</span>
                            {!b.is_active && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(239,68,68,0.12)", color: "#F87171" }}>inativo</span>}
                          </div>
                          <p className="text-[10px] truncate" style={{ color: "#475569" }}>
                            pior {Math.round(b.worst_days)}d · média {Math.round(b.avg_days)}d
                            {b.leads?.length ? ` · ${b.leads.slice(0, 3).map(l => l.name).join(", ")}` : ""}
                          </p>
                        </div>
                        <button onClick={() => cobrar(b)} disabled={cobrando === b.broker_id || done || !b.has_phone}
                          title={!b.has_phone ? "corretor sem telefone" : "cobra corretor + avisa gerente"}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition disabled:opacity-40"
                          style={done ? { background: "rgba(16,185,129,0.15)", color: "#34D399" } : { background: "rgba(239,68,68,0.12)", color: "#F87171" }}>
                          {cobrando === b.broker_id ? <Loader2 className="w-3 h-3 animate-spin" /> : done ? <Check className="w-3 h-3" /> : <Megaphone className="w-3 h-3" />}
                          {done ? "cobrado" : "cobrar"}
                        </button>
                      </div>
                    );
                  })}
                  {dev && dev.brokers.length === 0 && <p className="py-8 text-center text-sm" style={{ color: "#334155" }}>Ninguém devendo 🎉</p>}
                </div>
              )}
              <p className="text-[10px] px-4 py-2 border-t" style={{ borderColor: "#1E293B", color: "#475569" }}>
                "Cobrar" dispara no WhatsApp do corretor (os leads esperando) e avisa o gerente dele. Do chip de notificação.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tendência */}
        <div className="rounded-2xl p-5" style={{ background: "rgba(8,11,20,0.6)", border: "1px solid #1E293B" }}>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-3.5 h-3.5" style={{ color: "#00D4FF" }} />
            <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#64748B" }}>Tendência — recebidos vs vendas</span>
          </div>
          <div className="flex items-end gap-1" style={{ height: "120px" }}>
            {(data?.tendencia ?? []).map((day, i) => (
              <div key={day.date + i} className="flex-1 flex flex-col items-center gap-1 min-w-0 group" style={{ height: "100%" }}>
                <div className="flex-1 flex flex-col justify-end w-full">
                  <motion.div className="w-full rounded-t-sm" initial={{ height: 0 }}
                    animate={{ height: `${Math.max(4, (day.received / maxTrend) * 96)}px` }} transition={{ duration: 0.6, delay: i * 0.04 }}
                    title={`Recebidos: ${day.received}`} style={{ background: "rgba(0,212,255,0.35)", minWidth: 4 }} />
                  {day.concluded > 0 && (
                    <motion.div className="w-full rounded-t-sm" initial={{ height: 0 }}
                      animate={{ height: `${Math.max(3, (day.concluded / maxTrend) * 96)}px` }} transition={{ duration: 0.6, delay: i * 0.04 + 0.2 }}
                      title={`Vendas: ${day.concluded}`} style={{ background: "#10B981" }} />
                  )}
                </div>
                <span className="text-[8px] truncate w-full text-center" style={{ color: "#334155" }}>{day.date}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-5 mt-3 text-[10px]" style={{ color: "#334155" }}>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm inline-block" style={{ background: "rgba(0,212,255,0.35)" }} /> Leads recebidos</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm inline-block" style={{ background: "#10B981" }} /> Vendas concluídas</span>
          </div>
        </div>
      </div>

      </Fragment>)}
    </div>
  );
}
