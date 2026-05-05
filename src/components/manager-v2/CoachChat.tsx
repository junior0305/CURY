// CoachChat — drawer flutuante com chat do "Coach IA do Manager".
// Limite: 5 perguntas/dia · 200 tokens out (preserva custo).
// Por enquanto: respostas simuladas + estrutura pronta. IA real na Fase 2.

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Send, Sparkles, Loader2, MessageCircle, History,
} from "lucide-react";

const QUICK_QUESTIONS = [
  "Como recuperar a meta deste mês?",
  "O que os gerentes campeões estão fazendo?",
  "O que fazer com minha equipe agora?",
  "Onde estão meus pontos fracos?",
  "Devo contratar mais corretores?",
  "Como abordar um corretor desmotivado?",
];

const DAILY_LIMIT = 5;
const STORAGE_KEY = "v2-coach-questions-today";
const HISTORY_KEY = "v2-coach-last-session";

interface Msg {
  role: "user" | "coach";
  text: string;
  ts: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  managerName: string;
  initialQuestion?: string | null;
}

function getTodayCount(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const data = JSON.parse(raw);
    const today = new Date().toDateString();
    return data.date === today ? data.count : 0;
  } catch {
    return 0;
  }
}

function incrementCount() {
  const today = new Date().toDateString();
  const cur = getTodayCount();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: today, count: cur + 1 }));
  return cur + 1;
}

function saveHistory(messages: Msg[]) {
  // Salva só se tiver troca real (>1 msg = greeting + alguma interação)
  if (messages.length <= 1) return;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ ts: Date.now(), messages }));
  } catch { /* ignore */ }
}

