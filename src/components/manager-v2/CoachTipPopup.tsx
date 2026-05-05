// CoachTipPopup — bolha que aparece 2-3s após load no canto inferior direito.
// Conteúdo contextual: alerta se meta crítica, motivação se no ritmo.
// Click → abre CoachChat com a pergunta certa pré-preenchida.

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, ArrowRight } from "lucide-react";

interface Tip {
  message: string;
  question: string; // pergunta pré-formatada que dispara no Coach
  color: string;
  emoji: string;
}

function pickTip(args: {
  managerName: string;
  monthlySales: number;
  monthlyGoal: number | null;
  daysLeft: number;
  daysTotal: number;
  ligaRank?: number;
}): Tip | null {
  const { managerName, monthlySales, monthlyGoal, daysLeft, daysTotal, ligaRank } = args;
  const elapsed = daysTotal - daysLeft;
  const expectedPct = (elapsed / daysTotal) * 100;
  const realPct = monthlyGoal && monthlyGoal > 0 ? (monthlySales / monthlyGoal) * 100 : 0;
  const lag = realPct - expectedPct;

  if (!monthlyGoal) {
    return {
      message: `${managerName}, sua equipe não tem meta cadastrada. Sem meta, não dá pra medir progresso.`,
      question: "Como recuperar a meta deste mês?",
      color: "#F59E0B",
      emoji: "🎯",
    };
  }

  if (lag < -20) {
    return {
      message: `${managerName}, sua meta está crítica. Só ${monthlySales}/${monthlyGoal} vendas em ${elapsed} dias. Veja como virar o jogo.`,
      question: "Como recuperar a meta deste mês?",
      color: "#EF4444",
      emoji: "🔥",
    };
  }

  if (lag < -5) {
    return {
      message: `${managerName}, você está abaixo do ritmo da meta. Veja onde estão seus pontos fracos.`,
      question: "Onde estão meus pontos fracos?",
      color: "#F59E0B",
      emoji: "⚠️",
    };
  }

  if (ligaRank && ligaRank > 3) {
    return {
      message: `${managerName}, você está em #${ligaRank} na liga. Veja o que os campeões estão fazendo de diferente.`,
      question: "O que os gerentes campeões estão fazendo?",
      color: "#A78BFA",
      emoji: "🏆",
    };
  }

  // Bom estado — tip motivacional ou de coaching da equipe
  return {
    message: `${managerName}, time bem encaminhado. Hora de olhar quem do seu time pode acelerar mais.`,
    question: "O que fazer com minha equipe agora?",
    color: "#10B981",
    emoji: "💪",
  };
}

interface Props {
  managerName: string;
  monthlySales: number;
  monthlyGoal: number | null;
  daysLeftMonth: number;
  daysInMonth: number;
  ligaRank?: number;
  delayMs?: number;
  onAsk: (question: string) => void;
}

export default function CoachTipPopup({
  managerName, monthlySales, monthlyGoal, daysLeftMonth, daysInMonth, ligaRank,
  delayMs = 2500, onAsk,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const tip = pickTip({
    managerName, monthlySales, monthlyGoal,
    daysLeft: daysLeftMonth, daysTotal: daysInMonth, ligaRank,
  });

  useEffect(() => {
    if (dismissed || !tip) return;
    const t = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs, dismissed, tip]);

  if (!tip) return null;

  return (
    <AnimatePresence>
      {visible && !dismissed && (
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.92 }}
          transition={{ type: "spring", damping: 22, stiffness: 240 }}
          className="fixed bottom-5 right-5 z-40 max-w-[360px]"
          style={{ fontFamily: "Inter, system-ui, sans-serif" }}
        >
          <div
            className="rounded-2xl border p-4 shadow-2xl backdrop-blur-md"
            style={{
              background: `linear-gradient(135deg, ${tip.color}25, rgba(24,24,27,0.95))`,
              borderColor: `${tip.color}80`,
              boxShadow: `0 16px 48px rgba(0,0,0,0.6), 0 0 24px ${tip.color}40`,
            }}
          >
            <button
              onClick={() => setDismissed(true)}
              className="absolute top-2 right-2 w-6 h-6 rounded-lg hover:bg-white/10 flex items-center justify-center text-slate-400 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            <div className="flex items-start gap-3 pr-6">
              <motion.div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl"
                style={{ background: `${tip.color}25`, border: `1px solid ${tip.color}50` }}
                animate={{ rotate: [0, -6, 6, -3, 0] }}
                transition={{ duration: 1.2, delay: 0.3 }}
              >
                {tip.emoji}
              </motion.div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-3 h-3" style={{ color: tip.color }} />
                  <span
                    className="text-[11px] font-black uppercase tracking-widest"
                    style={{ color: tip.color }}
                  >
                    Coach IA
                  </span>
                </div>
                <p className="text-sm text-slate-100 leading-snug">{tip.message}</p>
                <motion.button
                  whileHover={{ x: 2 }}
                  onClick={() => {
                    onAsk(tip.question);
                    setDismissed(true);
                  }}
                  className="mt-2.5 flex items-center gap-1.5 text-xs font-bold rounded-lg px-2.5 py-1.5 transition"
                  style={{
                    background: `${tip.color}20`,
                    border: `1px solid ${tip.color}40`,
                    color: tip.color,
                  }}
                >
                  Ver como conquistar resultados
                  <ArrowRight className="w-3 h-3" />
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
