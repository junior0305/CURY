// AnnouncementCard — comunicado intercalado na fila de leads.
// Aparece como o "primeiro card" do broker até ele dar Entendi/Vou/Não posso.

import { useState } from "react";
import { Megaphone, CheckCircle2, X, AlertTriangle, Calendar, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Announcement {
  id: string;
  title: string;
  body?: string | null;
  category: "operacional" | "evento" | "treinamento" | "critico";
  emoji?: string | null;
  requires_rsvp: boolean;
  starts_at?: string | null;
  expires_at?: string | null;
  created_at: string;
}

const CATEGORY_STYLE: Record<string, { bg: string; border: string; text: string; label: string; icon: any }> = {
  operacional:  { bg: "linear-gradient(135deg,rgba(59,130,246,0.20),rgba(59,130,246,0.06))", border: "rgba(59,130,246,0.50)",  text: "#93c5fd", label: "📌 OPERACIONAL", icon: Megaphone },
  evento:       { bg: "linear-gradient(135deg,rgba(168,85,247,0.20),rgba(168,85,247,0.06))", border: "rgba(168,85,247,0.50)",  text: "#d8b4fe", label: "🎉 EVENTO",      icon: Calendar },
  treinamento:  { bg: "linear-gradient(135deg,rgba(16,185,129,0.20),rgba(16,185,129,0.06))", border: "rgba(16,185,129,0.50)",  text: "#6ee7b7", label: "🎓 TREINAMENTO", icon: Megaphone },
  critico:      { bg: "linear-gradient(135deg,rgba(239,68,68,0.30),rgba(239,68,68,0.10))",   border: "rgba(239,68,68,0.70)",   text: "#fca5a5", label: "⚠️ CRÍTICO",     icon: AlertTriangle },
};

function fmtRelative(iso?: string | null): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  const h = ms / 3600000;
  if (h < 0) return "agora";
  if (h < 1) return `em ${Math.max(1, Math.round(h * 60))}min`;
  if (h < 24) return `em ${Math.round(h)}h`;
  return `em ${Math.round(h / 24)}d`;
}

interface Props {
  ann: Announcement;
  onDone?: () => void;
}

export default function AnnouncementCard({ ann, onDone }: Props) {
  const [busy, setBusy] = useState(false);
  const style = CATEGORY_STYLE[ann.category] || CATEGORY_STYLE.operacional;
  const Icon = style.icon;

  async function ack(rsvp: "yes" | "no" | null = null) {
    setBusy(true);
    const { error } = await supabase.rpc("mark_announcement_read", {
      p_announcement_id: ann.id,
      p_rsvp: rsvp,
    });
    setBusy(false);
    if (error) {
      toast.error("Erro ao registrar: " + error.message);
      return;
    }
    if (rsvp === "yes") toast.success("✅ Confirmado");
    else if (rsvp === "no") toast.info("Anotado, não pode comparecer");
    onDone?.();
  }

  const isCritical = ann.category === "critico";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border-2 p-4 sm:p-6 space-y-3 relative overflow-hidden"
      style={{
        background: style.bg,
        borderColor: style.border,
        boxShadow: isCritical ? `0 0 32px ${style.border}` : `0 0 18px ${style.border}40`,
        animation: isCritical ? "pulse-critical 2s ease-in-out infinite" : undefined,
      }}
    >
      <style>{`
        @keyframes pulse-critical {
          0%, 100% { box-shadow: 0 0 32px rgba(239,68,68,0.50); }
          50%      { box-shadow: 0 0 48px rgba(239,68,68,0.85); }
        }
      `}</style>

      <div className="flex items-start gap-3">
        <div className="text-4xl shrink-0">{ann.emoji || <Icon className="w-8 h-8" style={{ color: style.text }} />}</div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest font-black mb-1" style={{ color: style.text }}>
            {style.label}
          </div>
          <h2 className="text-xl sm:text-2xl font-black leading-tight" style={{ color: "var(--crm-text)" }}>
            {ann.title}
          </h2>
        </div>
      </div>

      {ann.body && (
        <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--crm-text-muted)" }}>
          {ann.body}
        </p>
      )}

      {ann.starts_at && (
        <div className="flex items-center gap-2 text-sm font-bold" style={{ color: style.text }}>
          <Clock className="w-4 h-4" />
          {new Date(ann.starts_at).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          <span className="text-xs opacity-70">· {fmtRelative(ann.starts_at)}</span>
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: style.border }}>
        <div className="text-[10px]" style={{ color: "var(--crm-text-muted)" }}>
          Aviso de {new Date(ann.created_at).toLocaleDateString("pt-BR")}
        </div>

        {ann.requires_rsvp ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => ack("no")}
              disabled={busy}
              className="px-3 py-2 rounded-lg text-sm font-bold transition disabled:opacity-50 flex items-center gap-1.5"
              style={{ background: "rgba(100,100,100,0.20)", color: "var(--crm-text-muted)", border: "1px solid rgba(100,100,100,0.30)" }}
            >
              <X className="w-3.5 h-3.5" /> Não posso
            </button>
            <button
              onClick={() => ack("yes")}
              disabled={busy}
              className="px-4 py-2 rounded-lg text-sm font-black uppercase tracking-wider transition disabled:opacity-50 flex items-center gap-1.5 text-white"
              style={{ background: style.text, boxShadow: `0 0 12px ${style.border}` }}
            >
              <CheckCircle2 className="w-4 h-4" /> Vou!
            </button>
          </div>
        ) : (
          <button
            onClick={() => ack(null)}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-black uppercase tracking-wider transition disabled:opacity-50 flex items-center gap-1.5 text-white"
            style={{ background: style.text, boxShadow: `0 0 12px ${style.border}` }}
          >
            <CheckCircle2 className="w-4 h-4" /> Entendi
          </button>
        )}
      </div>
    </motion.div>
  );
}
