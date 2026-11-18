/**
 * DiscadorWidget — UI completa do discador/click-to-call do Comandra.
 *
 * Tema dark premium. Peças: botão de discagem rápida, widget flutuante de chamada
 * (status, cronômetro, mute, encerrar), modal pós-chamada (desfecho + observação) e
 * player de gravação.
 *
 * O MOTOR da ligação é PLUGÁVEL: tudo passa pela interface `DialerEngine`. Hoje vem um
 * mock (MockEngine) só pra UI girar. Pra ligar de verdade, troque por um engine real
 * (SIP.js → nosso Asterisk, ou SDK da operadora) — é o ÚNICO ponto que muda.
 *
 * Stack: React + TS + Tailwind + lucide-react + framer-motion (já no repo).
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, Mic, MicOff, Loader2, Play, Pause, CheckCircle2, CalendarPlus, Voicemail, XCircle } from "lucide-react";

// ───────────────────────── Tipos / Motor plugável ─────────────────────────
export type CallStatus = "idle" | "dialing" | "ringing" | "connected" | "ended" | "failed";

export interface CallTarget { id: string; nome: string; telefone: string; sub?: string }

export interface DialerEngine {
  /** Inicia a ligação. Deve chamar onStatus conforme a ligação evolui. */
  call(target: CallTarget, cb: {
    onStatus: (s: CallStatus) => void;
    onRecordingUrl?: (url: string) => void;
  }): Promise<void>;
  hangup(): Promise<void>;
  setMuted(muted: boolean): void;
}

/** Mock só pra UI girar sem telefonia real. Troque por SIP.js/Asterisk. */
export class MockEngine implements DialerEngine {
  private timers: number[] = [];
  async call(_t: CallTarget, cb: { onStatus: (s: CallStatus) => void; onRecordingUrl?: (u: string) => void }) {
    cb.onStatus("dialing");
    this.timers.push(window.setTimeout(() => cb.onStatus("ringing"), 900));
    this.timers.push(window.setTimeout(() => cb.onStatus("connected"), 3200));
    cb.onRecordingUrl?.("");
  }
  async hangup() { cb_clear(this.timers); }
  setMuted(_m: boolean) {}
}
function cb_clear(ts: number[]) { ts.forEach(clearTimeout); ts.length = 0; }

// ───────────────────────── Contexto / Hook ─────────────────────────
interface DialerState {
  status: CallStatus; target: CallTarget | null; seconds: number; muted: boolean; recordingUrl: string | null;
}
interface DialerCtx extends DialerState {
  discar: (t: CallTarget) => void; encerrar: () => void; toggleMute: () => void; fecharResumo: () => void;
  resumoAberto: boolean; registrar: (desfecho: string, obs: string) => void;
}
const Ctx = createContext<DialerCtx | null>(null);
export const useDiscador = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDiscador precisa do <DiscadorProvider>");
  return c;
};

