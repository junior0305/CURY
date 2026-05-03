import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  X, Award, BarChart3, MessageSquare, History, Loader2,
  TrendingUp, AlertTriangle, CheckCircle2, Clock, Target,
  Plus, Trash2, Calendar, Save, ChevronRight, Sparkles,
} from "lucide-react";

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface BrokerSummary {
  id: string;
  first_name: string;
  last_name: string | null;
  leads_total: number;
  leads_concluded: number;
  leads_abandoned: number;
  tpr_avg_min: number | null;
  resp_5min_pct: number | null;
  lead_to_visit: number | null;
  lead_to_sale: number | null;
  visit_to_sale: number | null;
  efficiency_score: number;
  has_enough_data: boolean;
}

interface FunnelStage { rate: number | null; count: number; }
interface FunnelData {
  leads: number; in_progress: number; visit: number; docs: number; concluded: number;
  rate_new_to_progress: number | null;
  rate_progress_to_visit: number | null;
  rate_visit_to_docs: number | null;
  rate_docs_to_concluded: number | null;
}
interface FunnelComparison {
  period_days: number;
  my: FunnelData; team: FunnelData; top: FunnelData;
  gargalo: string | null;
  gargalo_gap_pp: number;
}

interface CoachAnalysisRow {
  id: string;
  conversation_id: string | null;
  quality_score: number | null;
  severity: string | null;
  summary: string | null;
  errors: any;
  positives: any;
  created_at: string;
  ia_conversations?: { id: string; lead_name: string | null; lead_phone: string | null; campaign_id: string | null };
}

interface ActionItem {
  id: string;
  text: string;
  due_date: string | null;
  status: "pending" | "done" | "missed";
  completed_at?: string | null;
  completed_note?: string;
}

