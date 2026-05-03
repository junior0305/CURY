import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  RefreshCw, MessageSquare, Bot, User as UserIcon, Bell, Eye,
  Loader2, Inbox, Flame, Ban, HelpCircle, Sparkles, Clock,
  CheckCircle2, AlertTriangle, ZapOff,
} from "lucide-react";

interface ConvRow {
  id: string;
  lead_id: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  bot_name: string | null;
  msgs_lead: number;
  msgs_out_ia: number;
  msgs_out_broker: number;
  last_msg_at: string;
  last_msg_sender: string;
  last_outgoing_at: string | null;
  last_outgoing_sender: string | null;
  last_lead_msg_text: string | null;
  last_lead_msg_at: string | null;
  last_broker_msg_at: string | null;
  // Lead
  lead_status: string | null;
  broker_id: string | null;
  broker_name: string | null;
  broker_phone: string | null;
  // Classificação textual
  classification: "quente" | "opt_out" | "pergunta" | "neutro";
  // Trabalhando? (resposta do corretor depois da última do lead)
  trabalhando: "ok" | "atrasado" | "perdido" | "sem_resposta";
  trabalhando_lag_h: number;
}

const WINDOW_OPTIONS = [
  { v: 24,  label: "24h" },
  { v: 168, label: "7d"  },
  { v: 720, label: "30d" },
] as const;

// ── Classificação textual (mesma do admin) ──────────────────────────────────
const OPT_OUT_KEYWORDS = [
  "nao quero", "não quero", "nao tenho interesse", "não tenho interesse",
  "sem interesse", "para de", "pare de", "me retire", "me tire",
  "descadastra", "descadastrar", "remova", "remover", "stop",
  "unsubscribe", "numero errado", "número errado", "nao sou",
  "não me incomod", "nao me incomod", "deixa de", "perdi o interesse",
  "ja comprei", "já comprei",
];
const QUENTE_KEYWORDS = [
  "quero", "tenho interesse", "preço", "preco", "valor", "quanto custa",
  "quando posso", "como funciona", "documento", "visita", "agendar",
  "marcar", "fgts", "renda", "comprovante", "entrada", "parcela",
  "financiar", "aprovado", "vamos", "bora", "sim", "topo", "topar",
];
function classify(text: string | null): ConvRow["classification"] {
  if (!text) return "neutro";
  const t = text.toLowerCase().trim();
  for (const kw of OPT_OUT_KEYWORDS) if (t.includes(kw)) return "opt_out";
  for (const kw of QUENTE_KEYWORDS)  if (t.includes(kw)) return "quente";
  if (t.endsWith("?")) return "pergunta";
  return "neutro";
}
const CLASSIFICATION_META: Record<ConvRow["classification"], { label: string; color: string; icon: any }> = {
  quente:   { label: "Quente",   color: "text-red-300 bg-red-900/40 border-red-500/40",       icon: Flame },
  opt_out:  { label: "Opt-out",  color: "text-zinc-300 bg-zinc-900/60 border-zinc-500/40",    icon: Ban },
  pergunta: { label: "Pergunta", color: "text-blue-300 bg-blue-900/40 border-blue-500/40",    icon: HelpCircle },
  neutro:   { label: "Neutro",   color: "text-gray-400 bg-slate-800 border-gray-700/40",      icon: MessageSquare },
};

const TRABALHANDO_META: Record<ConvRow["trabalhando"], { label: string; cls: string; icon: any }> = {
  ok:           { label: "Atendido",       cls: "bg-emerald-900/40 text-emerald-200 border-emerald-500/40", icon: CheckCircle2 },
  atrasado:     { label: "Atrasado",       cls: "bg-amber-900/40 text-amber-200 border-amber-500/40",       icon: Clock },
  perdido:      { label: "Sem resposta",   cls: "bg-red-900/40 text-red-200 border-red-500/40",             icon: AlertTriangle },
  sem_resposta: { label: "Lead não falou", cls: "bg-slate-800 text-gray-400 border-gray-700/40",            icon: ZapOff },
};

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

interface Props {
  managerId: string;
  onOpenLead?: (leadId: string) => void;
}