export function DiscadorProvider({
  engine, onResultado, children, semWidget,
}: {
  engine?: DialerEngine;
  /** chamado quando o corretor marca o desfecho no modal pós-chamada */
  onResultado?: (r: { target: CallTarget; desfecho: string; observacao: string; duracao: number }) => void;
  children: React.ReactNode;
  /** true = não renderiza o widget flutuante nem o modal (a tela desenha o próprio palco) */
  semWidget?: boolean;
}) {
  const eng = useMemo(() => engine ?? new MockEngine(), [engine]);
  const [st, setSt] = useState<DialerState>({ status: "idle", target: null, seconds: 0, muted: false, recordingUrl: null });
  const [resumoAberto, setResumoAberto] = useState(false);
  const tickRef = useRef<number | null>(null);
  const lastDuracao = useRef(0);

  const pararTick = () => { if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; } };
  useEffect(() => () => pararTick(), []);

  const discar = useCallback((t: CallTarget) => {
    setSt({ status: "dialing", target: t, seconds: 0, muted: false, recordingUrl: null });
    eng.call(t, {
      onStatus: (s) => setSt((p) => {
        if (s === "connected" && p.status !== "connected") {
          pararTick();
          tickRef.current = window.setInterval(() => setSt((q) => ({ ...q, seconds: q.seconds + 1 })), 1000);
        }
        if ((s === "ended" || s === "failed")) pararTick();
        return { ...p, status: s };
      }),
      onRecordingUrl: (url) => setSt((p) => ({ ...p, recordingUrl: url || null })),
    });
  }, [eng]);

  const encerrar = useCallback(() => {
    pararTick();
    eng.hangup();
    setSt((p) => { lastDuracao.current = p.seconds; return { ...p, status: "ended" }; });
    setResumoAberto(true);
  }, [eng]);

  const toggleMute = useCallback(() => setSt((p) => { eng.setMuted(!p.muted); return { ...p, muted: !p.muted }; }), [eng]);

  const fecharResumo = useCallback(() => { setResumoAberto(false); setSt((p) => ({ ...p, status: "idle", target: null, seconds: 0 })); }, []);

  const registrar = useCallback((desfecho: string, observacao: string) => {
    if (st.target) onResultado?.({ target: st.target, desfecho, observacao, duracao: lastDuracao.current });
    fecharResumo();
  }, [st.target, onResultado, fecharResumo]);

  const value: DialerCtx = { ...st, discar, encerrar, toggleMute, fecharResumo, resumoAberto, registrar };
  return (
    <Ctx.Provider value={value}>
      {children}
      {!semWidget && <WidgetChamada />}
      {!semWidget && <ModalPosChamada />}
    </Ctx.Provider>
  );
}

