// LeadAttemptsLine — resumo de tentativas automáticas + coach silencioso.
// Inline no card de foco do broker. Click "ver mensagens" expande timeline.

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Hand, Send, MessageCircle, Bot, Sparkles, Lightbulb, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  leadId: string;
  leadCreatedAt?: string;
  welcomeTemplateId?: string | null;
  lastBrokerWhatsappAt?: string | null; // último envio manual do broker
}

type AttemptKind = "welcome" | "followup" | "ai_qual" | "auto" | "broker";

interface AttemptItem {
  kind: AttemptKind;
  at: string;
  text: string | null;
}

const KIND_META: Record<AttemptKind, { label: string; color: string; icon: any }> = {
  welcome:  { label: "Boas-vindas",   color: "#10B981", icon: Hand },
  followup: { label: "Follow-up",     color: "#F59E0B", icon: Send },
  ai_qual:  { label: "IA conversando", color: "#06B6D4", icon: MessageCircle },
  auto:     { label: "Auto",          color: "#94A3B8", icon: Bot },
  broker:   { label: "Você",          color: "#A78BFA", icon: User },
};

function hoursSince(iso?: string | null) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

function fmtAgo(iso?: string | null) {
  if (!iso) return "—";
  const h = hoursSince(iso);
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}min`;
  if (h < 24) return `${Math.round(h)}h`;
  if (h < 24 * 30) return `${Math.round(h / 24)}d`;
  return `${Math.round(h / (24 * 30))}m`;
}

export default function LeadAttemptsLine({ leadId, welcomeTemplateId, lastBrokerWhatsappAt }: Props) {
  const [loading, setLoading] = useState(true);
  const [auto, setAuto] = useState<AttemptItem[]>([]);
  const [responses, setResponses] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!leadId) {
      setAuto([]);
      setResponses(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setOpen(false);
    (async () => {
      try {
        // 1) IDs das conversas do lead
        const { data: convs } = await supabase
          .from("ia_conversations")
          .select("id")
          .eq("lead_id", leadId);
        const convIds = (convs || []).map((c: any) => c.id).filter(Boolean);
        if (cancelled) return;
        if (convIds.length === 0) {
          setAuto([]);
          setResponses(0);
          setLoading(false);
          return;
        }

        // 2) Mensagens dessas conversas, ordem cronológica
        const { data } = await supabase
          .from("ia_messages")
          .select("message_text, direction, sender_type, send_source, sent_at, created_at")
          .in("conversation_id", convIds)
          .order("created_at", { ascending: true });
        if (cancelled) return;

        const list: AttemptItem[] = [];
        let respCount = 0;
        for (const row of (data as any[]) || []) {
          if (row.direction === "incoming") {
            respCount += 1;
            continue;
          }
          if (row.direction !== "outgoing") continue;
          if (row.sender_type === "broker") continue;
          const src = row.send_source as string | null;
          let kind: AttemptKind = "auto";
          if (src === "ai_followup") kind = "followup";
          else if (src === "ai_qualification") kind = "ai_qual";
          else if (src === "campaign") kind = "welcome";
          list.push({
            kind,
            at: row.sent_at || row.created_at,
            text: row.message_text || null,
          });
        }

        if (welcomeTemplateId && !list.some((a) => a.kind === "welcome")) {
          const first = list.find((a) => a.kind === "auto");
          if (first) first.kind = "welcome";
        }

        setAuto(list);
        setResponses(respCount);
      } catch (e) {
        console.warn("[LeadAttemptsLine] erro ao carregar histórico:", e);
        setAuto([]);
        setResponses(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leadId, welcomeTemplateId]);

  // Última ação (auto ou manual broker)
  const lastAction = useMemo(() => {
    const lastAuto = auto.length > 0 ? auto[auto.length - 1] : null;
    const lastBroker = lastBrokerWhatsappAt ? new Date(lastBrokerWhatsappAt).getTime() : 0;
    const lastAutoTs = lastAuto ? new Date(lastAuto.at).getTime() : 0;
    if (lastBroker > lastAutoTs) {
      return { kind: "broker" as const, at: lastBrokerWhatsappAt!, label: "mensagem manual" };
    }
    if (lastAuto) {
      return { kind: lastAuto.kind, at: lastAuto.at, label: KIND_META[lastAuto.kind].label.toLowerCase() };
    }
    return null;
  }, [auto, lastBrokerWhatsappAt]);

  const breakdown = useMemo(() => {
    const counts: Record<AttemptKind, number> = { welcome: 0, followup: 0, ai_qual: 0, auto: 0, broker: 0 };
    auto.forEach((a) => (counts[a.kind] += 1));
    const parts: string[] = [];
    if (counts.welcome) parts.push(`${counts.welcome} boas-vindas`);
    if (counts.followup) parts.push(`${counts.followup} follow-up${counts.followup > 1 ? "s" : ""}`);
    if (counts.ai_qual) parts.push(`${counts.ai_qual} IA`);
    if (counts.auto) parts.push(`${counts.auto} auto`);
    return parts.join(" + ");
  }, [auto]);

  // Coach silencioso — sugestão tática baseada no estado
  const coach = useMemo(() => {
    const total = auto.length;
    const lastH = auto.length > 0 ? hoursSince(auto[auto.length - 1].at) : Infinity;
    if (responses > 0) {
      const lastRespH = lastAction?.kind === "broker" ? Infinity : 0; // simplificação
      if (lastRespH > 72 || (total > 0 && lastH > 72)) {
        return { tone: "warm", text: "Ele já respondeu antes. Retoma com referência à conversa anterior." };
      }
      return { tone: "calm", text: "Lead engajou — mantém ritmo natural." };
    }
    if (total === 0) {
      return { tone: "info", text: "Lead novo. Manda apresentação simples e abre com pergunta." };
    }
    if (total === 1) return { tone: "info", text: "1ª tentativa sem retorno. Tenta pergunta direta sobre necessidade." };
    if (total === 2) return { tone: "info", text: "Duas tentativas sem resposta. Vale tentar áudio — humaniza." };
    if (total === 3) return { tone: "warn", text: "3 tentativas sem retorno. Tenta áudio curto ou chamada rápida." };
    if (total === 4) return { tone: "warn", text: "4 tentativas. Manda vídeo curto, foto do produto, ou muda o horário." };
    if (total >= 5 && lastH > 24 * 7) {
      return { tone: "danger", text: "Bot já esgotou (5+ tentativas, +7d sem resposta). Considera marcar como perdido." };
    }
    return { tone: "warn", text: `${total} tentativas. Quebra o padrão — fora do roteiro convence mais.` };
  }, [auto, responses, lastAction]);

  const COACH_COLOR: Record<string, string> = {
    info:   "#06B6D4",
    calm:   "#10B981",
    warm:   "#F59E0B",
    warn:   "#F97316",
    danger: "#EF4444",
  };

  if (!leadId) return null;

  if (loading) {
    return (
      <p className="text-[11px] mt-1.5" style={{ color: "var(--crm-text-muted)" }}>
        carregando histórico…
      </p>
    );
  }

  // Caso 0 tentativas
  if (auto.length === 0 && !lastBrokerWhatsappAt) {
    return (
      <div className="mt-2 space-y-1.5">
        <p className="text-[11px] flex items-center gap-1.5" style={{ color: "var(--crm-text-muted)" }}>
          <Sparkles className="w-3 h-3" style={{ color: "#06B6D4" }} />
          Lead novo · sem mensagens automáticas ainda
        </p>
        <p
          className="text-[11px] flex items-center gap-1.5 px-2 py-1 rounded-md"
          style={{
            background: `${COACH_COLOR[coach.tone]}12`,
            border: `1px solid ${COACH_COLOR[coach.tone]}30`,
            color: COACH_COLOR[coach.tone],
          }}
        >
          <Lightbulb className="w-3 h-3" />
          {coach.text}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-1.5">
      {/* Linha resumo */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" style={{ color: "var(--crm-text-muted)" }}>
        <span className="flex items-center gap-1 font-bold" style={{ color: "var(--crm-text)" }}>
          <Bot className="w-3 h-3" />
          {auto.length} tentativa{auto.length !== 1 ? "s" : ""}
        </span>
        {breakdown && (
          <>
            <span>·</span>
            <span>{breakdown}</span>
          </>
        )}
        <span>·</span>
        <span style={{ color: responses > 0 ? "#10B981" : undefined }}>
          {responses} resposta{responses !== 1 ? "s" : ""}
        </span>
        {lastAction && (
          <>
            <span>·</span>
            <span>
              última: {lastAction.label} há {fmtAgo(lastAction.at)}
            </span>
          </>
        )}
        {auto.length > 0 && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="ml-auto inline-flex items-center gap-1 text-[11px] hover:opacity-80 transition"
            style={{ color: "var(--crm-text-muted)" }}
          >
            ver mensagens
            <ChevronDown
              className="w-3 h-3 transition-transform"
              style={{ transform: open ? "rotate(180deg)" : "none" }}
            />
          </button>
        )}
      </div>

      {/* Coach silencioso */}
      <p
        className="text-[11px] flex items-center gap-1.5 px-2 py-1 rounded-md"
        style={{
          background: `${COACH_COLOR[coach.tone]}12`,
          border: `1px solid ${COACH_COLOR[coach.tone]}30`,
          color: COACH_COLOR[coach.tone],
        }}
      >
        <Lightbulb className="w-3 h-3" />
        {coach.text}
      </p>

      {/* Timeline expandida */}
      <AnimatePresence>
        {open && auto.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-1.5 pt-1.5">
              {auto.map((a, i) => {
                const meta = KIND_META[a.kind];
                const Icon = meta.icon;
                const isLast = i === auto.length - 1;
                return (
                  <div
                    key={i}
                    className="flex gap-2 px-2 py-1.5 rounded-md"
                    style={{
                      background: `${meta.color}08`,
                      border: `1px solid ${meta.color}20`,
                    }}
                  >
                    <Icon className="w-3 h-3 mt-0.5 shrink-0" style={{ color: meta.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span className="font-bold" style={{ color: meta.color }}>
                          {meta.label}
                          {a.kind === "followup" && i > 0
                            ? ` #${auto.slice(0, i + 1).filter((x) => x.kind === "followup").length}`
                            : ""}
                        </span>
                        <span style={{ color: "var(--crm-text-muted)" }}>· há {fmtAgo(a.at)}</span>
                        {isLast && <span style={{ color: "var(--crm-text-muted)" }}>(última)</span>}
                      </div>
                      {a.text && (
                        <p
                          className="text-[11px] mt-0.5 line-clamp-2"
                          style={{ color: "var(--crm-text)" }}
                        >
                          "{a.text}"
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