function loadHistory(): { ts: number; messages: Msg[] } | null {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Resposta sintética baseada na palavra-chave da pergunta (placeholder até Fase 2 c/ LLM real)
function fakeCoachReply(question: string, name: string): string {
  const q = question.toLowerCase();
  if (q.includes("meta") || q.includes("recuperar")) {
    return `${name}, antes de mais nada: olhe o gargalo do funil. Se a perda é em VISITA → DOCS, o problema é fechamento. Se é em IN_PROGRESS → NEGOTIATING, é qualificação. Foque coaching no gargalo, não numa "campanha mágica". Faltam pouco menos de 2 semanas — priorize agendar visitas dos quentes que já tem, em vez de prospectar mais.`;
  }
  if (q.includes("campeões") || q.includes("campeoes") || q.includes("líderes") || q.includes("lideres")) {
    return `Os campeões da rede fazem 3 coisas em comum: 1) atendem lead em <5min (TPR baixíssimo), 2) usam templates de welcome que não soam genéricos — testaram e descartaram os fracos no A/B Lab, 3) cobram corretores 2-3x ao dia via app (não esperam 1:1 da semana). O Datti, por exemplo, criou a campanha "ZS_BARATO" com 28% de resposta. Você pode clonar pelo painel "Liga".`;
  }
  if (q.includes("equipe") || q.includes("o que fazer com")) {
    return `Olhe seu painel agora: 1) quem está atrasado em quentes? Cobra agora. 2) quem está saturado? Redistribui. 3) quem está parado +24h sem produzir? Convoca pra 1:1 hoje, não amanhã. Não tenta resolver tudo de uma vez — escolhe 1 corretor e age. Repete amanhã com outro. Em 2 semanas você girou o time todo.`;
  }
  if (q.includes("pontos fracos") || q.includes("ponto fraco") || q.includes("melhorar")) {
    return `${name}, pra te dar diagnóstico real preciso ver seus dados (Fase 2). Mas em geral, gerentes inexperientes têm 3 fraquezas: 1) cobram só vendas, ignoram pastas/visitas (gargalos), 2) não fazem 1:1 estruturada — só "vai lá", 3) reagem a campanhas em vez de planejar capacidade. Olhe seu Health Score e veja onde caiu mais — esse é seu ponto fraco.`;
  }
  if (q.includes("conversão") || q.includes("conversao")) {
    return `Conversão cai por 3 motivos: 1) tempo de resposta lento (TPR), 2) abordagem genérica (welcome ruim), 3) lead errado (origem fraca). Olhe seu painel: TPR médio do time? Se >10min, o problema é velocidade. Se rápido mas não converte, é qualidade da conversa.`;
  }
  if (q.includes("contratar") || q.includes("contratação")) {
    return `Veja seu bloco "Saúde da Operação". Se a vazão diária está acima da capacidade saudável (~10 leads/cabeça), você está perdendo leads por saturação. Cada lead frio = R$200-400 de CPL desperdiçado. Solicitar contratação é decisão financeira, não emocional. Prepare 1-2 vagas se o gap persistir por 2 semanas.`;
  }
  if (q.includes("desmotivado") || q.includes("desmotivação") || q.includes("baixa")) {
    return `Não comece falando de números — comece pelo emocional. Pergunte: "Como você está? O que tá pesado?". Depois mostre 1 vitória recente (mesmo pequena) e 1 padrão que ele pode mudar. Termine com pacto de UMA mudança específica pra próxima semana. Cobre na próxima 1:1.`;
  }
  return `${name}, boa pergunta. Pra te dar uma resposta mais precisa preciso ver os dados da sua equipe — isso vem na Fase 2 com IA real conectada ao banco. Por enquanto, dica geral: foque no gargalo do seu funil + cobrança rápida dos top corretores em quentes esperando.`;
}

export default function CoachChat({ open, onClose, managerName, initialQuestion }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(getTodayCount());
  const [autoSent, setAutoSent] = useState(false);
  const [showingHistory, setShowingHistory] = useState(false);
  const [hasHistory, setHasHistory] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Quando abre: SEMPRE reseta com greeting; salva sessão anterior em history.
  useEffect(() => {
    if (open) {
      // Snapshot da sessão anterior pra history (se houver)
      saveHistory(messages);
      // Reset a cada abertura — manager começa fresco
      setMessages([
        {
          role: "coach",
          text: `Oi ${managerName}! Sou seu coach. Posso te ajudar a entender resultados, planejar ações e tomar decisões. Você tem ${DAILY_LIMIT - count} perguntas hoje.`,
          ts: Date.now(),
        },
      ]);
      setShowingHistory(false);
      setAutoSent(false);
      setHasHistory(loadHistory() !== null);
    } else {
      // Quando fecha, persiste pra próxima vez
      saveHistory(messages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-envia initialQuestion quando drawer abre com pergunta pré-formatada (do pop-up)
  useEffect(() => {
    if (open && initialQuestion && !autoSent && messages.length > 0 && !busy) {
      setAutoSent(true);
      setTimeout(() => handleSend(initialQuestion), 400);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialQuestion, autoSent, messages.length]);

  function viewHistory() {
    const h = loadHistory();
    if (!h) return;
    setMessages([
      {
        role: "coach",
        text: `📜 Sessão anterior (${new Date(h.ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}):`,
        ts: Date.now(),
      },
      ...h.messages.filter((m) => m.role === "user" || messages.length === 0),
      {
        role: "coach",
        text: "—— fim do histórico —— Para começar uma nova conversa, click em 'Nova conversa'.",
        ts: Date.now(),
      },
    ]);
    setShowingHistory(true);
  }

  function newChat() {
    setMessages([
      {
        role: "coach",
        text: `Oi ${managerName}! Em que posso te ajudar agora?`,
        ts: Date.now(),
      },
    ]);
    setShowingHistory(false);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(text: string) {
    if (!text.trim() || busy) return;
    if (count >= DAILY_LIMIT) return;
    setBusy(true);
    const newCount = incrementCount();
    setCount(newCount);
    setMessages((prev) => [...prev, { role: "user", text: text.trim(), ts: Date.now() }]);
    setInput("");
    // Simula latência de IA
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 600));
    const reply = fakeCoachReply(text, managerName);
    setMessages((prev) => [...prev, { role: "coach", text: reply, ts: Date.now() }]);
    setBusy(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          />
          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 250 }}
            className="fixed right-0 top-0 bottom-0 w-full sm:w-[420px] bg-slate-950 border-l border-slate-800 z-50 flex flex-col shadow-2xl"
            style={{ fontFamily: "Inter, system-ui, sans-serif" }}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/40 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Coach IA</h3>
                  <p className="text-[11px] text-slate-500">
                    {DAILY_LIMIT - count}/{DAILY_LIMIT} perguntas hoje
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 flex items-center justify-center text-slate-400 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Barra de histórico — só aparece se tem sessão anterior */}
            {hasHistory && (
              <div className="px-3 py-2 border-b border-slate-800 bg-slate-900/40 flex items-center gap-2">
                {!showingHistory ? (
                  <button
                    onClick={viewHistory}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 hover:text-slate-200 px-2 py-1 rounded transition"
                  >
                    <History className="w-3 h-3" />
                    Ver conversa anterior
                  </button>
                ) : (
                  <button
                    onClick={newChat}
                    className="flex items-center gap-1.5 text-[11px] font-bold text-violet-300 hover:text-violet-200 px-2 py-1 rounded bg-violet-500/10 border border-violet-500/30 transition"
                  >
                    <Sparkles className="w-3 h-3" />
                    Nova conversa
                  </button>
                )}
              </div>
            )}

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      m.role === "user"
                        ? "bg-violet-500/20 border border-violet-500/40 text-violet-100"
                        : "bg-slate-800/80 border border-slate-700/50 text-slate-200"
                    }`}
                  >
                    {m.text}
                  </div>
                </motion.div>
              ))}
              {busy && (
                <div className="flex justify-start">
                  <div className="bg-slate-800/80 border border-slate-700/50 rounded-2xl px-3.5 py-2.5 flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
                    <span className="text-xs text-slate-400">pensando…</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Atalhos rápidos */}
            {count < DAILY_LIMIT && messages.length <= 1 && (
              <div className="px-4 pb-2 grid grid-cols-2 gap-1.5">
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    className="text-[11px] text-left px-2.5 py-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 text-slate-300 transition"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="border-t border-slate-800 p-3">
              {count >= DAILY_LIMIT ? (
                <div className="text-center text-xs text-slate-500 py-2">
                  ⏳ Limite diário atingido. Volta amanhã!
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSend(input);
                    }}
                    placeholder="Pergunte ao coach…"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition"
                    disabled={busy}
                  />
                  <button
                    onClick={() => handleSend(input)}
                    disabled={busy || !input.trim()}
                    className="px-3 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/40 text-violet-300 disabled:opacity-30 transition"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              )}
              <p className="text-[11px] text-slate-600 mt-1.5 text-center">
                respostas placeholder · IA real na Fase 2
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Botão pra abrir o drawer (usado no header)
export function CoachChatButton({ onClick, count }: { onClick: () => void; count: number }) {
  const remaining = DAILY_LIMIT - count;
  return (
    <motion.button
      whileHover={{ y: -1, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-violet-500/15 border border-violet-500/40 hover:bg-violet-500/20 transition"
    >
      <MessageCircle className="w-3.5 h-3.5 text-violet-400" />
      <span className="text-xs font-bold text-violet-200">Fale com o Coach</span>
      <span className="text-[11px] font-black uppercase tracking-widest text-violet-400 bg-violet-500/20 px-1.5 py-0.5 rounded">
        {remaining}/{DAILY_LIMIT}
      </span>
    </motion.button>
  );
}

export { getTodayCount as getCoachTodayCount };