// ───────────────────────── 1) Botão de discagem rápida ─────────────────────────
export function BotaoDiscar({ target, className = "" }: { target: CallTarget; className?: string }) {
  const { discar, status, target: atual } = useDiscador();
  const emChamada = status !== "idle" && status !== "ended";
  const esseAtivo = emChamada && atual?.id === target.id;
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      disabled={emChamada}
      onClick={() => discar(target)}
      title={emChamada ? "Em ligação…" : `Ligar para ${target.nome}`}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition
        ${esseAtivo ? "bg-emerald-500 text-white"
          : emChamada ? "bg-slate-700/60 text-slate-500 cursor-not-allowed"
          : "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500 hover:text-white"} ${className}`}
    >
      <Phone size={16} />
    </motion.button>
  );
}

// ───────────────────────── 2) Widget flutuante de chamada ─────────────────────────
const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const LABEL: Record<CallStatus, string> = {
  idle: "", dialing: "Discando…", ringing: "Chamando…", connected: "Conectado", ended: "Encerrada", failed: "Falhou",
};

function WidgetChamada() {
  const { status, target, seconds, muted, encerrar, toggleMute } = useDiscador();
  const visivel = status !== "idle" && status !== "ended";
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {visivel && target && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className="fixed bottom-5 right-5 z-[90] w-[320px] overflow-hidden rounded-2xl border border-white/10
                     bg-gradient-to-b from-slate-900 to-slate-950 shadow-2xl shadow-black/60 ring-1 ring-black/40"
        >
          <div className="flex items-center gap-2 px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider">
            <span className={`h-2 w-2 rounded-full ${status === "connected" ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
            <span className={status === "connected" ? "text-emerald-400" : "text-amber-400"}>{LABEL[status]}</span>
            {status === "connected" && <span className="ml-auto font-mono text-sm tabular-nums text-slate-300">{fmt(seconds)}</span>}
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500/15 text-emerald-300 font-bold">
              {target.nome.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold text-white">{target.nome}</div>
              <div className="font-mono text-xs text-slate-400">{target.telefone}</div>
              {target.sub && <div className="truncate text-[11px] text-slate-500">{target.sub}</div>}
            </div>
          </div>
          <div className="flex items-center justify-center gap-3 border-t border-white/5 bg-black/20 px-4 py-3">
            <button onClick={toggleMute} title={muted ? "Ativar microfone" : "Silenciar"}
              className={`grid h-11 w-11 place-items-center rounded-full transition
                ${muted ? "bg-amber-500/20 text-amber-400" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>
              {muted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <motion.button whileTap={{ scale: 0.9 }} onClick={encerrar} title="Encerrar"
              className="grid h-12 w-12 place-items-center rounded-full bg-red-500 text-white shadow-lg shadow-red-500/30 hover:bg-red-600">
              {status === "dialing" || status === "ringing" ? <Loader2 size={20} className="animate-spin" /> : <PhoneOff size={20} />}
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ───────────────────────── 3) Modal pós-chamada + 4) player ─────────────────────────
const DESFECHOS = [
  { id: "interesse", label: "Atendeu com interesse", icon: CheckCircle2, cor: "emerald" },
  { id: "agendou", label: "Agendou visita", icon: CalendarPlus, cor: "blue" },
  { id: "caixa", label: "Caixa postal", icon: Voicemail, cor: "amber" },
  { id: "sem_interesse", label: "Sem interesse", icon: XCircle, cor: "red" },
] as const;

function ModalPosChamada() {
  const { resumoAberto, registrar, fecharResumo, target, recordingUrl } = useDiscador();
  const [desfecho, setDesfecho] = useState<string | null>(null);
  const [obs, setObs] = useState("");
  useEffect(() => { if (resumoAberto) { setDesfecho(null); setObs(""); } }, [resumoAberto]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {resumoAberto && target && (
        <motion.div className="fixed inset-0 z-[95] grid place-items-center bg-black/60 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={fecharResumo}>
          <motion.div onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
            <div className="px-5 pt-5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Resumo da ligação</div>
              <div className="mt-1 text-lg font-bold text-white">{target.nome}</div>
              <div className="font-mono text-xs text-slate-400">{target.telefone}</div>
            </div>

            {recordingUrl ? <GravacaoPlayer url={recordingUrl} /> : (
              <div className="mx-5 mt-4 rounded-xl border border-white/5 bg-black/20 px-4 py-2.5 text-xs text-slate-500">
                🎙️ Gravação ficará disponível aqui após o processamento.
              </div>
            )}

            <div className="px-5 pt-4">
              <div className="mb-2 text-xs font-semibold text-slate-400">Como foi?</div>
              <div className="grid grid-cols-2 gap-2">
                {DESFECHOS.map((d) => {
                  const on = desfecho === d.id; const Icon = d.icon;
                  const cor = {
                    emerald: on ? "border-emerald-500 bg-emerald-500/15 text-emerald-300" : "border-white/10 text-slate-300 hover:border-emerald-500/40",
                    blue: on ? "border-blue-500 bg-blue-500/15 text-blue-300" : "border-white/10 text-slate-300 hover:border-blue-500/40",
                    amber: on ? "border-amber-500 bg-amber-500/15 text-amber-300" : "border-white/10 text-slate-300 hover:border-amber-500/40",
                    red: on ? "border-red-500 bg-red-500/15 text-red-300" : "border-white/10 text-slate-300 hover:border-red-500/40",
                  }[d.cor];
                  return (
                    <button key={d.id} onClick={() => setDesfecho(d.id)}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[13px] font-semibold transition ${cor}`}>
                      <Icon size={16} /> {d.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="px-5 pt-3">
              <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Observação (opcional)…"
                className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none" />
            </div>

            <div className="flex gap-2 p-5 pt-3">
              <button onClick={fecharResumo} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-semibold text-slate-400 hover:bg-white/5">Pular</button>
              <button disabled={!desfecho} onClick={() => registrar(desfecho!, obs)}
                className="flex-[2] rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-white transition enabled:hover:bg-emerald-600 disabled:opacity-40">
                Salvar e próximo
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function GravacaoPlayer({ url }: { url: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [tocando, setTocando] = useState(false);
  return (
    <div className="mx-5 mt-4 flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5">
      <button onClick={() => { const a = ref.current; if (!a) return; tocando ? a.pause() : a.play(); }}
        className="grid h-9 w-9 place-items-center rounded-full bg-emerald-500/20 text-emerald-300">
        {tocando ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <div className="flex-1 text-xs text-slate-400">Gravação da chamada</div>
      <audio ref={ref} src={url} onPlay={() => setTocando(true)} onPause={() => setTocando(false)} onEnded={() => setTocando(false)} className="hidden" />
    </div>
  );
}