interface Session {
  id: string;
  manager_id: string;
  broker_id: string;
  session_date: string;
  notes: string | null;
  action_items: ActionItem[];
  next_meeting_at: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function tprColor(min: number | null): string {
  if (min === null) return "text-gray-500";
  if (min < 30) return "text-emerald-300";
  if (min < 120) return "text-amber-300";
  return "text-red-300";
}

function scoreTier(score: number): { label: string; cls: string; emoji: string } {
  if (score >= 25) return { label: "Top",      cls: "bg-amber-900/40 text-amber-200 border-amber-500/40",      emoji: "🏆" };
  if (score >= 15) return { label: "Forte",    cls: "bg-emerald-900/40 text-emerald-200 border-emerald-500/40", emoji: "💪" };
  if (score >= 8)  return { label: "Médio",    cls: "bg-slate-800 text-gray-300 border-gray-600/40",            emoji: "📊" };
  return { label: "Atenção", cls: "bg-red-900/40 text-red-200 border-red-500/40", emoji: "⚠️" };
}

function uid() { return Math.random().toString(36).slice(2, 10); }

// ─── Drawer principal ──────────────────────────────────────────────────────

interface Props {
  broker: BrokerSummary;
  managerId: string;
  periodDays: number;
  onClose: () => void;
}

type Tab = "diagnostico" | "conversas" | "historico";

export default function CoachingDrawer({ broker, managerId, periodDays, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("diagnostico");
  const [funnel, setFunnel] = useState<FunnelComparison | null>(null);
  const [analyses, setAnalyses] = useState<CoachAnalysisRow[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingFunnel, setLoadingFunnel] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  const [loadingHist, setLoadingHist] = useState(false);
  const [openConv, setOpenConv] = useState<CoachAnalysisRow | null>(null);

  const tier = scoreTier(broker.efficiency_score);

  // ── Loaders ──────────────────────────────────────────────────────────────
  async function loadFunnel() {
    setLoadingFunnel(true);
    const { data } = await supabase.rpc("get_broker_funnel_comparison", {
      p_broker_id: broker.id, p_period_days: periodDays,
    });
    if (data) setFunnel(data as FunnelComparison);
    setLoadingFunnel(false);
  }

  async function loadConversations() {
    setLoadingConv(true);
    const { data } = await supabase
      .from("ai_coach_analysis")
      .select("id, conversation_id, quality_score, severity, summary, errors, positives, created_at, ia_conversations(id, lead_name, lead_phone, campaign_id)")
      .eq("broker_id", broker.id)
      .not("conversation_id", "is", null)
      .not("quality_score", "is", null)
      .gte("created_at", new Date(Date.now() - periodDays * 86400000).toISOString())
      .order("quality_score", { ascending: false })
      .limit(100);
    setAnalyses((data || []) as any);
    setLoadingConv(false);
  }

  async function loadSessions() {
    setLoadingHist(true);
    const { data } = await supabase
      .from("coaching_sessions")
      .select("*")
      .eq("manager_id", managerId)
      .eq("broker_id", broker.id)
      .order("session_date", { ascending: false })
      .limit(20);
    setSessions((data || []) as Session[]);
    setLoadingHist(false);
  }

  useEffect(() => { loadFunnel(); /* eslint-disable-next-line */ }, [broker.id, periodDays]);
  useEffect(() => {
    if (tab === "conversas" && analyses.length === 0) loadConversations();
    if (tab === "historico" && sessions.length === 0) loadSessions();
    /* eslint-disable-next-line */
  }, [tab]);

  // Top 3 e bottom 3 de conversas
  const topConvs = useMemo(() => analyses.slice(0, 3), [analyses]);
  const bottomConvs = useMemo(() => [...analyses].reverse().slice(0, 3), [analyses]);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
           className="bg-slate-950 border border-cyan-500/40 rounded-t-2xl md:rounded-2xl w-full md:max-w-3xl max-h-[92vh] overflow-y-auto shadow-[0_0_50px_rgba(0,212,255,0.2)]">
        {/* Header */}
        <div className="sticky top-0 bg-slate-950 border-b border-gray-800 px-5 py-3 z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-cyan-400" />
              <div>
                <h3 className="font-bold text-white">1:1 com {broker.first_name} {broker.last_name || ""}</h3>
                <p className="text-[11px] text-gray-500">Sessão de coaching · últimos {periodDays} dias</p>
              </div>
              <span className={`inline-flex items-center gap-1 ml-3 px-2 py-1 rounded text-xs border ${tier.cls}`}>
                {tier.emoji} {tier.label} · {broker.efficiency_score}
              </span>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-300">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1">
            {([
              ["diagnostico", "Diagnóstico", BarChart3],
              ["conversas",   "Conversas",   MessageSquare],
              ["historico",   "Histórico",   History],
            ] as const).map(([k, l, Icon]) => (
              <button key={k} onClick={() => setTab(k as Tab)}
                className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  tab === k ? "bg-cyan-900/60 text-cyan-200 border border-cyan-500/40"
                            : "text-gray-400 hover:text-gray-200 hover:bg-slate-800/60"
                }`}>
                <Icon className="w-3.5 h-3.5" /> {l}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {tab === "diagnostico" && (
            <DiagnosticoTab broker={broker} funnel={funnel} loading={loadingFunnel} />
          )}
          {tab === "conversas" && (
            <ConversasTab loading={loadingConv} top={topConvs} bottom={bottomConvs}
                          onOpen={(c) => setOpenConv(c)} />
          )}
          {tab === "historico" && (
            <HistoricoTab broker={broker} managerId={managerId}
                          sessions={sessions} loading={loadingHist}
                          onSaved={() => loadSessions()} />
          )}
        </div>
      </div>

      {openConv && (
        <ConversationViewer analysis={openConv} onClose={() => setOpenConv(null)} />
      )}
    </div>
  );
}

// ─── Tab Diagnóstico ───────────────────────────────────────────────────────

function DiagnosticoTab({ broker, funnel, loading }: { broker: BrokerSummary; funnel: FunnelComparison | null; loading: boolean }) {
  if (loading || !funnel) return <Loading msg="Calculando funil comparativo..." />;

  const stages = [
    { label: "NEW → IN_PROGRESS",  my: funnel.my.rate_new_to_progress,    team: funnel.team.rate_new_to_progress,    top: funnel.top.rate_new_to_progress,    isGargalo: funnel.gargalo === "NEW → IN_PROGRESS" },
    { label: "IN_PROGRESS → VISITA", my: funnel.my.rate_progress_to_visit, team: funnel.team.rate_progress_to_visit, top: funnel.top.rate_progress_to_visit, isGargalo: funnel.gargalo === "IN_PROGRESS → VISITA" },
    { label: "VISITA → DOCS",       my: funnel.my.rate_visit_to_docs,     team: funnel.team.rate_visit_to_docs,     top: funnel.top.rate_visit_to_docs,     isGargalo: funnel.gargalo === "VISITA → DOCS" },
    { label: "DOCS → FECHAMENTO",   my: funnel.my.rate_docs_to_concluded, team: funnel.team.rate_docs_to_concluded, top: funnel.top.rate_docs_to_concluded, isGargalo: funnel.gargalo === "DOCS → FECHAMENTO" },
  ];

  return (
    <>
      {/* Funil drill-down comparativo */}
      <div className="bg-slate-900/60 border border-gray-700/50 rounded-xl p-4">
        <h4 className="text-sm font-bold text-gray-200 mb-2 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-cyan-400" /> Funil drill-down
        </h4>
        <p className="text-[11px] text-gray-500 mb-3">
          Taxa de conversão entre etapas — você vs média da equipe vs top performer.
          {funnel.gargalo && <span className="text-red-300 ml-1">🔴 Gargalo: <strong>{funnel.gargalo}</strong> ({funnel.gargalo_gap_pp.toFixed(1)}pp abaixo da equipe)</span>}
        </p>

        <table className="w-full text-xs">
          <thead className="text-gray-400 text-[10px] uppercase tracking-wider">
            <tr>
              <th className="text-left pb-1">Etapa</th>
              <th className="text-right pb-1">Você</th>
              <th className="text-right pb-1">Equipe</th>
              <th className="text-right pb-1">Top</th>
              <th className="text-right pb-1">Gap</th>
            </tr>
          </thead>
          <tbody>
            {stages.map(s => {
              const gap = (s.my ?? 0) - (s.team ?? 0);
              const cls = gap < -3 ? "text-red-300" : gap > 3 ? "text-emerald-300" : "text-gray-300";
              return (
                <tr key={s.label} className={`border-t border-gray-800 ${s.isGargalo ? "bg-red-950/20" : ""}`}>
                  <td className="py-1.5 text-gray-200">{s.isGargalo && "🔴 "}{s.label}</td>
                  <td className="py-1.5 text-right font-mono font-semibold text-white">{fmt(s.my)}{s.my !== null ? "%" : ""}</td>
                  <td className="py-1.5 text-right font-mono text-gray-400">{fmt(s.team)}%</td>
                  <td className="py-1.5 text-right font-mono text-amber-300">{fmt(s.top)}%</td>
                  <td className={`py-1.5 text-right font-mono ${cls}`}>{gap > 0 ? "+" : ""}{fmt(gap)}pp</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Funil em barras */}
        <div className="mt-4 space-y-1.5">
          {[
            { label: "Leads recebidos",  count: funnel.my.leads, pct: 100 },
            { label: "Em conversa",      count: funnel.my.in_progress, pct: funnel.my.leads ? (funnel.my.in_progress / funnel.my.leads) * 100 : 0 },
            { label: "Visita+",          count: funnel.my.visit, pct: funnel.my.leads ? (funnel.my.visit / funnel.my.leads) * 100 : 0 },
            { label: "Docs",             count: funnel.my.docs, pct: funnel.my.leads ? (funnel.my.docs / funnel.my.leads) * 100 : 0 },
            { label: "Vendas",           count: funnel.my.concluded, pct: funnel.my.leads ? (funnel.my.concluded / funnel.my.leads) * 100 : 0 },
          ].map((s, i) => (
            <div key={s.label}>
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="text-gray-300">{s.label}</span>
                <span className="text-gray-400 font-mono">{s.count} ({fmt(s.pct)}%)</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${
                  i === 0 ? "bg-blue-500" : i === 1 ? "bg-cyan-500" :
                  i === 2 ? "bg-amber-500" : i === 3 ? "bg-orange-500" : "bg-emerald-500"
                }`} style={{ width: `${Math.max(2, s.pct)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Insights */}
      <div className="bg-cyan-950/30 border border-cyan-500/30 rounded-xl p-4">
        <h4 className="text-sm font-bold text-cyan-200 mb-2 flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> Pontos pra discutir
        </h4>
        <ul className="space-y-1.5 text-xs text-gray-200">
          {!broker.has_enough_data && (
            <li className="flex items-start gap-2 text-amber-200">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              Amostra pequena (&lt;30 leads). Dados pouco confiáveis — não tirar conclusões duras.
            </li>
          )}
          {funnel.gargalo === "NEW → IN_PROGRESS" && (
            <li className="flex items-start gap-2 text-red-200">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <strong>Não engaja no início:</strong> {fmt(funnel.gargalo_gap_pp)}pp abaixo da equipe pra tirar lead do NEW. TPR = {broker.tpr_avg_min ? fmt(broker.tpr_avg_min) + "min" : "?"}. Treinar abertura — primeiras 2 mensagens.
            </li>
          )}
          {funnel.gargalo === "IN_PROGRESS → VISITA" && (
            <li className="flex items-start gap-2 text-red-200">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <strong>Qualifica pouco:</strong> {fmt(funnel.gargalo_gap_pp)}pp abaixo na conversão pra visita. Treinar BANT/SPIN — perguntas de renda, FGTS, score, urgência.
            </li>
          )}
          {funnel.gargalo === "VISITA → DOCS" && (
            <li className="flex items-start gap-2 text-amber-200">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <strong>Visita não converte em docs:</strong> falha no fechamento da visita. Revisar checklist pós-visita e pedido imediato de documentos.
            </li>
          )}
          {funnel.gargalo === "DOCS → FECHAMENTO" && (
            <li className="flex items-start gap-2 text-amber-200">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <strong>Pasta empaca no fechamento:</strong> docs não viram venda. Acompanhar análise bancária mais de perto, contato com gerente da Caixa.
            </li>
          )}
          {!funnel.gargalo && broker.has_enough_data && (
            <li className="flex items-start gap-2 text-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              Sem gargalo evidente — funil está alinhado com a equipe ou melhor.
            </li>
          )}
          {broker.efficiency_score >= 25 && (
            <li className="flex items-start gap-2 text-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <strong>Top performer:</strong> dar mais leads, pedir compartilhamento de método com a equipe.
            </li>
          )}
        </ul>
      </div>
    </>
  );
}

// ─── Tab Conversas ─────────────────────────────────────────────────────────

function ConversasTab({ loading, top, bottom, onOpen }: { loading: boolean; top: CoachAnalysisRow[]; bottom: CoachAnalysisRow[]; onOpen: (c: CoachAnalysisRow) => void }) {
  if (loading) return <Loading msg="Carregando análises das conversas..." />;
  if (top.length === 0 && bottom.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-40" />
        <p className="text-sm">Sem análises de conversa neste período.</p>
        <p className="text-[11px] mt-1">O Coach IA roda toda 1-2h analisando conversas. Aguarde o próximo ciclo.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Conversas analisadas pelo Coach IA — top 3 e bottom 3 por nota de qualidade. Click pra abrir e ver mensagens + comentários.
      </p>

      {top.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-emerald-200 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            🟢 Melhores (modelo)
          </h4>
          <div className="space-y-1.5">
            {top.map(c => <ConvCard key={c.id} c={c} accent="emerald" onOpen={() => onOpen(c)} />)}
          </div>
        </div>
      )}

      {bottom.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-red-200 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            🔴 Piores (revisar juntos)
          </h4>
          <div className="space-y-1.5">
            {bottom.map(c => <ConvCard key={c.id} c={c} accent="red" onOpen={() => onOpen(c)} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function ConvCard({ c, accent, onOpen }: { c: CoachAnalysisRow; accent: "emerald" | "red"; onOpen: () => void }) {
  const score = c.quality_score || 0;
  const conv = c.ia_conversations;
  const cls = accent === "emerald" ? "border-emerald-500/30 hover:bg-emerald-950/20" : "border-red-500/30 hover:bg-red-950/20";
  return (
    <button onClick={onOpen} className={`w-full text-left bg-slate-900/40 border rounded-lg p-2.5 transition-colors ${cls}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-lg font-black ${accent === "emerald" ? "text-emerald-300" : "text-red-300"}`}>{score}</span>
          <span className="text-sm text-gray-100 truncate">{conv?.lead_name || conv?.lead_phone || "(sem nome)"}</span>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
      </div>
      {c.summary && (
        <p className="text-[11px] text-gray-400 line-clamp-2 italic">{c.summary}</p>
      )}
      <div className="text-[10px] text-gray-500 mt-1">
        {fmtDate(c.created_at)}
        {c.severity && <span className="ml-2 px-1 py-0.5 rounded bg-slate-800 text-gray-400">{c.severity}</span>}
      </div>
    </button>
  );
}

// ─── Tab Histórico ────────────────────────────────────────────────────────

function HistoricoTab({ broker, managerId, sessions, loading, onSaved }: {
  broker: BrokerSummary; managerId: string; sessions: Session[]; loading: boolean; onSaved: () => void;
}) {
  const [composing, setComposing] = useState(false);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ActionItem[]>([]);
  const [nextMeeting, setNextMeeting] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().substring(0, 10);
  });
  const [saving, setSaving] = useState(false);

  function addItem() {
    const due = new Date(); due.setDate(due.getDate() + 7);
    setItems([...items, { id: uid(), text: "", due_date: due.toISOString().substring(0, 10), status: "pending" }]);
  }
  function updItem(id: string, patch: Partial<ActionItem>) { setItems(items.map(i => i.id === id ? { ...i, ...patch } : i)); }
  function rmItem(id: string) { setItems(items.filter(i => i.id !== id)); }

  async function save() {
    if (!notes.trim() && items.length === 0) return toast.error("Adicione anotações ou pacto");
    setSaving(true);
    try {
      const cleaned = items.filter(i => i.text.trim()).map(i => ({
        ...i, due_date: i.due_date ? new Date(i.due_date).toISOString() : null,
      }));
      const { error } = await supabase.from("coaching_sessions").insert({
        manager_id: managerId, broker_id: broker.id, notes: notes.trim() || null,
        action_items: cleaned, next_meeting_at: nextMeeting ? new Date(nextMeeting).toISOString() : null,
      });
      if (error) throw error;
      toast.success("Sessão registrada");
      setComposing(false); setNotes(""); setItems([]); onSaved();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  }

  async function togglePact(sessionId: string, item: ActionItem, newStatus: ActionItem["status"]) {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    const updated = (session.action_items || []).map(i => i.id === item.id ? { ...i, status: newStatus, completed_at: newStatus === "done" ? new Date().toISOString() : null } : i);
    const { error } = await supabase.from("coaching_sessions").update({ action_items: updated }).eq("id", sessionId);
    if (error) toast.error(error.message);
    else { toast.success("Atualizado"); onSaved(); }
  }

  if (loading) return <Loading msg="Carregando histórico..." />;

  return (
    <div className="space-y-3">
      {/* CTA pra nova sessão */}
      {!composing && (
        <button onClick={() => setComposing(true)}
          className="w-full bg-cyan-700 hover:bg-cyan-600 text-white rounded-lg py-2.5 font-medium flex items-center justify-center gap-2 transition-colors">
          <Plus className="w-4 h-4" /> Registrar nova sessão de 1:1
        </button>
      )}

      {/* Form de nova sessão */}
      {composing && (
        <div className="bg-cyan-950/30 border border-cyan-500/40 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-bold text-cyan-200">📝 Nova sessão · {new Date().toLocaleDateString("pt-BR")}</h4>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-1">Anotações da reunião</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder="O que foi conversado, observações, pontos de melhoria, contexto..."
              className="w-full bg-slate-900/60 border border-gray-700/50 rounded-lg p-2 text-sm text-gray-200 resize-none" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] uppercase tracking-wider text-gray-400">Pactos / Action items</label>
              <button onClick={addItem} className="text-xs text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1">
                <Plus className="w-3 h-3" /> Adicionar
              </button>
            </div>
            <div className="space-y-1.5">
              {items.length === 0 && <p className="text-[11px] text-gray-500 italic">Nenhum pacto ainda. Pacto = combinado específico com prazo. Ex: "Atingir TPR ≤30min em 7 dias".</p>}
              {items.map(i => (
                <div key={i.id} className="flex items-center gap-1.5">
                  <input value={i.text} onChange={(e) => updItem(i.id, { text: e.target.value })}
                    placeholder="O que foi combinado?"
                    className="flex-1 bg-slate-900/60 border border-gray-700/50 rounded px-2 py-1 text-xs text-gray-200" />
                  <input type="date" value={i.due_date || ""} onChange={(e) => updItem(i.id, { due_date: e.target.value || null })}
                    className="bg-slate-900/60 border border-gray-700/50 rounded px-2 py-1 text-xs text-gray-200" />
                  <button onClick={() => rmItem(i.id)} className="p-1 text-red-300 hover:text-red-200">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="w-3 h-3 text-gray-500" />
            <span className="text-[10px] uppercase tracking-wider text-gray-400">Próxima 1:1:</span>
            <input type="date" value={nextMeeting} onChange={(e) => setNextMeeting(e.target.value)}
              className="bg-slate-900/60 border border-gray-700/50 rounded px-2 py-1 text-xs text-gray-200" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => { setComposing(false); setNotes(""); setItems([]); }}
              className="px-3 py-1.5 rounded text-xs bg-slate-800 hover:bg-slate-700 text-gray-300">Cancelar</button>
            <button onClick={save} disabled={saving}
              className="px-3 py-1.5 rounded text-xs bg-emerald-700 hover:bg-emerald-600 text-white inline-flex items-center gap-1.5 disabled:opacity-50">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Salvar sessão
            </button>
          </div>
        </div>
      )}

      {/* Lista de sessões anteriores */}
      {sessions.length === 0 && !composing && (
        <div className="text-center py-6 text-gray-500 text-sm">
          Nenhuma sessão registrada ainda. <span className="text-cyan-300">Comece pela primeira ↑</span>
        </div>
      )}
      {sessions.map(s => (
        <SessionCard key={s.id} session={s} onTogglePact={togglePact} />
      ))}
    </div>
  );
}

function SessionCard({ session, onTogglePact }: { session: Session; onTogglePact: (sid: string, item: ActionItem, newStatus: ActionItem["status"]) => void }) {
  const [expanded, setExpanded] = useState(false);
  const items = session.action_items || [];
  const done = items.filter(i => i.status === "done").length;
  const missed = items.filter(i => i.status === "missed").length;
  const overdue = items.filter(i => i.status === "pending" && i.due_date && new Date(i.due_date) < new Date()).length;

  return (
    <div className="bg-slate-900/40 border border-gray-700/50 rounded-lg p-3">
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-gray-200">📅 {fmtDate(session.session_date)}</div>
          <div className="text-[11px] text-gray-500">
            {items.length > 0 && <>
              {items.length} pacto{items.length > 1 ? "s" : ""} ·
              {done > 0 && <span className="text-emerald-300"> ✓{done}</span>}
              {missed > 0 && <span className="text-red-300"> ✗{missed}</span>}
              {overdue > 0 && <span className="text-amber-300"> ⏰{overdue} vencido{overdue > 1 ? "s" : ""}</span>}
            </>}
            {items.length === 0 && "sem pactos"}
            {session.next_meeting_at && <> · próxima: {fmtDate(session.next_meeting_at)}</>}
          </div>
        </div>
        <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-800 space-y-2">
          {session.notes && (
            <div className="bg-slate-950/60 rounded p-2 text-xs text-gray-300 whitespace-pre-wrap">{session.notes}</div>
          )}
          {items.map(item => {
            const isOverdue = item.status === "pending" && item.due_date && new Date(item.due_date) < new Date();
            return (
              <div key={item.id} className={`flex items-start gap-2 p-2 rounded ${
                item.status === "done" ? "bg-emerald-950/30 border border-emerald-500/30" :
                item.status === "missed" ? "bg-red-950/30 border border-red-500/30" :
                isOverdue ? "bg-amber-950/30 border border-amber-500/30" :
                "bg-slate-950/40 border border-gray-700/40"
              }`}>
                <div className="flex-1">
                  <div className={`text-xs ${item.status === "done" ? "line-through text-gray-500" : "text-gray-200"}`}>
                    {item.text}
                  </div>
                  {item.due_date && (
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      Prazo: {fmtDate(item.due_date)}
                      {isOverdue && <span className="text-amber-300"> · vencido</span>}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  {item.status === "pending" && (
                    <>
                      <button onClick={() => onTogglePact(session.id, item, "done")}
                        title="Marcar cumprido"
                        className="p-1 rounded bg-emerald-900/40 hover:bg-emerald-900/60 text-emerald-300">
                        <CheckCircle2 className="w-3 h-3" />
                      </button>
                      <button onClick={() => onTogglePact(session.id, item, "missed")}
                        title="Marcar não cumprido"
                        className="p-1 rounded bg-red-900/40 hover:bg-red-900/60 text-red-300">
                        <X className="w-3 h-3" />
                      </button>
                    </>
                  )}
                  {item.status !== "pending" && (
                    <button onClick={() => onTogglePact(session.id, item, "pending")}
                      title="Reabrir"
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-gray-400 text-[10px] px-2">
                      reabrir
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Conversation Viewer ──────────────────────────────────────────────────

function ConversationViewer({ analysis, onClose }: { analysis: CoachAnalysisRow; onClose: () => void }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!analysis.conversation_id) return;
    (async () => {
      const { data } = await supabase
        .from("ia_messages")
        .select("id, message_text, direction, sender_type, created_at")
        .eq("conversation_id", analysis.conversation_id)
        .order("created_at", { ascending: true });
      setMessages(data || []);
      setLoading(false);
    })();
  }, [analysis.conversation_id]);

  const errors = analysis.errors as any[] | null;
  const positives = analysis.positives as any[] | null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
           className="bg-slate-950 border border-cyan-500/40 rounded-2xl w-full md:max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-slate-950 border-b border-gray-800 px-4 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="w-4 h-4 text-cyan-400" />
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-white truncate">{analysis.ia_conversations?.lead_name || analysis.ia_conversations?.lead_phone}</h4>
              <p className="text-[10px] text-gray-500">Score Coach IA: <strong className={analysis.quality_score && analysis.quality_score >= 60 ? "text-emerald-300" : "text-red-300"}>{analysis.quality_score}</strong> · {fmtDate(analysis.created_at)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-gray-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {analysis.summary && (
            <div className="bg-cyan-950/30 border border-cyan-500/30 rounded-lg p-3 text-xs text-gray-200">
              <div className="font-bold text-cyan-200 mb-1">📋 Resumo Coach IA</div>
              {analysis.summary}
            </div>
          )}

          {Array.isArray(errors) && errors.length > 0 && (
            <div className="bg-red-950/30 border border-red-500/30 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-red-300 mb-1.5">⚠️ Pontos de melhoria</div>
              <ul className="space-y-1 text-xs text-gray-200">
                {errors.slice(0, 5).map((e: any, i: number) => (
                  <li key={i}>• {typeof e === "string" ? e : e.text || e.error || JSON.stringify(e)}</li>
                ))}
              </ul>
            </div>
          )}

          {Array.isArray(positives) && positives.length > 0 && (
            <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-emerald-300 mb-1.5">✅ Bem feito</div>
              <ul className="space-y-1 text-xs text-gray-200">
                {positives.slice(0, 5).map((p: any, i: number) => (
                  <li key={i}>• {typeof p === "string" ? p : p.text || p.positive || JSON.stringify(p)}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-gray-400">💬 Mensagens</div>
            {loading && <Loading msg="Carregando..." />}
            {!loading && messages.length === 0 && <p className="text-xs text-gray-500 italic">Sem mensagens nesta conversa.</p>}
            {messages.map(m => (
              <div key={m.id} className={`flex ${m.direction === "incoming" ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[80%] rounded-lg px-3 py-1.5 text-xs ${
                  m.direction === "incoming" ? "bg-slate-800 text-gray-100"
                  : m.sender_type === "broker" ? "bg-cyan-900/60 text-cyan-100"
                  : "bg-fuchsia-900/40 text-fuchsia-100"
                }`}>
                  <div className="text-[9px] uppercase tracking-wider opacity-60 mb-0.5">
                    {m.direction === "incoming" ? "Lead" : m.sender_type === "broker" ? "Corretor" : "IA"} · {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div className="whitespace-pre-wrap">{m.message_text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers UI ──────────────────────────────────────────────────────────

function Loading({ msg }: { msg: string }) {
  return (
    <div className="text-center py-6 text-gray-500 text-xs inline-flex items-center justify-center gap-2 w-full">
      <Loader2 className="w-3 h-3 animate-spin" /> {msg}
    </div>
  );
}
