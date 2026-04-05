import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import type { Lead } from "@/types/lead";
import type { User } from "@/types/user";
import {
  X, Bot, User as UserIcon, MessageSquare,
  Star, AlertCircle, CheckCircle, Clock,
  TrendingUp, TrendingDown, Minus, Eye,
} from "lucide-react";

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
  errors: { type: string; description: string }[];
  positives: string[];
  summary: string;
  avg_first_response_time: number | null;
  analysis_period: string;
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
  const [messages, setMessages]       = useState<Message[]>([]);
  const [coach, setCoach]             = useState<CoachAnalysis | null>(null);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Fetch messages
  useEffect(() => {
    setLoadingMsgs(true);
    supabase.from("ia_conversations")
      .select("id")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(async ({ data: conv }) => {
        if (!conv) { setMessages([]); setLoadingMsgs(false); return; }
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

  // Fetch AI Coach for broker
  useEffect(() => {
    if (!broker?.id) return;
    supabase.from("ai_coach_analysis")
      .select("quality_score, severity, errors, positives, summary, avg_first_response_time, analysis_period")
      .eq("broker_id", broker.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setCoach(data ? {
        quality_score: data.quality_score,
        severity: data.severity,
        errors: Array.isArray(data.errors) ? data.errors : [],
        positives: Array.isArray(data.positives) ? data.positives : [],
        summary: data.summary || "",
        avg_first_response_time: data.avg_first_response_time,
        analysis_period: data.analysis_period,
      } : null));
  }, [broker?.id]);

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

      {/* ── AI Coach Score Strip ─────────────────────────────────────────── */}
      {broker && (
        <div className="shrink-0 px-4 py-3"
          style={{ borderBottom: "1px solid rgba(124,58,237,0.15)", background: "rgba(124,58,237,0.04)" }}>
          <div className="flex items-center gap-4">
            <ScoreArc score={coach?.quality_score ?? null} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Star className="w-3.5 h-3.5" style={{ color: "#A78BFA" }} />
                <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#A78BFA" }}>
                  AI Coach · {broker.name.split(" ")[0]}
                </span>
              </div>
              {coach ? (
                <>
                  <div className="flex items-center gap-2 mb-1.5">
                    {severityIcon(coach.severity)}
                    <span className="text-xs font-bold" style={{ color: scoreC }}>
                      {scoreLabel(coach.quality_score)}
                    </span>
                    {coach.avg_first_response_time !== null && (
                      <span className="text-[10px]" style={{ color: "#334155" }}>
                        · 1ª resp: {Math.round(coach.avg_first_response_time / 60)}min
                      </span>
                    )}
                  </div>
                  {coach.summary && (
                    <p className="text-[10px] leading-relaxed line-clamp-2" style={{ color: "#64748b" }}>
                      {coach.summary}
                    </p>
                  )}
                  {/* Pontos positivos / erros */}
                  <div className="flex gap-3 mt-2">
                    {coach.positives.slice(0, 2).map((p, i) => (
                      <span key={i} className="flex items-center gap-1 text-[9px]" style={{ color: "#10B981" }}>
                        <TrendingUp className="w-3 h-3 shrink-0" /> {p.slice(0, 28)}
                      </span>
                    ))}
                    {coach.errors.slice(0, 1).map((e, i) => (
                      <span key={i} className="flex items-center gap-1 text-[9px]" style={{ color: "#EF4444" }}>
                        <TrendingDown className="w-3 h-3 shrink-0" /> {e.description.slice(0, 28)}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-[10px]" style={{ color: "#334155" }}>Análise ainda não gerada para este corretor</p>
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

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-2.5 flex items-center gap-2"
        style={{ borderTop: "1px solid rgba(0,212,255,0.08)", background: "rgba(8,11,20,0.8)" }}>
        <Eye className="w-3.5 h-3.5" style={{ color: "#334155" }} />
        <span className="text-[10px]" style={{ color: "#334155" }}>
          Modo leitura — {messages.length} mensagens · Gerente não pode responder
        </span>
      </div>
    </motion.div>
  );
}
