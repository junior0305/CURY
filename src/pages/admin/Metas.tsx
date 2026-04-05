import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Target, TrendingUp, Calendar, DollarSign,
  Plus, Check, ChevronLeft, ChevronRight,
  Flame, BarChart3, Users, Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function firstOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addWeeks(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n * 7);
  return r;
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function ptWeekRange(monday: Date) {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
  return `${monday.toLocaleDateString("pt-BR", opts)} – ${sunday.toLocaleDateString("pt-BR", opts)}`;
}

function ptMonth(d: Date) {
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

const COLORS = {
  cyan:    "#00D4FF",
  emerald: "#10B981",
  amber:   "#F59E0B",
  red:     "#EF4444",
  purple:  "#7C3AED",
  bg:      "#080B14",
};

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, label, color = COLORS.cyan }: {
  icon: React.ElementType; label: string; color?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="p-2 rounded-lg" style={{ background: `${color}22`, border: `1px solid ${color}44` }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <span className="text-sm font-black uppercase tracking-[0.2em]" style={{ color }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${color}55, transparent)` }} />
    </div>
  );
}

function NavBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="p-1.5 rounded-lg transition-all hover:scale-105"
      style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)", color: COLORS.cyan }}
    >
      {children}
    </button>
  );
}

function ProgressBar({ value, color = COLORS.cyan }: { value: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="h-full rounded-full"
        style={{ background: `linear-gradient(90deg, ${color}88, ${color})`, boxShadow: `0 0 8px ${color}66` }}
      />
    </div>
  );
}

function RhythmBadge({ pct }: { pct: number }) {
  const label = pct >= 90 ? "No Prazo" : pct >= 60 ? "Em Risco" : "Abaixo";
  const color = pct >= 90 ? COLORS.emerald : pct >= 60 ? COLORS.amber : COLORS.red;
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full uppercase" style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
      {label}
    </span>
  );
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Team { id: string; name: string; }
interface Goal {
  id: string; team_id: string; month: string; week_start: string | null;
  goal_type: string; sales_target: number; set_by: string | null; notes: string | null;
}
interface LeadCount { team_id: string; count: number; }
interface Investment {
  id: string; team_id: string; amount: number; source: string;
  category: string; description: string | null; investment_date: string; week_start: string | null;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useTeams() {
  const [teams, setTeams] = useState<Team[]>([]);
  useEffect(() => {
    supabase.from("teams").select("id, name").order("name")
      .then(({ data }) => setTeams(data ?? []));
  }, []);
  return teams;
}

function useGoals(dateStr: string, type: "weekly" | "monthly") {
  const [goals, setGoals] = useState<Goal[]>([]);
  const fetch = () => {
    const q = supabase.from("team_goals").select("*").eq("goal_type", type);
    if (type === "weekly") q.eq("week_start", dateStr);
    else q.eq("month", dateStr);
    q.then(({ data }) => setGoals(data ?? []));
  };
  useEffect(() => { fetch(); }, [dateStr, type]);
  return { goals, refresh: fetch };
}

function useConversions(startDate: string, endDate: string) {
  const [counts, setCounts] = useState<LeadCount[]>([]);
  useEffect(() => {
    supabase
      .from("leads")
      .select("team_id")
      .eq("status", "CONCLUDED")
      .gte("updated_at", startDate)
      .lt("updated_at", endDate)
      .then(({ data }) => {
        const map: Record<string, number> = {};
        (data ?? []).forEach(r => { if (r.team_id) map[r.team_id] = (map[r.team_id] ?? 0) + 1; });
        setCounts(Object.entries(map).map(([team_id, count]) => ({ team_id, count })));
      });
  }, [startDate, endDate]);
  return counts;
}

function useInvestments(startDate: string, endDate: string) {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const fetch = () => {
    supabase.from("team_investments").select("*")
      .gte("investment_date", startDate).lt("investment_date", endDate)
      .then(({ data }) => setInvestments(data ?? []));
  };
  useEffect(() => { fetch(); }, [startDate, endDate]);
  return { investments, refresh: fetch };
}

// ─── Tab: Semana ──────────────────────────────────────────────────────────────

function TabSemana({ teams, role }: { teams: Team[]; role: string }) {
  const [weekStart, setWeekStart] = useState(getMonday(new Date()));
  const weekStr  = toDateStr(weekStart);
  const monthStr = toDateStr(firstOfMonth(weekStart));
  const endDate  = toDateStr(addWeeks(weekStart, 1));

  const { goals, refresh } = useGoals(weekStr, "weekly");
  const conversions        = useConversions(weekStr, endDate);

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft]     = useState("");
  const [saving, setSaving]   = useState(false);

  const save = async (teamId: string) => {
    setSaving(true);
    const target = parseInt(draft, 10);
    if (isNaN(target)) { setSaving(false); return; }
    const existing = goals.find(g => g.team_id === teamId);
    if (existing) {
      await supabase.from("team_goals").update({ sales_target: target }).eq("id", existing.id);
    } else {
      await supabase.from("team_goals").insert({
        team_id: teamId, goal_type: "weekly", week_start: weekStr,
        month: monthStr, sales_target: target,
      });
    }
    setSaving(false);
    setEditing(null);
    refresh();
  };

  return (
    <div>
      {/* Nav semana */}
      <div className="flex items-center gap-3 mb-6">
        <NavBtn onClick={() => setWeekStart(w => addWeeks(w, -1))}>
          <ChevronLeft className="w-4 h-4" />
        </NavBtn>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{ background: "rgba(0,212,255,0.08)", border: "1px solid rgba(0,212,255,0.2)" }}>
          <Calendar className="w-4 h-4" style={{ color: COLORS.cyan }} />
          <span className="text-sm font-bold" style={{ color: COLORS.cyan }}>{ptWeekRange(weekStart)}</span>
          {toDateStr(weekStart) === toDateStr(getMonday(new Date())) && (
            <span className="text-xs px-2 py-0.5 rounded-full font-bold ml-1" style={{ background: `${COLORS.emerald}22`, color: COLORS.emerald }}>Esta semana</span>
          )}
        </div>
        <NavBtn onClick={() => setWeekStart(w => addWeeks(w, 1))}>
          <ChevronRight className="w-4 h-4" />
        </NavBtn>
        {role !== "MANAGER" && (
          <p className="text-xs ml-auto" style={{ color: "#475569" }}>
            Semana: Seg → Dom • Meta definida toda segunda-feira
          </p>
        )}
      </div>

      {/* Cards por equipe */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {teams.map((team, i) => {
          const goal    = goals.find(g => g.team_id === team.id);
          const target  = goal?.sales_target ?? 0;
          const actual  = conversions.find(c => c.team_id === team.id)?.count ?? 0;
          const pct     = target > 0 ? Math.round((actual / target) * 100) : 0;
          const isEdit  = editing === team.id;
          const color   = pct >= 90 ? COLORS.emerald : pct >= 60 ? COLORS.amber : target === 0 ? "#334155" : COLORS.red;

          return (
            <motion.div
              key={team.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-xl p-5"
              style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${color}33` }}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-black uppercase tracking-wider text-sm text-white">{team.name}</p>
                  {target > 0 ? (
                    <RhythmBadge pct={pct} />
                  ) : (
                    <span className="text-xs" style={{ color: "#334155" }}>Sem meta definida</span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-3xl font-black" style={{ color }}>{actual}</span>
                  <span className="text-sm" style={{ color: "#475569" }}> / {target || "—"}</span>
                </div>
              </div>

              {target > 0 && <ProgressBar value={pct} color={color} />}
              {target > 0 && (
                <div className="flex justify-between mt-1">
                  <span className="text-xs" style={{ color: "#475569" }}>{pct}% realizado</span>
                  <span className="text-xs" style={{ color: "#475569" }}>{Math.max(0, target - actual)} restantes</span>
                </div>
              )}

              {/* Edição de meta */}
              {isEdit ? (
                <div className="mt-3 flex gap-2">
                  <Input
                    type="number"
                    min={0}
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    placeholder="Meta de vendas"
                    className="flex-1 text-sm h-8"
                    style={{ background: "rgba(0,0,0,0.4)", borderColor: `${COLORS.cyan}55`, color: "#fff" }}
                    autoFocus
                    onKeyDown={e => { if (e.key === "Enter") save(team.id); if (e.key === "Escape") setEditing(null); }}
                  />
                  <Button size="sm" onClick={() => save(team.id)} disabled={saving}
                    style={{ background: COLORS.emerald, color: "#fff", height: 32, minWidth: 32 }}>
                    <Check className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => { setEditing(team.id); setDraft(String(target || "")); }}
                  className="mt-3 text-xs w-full text-center py-1.5 rounded-lg transition-all hover:opacity-80"
                  style={{ background: "rgba(0,212,255,0.06)", border: "1px dashed rgba(0,212,255,0.2)", color: COLORS.cyan }}
                >
                  {target > 0 ? "Editar meta" : "Definir meta"}
                </button>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tab: Mês ─────────────────────────────────────────────────────────────────

function TabMes({ teams }: { teams: Team[] }) {
  const [month, setMonth] = useState(firstOfMonth(new Date()));
  const monthStr = toDateStr(month);
  const endDate  = toDateStr(addMonths(month, 1));

  const { goals, refresh } = useGoals(monthStr, "monthly");
  const conversions        = useConversions(monthStr, endDate);

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft]     = useState("");
  const [saving, setSaving]   = useState(false);

  const save = async (teamId: string) => {
    setSaving(true);
    const target = parseInt(draft, 10);
    if (isNaN(target)) { setSaving(false); return; }
    const existing = goals.find(g => g.team_id === teamId);
    if (existing) {
      await supabase.from("team_goals").update({ sales_target: target }).eq("id", existing.id);
    } else {
      await supabase.from("team_goals").insert({
        team_id: teamId, goal_type: "monthly", month: monthStr, sales_target: target,
      });
    }
    setSaving(false);
    setEditing(null);
    refresh();
  };

  return (
    <div>
      {/* Nav mês */}
      <div className="flex items-center gap-3 mb-6">
        <NavBtn onClick={() => setMonth(m => addMonths(m, -1))}>
          <ChevronLeft className="w-4 h-4" />
        </NavBtn>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
          <BarChart3 className="w-4 h-4" style={{ color: COLORS.emerald }} />
          <span className="text-sm font-bold capitalize" style={{ color: COLORS.emerald }}>{ptMonth(month)}</span>
          {toDateStr(month) === toDateStr(firstOfMonth(new Date())) && (
            <span className="text-xs px-2 py-0.5 rounded-full font-bold ml-1" style={{ background: `${COLORS.cyan}22`, color: COLORS.cyan }}>Mês atual</span>
          )}
        </div>
        <NavBtn onClick={() => setMonth(m => addMonths(m, 1))}>
          <ChevronRight className="w-4 h-4" />
        </NavBtn>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {teams.map((team, i) => {
          const goal   = goals.find(g => g.team_id === team.id);
          const target = goal?.sales_target ?? 0;
          const actual = conversions.find(c => c.team_id === team.id)?.count ?? 0;
          const pct    = target > 0 ? Math.round((actual / target) * 100) : 0;
          const color  = pct >= 90 ? COLORS.emerald : pct >= 60 ? COLORS.amber : target === 0 ? "#334155" : COLORS.red;
          const isEdit = editing === team.id;

          return (
            <motion.div
              key={team.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-xl p-5"
              style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${color}33` }}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-black uppercase tracking-wider text-sm text-white">{team.name}</p>
                  {target > 0 ? <RhythmBadge pct={pct} /> : (
                    <span className="text-xs" style={{ color: "#334155" }}>Sem meta mensal</span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-3xl font-black" style={{ color }}>{actual}</span>
                  <span className="text-sm" style={{ color: "#475569" }}> / {target || "—"}</span>
                </div>
              </div>

              {target > 0 && <ProgressBar value={pct} color={color} />}
              {target > 0 && (
                <div className="flex justify-between mt-1">
                  <span className="text-xs" style={{ color: "#475569" }}>{pct}% do mês</span>
                  <span className="text-xs" style={{ color: "#475569" }}>{Math.max(0, target - actual)} restam</span>
                </div>
              )}

              {isEdit ? (
                <div className="mt-3 flex gap-2">
                  <Input
                    type="number" min={0} value={draft}
                    onChange={e => setDraft(e.target.value)}
                    placeholder="Meta mensal"
                    className="flex-1 text-sm h-8"
                    style={{ background: "rgba(0,0,0,0.4)", borderColor: `${COLORS.emerald}55`, color: "#fff" }}
                    autoFocus
                    onKeyDown={e => { if (e.key === "Enter") save(team.id); if (e.key === "Escape") setEditing(null); }}
                  />
                  <Button size="sm" onClick={() => save(team.id)} disabled={saving}
                    style={{ background: COLORS.emerald, color: "#fff", height: 32, minWidth: 32 }}>
                    <Check className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => { setEditing(team.id); setDraft(String(target || "")); }}
                  className="mt-3 text-xs w-full text-center py-1.5 rounded-lg transition-all hover:opacity-80"
                  style={{ background: "rgba(16,185,129,0.06)", border: "1px dashed rgba(16,185,129,0.2)", color: COLORS.emerald }}
                >
                  {target > 0 ? "Editar meta" : "Definir meta"}
                </button>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Tab: Histórico ───────────────────────────────────────────────────────────

function TabHistorico({ teams }: { teams: Team[] }) {
  const [months] = useState(() => {
    const result = [];
    for (let i = 5; i >= 0; i--) result.push(addMonths(firstOfMonth(new Date()), -i));
    return result;
  });

  const [allGoals, setAllGoals]       = useState<Goal[]>([]);
  const [allConversions, setAllConversions] = useState<Record<string, LeadCount[]>>({});

  useEffect(() => {
    const oldest = toDateStr(months[0]);
    const newest = toDateStr(addMonths(months[months.length - 1], 1));
    supabase.from("team_goals").select("*").eq("goal_type", "monthly")
      .gte("month", oldest).lt("month", newest)
      .then(({ data }) => setAllGoals(data ?? []));
    Promise.all(
      months.map(async m => {
        const start = toDateStr(m);
        const end   = toDateStr(addMonths(m, 1));
        const { data } = await supabase.from("leads").select("team_id")
          .eq("status", "CONCLUDED").gte("updated_at", start).lt("updated_at", end);
        const map: Record<string, number> = {};
        (data ?? []).forEach(r => { if (r.team_id) map[r.team_id] = (map[r.team_id] ?? 0) + 1; });
        return { key: start, counts: Object.entries(map).map(([team_id, count]) => ({ team_id, count })) };
      })
    ).then(results => {
      const conv: Record<string, LeadCount[]> = {};
      results.forEach(r => { conv[r.key] = r.counts; });
      setAllConversions(conv);
    });
  }, []);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px]">
        <thead>
          <tr>
            <th className="text-left text-xs font-bold uppercase tracking-wider pb-3 pr-4" style={{ color: "#334155" }}>Equipe</th>
            {months.map(m => (
              <th key={toDateStr(m)} className="text-center text-xs font-bold uppercase tracking-wider pb-3 px-3 capitalize" style={{ color: "#334155" }}>
                {m.toLocaleDateString("pt-BR", { month: "short" })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teams.map((team, ti) => (
            <motion.tr
              key={team.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: ti * 0.04 }}
              className="border-t"
              style={{ borderColor: "rgba(255,255,255,0.04)" }}
            >
              <td className="py-3 pr-4 font-bold text-sm text-white whitespace-nowrap">{team.name}</td>
              {months.map(m => {
                const key    = toDateStr(m);
                const goal   = allGoals.find(g => g.team_id === team.id && g.month.startsWith(key.slice(0, 7)));
                const target = goal?.sales_target ?? 0;
                const actual = allConversions[key]?.find(c => c.team_id === team.id)?.count ?? 0;
                const pct    = target > 0 ? Math.round((actual / target) * 100) : 0;
                const color  = pct >= 90 ? COLORS.emerald : pct >= 60 ? COLORS.amber : target === 0 ? "#1e293b" : COLORS.red;

                return (
                  <td key={key} className="py-3 px-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-lg font-black" style={{ color: target === 0 ? "#334155" : color }}>
                        {actual}
                      </span>
                      <span className="text-xs" style={{ color: "#334155" }}>/ {target || "—"}</span>
                      {target > 0 && (
                        <div className="w-12">
                          <ProgressBar value={pct} color={color} />
                        </div>
                      )}
                    </div>
                  </td>
                );
              })}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Tab: Investimentos ───────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  manager:       { label: "Gerente",        color: COLORS.cyan },
  broker:        { label: "Corretor",       color: COLORS.purple },
  superintendent:{ label: "Superintendente",color: COLORS.amber },
};

interface InvForm {
  team_id: string; amount: string; source: string; category: string;
  description: string; investment_date: string;
}

function TabInvestimentos({ teams, role }: { teams: Team[]; role: string }) {
  const [month, setMonth] = useState(firstOfMonth(new Date()));
  const startDate = toDateStr(month);
  const endDate   = toDateStr(addMonths(month, 1));

  const { investments, refresh } = useInvestments(startDate, endDate);

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [form, setForm]         = useState<InvForm>({
    team_id: teams[0]?.id ?? "",
    amount: "",
    source: "manager",
    category: "MARKETING",
    description: "",
    investment_date: toDateStr(new Date()),
  });

  useEffect(() => {
    if (teams.length && !form.team_id) setForm(f => ({ ...f, team_id: teams[0].id }));
  }, [teams]);

  const totalBySource: Record<string, number> = {};
  investments.forEach(inv => {
    totalBySource[inv.source] = (totalBySource[inv.source] ?? 0) + inv.amount;
  });
  const totalAll = Object.values(totalBySource).reduce((a, b) => a + b, 0);

  const saveInvestment = async () => {
    setSaving(true);
    const amount = parseFloat(form.amount);
    if (!form.team_id || isNaN(amount) || amount <= 0) { setSaving(false); return; }
    await supabase.from("team_investments").insert({
      team_id: form.team_id,
      amount,
      source: form.source,
      category: form.category,
      description: form.description || null,
      investment_date: form.investment_date,
    });
    setSaving(false);
    setShowForm(false);
    refresh();
  };

  // Calcular leads gerados e conversões por equipe no período
  const [leadCounts, setLeadCounts] = useState<Record<string, { total: number; converted: number }>>({});
  useEffect(() => {
    supabase.from("leads").select("team_id, status").gte("created_at", startDate).lt("created_at", endDate)
      .then(({ data }) => {
        const map: Record<string, { total: number; converted: number }> = {};
        (data ?? []).forEach(r => {
          if (!r.team_id) return;
          if (!map[r.team_id]) map[r.team_id] = { total: 0, converted: 0 };
          map[r.team_id].total++;
          if (r.status === "CONCLUDED") map[r.team_id].converted++;
        });
        setLeadCounts(map);
      });
  }, [startDate, endDate]);

  return (
    <div>
      {/* Nav + botão */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <NavBtn onClick={() => setMonth(m => addMonths(m, -1))}>
          <ChevronLeft className="w-4 h-4" />
        </NavBtn>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
          <Wallet className="w-4 h-4" style={{ color: COLORS.amber }} />
          <span className="text-sm font-bold capitalize" style={{ color: COLORS.amber }}>{ptMonth(month)}</span>
        </div>
        <NavBtn onClick={() => setMonth(m => addMonths(m, 1))}>
          <ChevronRight className="w-4 h-4" />
        </NavBtn>
        <Button
          size="sm"
          onClick={() => setShowForm(s => !s)}
          className="ml-auto gap-1.5 font-bold uppercase text-xs"
          style={{ background: showForm ? "#334155" : COLORS.amber, color: showForm ? "#aaa" : "#000" }}
        >
          <Plus className="w-4 h-4" />
          {showForm ? "Cancelar" : "Lançar Investimento"}
        </Button>
      </div>

      {/* Totalizadores por fonte */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {Object.entries(SOURCE_LABELS).map(([src, { label, color }]) => (
          <div key={src} className="rounded-xl p-4" style={{ background: `${color}0d`, border: `1px solid ${color}33` }}>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color }}>{label}</p>
            <p className="text-2xl font-black" style={{ color }}>
              R$ {(totalBySource[src] ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
            </p>
          </div>
        ))}
        <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "#64748b" }}>Total</p>
          <p className="text-2xl font-black text-white">
            R$ {totalAll.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      {/* Formulário de lançamento */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-6"
          >
            <div className="rounded-xl p-5" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)" }}>
              <p className="text-xs font-black uppercase tracking-wider mb-4" style={{ color: COLORS.amber }}>Novo Investimento</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Equipe</label>
                  <select
                    value={form.team_id}
                    onChange={e => setForm(f => ({ ...f, team_id: e.target.value }))}
                    className="w-full h-9 rounded-lg px-3 text-sm text-white"
                    style={{ background: "#111827", border: "1px solid #334155" }}
                  >
                    {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Origem</label>
                  <select
                    value={form.source}
                    onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                    className="w-full h-9 rounded-lg px-3 text-sm text-white"
                    style={{ background: "#111827", border: "1px solid #334155" }}
                  >
                    <option value="manager">Gerente</option>
                    <option value="broker">Corretor</option>
                    <option value="superintendent">Superintendente</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Categoria</label>
                  <select
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full h-9 rounded-lg px-3 text-sm text-white"
                    style={{ background: "#111827", border: "1px solid #334155" }}
                  >
                    <option value="MARKETING">Marketing</option>
                    <option value="INFRA">Infraestrutura</option>
                    <option value="BONUS_OFF">Bônus Offline</option>
                    <option value="EVENTS">Eventos</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Valor (R$)</label>
                  <Input
                    type="number" min={0} step="0.01" value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0,00"
                    className="h-9 text-sm"
                    style={{ background: "#111827", borderColor: "#334155", color: "#fff" }}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Data</label>
                  <Input
                    type="date" value={form.investment_date}
                    onChange={e => setForm(f => ({ ...f, investment_date: e.target.value }))}
                    className="h-9 text-sm"
                    style={{ background: "#111827", borderColor: "#334155", color: "#fff" }}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Descrição</label>
                  <Input
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Campanha Facebook..."
                    className="h-9 text-sm"
                    style={{ background: "#111827", borderColor: "#334155", color: "#fff" }}
                  />
                </div>
              </div>
              <Button
                className="mt-4 font-bold uppercase text-xs gap-1.5"
                onClick={saveInvestment}
                disabled={saving}
                style={{ background: COLORS.amber, color: "#000" }}
              >
                <Check className="w-4 h-4" /> Salvar
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ROI por equipe */}
      <SectionTitle icon={TrendingUp} label="ROI por Equipe" color={COLORS.emerald} />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        {teams.map((team, i) => {
          const teamInv   = investments.filter(inv => inv.team_id === team.id);
          const total     = teamInv.reduce((s, inv) => s + inv.amount, 0);
          const leads     = leadCounts[team.id] ?? { total: 0, converted: 0 };
          const cpl       = leads.total > 0 ? total / leads.total : 0;
          const costPerSale = leads.converted > 0 ? total / leads.converted : 0;

          return (
            <motion.div
              key={team.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-xl p-4"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <p className="font-black uppercase tracking-wider text-sm text-white mb-3">{team.name}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: "#475569" }}>Investido</p>
                  <p className="text-lg font-black" style={{ color: COLORS.amber }}>
                    R$ {total.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: "#475569" }}>Leads</p>
                  <p className="text-lg font-black text-white">{leads.total}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: "#475569" }}>Custo/Lead</p>
                  <p className="text-base font-bold" style={{ color: COLORS.cyan }}>
                    {total > 0 && leads.total > 0 ? `R$ ${cpl.toFixed(0)}` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: "#475569" }}>Custo/Venda</p>
                  <p className="text-base font-bold" style={{ color: COLORS.emerald }}>
                    {total > 0 && leads.converted > 0 ? `R$ ${costPerSale.toFixed(0)}` : "—"}
                  </p>
                </div>
              </div>

              {/* Breakdown por fonte */}
              {teamInv.length > 0 && (
                <div className="mt-3 pt-3 border-t space-y-1" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  {Object.entries(SOURCE_LABELS).map(([src, { label, color }]) => {
                    const srcTotal = teamInv.filter(i => i.source === src).reduce((s, i) => s + i.amount, 0);
                    if (!srcTotal) return null;
                    return (
                      <div key={src} className="flex justify-between">
                        <span className="text-xs" style={{ color: "#475569" }}>{label}</span>
                        <span className="text-xs font-bold" style={{ color }}>
                          R$ {srcTotal.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Lista de lançamentos */}
      <SectionTitle icon={DollarSign} label="Lançamentos do Período" color={COLORS.amber} />
      {investments.length === 0 ? (
        <div className="text-center py-10" style={{ color: "#334155" }}>
          <Wallet className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhum investimento lançado neste período</p>
        </div>
      ) : (
        <div className="space-y-2">
          {investments.map((inv, i) => {
            const team = teams.find(t => t.id === inv.team_id);
            const src  = SOURCE_LABELS[inv.source] ?? { label: inv.source, color: "#475569" };
            return (
              <motion.div
                key={inv.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-3 rounded-lg px-4 py-3"
                style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}
              >
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: src.color, boxShadow: `0 0 6px ${src.color}` }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">{team?.name ?? "—"}</p>
                  <p className="text-xs truncate" style={{ color: "#475569" }}>
                    {inv.description ?? inv.category} • {new Date(inv.investment_date).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: `${src.color}22`, color: src.color }}>
                  {src.label}
                </span>
                <span className="text-base font-black" style={{ color: COLORS.amber }}>
                  R$ {inv.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

type MetasTab = "semana" | "mes" | "historico" | "investimentos";

const TABS: { value: MetasTab; label: string; icon: React.ElementType; color: string }[] = [
  { value: "semana",        label: "Semana",        icon: Flame,     color: COLORS.cyan },
  { value: "mes",           label: "Mês",           icon: Target,    color: COLORS.emerald },
  { value: "historico",     label: "Histórico",     icon: BarChart3, color: COLORS.purple },
  { value: "investimentos", label: "Investimentos", icon: DollarSign,color: COLORS.amber },
];

export default function Metas() {
  const { role } = useAuth();
  const normalizedRole = role?.toUpperCase() ?? "";

  const teams = useTeams();

  const [activeTab, setActiveTab] = useState<MetasTab>("semana");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl" style={{ background: `${COLORS.amber}22`, border: `1px solid ${COLORS.amber}44` }}>
          <Target className="w-5 h-5" style={{ color: COLORS.amber }} />
        </div>
        <div>
          <h2 className="text-xl font-black uppercase tracking-[0.15em] text-white">Metas & Estratégias</h2>
          <p className="text-xs uppercase tracking-wider" style={{ color: "#475569" }}>
            Semana começa na segunda-feira • Metas por equipe
          </p>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Users className="w-4 h-4" style={{ color: "#334155" }} />
          <span className="text-sm font-bold" style={{ color: "#475569" }}>{teams.length} equipes</span>
        </div>
      </div>

      {/* Sub-tab selector */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(({ value, label, icon: Icon, color }) => {
          const isActive = activeTab === value;
          return (
            <motion.button
              key={value}
              whileTap={{ scale: 0.97 }}
              onClick={() => setActiveTab(value)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all"
              style={isActive ? {
                background: `${color}22`,
                borderColor: `${color}55`,
                color,
                boxShadow: `0 0 14px ${color}33`,
              } : {
                background: "rgba(255,255,255,0.03)",
                borderColor: "rgba(255,255,255,0.07)",
                color: "#334155",
              }}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </motion.button>
          );
        })}
      </div>

      {/* Conteúdo */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {activeTab === "semana"        && <TabSemana teams={teams} role={normalizedRole} />}
          {activeTab === "mes"           && <TabMes teams={teams} />}
          {activeTab === "historico"     && <TabHistorico teams={teams} />}
          {activeTab === "investimentos" && <TabInvestimentos teams={teams} role={normalizedRole} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
