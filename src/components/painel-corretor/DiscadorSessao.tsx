/**
 * DiscadorSessao — aba "Discador" do dashboard do corretor.
 *
 * Power dialer com o PALCO da ligação (protótipo aprovado): o lead na linha com avatar
 * pulsando, ondas de áudio, cronômetro, ficha MCMV, roteiro do que falar, controles grandes
 * e desfecho em 1 toque. Ao lado, a fila do dia e o controle da sessão.
 *
 * Motor real: WebRTCDialerEngine (SIP.js → wss://app.nvoip.com.br:7443). A credencial SIP
 * vem da edge `discador-sip-config` (nunca no front). Desenha o próprio palco → semWidget.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Phone, PhoneOff, Mic, MicOff, SkipForward, Zap, Lightbulb, Loader2, Play, Pause, CalendarCheck, ThumbsUp, Clock, Voicemail, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { registerContactAttempt, updateLeadStatus } from "@/integrations/supabase/leads";
import type { Lead } from "@/types/lead";
import { DiscadorProvider, useDiscador, type CallTarget } from "@/components/discador/DiscadorWidget";
import { WebRTCDialerEngine, type SipConfig } from "@/components/discador/WebRTCDialerEngine";
import "@/styles/discador-sessao.css";

const soDig = (s?: string) => (s || "").replace(/\D/g, "");
const fmtFone = (t?: string) => { const d = soDig(t).replace(/^55/, ""); return d.length === 11 ? `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}` : (t || ""); };
const ini = (n?: string) => (n || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "?";
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const ATIVOS = new Set(["NEW", "IN_PROGRESS", "NEGOTIATING", "VISIT_SCHEDULED", "VISITA_REALIZADA", "DOCS_REQUESTED", "REACTIVATED"]);

const fmtRenda = (v: any) => { const n = Number(soDig(String(v ?? ""))); return n > 0 ? "R$ " + n.toLocaleString("pt-BR") : (v ? String(v) : "—"); };
function roteiro(l?: Lead): string {
  if (!l) return "Confirme com quem fala, descubra a renda e o tipo de trabalho pra achar a faixa do MCMV e já convide pra uma visita.";
  const regiao = l.regiao_interesse || (l as any).regiao;
  const renda = (l as any).renda_declarada;
  const trab = (l as any).tipo_trabalho;
  if (renda && trab) return `Renda ${fmtRenda(renda)} + ${trab}: confira a faixa do MCMV, ofereça um empreendimento${regiao ? " em " + regiao : " na região dela"} e convide pra visita neste fim de semana.`;
  if (regiao) return `Cliente de ${regiao}. Confirme renda e tipo de trabalho pra achar a faixa do MCMV e já marque uma visita.`;
  return "Confirme a renda e o tipo de trabalho pra achar a faixa do MCMV e convide pra uma visita neste fim de semana.";
}

async function getSipConfig(): Promise<SipConfig> {
  const { data, error } = await supabase.functions.invoke("discador-sip-config", { body: {} });
  if (error || !data?.server) throw new Error(data?.error || "sem_config_sip");
  return data as SipConfig;
}

const LABEL_DESFECHO: Record<string, string> = {
  interesse: "Atendeu com interesse", agendou: "Agendou visita", ligar_depois: "Ligar depois", caixa: "Caixa postal", sem_interesse: "Sem interesse",
};

export default function DiscadorSessao({ leads }: { leads: Lead[] }) {
  const engine = useMemo(() => new WebRTCDialerEngine(getSipConfig), []);
  const fila = useMemo(
    () => leads.filter((l) => soDig(l.phone).length >= 10 && ATIVOS.has(String(l.status))),
    [leads],
  );
  async function salvarResultado(r: { target: CallTarget; desfecho: string; observacao: string; duracao: number }) {
    if (r.target.id === "avulso") return; // ligação avulsa não é lead
    try {
      await registerContactAttempt(r.target.id, "Ligação");
      const nota = `📞 Ligação (${r.duracao}s) · ${LABEL_DESFECHO[r.desfecho] || r.desfecho}${r.observacao ? " · " + r.observacao : ""}`;
      await supabase.from("lead_notes").insert({ lead_id: r.target.id, content: nota });
      if (r.desfecho === "agendou") await updateLeadStatus(r.target.id, "VISIT_SCHEDULED");
    } catch (e) { /* não trava a sessão */ }
  }

  return (
    <DiscadorProvider engine={engine} onResultado={salvarResultado} semWidget>
      <Conteudo fila={fila} />
    </DiscadorProvider>
  );
}