export default function RespostasPanel({ managerId, onOpenLead }: Props) {
  const [rows, setRows] = useState<ConvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowH, setWindowH] = useState<number>(168);
  const [filter, setFilter] = useState<"todos" | "quentes" | "qualificados" | "atrasados" | "opt_outs">("todos");
  const [busyConv, setBusyConv] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 1) Corretores do manager
      const { data: brokers } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, phone")
        .eq("manager_id", managerId)
        .eq("role", "BROKER");

      const brokerIds = (brokers || []).map((b: any) => b.id);
      const brokerMap = new Map<string, any>();
      (brokers || []).forEach((b: any) => brokerMap.set(b.id, b));

      if (brokerIds.length === 0) { setRows([]); setLoading(false); return; }

      // 2) Leads desses corretores
      const { data: leads } = await supabase
        .from("leads")
        .select("id, status, broker_id")
        .in("broker_id", brokerIds);

      const leadIds = (leads || []).map((l: any) => l.id);
      const leadMap = new Map<string, any>();
      (leads || []).forEach((l: any) => leadMap.set(l.id, l));

      if (leadIds.length === 0) { setRows([]); setLoading(false); return; }

      // 3) Conversas dessas leads — apenas conversas vindas de campanha
      const cutoff = new Date(Date.now() - windowH * 3600000).toISOString();
      const { data: convs } = await supabase
        .from("ia_conversations")
        .select(`id, lead_id, lead_name, lead_phone, campaign_id, bot_instance_id,
                 ia_campaigns!campaign_id(name), bot_instances!bot_instance_id(name)`)
        .in("lead_id", leadIds)
        .gte("last_message_at", cutoff)
        .gte("messages_count", 2)
        .not("campaign_id", "is", null)
        .order("last_message_at", { ascending: false })
        .limit(150);

      if (!convs || convs.length === 0) { setRows([]); setLoading(false); return; }

      // 4) Mensagens dessas conversas
      const convIds = convs.map((c: any) => c.id);
      const { data: msgs } = await supabase
        .from("ia_messages")
        .select("conversation_id, direction, sender_type, message_text, created_at")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: true });

      type Agg = {
        msgs_lead: number; msgs_out_ia: number; msgs_out_broker: number;
        last_msg_at: string; last_msg_sender: string;
        last_outgoing_at: string | null; last_outgoing_sender: string | null;
        last_lead_msg_text: string | null; last_lead_msg_at: string | null;
        last_broker_msg_at: string | null;
      };
      const agg = new Map<string, Agg>();
      for (const c of convs) agg.set(c.id, {
        msgs_lead: 0, msgs_out_ia: 0, msgs_out_broker: 0,
        last_msg_at: "", last_msg_sender: "",
        last_outgoing_at: null, last_outgoing_sender: null,
        last_lead_msg_text: null, last_lead_msg_at: null, last_broker_msg_at: null,
      });
      for (const m of msgs || []) {
        const a = agg.get(m.conversation_id);
        if (!a) continue;
        if (m.direction === "incoming") {
          a.msgs_lead++;
          a.last_lead_msg_text = m.message_text || null;
          a.last_lead_msg_at = m.created_at;
        } else if (m.sender_type === "ia")     a.msgs_out_ia++;
        else  if (m.sender_type === "broker") {
          a.msgs_out_broker++;
          a.last_broker_msg_at = m.created_at;
        }
        a.last_msg_at = m.created_at;
        a.last_msg_sender = m.direction === "incoming" ? "lead" : (m.sender_type || "");
        if (m.direction === "outgoing") {
          a.last_outgoing_at = m.created_at;
          a.last_outgoing_sender = m.sender_type || null;
        }
      }

      const withResponse = convs.filter((c: any) => (agg.get(c.id)?.msgs_lead ?? 0) > 0);

      const out: ConvRow[] = withResponse.map((c: any) => {
        const a = agg.get(c.id)!;
        const lead = leadMap.get(c.lead_id);
        const broker = lead?.broker_id ? brokerMap.get(lead.broker_id) : null;

        // Trabalhando? Tempo entre última msg do lead e última do broker
        let trabalhando: ConvRow["trabalhando"] = "sem_resposta";
        let lagH = 0;
        if (a.last_lead_msg_at) {
          if (a.last_broker_msg_at && a.last_broker_msg_at > a.last_lead_msg_at) {
            const lag = (new Date(a.last_broker_msg_at).getTime() - new Date(a.last_lead_msg_at).getTime()) / 3600000;
            lagH = lag;
            trabalhando = lag <= 4 ? "ok" : "atrasado";
          } else {
            const since = (Date.now() - new Date(a.last_lead_msg_at).getTime()) / 3600000;
            lagH = since;
            trabalhando = since <= 1 ? "ok" : since <= 4 ? "atrasado" : "perdido";
          }
        }

        return {
          id: c.id,
          lead_id: c.lead_id,
          lead_name: c.lead_name,
          lead_phone: c.lead_phone,
          campaign_id: c.campaign_id,
          campaign_name: c.ia_campaigns?.name || null,
          bot_name: c.bot_instances?.name || null,
          msgs_lead: a.msgs_lead,
          msgs_out_ia: a.msgs_out_ia,
          msgs_out_broker: a.msgs_out_broker,
          last_msg_at: a.last_msg_at,
          last_msg_sender: a.last_msg_sender,
          last_outgoing_at: a.last_outgoing_at,
          last_outgoing_sender: a.last_outgoing_sender,
          last_lead_msg_text: a.last_lead_msg_text,
          last_lead_msg_at: a.last_lead_msg_at,
          last_broker_msg_at: a.last_broker_msg_at,
          lead_status: lead?.status || null,
          broker_id: broker?.id || null,
          broker_name: broker ? `${broker.first_name || ""} ${broker.last_name || ""}`.trim() : null,
          broker_phone: broker?.phone || null,
          classification: classify(a.last_lead_msg_text),
          trabalhando, trabalhando_lag_h: Math.round(lagH * 10) / 10,
        };
      });

      setRows(out);
    } catch (e: any) {
      toast.error("Erro: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [managerId, windowH]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const QUALIFIED = ["IN_PROGRESS","NEGOTIATING","VISIT_SCHEDULED","VISITA_REALIZADA","DOCS_REQUESTED","CONCLUDED"];
    return {
      total: rows.length,
      quentes:      rows.filter(r => r.classification === "quente").length,
      qualificados: rows.filter(r => QUALIFIED.includes(r.lead_status || "")).length,
      atrasados:    rows.filter(r => r.trabalhando === "atrasado" || r.trabalhando === "perdido").length,
      opt_outs:     rows.filter(r => r.classification === "opt_out").length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const QUALIFIED = ["IN_PROGRESS","NEGOTIATING","VISIT_SCHEDULED","VISITA_REALIZADA","DOCS_REQUESTED","CONCLUDED"];
    return rows.filter(r => {
      if (filter === "quentes"      && r.classification !== "quente") return false;
      if (filter === "qualificados" && !QUALIFIED.includes(r.lead_status || "")) return false;
      if (filter === "atrasados"    && r.trabalhando !== "atrasado" && r.trabalhando !== "perdido") return false;
      if (filter === "opt_outs"     && r.classification !== "opt_out") return false;
      return true;
    });
  }, [rows, filter]);

  async function chargeBroker(row: ConvRow) {
    if (!row.broker_id) return toast.error("Lead sem corretor");
    setBusyConv(row.id);
    try {
      await supabase.from("internal_notifications").insert({
        to_id: row.broker_id,
        type: "MANAGER_NUDGE",
        title: "🚨 Atenção neste lead",
        message: `${row.lead_name || "Lead"} respondeu ${relativeTime(row.last_lead_msg_at)} — ${row.classification === "quente" ? "está QUENTE!" : "aguardando seu retorno"}.`,
        related_lead_id: row.lead_id,
      });
      toast.success(`${row.broker_name} foi notificado`);
    } catch (e: any) {
      toast.error("Falha: " + e.message);
    } finally {
      setBusyConv(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <StatCard label="Total"        value={stats.total}        color="slate"   onClick={() => setFilter("todos")}        active={filter === "todos"} />
        <StatCard label="🔥 Quentes"   value={stats.quentes}      color="red"     onClick={() => setFilter("quentes")}      active={filter === "quentes"} />
        <StatCard label="✅ Qualif."   value={stats.qualificados} color="emerald" onClick={() => setFilter("qualificados")} active={filter === "qualificados"} />
        <StatCard label="⏰ Atrasados" value={stats.atrasados}    color="amber"   onClick={() => setFilter("atrasados")}    active={filter === "atrasados"} />
        <StatCard label="🚫 Opt-out"   value={stats.opt_outs}     color="zinc"    onClick={() => setFilter("opt_outs")}     active={filter === "opt_outs"} />
      </div>

      {/* Window selector + refresh */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {WINDOW_OPTIONS.map(w => (
            <button key={w.v} onClick={() => setWindowH(w.v)}
              className={`px-2 py-1 text-xs rounded transition-colors ${windowH === w.v ? "bg-fuchsia-900/60 text-fuchsia-200 border border-fuchsia-500/40" : "bg-slate-800 text-gray-400 hover:text-gray-200"}`}>
              {w.label}
            </button>
          ))}
        </div>
        <button onClick={load} disabled={loading}
          className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-gray-300 flex items-center gap-1.5 disabled:opacity-50">
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {loading && rows.length === 0 && (
          <div className="text-center text-gray-500 py-8 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando respostas das campanhas...
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
            Nenhuma resposta {filter !== "todos" ? "neste filtro" : "nas suas campanhas"} no período.
          </div>
        )}
        {filtered.map(r => {
          const cls = CLASSIFICATION_META[r.classification];
          const ClsIcon = cls.icon;
          const tab = TRABALHANDO_META[r.trabalhando];
          const TabIcon = tab.icon;
          const QUALIFIED = ["IN_PROGRESS","NEGOTIATING","VISIT_SCHEDULED","VISITA_REALIZADA","DOCS_REQUESTED","CONCLUDED"];
          const isQualified = QUALIFIED.includes(r.lead_status || "");

          return (
            <div key={r.id} className={`bg-slate-900/40 border rounded-xl p-3 ${
              r.classification === "quente" ? "border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.15)]" :
              r.classification === "opt_out" ? "border-zinc-700/40" :
              isQualified ? "border-emerald-500/30" : "border-gray-700/50"
            }`}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  {/* Lead nome + chips */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-gray-100 truncate" title={r.lead_name || ""}>
                      {r.lead_name || r.lead_phone || "(sem nome)"}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider border inline-flex items-center gap-1 ${cls.color}`}>
                      <ClsIcon className="w-3 h-3" /> {cls.label}
                    </span>
                    {isQualified && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider border bg-emerald-900/40 text-emerald-200 border-emerald-500/40">
                        ✓ {r.lead_status?.toLowerCase().replace("_", " ")}
                      </span>
                    )}
                    {r.campaign_name && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-gray-400" title={r.campaign_name}>
                        📣 {r.campaign_name.length > 15 ? r.campaign_name.substring(0, 15) + "…" : r.campaign_name}
                      </span>
                    )}
                  </div>

                  {/* Preview da última msg do lead */}
                  {r.last_lead_msg_text && (
                    <div className={`text-[12px] italic mb-1.5 line-clamp-1 ${
                      r.classification === "quente" ? "text-red-200" :
                      r.classification === "opt_out" ? "text-zinc-400" :
                      r.classification === "pergunta" ? "text-blue-200" : "text-gray-400"
                    }`}>
                      💬 "{r.last_lead_msg_text.substring(0, 80)}{r.last_lead_msg_text.length > 80 ? "…" : ""}"
                    </div>
                  )}

                  {/* Linha de status: trabalhando + corretor + lag */}
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider border inline-flex items-center gap-1 ${tab.cls}`}>
                      <TabIcon className="w-3 h-3" /> {tab.label}
                      {r.trabalhando_lag_h > 0 && r.trabalhando !== "ok" && (
                        <span className="ml-0.5">há {r.trabalhando_lag_h < 1 ? `${Math.round(r.trabalhando_lag_h * 60)}min` : `${r.trabalhando_lag_h}h`}</span>
                      )}
                    </span>
                    <span className="text-gray-400 inline-flex items-center gap-1">
                      <UserIcon className="w-3 h-3" />
                      <span className="text-gray-200">{r.broker_name || "—"}</span>
                    </span>
                    {r.bot_name && (
                      <span className="text-gray-500 inline-flex items-center gap-1">
                        <Bot className="w-3 h-3" /> {r.bot_name}
                      </span>
                    )}
                    <span className="text-gray-500">
                      Lead: {relativeTime(r.last_lead_msg_at)} · Corretor: {relativeTime(r.last_broker_msg_at)}
                    </span>
                  </div>
                </div>

                {/* Ações */}
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  {(r.trabalhando === "atrasado" || r.trabalhando === "perdido") && r.broker_id && (
                    <button onClick={() => chargeBroker(r)} disabled={busyConv === r.id}
                      title={`Cobrar ${r.broker_name}`}
                      className="p-1.5 rounded bg-amber-900/40 hover:bg-amber-900/60 text-amber-200 border border-amber-500/40 disabled:opacity-50">
                      {busyConv === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  {onOpenLead && r.lead_id && (
                    <button onClick={() => onOpenLead(r.lead_id!)} title="Abrir lead"
                      className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-gray-300 border border-gray-700/40">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, color, onClick, active }: { label: string; value: number; color: string; onClick: () => void; active: boolean }) {
  const map: Record<string, string> = {
    slate:   "from-slate-800 to-slate-900 border-gray-600/40",
    red:     "from-red-900/40 to-red-900/10 border-red-500/40",
    emerald: "from-emerald-900/40 to-emerald-900/10 border-emerald-500/40",
    amber:   "from-amber-900/40 to-amber-900/10 border-amber-500/40",
    zinc:    "from-zinc-900/60 to-zinc-900/20 border-zinc-500/40",
  };
  return (
    <button onClick={onClick}
      className={`bg-gradient-to-br ${map[color]} border rounded-lg p-2.5 text-left transition-all hover:scale-[1.02] ${active ? "ring-2 ring-fuchsia-500/40" : ""}`}>
      <div className="text-[10px] uppercase tracking-wider text-gray-300">{label}</div>
      <div className="text-xl font-black text-white mt-0.5">{value}</div>
    </button>
  );
}
