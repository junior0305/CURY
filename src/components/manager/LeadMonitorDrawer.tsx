import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import type { Lead } from "@/types/lead";
import type { User } from "@/types/user";
import {
  X, Bot, User as UserIcon, MessageSquare,
  Star, AlertCircle, CheckCircle, Clock, Send, Shield,
  TrendingUp, TrendingDown, Minus, Eye, RefreshCw, Lightbulb, Loader2,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  text: string;
  direction: "incoming" | "outgoing";
  senderType: "broker" | "lead" | "ai";
  createdAt: string;
}

interface CoachAnalysis {
  quality_score: number | null;
  severity: string | null;
  errors: { description: string; severity?: string }[];
  positives: string[];
  summary: string;
  suggestion: string | null;
  created_at?: string;
  cached?: boolean;
  source?: 'auto_metrics' | 'manual_request' | string;  // métrica vs LLM
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Hoje";
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function scoreColor(score: number | null) {
  if (score === null) return "#475569";
  if (score >= 7) return "#10B981";
  if (score >= 4) return "#F59E0B";
  return "#EF4444";
}

function scoreLabel(score: number | null) {
  if (score === null) return "Sem análise";
  if (score >= 8) return "Excelente";
  if (score >= 6) return "Bom";
  if (score >= 4) return "Regular";
  return "Crítico";
}

function severityIcon(severity: string | null) {
  if (severity === "low" || severity === "none") return <CheckCircle className="w-3.5 h-3.5" style={{ color: "#10B981" }} />;
  if (severity === "medium") return <AlertCircle className="w-3.5 h-3.5" style={{ color: "#F59E0B" }} />;
  if (severity === "high" || severity === "critical") return <AlertCircle className="w-3.5 h-3.5" style={{ color: "#EF4444" }} />;
  return <Minus className="w-3.5 h-3.5" style={{ color: "#475569" }} />;
}

// ─── Score Arc ────────────────────────────────────────────────────────────────

function ScoreArc({ score }: { score: number | null }) {
  const pct    = score !== null ? score / 10 : 0;
  const color  = scoreColor(score);
  const r      = 38;
  const circ   = 2 * Math.PI * r;
  const offset = circ - pct * circ * 0.75; // 3/4 arc
  const strokeDash = `${circ * 0.75} ${circ * 0.25}`;

  return (
    <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>
      <svg width="96" height="96" style={{ transform: "rotate(135deg)" }}>
        <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,0.06)"
          strokeWidth="8" strokeDasharray={strokeDash} strokeLinecap="round" />
        <motion.circle
          cx="48" cy="48" r={r} fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={strokeDash}
          initial={{ strokeDashoffset: circ * 0.75 }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: "easeOut" }}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-2xl font-black" style={{ color }}>
          {score !== null ? score.toFixed(1) : "—"}
        </span>
        <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#475569" }}>
          /10
        </span>
      </div>
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function Bubble({ msg }: { msg: Message }) {
  const isLead   = msg.direction === "incoming";
  const isAI     = msg.senderType === "ai";
  const isBroker = msg.senderType === "broker";

  const bg    = isLead ? "rgba(0,212,255,0.1)"   : isAI ? "rgba(124,58,237,0.12)" : "rgba(16,185,129,0.1)";
  const color = isLead ? "#00D4FF"                : isAI ? "#A78BFA"               : "#34D399";
  const align = isLead ? "items-start"            : "items-end";

  return (
    <div className={`flex flex-col ${align} gap-0.5`}>
      <div className="flex items-center gap-1.5">
        {isLead && <UserIcon className="w-3 h-3" style={{ color: "#00D4FF" }} />}
        {isAI   && <Bot      className="w-3 h-3" style={{ color: "#A78BFA" }} />}
        {isBroker && <Eye    className="w-3 h-3" style={{ color: "#34D399" }} />}
        <span className="text-[10px] font-bold" style={{ color }}>
          {isLead ? "Lead" : isAI ? "IA" : "Corretor"}
        </span>
        <span className="text-[9px]" style={{ color: "#334155" }}>{formatTime(msg.createdAt)}</span>
      </div>
      <div
        className="max-w-[85%] rounded-xl px-3 py-2 text-sm"
        style={{
          background: bg,
          border: `1px solid ${color}22`,
          color: "#E2E8F0",
          alignSelf: isLead ? "flex-start" : "flex-end",
        }}
      >
        {msg.text}
      </div>
    </div>
  );
}

// ─── Main Drawer ──────────────────────────────────────────────────────────────

interface Props {
  lead: Lead;
  broker: User | null;
  onClose: () => void;
}

export function LeadMonitorDrawer({ lead, broker, onClose }: Props) {
  const [messages, setMessages]         = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [coach, setCoach]               = useState<CoachAnalysis | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError]     = useState<string | null>(null);
  const [loadingMsgs, setLoadingMsgs]   = useState(true);
  const [draftMessage, setDraftMessage] = useState<string>("");
  const [sending, setSending]           = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function handleManagerSend() {
    const text = draftMessage.trim();
    if (!text) return;
    if (!broker?.botInstanceId) {
      toast.error("Corretor não tem chip vinculado. Não dá pra enviar via WhatsApp.");
      return;
    }
    if (!lead?.phone) {
      toast.error("Lead sem telefone");
      return;
    }
    setSending(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("send_whatsapp_message", {
        body: {
          botId: broker.botInstanceId,
          phone: lead.phone,
          message: text,
          conversationId: conversationId,
          send_source: "broker_manual",
        },
      });
      if (error || !result?.success) {
        const reason = (result as any)?.skipped || error?.message || "falha ao enviar";
        toast.error("❌ " + reason);
        return;
      }
      // Aparece na conversa imediatamente
      setMessages(prev => [...prev, {
        id: `tmp-${Date.now()}`,
        text,
        direction: "outgoing",
        senderType: "broker",
        createdAt: new Date().toISOString(),
      }]);
      setDraftMessage("");

      // Audit log + notif pro corretor
      try {
        await supabase.rpc("log_audit", {
          p_action_type: "MANAGER_TAKEOVER_MESSAGE",
          p_entity_type: "lead",
          p_entity_id: lead.id,
          p_payload: { lead_phone: lead.phone, broker_id: broker.id, message_preview: text.slice(0, 100) },
          p_notes: `Gerente enviou msg pelo chip de ${broker.name?.split(" ")[0] || "corretor"} pro lead ${lead.name}`,
        });
      } catch { /* não bloqueia */ }

      try {
        await supabase.from("internal_notifications").insert({
          to_id: broker.id,
          type: "MANAGER_TAKEOVER",
          message: `Seu gerente respondeu o lead ${lead.name} pelo seu chip. Olha a conversa pra alinhar.`,
        });
      } catch { /* não bloqueia */ }

      toast.success("✅ Enviado pelo chip do corretor");
    } catch (e: any) {
      toast.error("❌ " + (e?.message || "erro inesperado"));
    } finally {
      setSending(false);
    }
  }

