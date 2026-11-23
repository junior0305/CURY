/**
 * DiscadorSessao — aba "Discador" do corretor. Cockpit v2 (design do Junior) portado nativo.
 *
 * Power dialer ÀS CEGAS: o corretor aperta Iniciar uma vez; o Comandra liga um atrás do outro,
 * pula quem não atende e SÓ revela o cliente quando a pessoa ATENDE (nenhum nome da fila à vista,
 * nenhum nome durante a discagem). Ao desligar, marca o desfecho em 1 toque → liga o próximo.
 * Tema claro/escuro segue o painel. Motor real: WebRTCDialerEngine (SIP.js → :7443).
 * Atalhos: Espaço (iniciar/desligar) · M (mudo) · 1–5 (desfecho).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Zap, ShieldCheck, Users, PhoneCall, TrendingUp, CalendarCheck, PhoneOutgoing, Play, Phone, SkipForward, Square, Mic, MicOff, PhoneOff, Activity, Clock, ThumbsUp, Voicemail, UserX, Pause, Trophy, Sparkles, Target, Pencil, Lock, Check, Copy, AlertCircle, Upload } from "lucide-react";
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
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const fmtRenda = (v: any) => { const n = Number(soDig(String(v ?? ""))); return n > 0 ? "R$ " + n.toLocaleString("pt-BR") : (v ? String(v) : "—"); };
const ATIVOS = new Set(["NEW", "IN_PROGRESS", "NEGOTIATING", "VISIT_SCHEDULED", "VISITA_REALIZADA", "DOCS_REQUESTED", "REACTIVATED"]);
const LABEL: Record<string, string> = { interesse: "Atendeu com interesse", agendou: "Agendou visita", ligar_depois: "Ligar depois", caixa: "Caixa postal", sem_interesse: "Sem interesse" };
const TAGS = ["Tem FGTS", "Compõe renda", "Quer 2 dorms", "Nome limpo"];

function roteiro(l?: Lead | null): string {
  if (!l) return "Confirme com quem fala, descubra renda e tipo de trabalho pra achar a faixa do MCMV e já convide pra uma visita.";
  const regiao = l.regiao_interesse || (l as any).regiao;
  const renda = (l as any).renda_declarada, trab = (l as any).tipo_trabalho;
  if (renda && trab) return `Renda ${fmtRenda(renda)} + ${trab}: confira a faixa do MCMV, ofereça um empreendimento${regiao ? " em " + regiao : " na região dela"} e convide pra visita neste fim de semana.`;
  if (regiao) return `Cliente de ${regiao}. Confirme renda e tipo de trabalho pra achar a faixa do MCMV e já marque uma visita.`;
  return "Confirme renda e tipo de trabalho pra achar a faixa do MCMV e convide pra uma visita neste fim de semana.";
}

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
      const [{ data: prof }, cfg, membro] = await Promise.all([
        supabase.from("profiles").select("manager_id, first_name").eq("id", uid).maybeSingle(),
        supabase.functions.invoke("discador-sip-config", { body: {} }),
        supabase.rpc("discador_sou_membro"),
      ]);
      const poolMembro = !!(membro.data as any)?.membro;                 // está no bolo de linhas da equipe
      const liberado = poolMembro || (!cfg.error && !!(cfg.data as any)?.server);
      return { uid, liberado, poolMembro, config: (cfg.data as SipConfig) || null, managerId: (prof as any)?.manager_id ?? null, nome: (prof as any)?.first_name ?? null, licencaPropria: !!(cfg.data as any)?.licenca_propria };
    },
    staleTime: 5 * 60 * 1000,
  });
  const fila = useMemo(() => leads.filter((l) => soDig(l.phone).length >= 10 && ATIVOS.has(String(l.status))), [leads]);

  return (
    <div className={"disc" + (claro ? " claro" : "")}>
      {isLoading ? (
        <div className="disc-glass disc-gate"><div className="disc-spin" /><p>Carregando o discador…</p></div>
      ) : !lic?.liberado ? (
        <GateLiberacao uid={lic?.uid} managerId={lic?.managerId} nome={lic?.nome} />
      ) : (
        <Dialer fila={fila} uid={lic.uid} config={lic.config} poolMembro={lic.poolMembro} brokerNome={lic.nome} licencaPropria={lic.licencaPropria} />
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
      message: `📞 ${nome || "Um corretor"} pediu pra liberar o Discador. Configure o linha de ligação dele em Configurar.`,
    });
    if (error) { toast.error("Não consegui enviar o pedido."); return; }
    setPedido(true); toast.success("Pedido enviado ao seu gerente ✅");
  }
  return (
    <div className="disc-glass disc-gate">
      <div className="ic"><Lock size={30} /></div>
      <h2>Discador ainda não liberado pra você</h2>
      <p>O Discador liga pelos seus clientes direto do navegador — sem precisar do celular. Seu gerente precisa liberar e configurar seu linha de ligação. Peça a liberação aqui que ele recebe o aviso.</p>
      {pedido
        ? <span className="ok"><Check size={17} /> Pedido enviado — assim que ele liberar, o discador abre aqui.</span>
        : <button className="disc-cta" style={{ marginTop: 20 }} onClick={pedir}><Phone size={18} /> Pedir liberação ao gerente</button>}
    </div>
  );
}

type Fase = "idle" | "discando" | "conectado" | "desfecho" | "vitoria" | "carregar";

function Dialer({ fila, uid, config, poolMembro, brokerNome, licencaPropria }: { fila: Lead[]; uid: string; config: SipConfig | null; poolMembro?: boolean; brokerNome?: string | null; licencaPropria?: boolean }) {
  // Pool member: a credencial SIP vem de uma LINHA emprestada pelo porteiro (não do ramal fixo).
  const cfgRef = useRef<SipConfig | null>(poolMembro ? null : config);
  const linhaIdRef = useRef<string | null>(null);
  const hbTimer = useRef<number | null>(null);
  const esperaTimer = useRef<number | null>(null);
  const [aguardando, setAguardando] = useState(false);
  const [qtdLinhas, setQtdLinhas] = useState(1);
  const engine = useMemo(() => new WebRTCDialerEngine(async () => {
    const c = cfgRef.current; if (!c) throw new Error("sem linha"); return c;
  }), []);
  const [fase, setFase] = useState<Fase>("idle");
  const [atual, setAtual] = useState<Lead | null>(null);
  const [avulso, setAvulso] = useState<CallTarget | null>(null);
  const [poolAtual, setPoolAtual] = useState<{ id: string; nome: string; telefone: string; regiao?: string } | null>(null);
  const [fonte, setFonte] = useState<"meus" | "pool">(fila.length ? "meus" : "pool");
  const [poolQtde, setPoolQtde] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [stats, setStats] = useState({ discadas: 0, atenderam: 0, agendadas: 0, falado: 0 });
  const [nota, setNota] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [manual, setManual] = useState("");
  const [mostraManual, setMostraManual] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [subindo, setSubindo] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvResult, setCsvResult] = useState<{ inseridos: number; rejeitados: any[] } | null>(null);

  const sessaoRef = useRef(false);
  const feitos = useRef<Set<string>>(new Set()).current;
  const conectouRef = useRef(false);
  const avancandoRef = useRef(false);
  const ringTimer = useRef<number | null>(null);
  const secTimer = useRef<number | null>(null);
  const faseRef = useRef<Fase>(fase); faseRef.current = fase;
  const mutedRef = useRef(muted); mutedRef.current = muted;
  const fonteRef = useRef(fonte); fonteRef.current = fonte;
  const poolAtualRef = useRef(poolAtual); poolAtualRef.current = poolAtual;
  const poolBatch = useRef<any[]>([]);
  const waveRef = useRef<HTMLDivElement>(null);

  useEffect(() => { supabase.rpc("discador_pool_qtde").then(({ data }) => setPoolQtde(typeof data === "number" ? data : null)).catch(() => {}); }, []);

  const restamLeads = fila.filter((l) => !feitos.has(l.id)).length;
  const continuando = fonte === "meus" && feitos.size > 0 && restamLeads > 0;
  const naFonte = fonte === "pool" ? (poolQtde ?? 0) : restamLeads;
  const total = (fonte === "pool" ? (poolQtde || 1) : fila.length) || 1;
  const naTela = atual ? { nome: atual.name, telefone: atual.phone } : (avulso || poolAtual);
  const taxa = stats.discadas ? Math.round((stats.atenderam / stats.discadas) * 100) : 0;

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

  function discarAlvo(a: { id: string; nome: string; telefone: string; regiao?: string }, lead?: Lead) {
    if (lead) feitos.add(lead.id);
    conectouRef.current = false; avancandoRef.current = false;
    setAtual(lead || null); setPoolAtual(lead ? null : { id: a.id, nome: a.nome, telefone: a.telefone, regiao: a.regiao }); setAvulso(null);
    setMuted(false); setNota(""); setTags([]);
    setFase("discando");
    setStats((p) => ({ ...p, discadas: p.discadas + 1 }));
    engine.call({ id: a.id, nome: a.nome, telefone: a.telefone }, { onStatus });
    ringTimer.current = window.setTimeout(() => pularSemResposta(), 25000);
  }

  async function proximo() {
    if (!sessaoRef.current) return;
    if (fonteRef.current === "meus") {
      const prox = fila.find((l) => !feitos.has(l.id));
      if (!prox) { sessaoRef.current = false; limparTimers(); setAtual(null); setPoolAtual(null); setAvulso(null); setFase("vitoria"); return; }
      discarAlvo({ id: prox.id, nome: prox.name, telefone: prox.phone }, prox);
    } else {
      if (!poolBatch.current.length) {
        try { const { data } = await supabase.rpc("discador_pool_proximos", { p_limit: 40 }); poolBatch.current = (data as any[]) || []; } catch { poolBatch.current = []; }
      }
      const c = poolBatch.current.shift();
      if (!c) { sessaoRef.current = false; limparTimers(); setPoolAtual(null); setAtual(null); setFase("carregar"); return; }
      discarAlvo({ id: c.id, nome: c.nome, telefone: c.telefone, regiao: c.regiao });
    }
  }

  async function pularSemResposta() {
    avancandoRef.current = true;
    limparTimers();
    const pa = poolAtualRef.current;
    if (fonteRef.current === "pool" && pa) supabase.rpc("discador_ligou", { p_id: pa.id, p_resultado: "nao_atendeu", p_duracao: 0 }).catch(() => {});
    await engine.hangup().catch(() => {});
    setFase("discando");
    window.setTimeout(() => proximo(), 450);
  }

  async function desligar() {
    limparTimers();
    setStats((p) => ({ ...p, falado: p.falado + seconds }));
    await engine.hangup().catch(() => {});
    if (atual || poolAtual) setFase("desfecho");
    else encerrar();
  }

  // ---- ANTI-LINHA-MUDA: nenhuma ligação fica aberta sem o corretor olhando ----
  // (secretária eletrônica, distração, troca de aba, hibernação) queimam crédito/minuto.
  useEffect(() => {
    if (fase !== "conectado") return;
    const fim = (motivo: string) => { toast(motivo); apiRef.current?.desligar?.(); };
    const MAX_MS = 5 * 60 * 1000;   // tempo máximo de uma ligação
    const GRACE_MS = 45 * 1000;     // fora da tela por mais que isso = encerra
    const max = window.setTimeout(() => fim("Ligação encerrada: passou do tempo máximo (5 min)."), MAX_MS);
    let hide: number | undefined;
    const onVis = () => {
      if (document.hidden) { toast("Você saiu da tela — a ligação encerra em 45s se não voltar."); hide = window.setTimeout(() => fim("Ligação encerrada: você ficou fora da tela (linha muda)."), GRACE_MS); }
      else if (hide) { clearTimeout(hide); hide = undefined; toast("De volta à ligação."); }
    };
    const derruba = () => { engine.hangup().catch(() => {}); };   // pagehide/freeze/offline: mata a chamada na hora
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", derruba);
    window.addEventListener("freeze", derruba as any);
    window.addEventListener("offline", derruba);
    return () => { clearTimeout(max); if (hide) clearTimeout(hide); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pagehide", derruba); window.removeEventListener("freeze", derruba as any); window.removeEventListener("offline", derruba); };
  }, [fase]);

  // ---- PORTEIRO (bolo de linhas da equipe) ----
  function pararHeartbeat() { if (hbTimer.current) { clearInterval(hbTimer.current); hbTimer.current = null; } }
  function pararEspera() { if (esperaTimer.current) { clearTimeout(esperaTimer.current); esperaTimer.current = null; } }
  async function soltarLinha() {
    pararHeartbeat();
    const id = linhaIdRef.current;
    if (!id) return;
    linhaIdRef.current = null; cfgRef.current = null;
    try { await supabase.rpc("discador_linha_soltar", { p_linha: id }); } catch { /* 75s de staleness recupera */ }
    try { await (engine as any).destruir?.(); } catch { /* */ }
  }
  async function tentarLinhaEComecar() {
    try {
      const { data, error } = await supabase.rpc("discador_linha_pegar");
      const d = data as any;
      if (d?.total) setQtdLinhas(d.total);   // nº real de linhas da equipe (p/ a mensagem de espera)
      if (error || !d || d.esperar || !d.linha_id) {   // linhas ocupadas → espera e tenta de novo
        setAguardando(true);
        esperaTimer.current = window.setTimeout(tentarLinhaEComecar, 5000);
        return;
      }
      pararEspera(); setAguardando(false);
      linhaIdRef.current = d.linha_id;
      cfgRef.current = { server: d.server, domain: d.domain, user: d.user, password: d.password };
      try { await (engine as any).destruir?.(); } catch { /* */ }   // re-registra com a credencial da linha emprestada
      hbTimer.current = window.setInterval(() => { const id = linhaIdRef.current; if (id) supabase.rpc("discador_linha_heartbeat", { p_linha: id }).catch(() => {}); }, 25000);
      sessaoRef.current = true;
      proximo();
    } catch {
      setAguardando(true);
      esperaTimer.current = window.setTimeout(tentarLinhaEComecar, 5000);
    }
  }
  function cancelarEspera() { pararEspera(); setAguardando(false); }

  function iniciar() {
    setConfirmando(false);
    if (poolMembro) { tentarLinhaEComecar(); return; }   // pega uma linha livre antes de começar
    sessaoRef.current = true; proximo();
  }
  function encerrar() { sessaoRef.current = false; limparTimers(); pararEspera(); setAguardando(false); engine.hangup().catch(() => {}); poolBatch.current = []; setFase("idle"); setAtual(null); setAvulso(null); setPoolAtual(null); if (poolMembro) soltarLinha(); }
  function toggleMute() { const m = !muted; setMuted(m); engine.setMuted(m); }
  function toggleTag(t: string) { setTags((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t]); }

  async function marcar(desfecho: string) {
    const lead = atual; const pa = poolAtual; const dur = seconds;
    const obs = [nota.trim(), tags.join(", ")].filter(Boolean).join(" · ");
    setFase("discando");
    if (desfecho === "agendou") setStats((p) => ({ ...p, agendadas: p.agendadas + 1 }));
    const sucesso = desfecho === "agendou" || desfecho === "interesse" || desfecho === "ligar_depois";
    if (lead) {
      try {
        await registerContactAttempt(lead.id, "Ligação");
        await supabase.from("lead_notes").insert({ lead_id: lead.id, content: `📞 Ligação (${dur}s) · ${LABEL[desfecho] || desfecho}${obs ? " · " + obs : ""}` });
        if (desfecho === "agendou") await updateLeadStatus(lead.id, "VISIT_SCHEDULED");
      } catch { /* não trava */ }
    } else if (pa) {
      try {
        const { data } = await supabase.rpc("discador_ligou", { p_id: pa.id, p_resultado: sucesso ? "sucesso" : "nao_atendeu", p_desfecho: desfecho, p_duracao: dur });
        if (sucesso && (data as any)?.virou_lead) { toast.success("Virou cliente — foi pra sua Central de Leads ✅"); setPoolQtde((q) => (q != null ? Math.max(0, q - 1) : q)); }
      } catch { /* não trava */ }
    }
    setNota(""); setTags([]);
    window.setTimeout(() => proximo(), 300);
  }

  function ligarManual() {
    const alvo: CallTarget = { id: "avulso", nome: "Ligação", telefone: manual };
    sessaoRef.current = false; conectouRef.current = false; avancandoRef.current = false;
    setAtual(null); setPoolAtual(null); setAvulso(alvo); setMuted(false); setMostraManual(false);
    setFase("discando");
    engine.call(alvo, { onStatus: (s) => {
      if (s === "connected") { conectouRef.current = true; setFase("conectado"); cronometro(); }
      else if ((s === "ended" || s === "failed") && !conectouRef.current) encerrar();
    } });
    ringTimer.current = window.setTimeout(() => { engine.hangup().catch(() => {}); if (!conectouRef.current) { encerrar(); toast("Ninguém atendeu."); } }, 25000);
  }

  async function lerArquivo(file: File): Promise<string> {
    const buf = await file.arrayBuffer();
    let txt = new TextDecoder("utf-8").decode(buf);
    if (txt.includes("�")) txt = new TextDecoder("windows-1252").decode(buf);
    return txt;
  }
  function parseCsv(txt: string): { nome: string; telefone: string }[] {
    const out: { nome: string; telefone: string }[] = [];
    txt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((ln, i) => {
      if (i === 0 && /(telefone|celular|fone|nome|phone|name)/i.test(ln) && !/\d{8}/.test(ln)) return;
      const cols = ln.split(/[;,\t]/).map((c) => c.trim());
      let nome = "", tel = "";
      for (const c of cols) { const d = c.replace(/\D/g, ""); if (d.length >= 8 && d.length >= tel.replace(/\D/g, "").length) tel = c; else if (!nome && /[a-zA-ZÀ-ú]/.test(c)) nome = c; }
      if (!tel && cols.length) tel = cols[cols.length - 1];
      if (tel) out.push({ nome, telefone: tel });
    });
    return out;
  }
  function baixaCsv(nome: string, conteudo: string) {
    const blob = new Blob(["﻿" + conteudo], { type: "text/csv;charset=utf-8" });
    const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = nome; a.click(); URL.revokeObjectURL(u);
  }
  async function processarCsv(file: File) {
    setCsvBusy(true); setCsvResult(null);
    try {
      const rows = parseCsv(await lerArquivo(file));
      if (!rows.length) { toast.error("Não achei telefones no arquivo."); setCsvBusy(false); return; }
      const { data, error } = await supabase.rpc("discador_subir_csv", { p: rows });
      if (error || (data as any)?.erro) { toast.error("Não consegui subir a lista."); setCsvBusy(false); return; }
      const res = data as any; setCsvResult({ inseridos: res.inseridos || 0, rejeitados: res.rejeitados || [] });
      if (res.inseridos) { setPoolQtde((q) => (q || 0) + res.inseridos); setFonte("pool"); }
      toast.success(`${res.inseridos || 0} contato(s) na sua lista ✅`);
    } catch { toast.error("Erro ao ler o arquivo."); }
    setCsvBusy(false);
  }

  // cleanup
  useEffect(() => () => { limparTimers(); pararHeartbeat(); pararEspera(); const id = linhaIdRef.current; if (id) supabase.rpc("discador_linha_soltar", { p_linha: id }).catch(() => {}); (engine as any).destruir?.(); }, [engine]);

  // atalhos de teclado (lê pelos refs pra não ficar stale)
  const apiRef = useRef<any>({});
  apiRef.current = { desligar, toggleMute, marcar, iniciar: () => setConfirmando(true) };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      const f = faseRef.current; const a = apiRef.current;
      if (e.code === "Space") { e.preventDefault(); if (f === "conectado") a.desligar(); else if (f === "idle") a.iniciar(); }
      else if ((e.key === "m" || e.key === "M") && f === "conectado") a.toggleMute();
      else if (f === "desfecho") { const m: Record<string, string> = { "1": "agendou", "2": "interesse", "3": "ligar_depois", "4": "caixa", "5": "sem_interesse" }; if (m[e.key]) a.marcar(m[e.key]); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // waveform
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const bars = waveRef.current ? (Array.from(waveRef.current.children) as HTMLElement[]) : [];
      const on = faseRef.current === "conectado" && !mutedRef.current;
      bars.forEach((b, i) => {
        if (on) { const t = Date.now() / 200; const w = Math.sin(t + i * 0.35) * 16 + 22; b.style.height = Math.min(46, Math.max(6, w + Math.random() * 12)) + "px"; b.style.opacity = "1"; }
        else { b.style.height = "6px"; b.style.opacity = "0.3"; }
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const ambientCor = fase === "discando" ? "color-mix(in srgb,var(--cy) 18%,transparent)" : fase === "desfecho" ? "color-mix(in srgb,var(--am) 16%,transparent)" : fase === "vitoria" ? "color-mix(in srgb,var(--yl) 16%,transparent)" : "var(--glow)";

  return (
    <>
      {/* barra de métricas */}
      <div className="disc-metrics">
        <Metric ic={<ShieldCheck size={18} />} lbl="Linha" val={<><span className="disc-dot" /> Pronta</>} />
        <Metric cls="cy" ic={<Clock size={18} />} lbl="Falado" val={mmss(stats.falado + (fase === "conectado" ? seconds : 0))} />
        <Metric cls="sl" ic={<Users size={18} />} lbl={fonte === "pool" ? "Na lista" : "Fila de hoje"} val={`${naFonte}${fonte === "pool" ? "" : " leads"}`} />
        <Metric cls="sl" ic={<PhoneCall size={18} />} lbl="Discadas" val={`${stats.discadas}`} />
        <Metric ic={<TrendingUp size={18} />} lbl="Atenderam" val={`${stats.atenderam}${stats.discadas ? ` · ${taxa}%` : ""}`} />
        <Metric cls="am" ic={<CalendarCheck size={18} />} lbl="Visitas" val={`${stats.agendadas}`} />
      </div>

      <div className="disc-grid">
        {/* ===== PALCO ===== */}
        <div className="disc-glass disc-palco">
          <div className="disc-ambient" style={{ background: ambientCor }} />

          {/* IDLE */}
          {fase === "idle" && (
            <div className="disc-stage">
              {aguardando ? (
                <>
                  <div className="disc-radar"><span className="w" /><span className="w" /><span className="w" /><div className="core"><Clock size={28} /></div></div>
                  <div style={{ maxWidth: 380 }}>
                    <span className="disc-badge">Fila de linha</span>
                    <h2 className="disc-h2" style={{ marginTop: 10 }}>{qtdLinhas === 1 ? "A linha está em uso" : `As ${qtdLinhas} linhas estão em uso`}</h2>
                    <p className="disc-lead" style={{ marginTop: 8 }}>Sua equipe liga em <b style={{ color: "var(--ink)" }}>{qtdLinhas} ao mesmo tempo</b>. Assim que {qtdLinhas === 1 ? "ela" : "uma"} liberar, você entra automático e começa a discar. Pode deixar aberto nesta tela.</p>
                  </div>
                  <button className="disc-ghost" onClick={cancelarEspera}><Square size={16} /> Cancelar</button>
                </>
              ) : subindo ? (
                <>
                  <div className="disc-orb"><div className="halo" style={{ opacity: .15 }} /><div className="core" style={{ color: "var(--cy)" }}><Upload size={42} /></div></div>
                  <div style={{ maxWidth: 420 }}>
                    <span className="disc-badge" style={{ background: "color-mix(in srgb,var(--cy) 12%,transparent)", color: "var(--cy)", borderColor: "color-mix(in srgb,var(--cy) 22%,transparent)" }}>Minha lista</span>
                    <h2 className="disc-h2" style={{ marginTop: 10 }}>Subir minha lista pra ligar</h2>
                    <p className="disc-lead" style={{ marginTop: 8 }}>Planilha CSV com <b style={{ color: "var(--ink)" }}>nome;telefone</b>. O Comandra confere e <b style={{ color: "var(--ink)" }}>só entra o que é válido</b> — tira número errado, sem DDD, repetido e bloqueado, pra você não gastar ligação à toa.</p>
                  </div>
                  {csvResult ? (
                    <>
                      <div className="disc-block" style={{ width: "100%", maxWidth: 420 }}>
                        <div className="bl"><Check size={12} /> Resultado</div>
                        <p><b style={{ color: "var(--em)" }}>{csvResult.inseridos}</b> entraram na sua lista.{csvResult.rejeitados.length > 0 ? <> <b style={{ color: "var(--rose)" }}>{csvResult.rejeitados.length}</b> ficaram de fora (errado / repetido / bloqueado).</> : ""}</p>
                        {csvResult.rejeitados.length > 0 && <button className="disc-link" style={{ marginTop: 8 }} onClick={() => baixaCsv("linhas_com_problema.csv", ["nome;telefone;problema", ...csvResult.rejeitados.map((r: any) => `${r.nome || ""};${r.telefone || ""};${r.motivo}`)].join("\n"))}>baixar as linhas com problema</button>}
                      </div>
                      <button className="disc-ghost" onClick={() => { setSubindo(false); setCsvResult(null); }}>Pronto</button>
                    </>
                  ) : (
                    <>
                      <label className="disc-cta" style={{ cursor: "pointer" }}>
                        {csvBusy ? <><div className="disc-spin" style={{ width: 18, height: 18, margin: 0 }} /> Conferindo…</> : <><Upload size={18} /> Escolher planilha CSV</>}
                        <input type="file" accept=".csv,text/csv" style={{ display: "none" }} disabled={csvBusy} onChange={(e) => { const f = e.target.files?.[0]; if (f) processarCsv(f); (e.target as HTMLInputElement).value = ""; }} />
                      </label>
                      <button className="disc-link" onClick={() => baixaCsv("modelo_lista.csv", "nome;telefone\nMaria Silva;11988887777\nJoão Souza;11977776666\n")}>baixar o modelo CSV</button>
                      <button className="disc-link" style={{ opacity: .7 }} onClick={() => setSubindo(false)}>voltar</button>
                    </>
                  )}
                </>
              ) : confirmando ? (
                <>
                  <div className="disc-orb" onClick={iniciar}><div className="halo" /><div className="core"><PhoneOutgoing size={46} /></div></div>
                  <div style={{ maxWidth: 380 }}>
                    <span className="disc-badge">Confirmar</span>
                    <h2 className="disc-h2" style={{ marginTop: 10 }}>Ligar pros seus clientes?</h2>
                    <p className="disc-lead" style={{ marginTop: 8 }}>O Comandra vai ligar de verdade, um atrás do outro, começando por <b style={{ color: "var(--ink)" }}>{naFonte} {fonte === "pool" ? "contato" : "cliente"}{naFonte === 1 ? "" : "s"}</b>. É só falar quando alguém atender.</p>
                  </div>
                  <button className="disc-cta" onClick={iniciar}><Play size={18} /> Sim, pode ligar</button>
                  <button className="disc-link" onClick={() => setConfirmando(false)}>agora não</button>
                </>
              ) : (
                <>
                  {fila.length > 0 && (poolQtde ?? 0) > 0 && (
                    <div className="disc-pills" style={{ justifyContent: "center" }}>
                      <button className={"disc-spill" + (fonte === "meus" ? " on" : "")} onClick={() => setFonte("meus")}>Meus clientes · {restamLeads}</button>
                      <button className={"disc-spill" + (fonte === "pool" ? " on" : "")} onClick={() => setFonte("pool")}>Lista da equipe · {poolQtde}</button>
                    </div>
                  )}
                  <div className="disc-orb" onClick={() => naFonte && setConfirmando(true)}><div className="halo" /><div className="core"><PhoneOutgoing size={46} /></div></div>
                  <div style={{ maxWidth: 400 }}>
                    <span className="disc-badge">{fonte === "pool" ? "Lista da equipe" : "Power Dialer Contínuo"}</span>
                    <h2 className="disc-h2" style={{ marginTop: 10 }}>{continuando ? "Continuar a sessão" : "Iniciar sessão de ligações"}</h2>
                    <p className="disc-lead" style={{ marginTop: 8 }}>{continuando ? "Você parou no meio — dá pra seguir de onde parou. Você não escolhe pra quem: só fala quando alguém atende." : fonte === "pool" ? "O Comandra disca a lista da sua equipe sozinho, pula quem não atende, e quando alguém atende e dá certo o contato vira seu cliente na Central. Você não sabe pra quem liga até atender." : "O Comandra disca sozinho pelo navegador, pula quem não atende, e abre o áudio e a ficha do cliente quando alguém atender. Você não sabe pra quem vai ligar até a pessoa atender."}</p>
                  </div>
                  <button className="disc-cta" disabled={!naFonte} onClick={() => setConfirmando(true)}><Play size={18} /> {continuando ? `Continuar · ${naFonte} restantes` : fonte === "pool" ? "Ligar a lista" : "Iniciar sessão automática"}</button>
                  {licencaPropria && <button className="disc-link" style={{ opacity: .85 }} onClick={() => { setSubindo(true); setCsvResult(null); }}><Upload size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />subir minha lista (CSV)</button>}
                </>
              )}
            </div>
          )}

          {/* DISCANDO — às cegas, sem nome */}
          {fase === "discando" && (
            <div className="disc-stage">
              <div className="disc-radar"><span className="w" /><span className="w" /><span className="w" /><div className="core"><PhoneOutgoing size={30} /></div></div>
              <div>
                <div className="disc-eyebrow">{avulso ? "Ligando" : "Procurando quem atende"}</div>
                <h2 className="disc-h2" style={{ marginTop: 6 }}>Chamando…</h2>
                <p className="disc-lead" style={{ marginTop: 8 }}>{avulso ? "Assim que atender, o áudio abre aqui." : "Assim que alguém atender, o cliente aparece com a ficha e o roteiro. Pode deixar — o Comandra pula quem não atende em 25 segundos."}</p>
              </div>
              <div className="disc-ctrls" style={{ gap: 12 }}>
                {!avulso && <button className="disc-ghost" onClick={() => { avancandoRef.current = true; limparTimers(); engine.hangup().catch(() => {}); window.setTimeout(proximo, 200); }}><SkipForward size={16} /> Pular</button>}
                <button className="disc-ghost danger" onClick={encerrar}><Square size={16} /> Parar sessão</button>
              </div>
            </div>
          )}

          {/* CONECTADO */}
          {fase === "conectado" && naTela && (
            <div className="disc-conn">
              <div className="disc-chead">
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div className="disc-av"><div className="in">{ini(naTela.nome)}</div><div className="pip"><i /></div></div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span className="disc-nome">{naTela.nome}</span>
                      <span className="disc-badge"><span className="disc-dot" /> Conectado</span>
                    </div>
                    <div className="disc-sub">
                      <span className="mono">{fmtFone(naTela.telefone)}</span>
                      {atual?.regiao_interesse && <><span>•</span><span>{atual.regiao_interesse}</span></>}
                      {(atual as any)?.campanha_nome && <><span>•</span><span style={{ color: "var(--em)" }}>{(atual as any).campanha_nome}</span></>}
                      {!atual && poolAtual && <><span>•</span><span style={{ color: "var(--cy)" }}>Da lista{poolAtual.regiao ? " · " + poolAtual.regiao : ""}</span></>}
                    </div>
                  </div>
                </div>
                <div className="disc-timer"><span><Clock size={11} /> Duração</span><b className="mono">{mmss(seconds)}</b></div>
              </div>

              <div className="disc-wavebox">
                <div className="disc-waverow"><span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Activity size={13} style={{ color: "var(--em)" }} /> Áudio ao vivo</span><span className="live"><span className="disc-dot" /> {muted ? "Microfone mudo" : "Microfone transmitindo"}</span></div>
                <div className="disc-wave" ref={waveRef}>{Array.from({ length: 32 }).map((_, i) => <i key={i} style={{ height: 6 }} />)}</div>
              </div>

              {atual && (
                <div className="disc-ficha">
                  <div className="disc-fcard"><span>Região</span><b>{atual.regiao_interesse || (atual as any).regiao || "—"}</b></div>
                  <div className="disc-fcard"><span>Renda familiar</span><b className="em">{fmtRenda((atual as any).renda_declarada)}</b></div>
                  <div className="disc-fcard"><span>Vínculo</span><b>{(atual as any).tipo_trabalho || "—"}</b></div>
                  <div className="disc-fcard"><span>Veio de</span><b className="cy">{(atual as any).campanha_nome || "MCMV"}</b></div>
                </div>
              )}
              {!atual && poolAtual && (
                <div className="disc-ficha" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
                  <div className="disc-fcard"><span>Região</span><b>{poolAtual.regiao || "—"}</b></div>
                  <div className="disc-fcard"><span>Origem</span><b className="cy">Lista da equipe</b></div>
                </div>
              )}

              <div className="disc-ctrls" style={{ marginTop: "auto", paddingTop: 8 }}>
                <button className={"disc-cbtn" + (muted ? " on" : "")} onClick={toggleMute} title="Atalho: M">{muted ? <MicOff size={20} /> : <Mic size={20} />}<span>[M] Mudo</span></button>
                <button className="disc-hang" onClick={desligar}><PhoneOff size={20} /> Desligar <kbd style={{ fontSize: 10, opacity: .7 }}>[Espaço]</kbd></button>
                <button className="disc-cbtn" onClick={() => { avancandoRef.current = true; desligar(); }} title="Próximo"><SkipForward size={20} /><span>Próximo</span></button>
              </div>
            </div>
          )}

          {/* DESFECHO */}
          {fase === "desfecho" && (
            <div className="disc-stage" style={{ justifyContent: "center", gap: 20 }}>
              <div>
                <span className="disc-badge am">Resultado da ligação</span>
                <h2 className="disc-h2" style={{ marginTop: 10 }}>Como foi com <span style={{ color: "var(--em)" }}>{atual?.name || poolAtual?.nome}</span>?</h2>
                <p className="disc-lead" style={{ marginTop: 6 }}>Falou <b className="mono" style={{ color: "var(--ink)" }}>{mmss(seconds)}</b> · escolha o desfecho ou tecle <b>[1–5]</b>. Depois o Comandra liga o próximo sozinho.</p>
              </div>
              <div className="disc-desf" style={{ width: "100%" }}>
                <Chip cls="ok" k="1" ic={<CalendarCheck size={18} />} t="Agendou visita 🎉" d="Visita confirmada no plantão" onClick={() => marcar("agendou")} />
                <Chip cls="cy" k="2" ic={<ThumbsUp size={18} />} t="Atendeu com interesse" d="Pediu simulação ou retorno" onClick={() => marcar("interesse")} />
                <Chip cls="am" k="3" ic={<Clock size={18} />} t="Ligar depois" d="Pediu pra retornar mais tarde" onClick={() => marcar("ligar_depois")} />
                <Chip cls="sl" k="4" ic={<Voicemail size={18} />} t="Caixa postal / sem resposta" d="Tocou até cair ou deu ocupado" onClick={() => marcar("caixa")} />
                <Chip cls="rose" k="5" ic={<UserX size={18} />} t="Sem interesse" d="Descartar da esteira" onClick={() => marcar("sem_interesse")} />
                <div className="disc-chip info">
                  <div><div className="tt">Fluxo automático</div><p>Ao marcar, o resultado é salvo e o Comandra liga o próximo sozinho.</p></div>
                  <button className="disc-link" style={{ color: "var(--rose)", textAlign: "left", display: "inline-flex", alignItems: "center", gap: 5 }} onClick={encerrar}><Pause size={14} /> Fazer uma pausa</button>
                </div>
              </div>
            </div>
          )}

          {/* VITÓRIA */}
          {fase === "vitoria" && (
            <div className="disc-stage">
              <div className="disc-trophy"><Trophy size={46} /></div>
              <div style={{ maxWidth: 400 }}>
                <span className="disc-badge" style={{ background: "color-mix(in srgb,var(--yl) 12%,transparent)", color: "var(--yl)", borderColor: "color-mix(in srgb,var(--yl) 22%,transparent)" }}>Sessão concluída</span>
                <h2 className="disc-h2" style={{ marginTop: 10 }}>Boa, corretor! 🎯</h2>
                <p className="disc-lead" style={{ marginTop: 8 }}>Você falou com todo mundo da fila de hoje. Tudo foi registrado no cliente e no seu placar.</p>
              </div>
              <div className="disc-score">
                <div className="disc-scard"><b>{stats.discadas}</b><span>Discadas</span></div>
                <div className="disc-scard em"><b>{stats.atenderam}</b><span>Atenderam</span></div>
                <div className="disc-scard am"><b>{stats.agendadas}</b><span>Visitas</span></div>
              </div>
              <button className="disc-ghost" onClick={() => { feitos.clear(); setStats({ discadas: 0, atenderam: 0, agendadas: 0, falado: 0 }); setFase("idle"); }}>Voltar ao início</button>
            </div>
          )}

          {/* CARREGAR MAIS (pool esgotado) */}
          {fase === "carregar" && (
            <div className="disc-stage">
              <div className="disc-orb"><div className="halo" style={{ opacity: .15 }} /><div className="core" style={{ color: "var(--am)" }}><AlertCircle size={44} /></div></div>
              <div style={{ maxWidth: 400 }}>
                <span className="disc-badge am">Lista no fim</span>
                <h2 className="disc-h2" style={{ marginTop: 10 }}>Já testou todo mundo da lista</h2>
                <p className="disc-lead" style={{ marginTop: 8 }}>Todos os contatos da lista já foram bem tentados. Peça pro seu gerente carregar mais contatos{fila.length ? ", ou ligue pros seus clientes" : ""}.</p>
              </div>
              <div className="disc-ctrls" style={{ gap: 10 }}>
                {fila.length > 0 && <button className="disc-cta" onClick={() => { setFonte("meus"); setFase("idle"); }}><Play size={18} /> Ligar meus clientes</button>}
                <button className="disc-ghost" onClick={() => setFase("idle")}>Voltar</button>
              </div>
            </div>
          )}

          {/* footer progresso */}
          {fase !== "idle" && fase !== "carregar" && (
            <div className="disc-foot">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><span className="disc-dot" /> {fonte === "pool" ? "Ligadas" : "Progresso"}: <b className="mono" style={{ color: "var(--ink)" }}>{fonte === "meus" ? `${stats.discadas} / ${fila.length}` : stats.discadas}</b></span>
              <div className="disc-prog"><i style={{ width: `${Math.min(100, Math.round((stats.discadas / total) * 100))}%` }} /></div>
              <span className="mono">Falado: <b style={{ color: "var(--ink)" }}>{mmss(stats.falado + (fase === "conectado" ? seconds : 0))}</b></span>
            </div>
          )}
        </div>

        {/* ===== LATERAL (copilot + notas) — nunca a fila de nomes ===== */}
        <div className="disc-side">
          <Copilot lead={atual || (poolAtual ? ({ name: poolAtual.nome, regiao_interesse: poolAtual.regiao } as any) : null)} brokerNome={brokerNome} uid={uid} />

          <div className="disc-glass disc-card">
            <div className="ch"><span className="ct" style={{ color: "var(--cy)" }}><span className="ci" style={{ background: "color-mix(in srgb,var(--cy) 14%,transparent)", color: "var(--cy)" }}><Pencil size={14} /></span> Anotações da ligação</span></div>
            <div className="disc-tags">{TAGS.map((t) => <button key={t} className={"disc-tag" + (tags.includes(t) ? " on" : "")} onClick={() => toggleTag(t)} disabled={fase !== "conectado"}>+ {t}</button>)}</div>
            <textarea className="disc-ta" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Escreva o que combinou — vira nota no cliente ao marcar o desfecho." disabled={fase !== "conectado"} />
          </div>
        </div>
      </div>
    </>
  );
}

const primeiroNome = (n?: string | null) => (n || "").trim().split(/\s+/)[0] || "";
const MODELOS = [
  { id: "noticia", nome: "Notícia boa", tpl: "{nome}? Aqui é o {corretor}. Vou ser rápido porque é boa notícia: pela sua renda você já tem subsídio do governo reservado pra sair do aluguel — e a faixa pode mudar mês que vem. Separei umas opções {regiao}. Me dá 2 minutos?" },
  { id: "provoca", nome: "Provocação", tpl: "{nome}, pergunta rápida e meio estranha: se a parcela do seu apê ficasse quase igual ao aluguel que você paga hoje, você iria ver no sábado? Porque foi isso que eu achei pra você {empreendimento}." },
  { id: "direto", nome: "Direto 30s", tpl: "Oi {nome}, não é telemarketing não — vi que você pediu uma simulação {empreendimento}. Tenho 30 segundos: você quer sair do aluguel ainda esse ano, ou tá só pesquisando?" },
];
const TIPS_SCRIPT: [string, string][] = [
  ["Nome + motivo real", "cite \"você simulou X\" ou a região — mata o \"é telemarketing\""],
  ["Quebre o padrão na 1ª frase", "\"boa notícia\", \"pergunta estranha\", \"não é telemarketing\""],
  ["Novidade, não \"tem interesse?\"", "\"você tem subsídio esperando\" bate mais que \"quer um apê?\""],
  ["Peça micro-compromisso", "\"me dá 30 segundos\" / \"responde só uma coisa\""],
  ["O sim que você quer é a VISITA", "\"topa ver no sábado?\" — nunca \"quer comprar?\""],
];
function montar(tpl: string, lead?: Lead | null, brokerNome?: string | null) {
  const regiao = lead?.regiao_interesse || (lead as any)?.regiao;
  const emp = (lead as any)?.campanha_nome;
  return tpl
    .replace(/{nome}/g, primeiroNome(lead?.name) || "cliente")
    .replace(/{corretor}/g, primeiroNome(brokerNome) || "seu corretor")
    .replace(/{regiao}/g, regiao ? "em " + regiao : "na sua região")
    .replace(/{empreendimento}/g, emp ? "no " + emp : "no nosso lançamento")
    .replace(/{renda}/g, fmtRenda((lead as any)?.renda_declarada));
}

function Copilot({ lead, brokerNome, uid }: { lead?: Lead | null; brokerNome?: string | null; uid: string }) {
  const [sel, setSel] = useState("noticia");
  const [editando, setEditando] = useState(false);
  const [meu, setMeu] = useState<string>(() => { try { return localStorage.getItem("disc_meu_script_" + uid) || ""; } catch { return ""; } });
  const [rascunho, setRascunho] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const modelos = [...MODELOS, ...(meu ? [{ id: "meu", nome: "Meu script", tpl: meu }] : [])];
  const tpl = modelos.find((m) => m.id === sel)?.tpl || MODELOS[0].tpl;
  const texto = montar(tpl, lead, brokerNome);

  function copiar() { navigator.clipboard?.writeText(texto).then(() => toast.success("Script copiado ✅")).catch(() => {}); }
  function abrirEditor() { setRascunho(meu || MODELOS[0].tpl); setEditando(true); }
  function inserir(ph: string) {
    const ta = taRef.current;
    if (!ta) { setRascunho((r) => r + ph); return; }
    const s = ta.selectionStart ?? rascunho.length, e = ta.selectionEnd ?? s;
    setRascunho(rascunho.slice(0, s) + ph + rascunho.slice(e));
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = s + ph.length; }, 0);
  }
  function salvar() { const v = rascunho.trim(); try { localStorage.setItem("disc_meu_script_" + uid, v); } catch {} setMeu(v); setSel(v ? "meu" : "noticia"); setEditando(false); toast.success("Seu script foi salvo 💪"); }

  return (
    <div className="disc-glass disc-card disc-copilot">
      <div className="ch">
        <span className="ct"><span className="ci"><Sparkles size={14} /></span> Copilot de abordagem</span>
        <button className="disc-spill" onClick={editando ? () => setEditando(false) : abrirEditor}><Pencil size={11} /> {editando ? "voltar" : meu ? "meu script" : "criar o meu"}</button>
      </div>

      {editando ? (
        <>
          <div className="disc-block">
            <div className="bl"><Target size={12} /> Receita do script matador</div>
            <ul className="disc-tips">{TIPS_SCRIPT.map(([a, b]) => <li key={a}><Check size={13} style={{ color: "var(--em)", flexShrink: 0, marginTop: 1 }} /><span><b>{a}:</b> {b}</span></li>)}</ul>
          </div>
          <div className="disc-chips2">{["{nome}", "{regiao}", "{renda}", "{empreendimento}"].map((p) => <button key={p} className="disc-ph" onClick={() => inserir(p)}>{p}</button>)}</div>
          <textarea ref={taRef} className="disc-ta" value={rascunho} onChange={(e) => setRascunho(e.target.value)} placeholder="Escreva sua abertura do seu jeito. Use os chips acima — o sistema troca nome / região / renda / empreendimento pelos dados do cliente." />
          <div className="disc-mini"><button className="cancel" onClick={() => setEditando(false)}>Cancelar</button><button className="save" onClick={salvar} disabled={rascunho.trim().length < 10}>Salvar meu script</button></div>
        </>
      ) : (
        <>
          <div className="disc-pills">{modelos.map((m) => <button key={m.id} className={"disc-spill" + (sel === m.id ? " on" : "")} onClick={() => setSel(m.id)}>{m.nome}</button>)}</div>
          <div className="disc-script"><div className="lbl"><Target size={12} /> Abertura — leia no tom de conversa</div><p className="disc-scripttxt">"{texto}"</p></div>
          <div className="disc-copyrow"><button className="disc-copy" onClick={copiar}><Copy size={13} /> Copiar</button></div>
          <div className="disc-block"><div className="bl"><CalendarCheck size={12} /> Gatilho de visita</div><p>"Tô no decorado sábado às 10h ou 15h — qual fica melhor pra você e sua família verem de perto?"</p></div>
          <div className="disc-block"><div className="bl"><AlertCircle size={12} /> Se travar na entrada</div><p>"Entendo — por isso a maioria usa o FGTS como entrada. Você tem conta com FGTS?" (abre a conversa, não fecha)</p></div>
        </>
      )}
    </div>
  );
}

function Metric({ ic, lbl, val, cls = "" }: { ic: ReactNode; lbl: string; val: ReactNode; cls?: string }) {
  return <div className="disc-glass disc-metric"><div className={"mi " + cls}>{ic}</div><div className="ml"><span>{lbl}</span><b>{val}</b></div></div>;
}
function Chip({ cls, k, ic, t, d, onClick }: { cls: string; k: string; ic: ReactNode; t: string; d: string; onClick: () => void }) {
  return <button className={"disc-chip " + cls} onClick={onClick}><div className="ch"><span className="ic">{ic}</span><kbd>[{k}]</kbd></div><div className="tt">{t}</div><div className="ds">{d}</div></button>;
}
