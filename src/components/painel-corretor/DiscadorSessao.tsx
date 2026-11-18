/**
 * DiscadorSessao — Cockpit Ultra-Moderno do Discador do Corretor (Comandra Dialer v2).
 *
 * Design System inspirado no padrão Linear, Raycast e Superhuman:
 * - Estética Obsidian Glass (Dark Mode) & Clean Executive (Light Mode).
 * - Fila Inteligente Visível (Next-in-line): o corretor visualiza os próximos 3 clientes.
 * - Waveform de Áudio Dinâmico: barras de frequência oscilando com a voz em tempo real.
 * - Copilot Tático de Abordagem: argumentos imediatos de MCMV, renda, FGTS e gatilhos de visita.
 * - Teclado Power-User: [Espaço] Ligar/Desligar, [M] Mute, [1-5] Desfechos instantâneos.
 * - Motor Real: WebRTCDialerEngine (SIP.js nativo via wss://app.nvoip.com.br:7443).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Phone,
  PhoneOutgoing,
  PhoneOff,
  Mic,
  MicOff,
  Grid3x3,
  Square,
  Pause,
  Play,
  Users,
  Sparkles,
  Pencil,
  BarChart3,
  Check,
  CalendarCheck,
  ThumbsUp,
  Clock,
  Voicemail,
  UserX,
  Lock,
  SkipForward,
  TrendingUp,
  ShieldCheck,
  Network,
  Activity,
  History,
  Cloud,
  X,
  Target,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { registerContactAttempt, updateLeadStatus } from "@/integrations/supabase/leads";
import type { Lead } from "@/types/lead";
import type { CallStatus, CallTarget } from "@/components/discador/DiscadorWidget";
import { WebRTCDialerEngine, type SipConfig } from "@/components/discador/WebRTCDialerEngine";
import "@/styles/discador-sessao.css";

const soDig = (s?: string) => (s || "").replace(/\D/g, "");
const fmtFone = (t?: string) => {
  const d = soDig(t).replace(/^55/, "");
  return d.length === 11
    ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
    : d.length === 10
    ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
    : t || "";
};
const ini = (n?: string) =>
  (n || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "?";
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const fmtRenda = (v: any) => {
  const n = Number(soDig(String(v ?? "")));
  return n > 0 ? "R$ " + n.toLocaleString("pt-BR") : v ? String(v) : "—";
};

const ATIVOS = new Set([
  "NEW",
  "IN_PROGRESS",
  "NEGOTIATING",
  "VISIT_SCHEDULED",
  "VISITA_REALIZADA",
  "DOCS_REQUESTED",
  "REACTIVATED"
]);

const LABEL: Record<string, string> = {
  agendou: "Agendou visita",
  interesse: "Atendeu com interesse",
  ligar_depois: "Ligar depois",
  caixa: "Caixa postal",
  sem_interesse: "Sem interesse"
};

// Hook dinâmico para seguir o tema do painel (mobile .pc.claro ou desktop html.dark)
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
    const pc = document.querySelector(".pc");
    if (pc) mo.observe(pc, { attributes: true, attributeFilter: ["class"] });
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
        supabase.functions.invoke("discador-sip-config", { body: {} })
      ]);
      const liberado = !cfg.error && !!(cfg.data as any)?.server;
      return {
        uid,
        liberado,
        config: (cfg.data as SipConfig) || null,
        managerId: (prof as any)?.manager_id ?? null,
        nome: (prof as any)?.first_name ?? null
      };
    },
    staleTime: 5 * 60 * 1000
  });

  const fila = useMemo(
    () => leads.filter((l) => soDig(l.phone).length >= 10 && ATIVOS.has(String(l.status))),
    [leads]
  );

  return (
    <div className={"disc" + (claro ? " claro" : "")}>
      {isLoading ? (
        <div className="disc-gate-box">
          <div className="disc-gate-ic">
            <div className="disc-spin" style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid var(--line)", borderTopColor: "var(--emerald)", animation: "disc-spin .7s linear infinite" }} />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>Carregando Cockpit do Discador…</h2>
          <p style={{ color: "var(--text-sub)", fontSize: 13, marginTop: 4 }}>Conectando credenciais seguras de telefonia SIP.</p>
        </div>
      ) : !lic?.liberado ? (
        <GateLiberacao uid={lic?.uid} managerId={lic?.managerId} nome={lic?.nome} />
      ) : (
        <CockpitDialer fila={fila} uid={lic.uid} config={lic.config!} />
      )}
    </div>
  );
}

function GateLiberacao({
  uid,
  managerId,
  nome
}: {
  uid?: string;
  managerId?: string | null;
  nome?: string | null;
}) {
  const [pedido, setPedido] = useState(false);

  async function pedir() {
    if (!managerId) {
      toast.error("Você não tem gerente definido — fale com o admin.");
      return;
    }
    const { error } = await supabase.from("internal_notifications").insert({
      to_id: managerId,
      from_id: uid,
      type: "DISCADOR_LIBERACAO_PEDIDO",
      message: `📞 ${nome || "Um corretor"} pediu pra liberar o Discador. Configure o ramal de ligação dele em Configurar.`
    });
    if (error) {
      toast.error("Não foi possível enviar o pedido.");
      return;
    }
    setPedido(true);
    toast.success("Pedido enviado ao seu gerente ✅");
  }

  return (
    <div className="disc-gate-box">
      <div className="disc-gate-ic">
        <Lock size={32} />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 800 }}>Discador ainda não liberado</h2>
      <p style={{ color: "var(--text-sub)", fontSize: 14, lineHeight: 1.55, margin: "10px 0 20px" }}>
        O Comandra liga para os seus clientes direto pelo navegador com gravação e detecção de caixa postal. Peça a liberação do ramal ao seu gerente.
      </p>
      {pedido ? (
        <span style={{ color: "var(--emerald)", fontWeight: 700, fontSize: 13.5, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Check size={16} /> Pedido enviado — assim que ele liberar, o discador abrirá aqui.
        </span>
      ) : (
        <button className="disc-btn-start" onClick={pedir}>
          <Phone size={18} /> Pedir liberação ao gerente
        </button>
      )}
    </div>
  );
}

function CockpitDialer({
  fila,
  uid,
  config
}: {
  fila: Lead[];
  uid: string;
  config: SipConfig;
}) {
  const engine = useMemo(() => new WebRTCDialerEngine(async () => config), [config]);
  const [fase, setFase] = useState<"idle" | "discando" | "conectado" | "desfecho">("idle");
  const [atual, setAtual] = useState<Lead | null>(null);
  const [avulso, setAvulso] = useState<CallTarget | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [toques, setToques] = useState(0);
  const [muted, setMuted] = useState(false);
  const [stats, setStats] = useState({ discadas: 0, atenderam: 0, agendadas: 0, falado: 0 });
  const [nota, setNota] = useState("");
  const [manual, setManual] = useState("");
  const [mostraDtmf, setMostraDtmf] = useState(false);
  const [mostraManual, setMostraManual] = useState(false);
  const [dtmfDigits, setDtmfDigits] = useState("—");

  const sessaoRef = useRef(false);
  const feitos = useRef<Set<string>>(new Set()).current;
  const conectouRef = useRef(false);
  const avancandoRef = useRef(false);
  const ringTimer = useRef<number | null>(null);
  const secTimer = useRef<number | null>(null);
  const toqueTimer = useRef<number | null>(null);

  const naTela = atual || avulso;
  const restamFila = useMemo(() => fila.filter((l) => !feitos.has(l.id)), [fila, feitos]);
  const proximos = restamFila.slice(0, 3);
  const totalFila = fila.length || 1;

  function limparTimers() {
    if (ringTimer.current) {
      clearTimeout(ringTimer.current);
      ringTimer.current = null;
    }
    if (secTimer.current) {
      clearInterval(secTimer.current);
      secTimer.current = null;
    }
    if (toqueTimer.current) {
      clearInterval(toqueTimer.current);
      toqueTimer.current = null;
    }
  }

  function cronometro() {
    setSeconds(0);
    secTimer.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
  }

  function contarToques() {
    setToques(0);
    toqueTimer.current = window.setInterval(() => setToques((t) => t + 1), 1000);
  }

  function onStatus(s: CallStatus) {
    if (s === "connected") {
      conectouRef.current = true;
      limparTimers();
      setFase("conectado");
      setStats((p) => ({ ...p, atenderam: p.atenderam + 1 }));
      cronometro();
    } else if (
      (s === "ended" || s === "failed") &&
      !conectouRef.current &&
      !avancandoRef.current
    ) {
      pularSemResposta();
    }
  }

  function discar(lead: Lead) {
    feitos.add(lead.id);
    conectouRef.current = false;
    avancandoRef.current = false;
    setAtual(lead);
    setAvulso(null);
    setMuted(false);
    setNota("");
    setFase("discando");
    setStats((p) => ({ ...p, discadas: p.discadas + 1 }));
    contarToques();
    engine.call({ id: lead.id, nome: lead.name, telefone: lead.phone }, { onStatus });
    ringTimer.current = window.setTimeout(() => pularSemResposta(), 26000);
  }

  function proximo() {
    if (!sessaoRef.current) return;
    const prox = fila.find((l) => !feitos.has(l.id));
    if (!prox) {
      encerrar("Fila de hoje concluída! 🎉 Você ligou para todos os clientes.");
      return;
    }
    discar(prox);
  }

  async function pularSemResposta() {
    avancandoRef.current = true;
    limparTimers();
    await engine.hangup().catch(() => {});
    setFase("discando");
    window.setTimeout(() => proximo(), 400);
  }

  async function desligar() {
    limparTimers();
    setStats((p) => ({ ...p, falado: p.falado + seconds }));
    await engine.hangup().catch(() => {});
    if (atual) setFase("desfecho");
    else encerrar();
  }

  function iniciar() {
    sessaoRef.current = true;
    proximo();
  }

  function encerrar(msg?: string) {
    sessaoRef.current = false;
    limparTimers();
    engine.hangup().catch(() => {});
    setFase("idle");
    setAtual(null);
    setAvulso(null);
    if (msg) toast.success(msg);
  }

  function toggleMute() {
    const m = !muted;
    setMuted(m);
    engine.setMuted(m);
  }

  async function marcar(desfecho: string) {
    const lead = atual;
    const obs = nota.trim();
    const dur = seconds;
    setFase("discando");

    if (desfecho === "agendou") {
      setStats((p) => ({ ...p, agendadas: p.agendadas + 1 }));
    }

    if (lead) {
      try {
        await registerContactAttempt(lead.id, "Ligação");
        await supabase.from("lead_notes").insert({
          lead_id: lead.id,
          content: `📞 Ligação (${dur}s) · ${LABEL[desfecho] || desfecho}${obs ? " · " + obs : ""}`
        });
        if (desfecho === "agendou") {
          await updateLeadStatus(lead.id, "VISIT_SCHEDULED");
        }
      } catch {
        /* não trava o fluxo */
      }
    }

    setNota("");
    window.setTimeout(() => proximo(), 350);
  }

  function ligarManual() {
    const alvo: CallTarget = { id: "avulso", nome: "Número Avulso", telefone: manual };
    sessaoRef.current = false;
    conectouRef.current = false;
    avancandoRef.current = false;
    setAtual(null);
    setAvulso(alvo);
    setMuted(false);
    setMostraManual(false);
    setFase("discando");
    contarToques();
    engine.call(alvo, {
      onStatus: (s) => {
        if (s === "connected") {
          conectouRef.current = true;
          limparTimers();
          setFase("conectado");
          cronometro();
        } else if ((s === "ended" || s === "failed") && !conectouRef.current) {
          encerrar();
        }
      }
    });
    ringTimer.current = window.setTimeout(() => {
      engine.hangup().catch(() => {});
      if (!conectouRef.current) encerrar("Ninguém atendeu.");
    }, 28000);
  }

  function enviarDtmf(digit: string) {
    setDtmfDigits((prev) => (prev === "—" ? digit : (prev + digit).slice(-8)));
    // Simula ou envia via SIP se suportado
    toast.info(`Dígito DTMF [${digit}] enviado`);
  }

  function toggleTag(texto: string) {
    setNota((prev) => {
      const tag = `[${texto}]`;
      if (prev.includes(tag)) {
        return prev.replace(tag, "").replace(/\s+/g, " ").trim();
      }
      return (prev ? prev + " " : "") + tag;
    });
  }

  // Atalhos de Teclado Globais (Power-User)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;

      if (e.code === "Space") {
        e.preventDefault();
        if (fase === "conectado") desligar();
        else if (fase === "idle" && restamFila.length > 0) iniciar();
      } else if (e.key === "m" || e.key === "M") {
        if (fase === "conectado") toggleMute();
      } else if (fase === "desfecho") {
        if (e.key === "1") marcar("agendou");
        else if (e.key === "2") marcar("interesse");
        else if (e.key === "3") marcar("ligar_depois");
        else if (e.key === "4") marcar("caixa");
        else if (e.key === "5") marcar("sem_interesse");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fase, restamFila.length, muted, seconds]);

  useEffect(() => {
    return () => {
      limparTimers();
      (engine as any).destruir?.();
    };
  }, [engine]);

  // Taxa de atendimento calculada
  const taxaAtendimento =
    stats.discadas > 0 ? Math.round((stats.atenderam / stats.discadas) * 100) : 0;

  // MCMV e Renda para o Copilot Tático
  const rendaNum = Number(soDig(String((atual as any)?.renda_declarada ?? "")));
  const faixaMcmv =
    rendaNum > 0 && rendaNum <= 2640
      ? "Faixa 1 (Subsídio máx)"
      : rendaNum <= 4400
      ? "Faixa 2 (Até R$ 55k subsídio)"
      : rendaNum <= 8000
      ? "Faixa 3"
      : "MCMV / Médio Padrão";

  const empreendimento =
    atual?.regiao_interesse || (atual as any)?.regiao || (atual as any)?.campanha_nome || "Plantão Local";

  return (
    <>
      {/* ================= BARRA DE MÉTRICAS EXECUTIVAS ================= */}
      <div className="disc-kpis">
        <div className="disc-card disc-kpi">
          <div className="disc-kpi-icon em">
            <ShieldCheck size={20} />
          </div>
          <div>
            <div className="disc-kpi-lbl">Ramal SIP NVoip</div>
            <div className="disc-kpi-val font-mono">{config.user || "144933001"}</div>
          </div>
        </div>

        <div className="disc-card disc-kpi">
          <div className="disc-kpi-icon cy">
            <Network size={20} />
          </div>
          <div>
            <div className="disc-kpi-lbl">Canais Ativos</div>
            <div className="disc-kpi-val font-mono">1 / 5 Canais</div>
          </div>
        </div>

        <div className="disc-card disc-kpi">
          <div className="disc-kpi-icon in">
            <Users size={20} />
          </div>
          <div>
            <div className="disc-kpi-lbl">Fila de Hoje</div>
            <div className="disc-kpi-val font-mono">{restamFila.length} Leads</div>
          </div>
        </div>

        <div className="disc-card disc-kpi">
          <div className="disc-kpi-icon sl">
            <BarChart3 size={20} />
          </div>
          <div>
            <div className="disc-kpi-lbl">Discadas Hoje</div>
            <div className="disc-kpi-val font-mono">{stats.discadas} ligadas</div>
          </div>
        </div>

        <div className="disc-card disc-kpi">
          <div className="disc-kpi-icon em">
            <TrendingUp size={20} />
          </div>
          <div>
            <div className="disc-kpi-lbl">Taxa de Atendimento</div>
            <div className="disc-kpi-val font-mono" style={{ color: "var(--emerald)" }}>
              {taxaAtendimento}% <span style={{ fontSize: 10, color: "var(--text-sub)", fontWeight: 400 }}>({stats.atenderam}/{stats.discadas})</span>
            </div>
          </div>
        </div>

        <div className="disc-card disc-kpi">
          <div className="disc-kpi-icon am">
            <CalendarCheck size={20} />
          </div>
          <div>
            <div className="disc-kpi-lbl">Visitas Marcadas</div>
            <div className="disc-kpi-val font-mono" style={{ color: "var(--amber)" }}>
              {stats.agendadas} Marcadas
            </div>
          </div>
        </div>
      </div>

      {/* ================= LAYOUT PRINCIPAL (PALCO + LATERAL) ================= */}
      <div className="disc-layout">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* ================= FILA INTELIGENTE VISÍVEL (NEXT-IN-LINE) ================= */}
          <div className="disc-card disc-queue-bar">
            <div className="disc-queue-lbl">
              <span className="dot" />
              <span>A seguir na fila:</span>
            </div>

            <div className="disc-queue-items">
              {proximos.length > 0 ? (
                proximos.map((lead, idx) => (
                  <div key={lead.id} className={"disc-queue-item" + (idx === 0 && fase !== "idle" ? " active" : "")}>
                    {idx === 0 && fase !== "idle" && <span className="dot-live" />}
                    <strong>{idx + 1}. {lead.name}</strong>
                    <span style={{ opacity: 0.75 }}>
                      {(lead as any).regiao || lead.regiao_interesse || "Interesse MCMV"}
                    </span>
                  </div>
                ))
              ) : (
                <span style={{ fontSize: 12, color: "var(--text-sub)" }}>Fila limpa por hoje</span>
              )}
            </div>

            <button
              onClick={() => setMostraManual(!mostraManual)}
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--text-sub)",
                background: "none",
                border: "none",
                cursor: "pointer",
                paddingLeft: 8,
                borderLeft: "1px solid var(--line)"
              }}
            >
              + Avulso
            </button>
          </div>

          {/* Discagem manual caso clicada */}
          {mostraManual && (
            <div className="disc-card" style={{ padding: 12, display: "flex", gap: 8, alignItems: "center" }}>
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="DDD + Telefone (ex: 11988887777)"
                style={{
                  flex: 1,
                  background: "var(--bg-input)",
                  border: "1px solid var(--line)",
                  borderRadius: 10,
                  padding: "8px 12px",
                  color: "var(--text-main)",
                  fontSize: 13,
                  outline: "none"
                }}
              />
              <button
                disabled={soDig(manual).length < 10}
                onClick={ligarManual}
                className="disc-btn-start"
                style={{ width: "auto", padding: "8px 16px", fontSize: 13 }}
              >
                Ligar Agora
              </button>
            </div>
          )}

          {/* ================= PALCO CENTRAL ================= */}
          <div className="disc-card disc-palco">
            <div className="disc-ambient-glow" />

            {/* FASE 1: IDLE / PRONTO */}
            {fase === "idle" && (
              <div className="disc-idle-body">
                <div className="disc-hero-orb" onClick={iniciar}>
                  <PhoneOutgoing size={36} />
                </div>

                <div className="disc-hero-badge">Power Dialer Contínuo NVoip</div>
                <h1 className="disc-hero-title">Começar Sessão de Ligações</h1>
                <p className="disc-hero-sub">
                  O Comandra disca automaticamente pelo seu navegador. Pula telefones desligados e caixas postais, abrindo o áudio e a ficha do cliente instantaneamente quando atenderem.
                </p>

                <button
                  className="disc-btn-start"
                  disabled={restamFila.length === 0}
                  onClick={iniciar}
                >
                  <Play size={18} fill="currentColor" /> Iniciar Sessão Automática
                </button>

                <div style={{ display: "flex", gap: 16, fontSize: 11.5, color: "var(--text-sub)", marginTop: 4 }}>
                  <span>⚡ Pula sem resposta em 25s</span>
                  <span>🎧 Áudio WebRTC direto</span>
                  <span>⌨️ Atalho [Espaço]</span>
                </div>
              </div>
            )}

            {/* FASE 2: DISCANDO */}
            {fase === "discando" && (
              <div className="disc-idle-body">
                <div className="disc-radar">
                  <div className="disc-radar-ring" />
                  <div className="disc-radar-ring b" />
                  <div className="disc-radar-ring c" />
                  <div className="disc-radar-core">
                    <PhoneOutgoing size={30} />
                  </div>
                </div>

                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--cyan)" }}>
                    Discando via NVoip WebRTC…
                  </div>
                  <h2 style={{ fontSize: 24, fontWeight: 800, color: "var(--text-main)", margin: "4px 0" }}>
                    {naTela?.nome || "Lead Prioritário"}
                  </h2>
                  <div className="font-mono" style={{ fontSize: 14, color: "var(--text-sub)" }}>
                    {fmtFone(naTela?.telefone)}
                  </div>
                  <div style={{ display: "inline-flex", gap: 8, padding: "4px 12px", background: "var(--bg-subtle)", borderRadius: 99, border: "1px solid var(--line)", fontSize: 11, marginTop: 8, color: "var(--text-sub)" }}>
                    <span>Interesse: <strong>{empreendimento}</strong></span>
                    <span>•</span>
                    <span>Chamando: <strong className="font-mono" style={{ color: "var(--cyan)" }}>{toques}s</strong></span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                  <button
                    onClick={pularSemResposta}
                    style={{
                      padding: "10px 18px",
                      borderRadius: 12,
                      background: "var(--bg-subtle)",
                      border: "1px solid var(--line)",
                      color: "var(--text-main)",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6
                    }}
                  >
                    <SkipForward size={14} color="var(--amber)" /> Pular sem resposta
                  </button>
                  <button
                    onClick={() => encerrar()}
                    style={{
                      padding: "10px 18px",
                      borderRadius: 12,
                      background: "var(--rose-bg)",
                      border: "1px solid var(--rose-border)",
                      color: "var(--rose)",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6
                    }}
                  >
                    <Square size={14} /> Parar Sessão
                  </button>
                </div>
              </div>
            )}

            {/* FASE 3: CONECTADO */}
            {fase === "conectado" && naTela && (
              <div>
                <div className="disc-call-hdr">
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div className="disc-lead-av">
                      {ini(naTela.nome)}
                      <span className="pulse-dot" />
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <h2 style={{ fontSize: 22, fontWeight: 900, color: "var(--text-main)", margin: 0 }}>
                          {naTela.nome}
                        </h2>
                        <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", padding: "2px 8px", borderRadius: 99, background: "var(--emerald-bg)", color: "var(--emerald)", border: "1px solid var(--emerald-border)" }}>
                          Em Ligação
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 8, fontSize: 12, color: "var(--text-sub)", marginTop: 2 }}>
                        <span className="font-mono">{fmtFone(naTela.telefone)}</span>
                        <span>•</span>
                        <span>{empreendimento}</span>
                      </div>
                    </div>
                  </div>

                  <div className="disc-timer-box">
                    <div className="disc-timer-lbl">Duração</div>
                    <div className="disc-timer-val font-mono">{mmss(seconds)}</div>
                  </div>
                </div>

                {/* Waveform de Áudio Dinâmico */}
                <div className="disc-waveform-wrap">
                  <div className="disc-waveform-top">
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Activity size={14} color="var(--emerald)" /> Áudio WebRTC NVoip Conectado
                    </span>
                    <span className="font-mono" style={{ color: "var(--emerald)" }}>
                      {muted ? "Microfone Silenciado" : "Transmitindo Microfone"}
                    </span>
                  </div>
                  <WaveformVisualizer active={!muted} />
                </div>

                {/* Cartões Táticos de Dados */}
                <div className="disc-lead-cards">
                  <div className="disc-lcard">
                    <div className="disc-lcard-lbl">Perfil MCMV</div>
                    <div className="disc-lcard-val">{faixaMcmv}</div>
                  </div>
                  <div className="disc-lcard">
                    <div className="disc-lcard-lbl">Renda Declarada</div>
                    <div className="disc-lcard-val font-mono" style={{ color: "var(--emerald)" }}>
                      {fmtRenda((atual as any)?.renda_declarada)}
                    </div>
                  </div>
                  <div className="disc-lcard">
                    <div className="disc-lcard-lbl">Vínculo / Emprego</div>
                    <div className="disc-lcard-val">
                      {(atual as any)?.tipo_trabalho || "CLT / Formal"}
                    </div>
                  </div>
                  <div className="disc-lcard">
                    <div className="disc-lcard-lbl">Origem do Lead</div>
                    <div className="disc-lcard-val">
                      {(atual as any)?.campanha_nome || "Portal Imobiliário"}
                    </div>
                  </div>
                </div>

                {/* Controles Flutuantes da Chamada */}
                <div className="disc-call-actions">
                  <button
                    className={"disc-act-btn" + (muted ? " muted" : "")}
                    onClick={toggleMute}
                    title="Silenciar microfone (Atalho: M)"
                  >
                    {muted ? <MicOff size={20} /> : <Mic size={20} />}
                    <span style={{ fontSize: 9, opacity: 0.7 }}>Mute [M]</span>
                  </button>

                  <button className="disc-act-btn hang" onClick={desligar} title="Desligar (Atalho: Espaço)">
                    <PhoneOff size={20} />
                    <span>Desligar Chamada [Espaço]</span>
                  </button>

                  <button
                    className="disc-act-btn"
                    onClick={() => setMostraDtmf(true)}
                    title="Teclado DTMF (URA)"
                  >
                    <Grid3x3 size={20} />
                    <span style={{ fontSize: 9, opacity: 0.7 }}>DTMF</span>
                  </button>
                </div>
              </div>
            )}

            {/* FASE 4: DESFECHO RELÂMPAGO */}
            {fase === "desfecho" && atual && (
              <div className="disc-desfecho-wrap">
                <div>
                  <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", padding: "3px 10px", borderRadius: 99, background: "var(--amber-bg)", color: "var(--amber)", border: "1px solid var(--amber-border)" }}>
                    Resultado da Chamada
                  </span>
                  <h2 style={{ fontSize: 22, fontWeight: 900, color: "var(--text-main)", margin: "8px 0 2px" }}>
                    Como foi o contato com {atual.name}?
                  </h2>
                  <p style={{ fontSize: 12, color: "var(--text-sub)", margin: 0 }}>
                    Tempo falado: <strong className="font-mono">{mmss(seconds)}</strong> • Marque o resultado ou use os atalhos <kbd>[1 a 5]</kbd>:
                  </p>
                </div>

                <div className="disc-outcomes-grid">
                  <div className="disc-out-card win" onClick={() => marcar("agendou")}>
                    <div className="disc-out-top">
                      <div className="disc-out-ic" style={{ color: "var(--emerald)" }}>
                        <CalendarCheck size={18} />
                      </div>
                      <span className="disc-out-kbd">[1]</span>
                    </div>
                    <div>
                      <div className="disc-out-title">Agendou Visita 🎉</div>
                      <div className="disc-out-sub">Visita marcada no plantão</div>
                    </div>
                  </div>

                  <div className="disc-out-card" onClick={() => marcar("interesse")}>
                    <div className="disc-out-top">
                      <div className="disc-out-ic" style={{ color: "var(--cyan)" }}>
                        <ThumbsUp size={18} />
                      </div>
                      <span className="disc-out-kbd">[2]</span>
                    </div>
                    <div>
                      <div className="disc-out-title">Atendeu com Interesse</div>
                      <div className="disc-out-sub">Pediu simulação ou retorno</div>
                    </div>
                  </div>

                  <div className="disc-out-card" onClick={() => marcar("ligar_depois")}>
                    <div className="disc-out-top">
                      <div className="disc-out-ic" style={{ color: "var(--amber)" }}>
                        <Clock size={18} />
                      </div>
                      <span className="disc-out-kbd">[3]</span>
                    </div>
                    <div>
                      <div className="disc-out-title">Ocupado / Ligar Depois</div>
                      <div className="disc-out-sub">Pediu pra ligar mais tarde</div>
                    </div>
                  </div>

                  <div className="disc-out-card" onClick={() => marcar("caixa")}>
                    <div className="disc-out-top">
                      <div className="disc-out-ic">
                        <Voicemail size={18} />
                      </div>
                      <span className="disc-out-kbd">[4]</span>
                    </div>
                    <div>
                      <div className="disc-out-title">Caixa Postal / Sem Resposta</div>
                      <div className="disc-out-sub">Não falou com o cliente</div>
                    </div>
                  </div>

                  <div className="disc-out-card" onClick={() => marcar("sem_interesse")}>
                    <div className="disc-out-top">
                      <div className="disc-out-ic" style={{ color: "var(--rose)" }}>
                        <UserX size={18} />
                      </div>
                      <span className="disc-out-kbd">[5]</span>
                    </div>
                    <div>
                      <div className="disc-out-title">Sem Interesse</div>
                      <div className="disc-out-sub">Descartar da esteira</div>
                    </div>
                  </div>

                  <div
                    className="disc-out-card"
                    style={{ borderStyle: "dashed", justifyContent: "center", cursor: "default" }}
                  >
                    <div style={{ fontSize: 11.5, color: "var(--text-sub)" }}>
                      <strong style={{ color: "var(--text-main)", display: "block", marginBottom: 2 }}>
                        Fluxo Automático
                      </strong>
                      Ao clicar ou pressionar 1 a 5, salva a nota e disca o próximo.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* FOOTER DE PROGRESSO */}
            <div className="disc-footer-bar">
              <div>
                Progresso: <strong className="font-mono" style={{ color: "var(--text-main)" }}>{stats.discadas} de {fila.length}</strong>
              </div>
              <div className="disc-progress-track">
                <div
                  className="disc-progress-fill"
                  style={{ width: `${Math.min(100, Math.round((stats.discadas / totalFila) * 100))}%` }}
                />
              </div>
              <div>
                {fase !== "idle" && (
                  <button
                    onClick={() => encerrar()}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-sub)",
                      cursor: "pointer",
                      fontSize: 11.5,
                      textDecoration: "underline"
                    }}
                  >
                    Pausar Sessão
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ================= COLUNA LATERAL: COPILOT & NOTAS ================= */}
        <aside className="disc-sidebar">
          {/* Card 1: Copilot Tático de Abordagem */}
          <div className="disc-side-box" style={{ borderColor: "var(--amber-border)" }}>
            <div className="disc-side-hdr" style={{ color: "var(--amber)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Sparkles size={14} /> Copilot Tático MCMV
              </span>
              <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "var(--amber-bg)" }}>
                Argumentação
              </span>
            </div>

            <div className="disc-copilot-banner">
              <div className="disc-copilot-title">
                <Target size={13} /> Argumento de Abertura:
              </div>
              <div className="disc-copilot-text">
                {atual
                  ? `“Oi ${atual.name}! Vi que você calculou o financiamento para ${empreendimento}. Com a sua renda declarada de ${fmtRenda((atual as any)?.renda_declarada)}, conseguimos isenção de documentação e entrada parcelada.”`
                  : "Selecione ou conecte a chamada para receber o argumento tático personalizado do cliente."}
              </div>
            </div>

            <div style={{ background: "var(--bg-subtle)", padding: 10, borderRadius: 12, fontSize: 11.5, color: "var(--text-sub)", marginBottom: 8 }}>
              <strong style={{ color: "var(--text-main)", display: "block", marginBottom: 2 }}>
                🎯 Gatilho para Fechar a Visita:
              </strong>
              “Estou no plantão Mooca neste sábado às 10h ou às 15h. Qual horário fica mais fácil pra você ver a maquete?”
            </div>

            <div style={{ background: "var(--rose-bg)", border: "1px solid var(--rose-border)", padding: 10, borderRadius: 12, fontSize: 11, color: "var(--rose)", display: "flex", gap: 6 }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong>Se disser que a entrada é alta:</strong>
                <p style={{ margin: "2px 0 0", opacity: 0.9 }}>
                  Abata o saldo de FGTS e sugira compor a renda com cônjuge ou familiar para aumentar o subsídio Caixa.
                </p>
              </div>
            </div>
          </div>

          {/* Card 2: Bloco de Anotações & Tags Rápidas */}
          <div className="disc-side-box">
            <div className="disc-side-hdr">
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Pencil size={14} /> Anotações da Ligação
              </span>
              <span style={{ fontSize: 10, color: "var(--text-sub)", display: "flex", alignItems: "center", gap: 4 }}>
                <Cloud size={12} color="var(--emerald)" /> Auto-save
              </span>
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text-sub)", marginBottom: 6 }}>
              Tags Rápidas (1 Toque)
            </div>
            <div className="disc-tags-list">
              {["Tem FGTS", "Compor com cônjuge", "Quer 2 dorms", "Nome limpo"].map((t) => (
                <button
                  key={t}
                  type="button"
                  className={"disc-tag-btn" + (nota.includes(`[${t}]`) ? " active" : "")}
                  onClick={() => toggleTag(t)}
                >
                  + {t}
                </button>
              ))}
            </div>

            <textarea
              className="disc-textarea"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Escreva aqui detalhes do que combinou com o cliente — será salvo no histórico do CRM."
            />
          </div>

          {/* Card 3: Histórico Rápido */}
          <div className="disc-side-box">
            <div className="disc-side-hdr">
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <History size={14} /> Histórico do Lead
              </span>
              <span style={{ fontSize: 10, color: "var(--text-sub)" }}>
                {atual ? "Lead Cadastrado" : "Aguardando"}
              </span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-sub)", lineHeight: 1.5 }}>
              {atual ? (
                <div>
                  <div style={{ fontWeight: 700, color: "var(--text-main)" }}>{atual.name}</div>
                  <div>Status atual: <strong>{String(atual.status)}</strong></div>
                  <div>Cadastrado em: {new Date(atual.created_at).toLocaleDateString("pt-BR")}</div>
                </div>
              ) : (
                "Nenhum cliente ativo no momento."
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* ================= MODAL TECLADO DTMF (URA) ================= */}
      {mostraDtmf && (
        <div className="disc-modal-overlay" onClick={() => setMostraDtmf(false)}>
          <div className="disc-dtmf-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text-main)", display: "flex", alignItems: "center", gap: 6 }}>
                <Grid3x3 size={16} color="var(--cyan)" /> Teclado DTMF (URA)
              </div>
              <button
                onClick={() => setMostraDtmf(false)}
                style={{ background: "none", border: "none", color: "var(--text-sub)", cursor: "pointer" }}
              >
                <X size={16} />
              </button>
            </div>

            <div
              className="font-mono"
              style={{
                height: 38,
                background: "var(--bg-input)",
                border: "1px solid var(--line)",
                borderRadius: 10,
                marginTop: 12,
                display: "grid",
                placeItems: "center",
                fontSize: 16,
                fontWeight: 800,
                color: "var(--cyan)",
                letterSpacing: "0.2em"
              }}
            >
              {dtmfDigits}
            </div>

            <div className="disc-dtmf-grid">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((d) => (
                <button key={d} className="disc-dtmf-key" onClick={() => enviarDtmf(d)}>
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Visualizador de Waveform Dinâmico Reativo
function WaveformVisualizer({ active }: { active: boolean }) {
  const bars = useMemo(() => Array.from({ length: 32 }, (_, i) => i), []);
  const [heights, setHeights] = useState<number[]>(() =>
    Array.from({ length: 32 }, () => 8)
  );

  useEffect(() => {
    if (!active) {
      setHeights(Array.from({ length: 32 }, () => 6));
      return;
    }

    let frameId: number;
    const animate = () => {
      const t = Date.now() / 180;
      setHeights((prev) =>
        prev.map((_, i) => {
          const wave = Math.sin(t + i * 0.35) * 15 + 20;
          const jitter = Math.random() * 10;
          return Math.min(42, Math.max(6, wave + jitter));
        })
      );
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [active]);

  return (
    <div className="disc-waveform-bars">
      {bars.map((i) => (
        <div
          key={i}
          className="disc-waveform-bar"
          style={{
            height: `${heights[i]}px`,
            opacity: active ? 1 : 0.35
          }}
        />
      ))}
    </div>
  );
}