  // Fetch messages + capture conversationId
  useEffect(() => {
    setLoadingMsgs(true);
    supabase.from("ia_conversations")
      .select("id")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(async ({ data: conv }) => {
        if (!conv) { setMessages([]); setConversationId(null); setLoadingMsgs(false); return; }
        setConversationId(conv.id);
        const { data: msgs } = await supabase
          .from("ia_messages")
          .select("id, message_text, direction, sender_type, created_at")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: true });
        setMessages((msgs || []).map(m => ({
          id: m.id,
          text: m.message_text,
          direction: m.direction,
          senderType: m.sender_type,
          createdAt: m.created_at,
        })));
        setLoadingMsgs(false);
      });
  }, [lead.id]);

  // Fetch coach analysis — PRIMEIRO tenta cache do banco (qualquer fonte), depois métricas.
  // LLM só roda se manager clicar em "Análise IA Profunda".
  const loadCoachFromDB = async () => {
    if (!conversationId) return null;
    const { data } = await supabase
      .from("ai_coach_analysis")
      .select("quality_score, severity, summary, positives, errors, sample_conversations, conversation_origin, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    return {
      quality_score: data.quality_score,
      severity: data.severity,
      errors: Array.isArray(data.errors) ? data.errors : [],
      positives: Array.isArray(data.positives) ? data.positives : [],
      summary: data.summary || "",
      suggestion: (data.sample_conversations as any)?.suggestion ?? null,
      created_at: data.created_at,
      source: data.conversation_origin || (data.sample_conversations as any)?.source,
      cached: true,
    } as CoachAnalysis;
  };

  const loadCoachMetrics = async () => {
    if (!conversationId) return;
    setCoachLoading(true);
    setCoachError(null);
    const { data, error } = await supabase.functions.invoke("coach-conversation-metrics", {
      body: { conversationId },
    });
    setCoachLoading(false);
    if (error) { setCoachError(error.message || "Falha ao analisar"); return; }
    if ((data as any)?.empty) { setCoach(null); setCoachError("Sem mensagens nesta conversa"); return; }
    if (data && (data as any).quality_score !== undefined) {
      setCoach({
        quality_score: (data as any).quality_score,
        severity: (data as any).severity,
        errors: Array.isArray((data as any).errors) ? (data as any).errors : [],
        positives: Array.isArray((data as any).positives) ? (data as any).positives : [],
        summary: (data as any).summary || "",
        suggestion: (data as any).suggestion ?? null,
        source: 'auto_metrics',
      });
    }
  };

  const loadCoachLLM = async () => {
    if (!conversationId) return;
    setCoachLoading(true);
    setCoachError(null);
    const { data, error } = await supabase.functions.invoke("ai-coach-conversation", {
      body: { conversationId, force: true },
    });
    setCoachLoading(false);
    if (error) { setCoachError(error.message || "Falha ao analisar"); return; }
    if ((data as any)?.empty) return;
    if ((data as any)?.analysis) {
      const a = (data as any).analysis;
      setCoach({
        quality_score: a.quality_score,
        severity: a.severity,
        errors: Array.isArray(a.errors) ? a.errors : [],
        positives: Array.isArray(a.positives) ? a.positives : [],
        summary: a.summary || "",
        suggestion: a.suggestion ?? null,
        source: 'manual_request',
      });
    }
  };

  useEffect(() => {
    if (!conversationId) return;
    (async () => {
      const cached = await loadCoachFromDB();
      if (cached) { setCoach(cached); return; }
      // Sem cache → roda métricas (instantâneo, zero custo)
      loadCoachMetrics();
    })();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [conversationId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (!loadingMsgs) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [loadingMsgs, messages.length]);

  // Group messages by day
  const grouped = messages.reduce<Record<string, Message[]>>((acc, msg) => {
    const day = new Date(msg.createdAt).toDateString();
    if (!acc[day]) acc[day] = [];
    acc[day].push(msg);
    return acc;
  }, {});

  const scoreC = scoreColor(coach?.quality_score ?? null);

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed top-0 right-0 bottom-0 z-40 flex flex-col"
      style={{
        width: "min(460px, 100vw)",
        background: "#0A0F1E",
        borderLeft: "1px solid rgba(0,212,255,0.15)",
        boxShadow: "-16px 0 60px rgba(0,0,0,0.6)",
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-3 flex items-start justify-between"
        style={{ borderBottom: "1px solid rgba(0,212,255,0.1)", background: "rgba(8,11,20,0.9)" }}>
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl mt-0.5"
            style={{ background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)" }}>
            <MessageSquare className="w-4 h-4" style={{ color: "#00D4FF" }} />
          </div>
          <div>
            <p className="font-black text-sm text-white">{lead.name}</p>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: "#475569" }}>
              {lead.phone} · {lead.tag || "sem tag"}
            </p>
            {broker && (
              <p className="text-[10px] mt-0.5" style={{ color: "#334155" }}>
                Corretor: <span style={{ color: "#94A3B8" }}>{broker.name.split(" ")[0]}</span>
              </p>
            )}
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg transition hover:bg-white/5 mt-0.5"
          style={{ color: "#475569" }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── AI Coach desta conversa ──────────────────────────────────────── */}
      {conversationId && (
        <div className="shrink-0 px-4 py-3"
          style={{ borderBottom: "1px solid rgba(124,58,237,0.15)", background: "rgba(124,58,237,0.04)" }}>
          <div className="flex items-center gap-4">
            <ScoreArc score={coach?.quality_score ?? null} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <Star className="w-3.5 h-3.5 shrink-0" style={{ color: "#A78BFA" }} />
                  <span className="text-[10px] font-black uppercase tracking-widest truncate" style={{ color: "#A78BFA" }}>
                    AI Coach
                  </span>
                  {coach?.source === 'auto_metrics' && (
                    <span className="text-[8px] px-1 py-0.5 rounded uppercase tracking-wider"
                      style={{ background: "rgba(16,185,129,0.1)", color: "#10B981", border: "1px solid rgba(16,185,129,0.2)" }}
                      title="Score calculado por métricas (sem custo de IA)">
                      📊 Métricas
                    </span>
                  )}
                  {coach?.source === 'manual_request' && (
                    <span className="text-[8px] px-1 py-0.5 rounded uppercase tracking-wider"
                      style={{ background: "rgba(167,139,250,0.1)", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.2)" }}
                      title="Análise contextual com LLM">
                      🧠 IA Profunda
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {coach?.source !== 'manual_request' && (
                    <button onClick={loadCoachLLM} disabled={coachLoading}
                      className="px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition disabled:opacity-50 flex items-center gap-1"
                      style={{ background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.3)", color: "#A78BFA" }}
                      title="Análise contextual com IA (gera custo de LLM)">
                      🧠 IA Profunda
                    </button>
                  )}
                  <button onClick={loadCoachMetrics} disabled={coachLoading}
                    className="p-1 rounded-md transition disabled:opacity-50"
                    style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)" }}
                    title="Recalcular métricas">
                    <RefreshCw className={`w-3 h-3 ${coachLoading ? "animate-spin" : ""}`} style={{ color: "#A78BFA" }} />
                  </button>
                </div>
              </div>

              {coachLoading && !coach ? (
                <div className="flex items-center gap-2 py-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "#A78BFA" }} />
                  <span className="text-[11px]" style={{ color: "#94A3B8" }}>Analisando mensagens...</span>
                </div>
              ) : coachError && !coach ? (
                <p className="text-[10px]" style={{ color: "#EF4444" }}>{coachError}</p>
              ) : coach ? (
                <>
                  <div className="flex items-center gap-2 mb-1.5">
                    {severityIcon(coach.severity)}
                    <span className="text-xs font-bold" style={{ color: scoreC }}>
                      {scoreLabel(coach.quality_score)}
                      {coach.quality_score !== null && <span className="text-[10px] font-normal ml-1" style={{ color: "#64748B" }}>· {coach.quality_score}/10</span>}
                    </span>
                  </div>
                  {coach.summary && (
                    <p className="text-[11px] leading-relaxed mb-1.5" style={{ color: "#94A3B8" }}>
                      {coach.summary}
                    </p>
                  )}
                  {/* Pontos positivos */}
                  {coach.positives.length > 0 && (
                    <div className="space-y-0.5 mb-1.5">
                      {coach.positives.slice(0, 3).map((p, i) => (
                        <div key={`p-${i}`} className="flex items-start gap-1 text-[10px]" style={{ color: "#10B981" }}>
                          <TrendingUp className="w-3 h-3 shrink-0 mt-0.5" />
                          <span className="leading-relaxed">{p}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Erros */}
                  {coach.errors.length > 0 && (
                    <div className="space-y-0.5 mb-1.5">
                      {coach.errors.slice(0, 3).map((e, i) => (
                        <div key={`e-${i}`} className="flex items-start gap-1 text-[10px]" style={{ color: "#EF4444" }}>
                          <TrendingDown className="w-3 h-3 shrink-0 mt-0.5" />
                          <span className="leading-relaxed">{e.description}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Sugestão de próximo passo */}
                  {coach.suggestion && (
                    <div className="flex items-start gap-1.5 mt-2 pt-2 px-2 py-2 rounded-lg"
                      style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}>
                      <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "#F59E0B" }} />
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-widest block mb-0.5" style={{ color: "#F59E0B" }}>
                          Próximo passo sugerido
                        </span>
                        <span className="text-[11px] leading-relaxed" style={{ color: "#FEF3C7" }}>{coach.suggestion}</span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[10px]" style={{ color: "#334155" }}>Sem análise disponível</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Messages ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
        {loadingMsgs ? (
          <div className="flex items-center justify-center h-full gap-2" style={{ color: "#334155" }}>
            <Clock className="w-5 h-5 animate-pulse" />
            <span className="text-sm">Carregando conversa...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: "#334155" }}>
            <MessageSquare className="w-10 h-10 opacity-20" />
            <p className="text-sm text-center">
              Nenhuma mensagem registrada para este lead.
              <br />
              <span className="text-[10px]">As mensagens aparecem após o corretor interagir via WhatsApp.</span>
            </p>
          </div>
        ) : (
          Object.entries(grouped).map(([day, msgs]) => (
            <div key={day}>
              {/* Day divider */}
              <div className="flex items-center gap-2 my-3">
                <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
                <span className="text-[9px] font-bold uppercase tracking-widest px-2"
                  style={{ color: "#334155" }}>
                  {formatDate(msgs[0].createdAt)}
                </span>
                <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
              </div>
              <div className="space-y-2">
                {msgs.map(msg => (
                  <motion.div key={msg.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Bubble msg={msg} />
                  </motion.div>
                ))}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Footer — input de envio (chip do corretor) ──────────────────── */}
      <div className="shrink-0"
        style={{ borderTop: "1px solid rgba(0,212,255,0.08)", background: "rgba(8,11,20,0.8)" }}>
        {broker?.botInstanceId ? (
          <>
            <div className="px-4 pt-2 pb-1 flex items-center gap-1.5">
              <Shield className="w-3 h-3" style={{ color: "#34D399" }} />
              <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#34D399" }}>
                Você falará pelo chip do {broker.name?.split(" ")[0] || "corretor"} — ele será notificado
              </span>
            </div>
            <div className="px-4 pb-3 flex items-end gap-2">
              <textarea
                value={draftMessage}
                onChange={(e) => setDraftMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleManagerSend();
                  }
                }}
                disabled={sending}
                placeholder="Digite a mensagem... (Enter envia, Shift+Enter quebra linha)"
                rows={2}
                className="flex-1 rounded-lg px-3 py-2 text-sm resize-none outline-none disabled:opacity-50"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(0,212,255,0.2)",
                  color: "#E2E8F0",
                }}
              />
              <button
                onClick={handleManagerSend}
                disabled={sending || !draftMessage.trim()}
                className="px-3 py-2 rounded-lg flex items-center gap-1.5 text-sm font-bold disabled:opacity-50 transition-all hover:scale-[1.03]"
                style={{
                  background: draftMessage.trim() ? "rgba(52,211,153,0.18)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${draftMessage.trim() ? "rgba(52,211,153,0.5)" : "rgba(255,255,255,0.08)"}`,
                  color: draftMessage.trim() ? "#34D399" : "#475569",
                }}
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Enviar
              </button>
            </div>
          </>
        ) : (
          <div className="px-4 py-2.5 flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5" style={{ color: "#F59E0B" }} />
            <span className="text-[10px]" style={{ color: "#F59E0B" }}>
              Corretor sem chip vinculado — modo leitura. Atribua um chip ao corretor pra poder assumir a conversa.
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
