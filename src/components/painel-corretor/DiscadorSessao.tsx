/**
 * DiscadorSessao — aba "Discador" do dashboard do corretor (power dialer nativo).
 *
 * Fluxo "às cegas": o corretor aperta Iniciar UMA vez; o Comandra liga um cliente atrás do
 * outro, pula quem não atende e só revela quem é quando a pessoa ATENDE. Nenhuma fila de nomes
 * à vista. Ao desligar, o corretor marca o desfecho em 1 toque e o sistema liga o próximo.
 *
 * Gate de liberação: sem ramal configurado, mostra "peça ao gerente" (igual ao Disparar).
 * Tema (claro/escuro) segue o painel. Motor real: WebRTCDialerEngine (SIP.js → :7443).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone, PhoneOutgoing, PhoneOff, Mic, MicOff, Grid3x3, Square, Pause, Users, Lightbulb, Pencil, BarChart3, Info, Check, CalendarCheck, ThumbsUp, Clock, Voicemail, X, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { registerContactAttempt, updateLeadStatus } from "@/integrations/supabase/leads";
import type { Lead } from "@/types/lead";
import type { CallStatus, CallTarget } from "@/components/discador/DiscadorWidget";
import { WebRTCDialerEngine, type SipConfig } from "@/components/discador/WebRTCDialerEngine";
import "@/styles/discador-sessao.css";

const soDig = (s?: string) => (s || "").replace(/\D/g, "");
const fmtFone = (t?: string) => { const d = soDig(t).replace(/^55/, ""); return d.length === 11 ? `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}` : (t || ""); };
const ini = (n?: string) => (n || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "?";
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const fmtRenda = (v: any) => { const n = Number(soDig(String(v ?? ""))); return n > 0 ? "R$ " + n.toLocaleString("pt-BR") : (v ? String(v) : "—"); };
const ATIVOS = new Set(["NEW", "IN_PROGRESS", "NEGOTIATING", "VISIT_SCHEDULED", "VISITA_REALIZADA", "DOCS_REQUESTED", "REACTIVATED"]);
const LABEL: Record<string, string> = { interesse: "Atendeu com interesse", agendou: "Agendou visita", ligar_depois: "Ligar depois", caixa: "Caixa postal", sem_interesse: "Sem interesse" };
const SUB: Record<string, string> = { idle: "Aperte para começar", discando: "Ligando…", conectado: "Na ligação", desfecho: "Marque o resultado" };

function roteiro(l?: Lead | null): string {
  if (!l) return "Confirme com quem fala, descubra a renda e o tipo de trabalho pra achar a faixa do MCMV e já convide pra uma visita.";
  const regiao = l.regiao_interesse || (l as any).regiao;
  const renda = (l as any).renda_declarada, trab = (l as any).tipo_trabalho;
  if (renda && trab) return `Renda ${fmtRenda(renda)} + ${trab}: confira a faixa do MCMV, ofereça um empreendimento${regiao ? " em " + regiao : " na região dela"} e convide pra visita neste fim de semana.`;
  if (regiao) return `Cliente de ${regiao}. Confirme renda e tipo de trabalho pra achar a faixa do MCMV e já marque uma visita.`;
  return "Confirme a renda e o tipo de trabalho pra achar a faixa do MCMV e convide pra uma visita neste fim de semana.";
}

// segue o tema do painel (mobile .pc.claro / desktop .cpv2 com .dark no <html>)
function useTemaClaro() {
  const ler = () => {
    if (typeof document === "undefined") return false;
    const pc = document.querySelector(".pc");
    if (pc) return pc.classList.contains("claro");
    return !document.documentElement.classList.contains("dark");
  };
  const [claro, setClaro] = useState(ler);
  useEffect(() => {
    const upd = () => setClaro(ler());
    const mo = new MutationObserver(upd);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const pc = document.querySelector(".pc"); if (pc) mo.observe(pc, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return claro;
}

export default function DiscadorSessao({ leads }: { leads: Lead[] }) {
  const claro = useTemaClaro();
  const { data: lic, isLoading } = useQuery({
    queryKey: ["disc-lic"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id || "";
      const [{ data: prof }, cfg] = await Promise.all([
        supabase.from("profiles").select("manager_id, first_name").eq("id", uid).maybeSingle(),
        supabase.functions.invoke("discador-sip-config", { body: {} }),
      ]);
      const liberado = !cfg.error && !!(cfg.data as any)?.server;
      return { uid, liberado, config: (cfg.data as SipConfig) || null, managerId: (prof as any)?.manager_id ?? null, nome: (prof as any)?.first_name ?? null };
    },
    staleTime: 5 * 60 * 1000,
  });
  const fila = useMemo(() => leads.filter((l) => soDig(l.phone).length >= 10 && ATIVOS.has(String(l.status))), [leads]);

  return (
    <div className={"disc" + (claro ? " claro" : "")}>
      {isLoading ? (
        <div className="disc-gate"><div className="disc-spin" /><p>Carregando o discador…</p></div>
      ) : !lic?.liberado ? (
        <GateLiberacao uid={lic?.uid} managerId={lic?.managerId} nome={lic?.nome} />
      ) : (
        <Dialer fila={fila} uid={lic.uid} config={lic.config!} />
      )}
    </div>
  );
}

function GateLiberacao({ uid, managerId, nome }: { uid?: string; managerId?: string | null; nome?: string | null }) {
  const [pedido, setPedido] = useState(false);
  async function pedir() {
    if (!managerId) { toast.error("Você não tem gerente definido — fale com o admin."); return; }
    const { error } = await supabase.from("internal_notifications").insert({
      to_id: managerId, from_id: uid, type: "DISCADOR_LIBERACAO_PEDIDO",
      message: `📞 ${nome || "Um corretor"} pediu pra liberar o Discador. Configure o ramal de ligação dele em Configurar.`,
    });
    if (error) { toast.error("Não consegui enviar o pedido."); return; }
    setPedido(true); toast.success("Pedido enviado ao seu gerente ✅");
  }
  return (
    <div className="disc-gate">
      <div className="ic"><Lock size={30} /></div>
      <h2>Discador ainda não liberado pra você</h2>
      <p>O Discador liga pelos seus clientes direto do navegador — sem precisar do celular. Seu gerente precisa liberar e configurar seu ramal de ligação. Peça a liberação aqui que ele recebe o aviso.</p>
      {pedido
        ? <span className="ok"><Check size={17} /> Pedido enviado — assim que ele liberar, o discador abre aqui.</span>
        : <button className="disc-start" onClick={pedir}><Phone size={18} /> Pedir liberação ao gerente</button>}
    </div>
  );
}

function Dialer({ fila, uid, config }: { fila: Lead[]; uid: string; config: SipConfig }) {
  const engine = useMemo(() => new WebRTCDialerEngine(async () => config), [config]);
  const [fase, setFase] = useState<"idle" | "discando" | "conectado" | "desfecho">("idle");
  const [atual, setAtual] = useState<Lead | null>(null);
  const [avulso, setAvulso] = useState<CallTarget | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [stats, setStats] = useState({ discadas: 0, atenderam: 0, falado: 0 });
  const [nota, setNota] = useState("");
  const [manual, setManual] = useState("");
  const [mostraManual, setMostraManual] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const sessaoRef = useRef(false);
  const feitos = useRef<Set<string>>(new Set()).current;
  const conectouRef = useRef(false);
  const avancandoRef = useRef(false);
  const ringTimer = useRef<number | null>(null);
  const secTimer = useRef<number | null>(null);

  const total = fila.length || 1;
  const naTela = atual || avulso;

  function limparTimers() { if (ringTimer.current) { clearTimeout(ringTimer.current); ringTimer.current = null; } if (secTimer.current) { clearInterval(secTimer.current); secTimer.current = null; } }
  function cronometro() { setSeconds(0); secTimer.current = window.setInterval(() => setSeconds((s) => s + 1), 1000); }

  function onStatus(s: CallStatus) {
    if (s === "connected") {
      conectouRef.current = true;
      if (ringTimer.current) { clearTimeout(ringTimer.current); ringTimer.current = null; }
      setFase("conectado");
      setStats((p) => ({ ...p, atenderam: p.atenderam + 1 }));
      cronometro();
    } else if ((s === "ended" || s === "failed") && !conectouRef.current && !avancandoRef.current) {
      pularSemResposta();
    }
  }

  function discar(lead: Lead) {
    feitos.add(lead.id);
    conectouRef.current = false; avancandoRef.current = false;
    setAtual(lead); setAvulso(null); setMuted(false); setNota("");
    setFase("discando");
    setStats((p) => ({ ...p, discadas: p.discadas + 1 }));
    engine.call({ id: lead.id, nome: lead.name, telefone: lead.phone }, { onStatus });
    ringTimer.current = window.setTimeout(() => pularSemResposta(), 30000);
  }

  function proximo() {
    if (!sessaoRef.current) return;
    const prox = fila.find((l) => !feitos.has(l.id));
    if (!prox) { encerrar("Fila concluída 🎉 Você falou com todo mundo de hoje."); return; }
    discar(prox);
  }

  async function pularSemResposta() {
    avancandoRef.current = true;
    limparTimers();
    await engine.hangup().catch(() => {});
    setFase("discando");
    window.setTimeout(() => proximo(), 500);
  }

  async function desligar() {
    limparTimers();
    setStats((p) => ({ ...p, falado: p.falado + seconds }));
    await engine.hangup().catch(() => {});
    if (atual) setFase("desfecho");
    else encerrar();
  }

  function iniciar() { sessaoRef.current = true; proximo(); }
  function encerrar(msg?: string) { sessaoRef.current = false; limparTimers(); engine.hangup().catch(() => {}); setFase("idle"); setAtual(null); setAvulso(null); if (msg) toast.success(msg); }
  function toggleMute() { const m = !muted; setMuted(m); engine.setMuted(m); }

  async function marcar(desfecho: string) {
    const lead = atual; const obs = nota.trim(); const dur = seconds;
    setFase("discando");
    if (lead) {
      try {
        await registerContactAttempt(lead.id, "Ligação");
        await supabase.from("lead_notes").insert({ lead_id: lead.id, content: `📞 Ligação (${dur}s) · ${LABEL[desfecho] || desfecho}${obs ? " · " + obs : ""}` });
        if (desfecho === "agendou") await updateLeadStatus(lead.id, "VISIT_SCHEDULED");
      } catch { /* não trava */ }
    }
    setNota("");
    window.setTimeout(() => proximo(), 300);
  }

  function ligarManual() {
    const alvo: CallTarget = { id: "avulso", nome: "Ligação", telefone: manual };
    sessaoRef.current = false; conectouRef.current = false; avancandoRef.current = false;
    setAtual(null); setAvulso(alvo); setMuted(false); setMostraManual(false);
    setFase("discando");
    engine.call(alvo, { onStatus: (s) => {
      if (s === "connected") { conectouRef.current = true; setFase("conectado"); cronometro(); }
      else if ((s === "ended" || s === "failed") && !conectouRef.current) encerrar();
    } });
    ringTimer.current = window.setTimeout(() => { engine.hangup().catch(() => {}); if (!conectouRef.current) encerrar("Ninguém atendeu."); }, 30000);
  }

  useEffect(() => () => { limparTimers(); (engine as any).destruir?.(); }, [engine]);

  const emSessao = fase !== "idle";
  const restamN = fila.filter((l) => !feitos.has(l.id)).length;
  const continuando = feitos.size > 0 && restamN > 0;

  return (
    <>
      {emSessao && (
        <div className="disc-top">
          <div className="sub" style={{ fontWeight: 700, color: "var(--ink)", display: "inline-flex", alignItems: "center", gap: 7 }}>
            <span className="d2" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--teal)", display: "inline-block" }} /> {SUB[fase]}
          </div>
          <div className="disc-sess">
            <div className="disc-st"><b>{stats.discadas}</b><span>ligadas</span></div>
            <div className="disc-st g"><b>{stats.atenderam}</b><span>atenderam</span></div>
            <div className="disc-st"><b>{mmss(stats.falado + (fase === "conectado" ? seconds : 0))}</b><span>falado</span></div>
          </div>
        </div>
      )}

      <div className="disc-grid desk">
        {/* ===== PALCO ===== */}
        <section className="disc-palco">
          <div className="disc-glow" />

          {fase === "idle" && (
            <>
              <div className="disc-orb"><div className="core"><Phone size={34} /></div></div>
              {confirmando ? (
                <>
                  <div className="disc-big">Ligar pros seus clientes?</div>
                  <p className="disc-sub2">O Comandra vai ligar de verdade, um atrás do outro, começando por <b style={{ color: "var(--ink)" }}>{restamN} cliente{restamN === 1 ? "" : "s"}</b>. É só falar quando alguém atender.</p>
                  <button className="disc-start" onClick={() => { setConfirmando(false); iniciar(); }}><PhoneOutgoing size={20} /> Sim, pode ligar</button>
                  <button className="disc-link" onClick={() => setConfirmando(false)}>agora não</button>
                </>
              ) : (
                <>
                  <div className="disc-big">{continuando ? "Continuar a sessão" : "Começar a ligar"}</div>
                  <p className="disc-sub2">{continuando ? "Você parou no meio — dá pra seguir de onde parou, sem repetir quem já ligou." : "O Comandra liga sozinho, um cliente atrás do outro. Você não escolhe pra quem — só fala quando alguém atende."}</p>
                  <span className="disc-pill"><Users size={14} /> {restamN} cliente{restamN === 1 ? "" : "s"} {continuando ? "restantes" : "na fila de hoje"}</span>
                  <button className="disc-start" disabled={!restamN} onClick={() => setConfirmando(true)}><PhoneOutgoing size={20} /> {continuando ? "Continuar" : "Iniciar sessão"}</button>
                  {mostraManual ? (
                    <div className="disc-ipt">
                      <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Número com DDD" inputMode="tel" autoFocus />
                      <button disabled={soDig(manual).length < 10} onClick={ligarManual}>Ligar</button>
                    </div>
                  ) : (
                    <button className="disc-link" onClick={() => setMostraManual(true)}>ou ligar um número específico</button>
                  )}
                </>
              )}
            </>
          )}

          {fase === "discando" && (
            <>
              <div className="disc-orb"><span className="r" /><span className="r b" /><span className="r c" /><div className="core"><PhoneOutgoing size={32} /></div></div>
              <div className="disc-eyebrow">{avulso ? "Ligando" : "Procurando quem atende"}</div>
              <div className="disc-big">Chamando…</div>
              <p className="disc-sub2">{avulso ? "Assim que atender, o áudio abre aqui." : "Assim que alguém atender, o cliente aparece com a ficha e o roteiro. Pode deixar — o Comandra pula quem não atende."}</p>
              {!avulso && <span className="disc-pill"><Users size={14} /> {restamN} na fila · pulando sem resposta</span>}
              <button className="disc-ghost" onClick={() => encerrar()}><Square size={15} /> Parar sessão</button>
            </>
          )}

          {(fase === "conectado" || fase === "desfecho") && naTela && (
            <>
              <div className={"disc-av" + (fase === "conectado" ? " live" : "")}>{ini(naTela.nome)}</div>
              <div className="disc-liverow">
                {fase === "conectado"
                  ? <><span className="disc-wave"><i /><i /><i /><i /></span> No telefone · <b style={{ fontVariantNumeric: "tabular-nums" }}>{mmss(seconds)}</b></>
                  : <span style={{ color: "var(--mut)" }}>Chamada encerrada · {mmss(seconds)}</span>}
              </div>
              <div className="disc-nome">{naTela.nome}</div>
              <div className="disc-fone">{fmtFone(naTela.telefone)}</div>
              {atual && (
                <div className="disc-ficha">
                  <div className="disc-fcard"><span>Região</span><b>{atual.regiao_interesse || (atual as any).regiao || "—"}</b></div>
                  <div className="disc-fcard"><span>Renda</span><b>{fmtRenda((atual as any).renda_declarada)}</b></div>
                  <div className="disc-fcard"><span>Trabalho</span><b>{(atual as any).tipo_trabalho || "—"}</b></div>
                  <div className="disc-fcard"><span>Veio de</span><b>{(atual as any).campanha_nome || "MCMV"}</b></div>
                </div>
              )}
              {fase === "conectado" && (
                <div className="disc-ctrls">
                  <button className={"disc-cbtn" + (muted ? " on" : "")} onClick={toggleMute} title={muted ? "Ativar microfone" : "Silenciar"}>{muted ? <MicOff size={20} /> : <Mic size={20} />}</button>
                  <button className="disc-cbtn hang" onClick={desligar} title="Desligar"><PhoneOff size={24} /></button>
                  <button className="disc-cbtn" title="Teclado" disabled><Grid3x3 size={20} /></button>
                </div>
              )}
            </>
          )}
        </section>

        {/* ===== LATERAL de contexto (nunca a fila de nomes) ===== */}
        {emSessao && (
          <aside className="disc-rail">
            {(fase === "conectado" || fase === "desfecho") && atual && (
              <>
                <div className="disc-box roteiro">
                  <div className="bh"><Lightbulb size={13} /> O que falar agora</div>
                  <p>{roteiro(atual)}</p>
                </div>
                <div className="disc-box notas">
                  <div className="bh"><Pencil size={13} /> Anotação da ligação</div>
                  <textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Escreva o que combinou — vira nota no cliente." />
                </div>
              </>
            )}
            {fase === "discando" && (
              <div className="disc-box disc-como">
                <div className="bh"><Info size={13} /> Como funciona</div>
                <ul>
                  <li><Check size={15} /> Você aperta Iniciar uma vez — o resto é automático.</li>
                  <li><Check size={15} /> Ligações sem resposta são puladas sozinhas.</li>
                  <li><Check size={15} /> Quando alguém atende, o cliente aparece aqui.</li>
                  <li><Check size={15} /> Você marca como foi e ele liga o próximo.</li>
                </ul>
              </div>
            )}
            <div className="disc-box">
              <div className="bh"><BarChart3 size={13} /> Placar de hoje</div>
              <div className="disc-rowp"><span>Ligadas</span><b>{stats.discadas}</b></div>
              <div className="disc-rowp"><span>Atenderam</span><b className="g">{stats.atenderam}</b></div>
              <div className="disc-rowp"><span>Tempo falado</span><b>{mmss(stats.falado + (fase === "conectado" ? seconds : 0))}</b></div>
            </div>
          </aside>
        )}

        {/* ===== DESFECHO (largura cheia) ===== */}
        {fase === "desfecho" && (
          <div className="disc-desf">
            <div className="q">Como foi com <b>{atual?.name}</b>? <span style={{ color: "var(--mut)" }}>· falou {mmss(seconds)}</span></div>
            <div className="disc-chips">
              <button className="disc-chip ok" onClick={() => marcar("agendou")}><CalendarCheck size={17} /> Agendou visita</button>
              <button className="disc-chip" onClick={() => marcar("interesse")}><ThumbsUp size={17} /> Interessado</button>
              <button className="disc-chip" onClick={() => marcar("ligar_depois")}><Clock size={17} /> Ligar depois</button>
              <button className="disc-chip" onClick={() => marcar("caixa")}><Voicemail size={17} /> Caixa postal</button>
              <button className="disc-chip" onClick={() => marcar("sem_interesse")}><X size={17} /> Sem interesse</button>
            </div>
            <div className="disc-nexthint"><span className="d2" /> Marque e o Comandra já liga o próximo</div>
          </div>
        )}
      </div>

      {emSessao && (
        <div className="disc-foot">
          <button className="pz" onClick={() => encerrar()}><Pause size={16} /> Parar sessão</button>
          <div className="prog"><i style={{ width: `${Math.round((stats.discadas / total) * 100)}%` }} /></div>
          <small>{stats.discadas} de {fila.length}</small>
        </div>
      )}

      {fase === "idle" && <p className="disc-tiny">O Comandra liga um cliente atrás do outro e só mostra quem é quando a pessoa atende. Fala pelo navegador — permita o microfone na primeira ligação.</p>}
    </>
  );
}