function Conteudo({ fila }: { fila: Lead[] }) {
  const { status, target, seconds, muted, discar, encerrar, toggleMute, resumoAberto, registrar, fecharResumo } = useDiscador();
  const [num, setNum] = useState("");
  const [pausada, setPausada] = useState(false);
  const feitos = useRef<Set<string>>(new Set()).current;
  const [, force] = useState(0);
  const atenderamRef = useRef(0);
  const contouRef = useRef<string | null>(null);

  const emChamada = status !== "idle" && status !== "ended";
  const conectado = status === "connected";
  const restam = fila.filter((l) => !feitos.has(l.id));
  const proximo = restam[0];
  const total = fila.length || 1;

  // conta "atenderam" quando a ligação conecta (uma vez por chamada)
  useEffect(() => {
    if (conectado && target && contouRef.current !== target.id) { contouRef.current = target.id; atenderamRef.current += 1; }
    if (status === "idle") contouRef.current = null;
  }, [status, conectado, target]);

  const alvo = (l: Lead): CallTarget => ({
    id: l.id, nome: l.name, telefone: l.phone,
    sub: [l.regiao_interesse, (l as any).campanha_nome].filter(Boolean).join(" · "),
  });
  function discarLead(l: Lead) { feitos.add(l.id); force((n) => n + 1); discar(alvo(l)); }
  function discarProximo() { if (proximo) discarLead(proximo); }
  function pular() { if (emChamada) encerrar(); setTimeout(discarProximo, 300); }
  function marcar(desfecho: string) { registrar(desfecho, ""); fecharResumo(); }

  const leadAtivo = fila.find((l) => l.id === target?.id);
  const noPalco = target && (emChamada || resumoAberto); // tem alguém na tela do palco

  return (
    <div className="text-slate-100">
      {/* ritmo da sessão */}
      <div className="hidden md:flex items-center gap-5 rounded-2xl border border-white/10 bg-white/[.03] px-5 py-2.5 mb-4 w-fit">
        <Metrica n={feitos.size} label="discadas" />
        <div className="w-px h-8 bg-white/10" />
        <Metrica n={atenderamRef.current} label="atenderam" cor="text-emerald-400" />
        <div className="w-px h-8 bg-white/10" />
        <Metrica n={restam.length} label="na fila" cor="text-blue-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">

        {/* ===== PALCO ===== */}
        <section className="rounded-3xl border border-white/10 bg-gradient-to-b from-[#0c1322] to-[#070b14] p-6 md:p-8 relative overflow-hidden">
          <div className="absolute -right-20 -top-20 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-center justify-between mb-6 relative">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1.5">
              <Zap className="w-3.5 h-3.5" /> Discador · fala pelo navegador
            </div>
            <div className="text-xs text-slate-500">contato <span className="text-slate-300 font-semibold">{feitos.size}</span> de {fila.length}</div>
          </div>

          {noPalco ? (
            <>
              {/* avatar + estado da chamada */}
              <div className="flex flex-col items-center text-center relative">
                <div className={"relative" + (conectado ? " dsc-ring" : "")}>
                  <div className="h-24 w-24 rounded-full bg-emerald-500/15 border border-emerald-500/30 grid place-items-center text-2xl font-bold text-emerald-300">{ini(target!.nome)}</div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-sm font-semibold">
                  {conectado ? (
                    <span className="flex items-center gap-2 text-emerald-400">
                      <span className="dsc-wave inline-flex items-end h-5"><span /><span style={{ animationDelay: ".1s" }} /><span style={{ animationDelay: ".2s" }} /><span style={{ animationDelay: ".15s" }} /></span>
                      Conectado · <span className="tabular-nums">{mmss(seconds)}</span>
                    </span>
                  ) : status === "ended" ? (
                    <span className="text-slate-400">Chamada encerrada{seconds ? " · " + mmss(seconds) : ""} — marque como foi 👇</span>
                  ) : (
                    <span className="flex items-center gap-2 text-amber-400"><Loader2 className="w-4 h-4 animate-spin" /> Chamando…</span>
                  )}
                </div>
                <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{target!.nome}</h1>
                <div className="text-slate-400 tabular-nums">{fmtFone(target!.telefone)}</div>
              </div>

              {/* ficha MCMV */}
              <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <Campo rot="Região" val={leadAtivo?.regiao_interesse || (leadAtivo as any)?.regiao} />
                <Campo rot="Renda" val={fmtRenda((leadAtivo as any)?.renda_declarada)} />
                <Campo rot="Trabalho" val={(leadAtivo as any)?.tipo_trabalho} />
                <Campo rot="Veio de" val={(leadAtivo as any)?.campanha_nome || "MCMV"} />
              </div>

              {/* roteiro */}
              <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/[.06] px-4 py-3">
                <div className="flex items-center gap-2 text-amber-300 text-xs font-bold uppercase tracking-wider"><Lightbulb className="w-3.5 h-3.5" /> O que falar agora</div>
                <p className="text-sm text-slate-300 mt-1.5 leading-relaxed">{roteiro(leadAtivo)}</p>
              </div>

              {/* controles */}
              <div className="mt-6 flex items-center justify-center gap-4">
                <button onClick={toggleMute} title={muted ? "Ativar microfone" : "Silenciar"} disabled={!conectado}
                  className={`grid h-12 w-12 place-items-center rounded-full transition disabled:opacity-40 ${muted ? "bg-amber-500/20 text-amber-400" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>
                  {muted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <button onClick={encerrar} disabled={status === "ended"} title="Desligar"
                  className="grid h-16 w-16 place-items-center rounded-full bg-red-500 text-white shadow-xl shadow-red-500/30 hover:bg-red-600 transition active:scale-90 disabled:opacity-40">
                  {status === "dialing" || status === "ringing" ? <Loader2 className="w-6 h-6 animate-spin" /> : <PhoneOff className="w-6 h-6" />}
                </button>
                <button onClick={pular} title="Pular pro próximo" disabled={!proximo && !emChamada}
                  className="grid h-12 w-12 place-items-center rounded-full bg-white/5 text-slate-300 hover:bg-white/10 transition disabled:opacity-40">
                  <SkipForward className="w-5 h-5" />
                </button>
              </div>

              {/* desfecho em 1 toque */}
              <div className="mt-6 border-t border-white/5 pt-5">
                <div className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                  {target!.id === "avulso" ? "Ligação avulsa — não vira registro de cliente" : "Ao desligar, marque em 1 toque →"}
                </div>
                {target!.id !== "avulso" && (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Desf onClick={() => marcar("agendou")} cor="emerald" ativo icon={<CalendarCheck className="w-4 h-4" />}>Agendou visita</Desf>
                    <Desf onClick={() => marcar("interesse")} cor="emerald" icon={<ThumbsUp className="w-4 h-4" />}>Interessado</Desf>
                    <Desf onClick={() => marcar("ligar_depois")} cor="amber" icon={<Clock className="w-4 h-4" />}>Ligar depois</Desf>
                    <Desf onClick={() => marcar("caixa")} cor="slate" icon={<Voicemail className="w-4 h-4" />}>Caixa postal</Desf>
                    <Desf onClick={() => marcar("sem_interesse")} cor="red" icon={<XCircle className="w-4 h-4" />}>Sem interesse</Desf>
                  </div>
                )}
                {target!.id === "avulso" && resumoAberto && (
                  <div className="flex justify-center"><button onClick={fecharResumo} className="px-5 py-2 rounded-xl bg-white/5 text-slate-200 text-sm font-semibold hover:bg-white/10">Fechar</button></div>
                )}
              </div>
            </>
          ) : (
            /* ===== PALCO OCIOSO: pronto pra discar ===== */
            <div className="flex flex-col items-center text-center py-4">
              {proximo ? (
                <>
                  <div className="h-24 w-24 rounded-full bg-white/5 border border-white/10 grid place-items-center text-2xl font-bold text-slate-300">{ini(proximo.name)}</div>
                  <div className="mt-4 text-xs uppercase tracking-wider text-slate-500">Próximo da fila</div>
                  <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{proximo.name}</h1>
                  <div className="text-slate-400 tabular-nums">{fmtFone(proximo.phone)}{proximo.regiao_interesse ? " · " + proximo.regiao_interesse : ""}</div>
                  <button onClick={discarProximo} className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-emerald-500 text-white font-bold text-lg px-8 py-3.5 shadow-xl shadow-emerald-500/25 hover:bg-emerald-400 active:scale-95 transition">
                    <Phone className="w-5 h-5" /> Discar {proximo.name.split(/\s+/)[0]}
                  </button>
                  <p className="mt-3 text-xs text-slate-500">Toca em discar e fala — o navegador liga. Permita o microfone na 1ª vez.</p>
                </>
              ) : (
                <>
                  <div className="h-20 w-20 rounded-full bg-white/5 border border-white/10 grid place-items-center text-3xl">📞</div>
                  <h1 className="mt-4 text-xl font-bold">Fila vazia por enquanto</h1>
                  <p className="mt-1 text-sm text-slate-400 max-w-xs">Puxe clientes no <b className="text-slate-200">Pescar</b> ou ligue direto num número abaixo.</p>
                </>
              )}

              {/* ligar um número avulso (teste / ligação direta) */}
              <div className="mt-6 w-full max-w-sm flex gap-2">
                <input value={num} onChange={(e) => setNum(e.target.value)} placeholder="Ligar um número (com DDD)" inputMode="tel"
                  className="flex-1 min-w-0 rounded-xl border border-white/10 bg-[#070b14] text-slate-100 placeholder:text-slate-600 px-3.5 py-2.5 text-sm tabular-nums outline-none focus:border-emerald-500/50" />
                <button disabled={soDig(num).length < 10} onClick={() => discar({ id: "avulso", nome: "Ligação avulsa", telefone: num })}
                  className="rounded-xl bg-emerald-500 text-white font-bold text-sm px-5 disabled:opacity-40 hover:bg-emerald-400 transition">Ligar</button>
              </div>
            </div>
          )}
        </section>

        {/* ===== FILA + CONTROLE DA SESSÃO ===== */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[.03] p-4">
            <button onClick={() => { if (pausada) { setPausada(false); discarProximo(); } else setPausada(true); }}
              disabled={emChamada || !proximo}
              className="w-full rounded-xl bg-amber-500 text-black font-bold py-3 flex items-center justify-center gap-2 hover:bg-amber-400 transition disabled:opacity-40">
              {emChamada ? <><Phone className="w-5 h-5" /> Em ligação…</> : <><Play className="w-5 h-5" /> Discar o próximo</>}
            </button>
            <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500"><span>Progresso</span><span className="tabular-nums text-slate-300">{feitos.size} / {fila.length}</span></div>
            <div className="mt-1.5 h-2 rounded-full bg-white/5 overflow-hidden"><div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.round((feitos.size / total) * 100)}%` }} /></div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[.03] p-4">
            <div className="flex items-center justify-between mb-3"><span className="text-sm font-bold">Fila de hoje</span><span className="text-xs text-slate-500">{fila.length} clientes</span></div>
            {!fila.length ? (
              <p className="text-sm text-slate-500 py-4 text-center">Sem clientes com telefone pra ligar agora.</p>
            ) : (
              <div className="space-y-1.5 max-h-[420px] overflow-auto pr-1">
                {fila.map((l) => {
                  const naLinha = emChamada && target?.id === l.id;
                  const feito = feitos.has(l.id);
                  return (
                    <div key={l.id} className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 border ${naLinha ? "border-emerald-500/40 bg-emerald-500/5 ring-1 ring-emerald-500/20" : feito ? "border-white/5 opacity-55" : "border-white/5"}`}>
                      <span className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-300 grid place-items-center text-[11px] font-bold">{ini(l.name)}</span>
                      <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold truncate">{l.name}</div><div className="tabular-nums text-[11px] text-slate-500">{fmtFone(l.phone)}</div></div>
                      {naLinha ? <span className="text-[10px] font-bold text-amber-400 animate-pulse">na linha</span>
                        : feito ? <span className="text-[10px] font-bold text-emerald-400">feito ✓</span>
                        : <button onClick={() => discarLead(l)} disabled={emChamada} title="Ligar" className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40 transition"><Phone className="w-4 h-4" /></button>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[.03] p-4">
            <div className="text-xs font-semibold text-slate-400 mb-2">Fila vem de</div>
            <div className="flex flex-wrap gap-1.5">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500 text-white text-xs font-semibold">Meus clientes</span>
              <span className="px-2.5 py-1 rounded-lg bg-white/5 text-slate-400 text-xs font-semibold">Pescar da região (em breve)</span>
              <span className="px-2.5 py-1 rounded-lg bg-white/5 text-slate-400 text-xs font-semibold">CSV (em breve)</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Metrica({ n, label, cor = "text-white" }: { n: number; label: string; cor?: string }) {
  return <div className="text-center"><div className={`text-lg font-bold tabular-nums ${cor}`}>{n}</div><div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div></div>;
}
function Campo({ rot, val }: { rot: string; val?: string }) {
  return <div className="rounded-xl bg-white/[.03] border border-white/5 px-3 py-2.5"><div className="text-[10px] uppercase tracking-wider text-slate-500">{rot}</div><div className="text-sm font-semibold mt-0.5 truncate">{val || "—"}</div></div>;
}
function Desf({ children, onClick, icon, cor, ativo }: { children: ReactNode; onClick: () => void; icon: ReactNode; cor: "emerald" | "amber" | "slate" | "red"; ativo?: boolean }) {
  const hover = { emerald: "hover:border-emerald-500/40", amber: "hover:border-amber-500/40", slate: "hover:border-slate-400/40", red: "hover:border-red-500/40" }[cor];
  const base = ativo ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : `border-white/10 text-slate-300 ${hover}`;
  return <button onClick={onClick} className={`px-3.5 py-2 rounded-xl border text-[13px] font-semibold flex items-center gap-1.5 transition ${base}`}>{icon} {children}</button>;
}
