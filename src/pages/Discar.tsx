/**
 * Discar — discador automático (power dialer) do corretor, via Nvoip.
 * Fase 1: fonte = "Meus leads" (os leads do corretor com telefone, que precisam de contato).
 * O corretor aperta "Discar lista" e o sistema liga um atrás do outro (edge nvoip-call),
 * pulando quem não atende, e só para quando alguém atende. Modo do áudio vem de discador_ramais.
 * Edge/tabelas SÓ na Econ (piloto). CSS escopado em .dsc (src/styles/discar.css).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { fetchLeadsForDashboard } from "@/integrations/supabase/leads";
import type { Lead } from "@/types/lead";
import "@/styles/discar.css";

type QStatus = "wait" | "now" | "ok" | "no";
type Item = { lead: Lead; status: QStatus; nota?: string };

const iniciais = (n?: string) =>
  (n || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "?";
const soDigitos = (s?: string) => (s || "").replace(/\D/g, "");
// normaliza p/ E.164 BR sem "+": 10/11 dígitos ganham 55 na frente
const paraNvoip = (tel?: string) => {
  const d = soDigitos(tel);
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
};
const fmtFone = (tel?: string) => {
  const d = soDigitos(tel).replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return tel || "";
};
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

// classifica a resposta crua do getCall (shape ainda não 100% conhecido → por palavra)
function classifica(raw: unknown): "andamento" | "atendeu" | "naoatendeu" {
  const s = JSON.stringify(raw || "").toLowerCase();
  if (/answer|bridge|atend|talk|falando|in[_-]?call|connected|active|conversa/.test(s)) return "atendeu";
  if (/hangup|fail|busy|ocup|noanswer|no[_-]?answer|cancel|complete|finish|ended|encerr|rejeit|unavailable/.test(s)) return "naoatendeu";
  return "andamento";
}

const ATIVOS = new Set(["NEW", "IN_PROGRESS", "NEGOTIATING", "VISIT_SCHEDULED", "VISITA_REALIZADA", "DOCS_REQUESTED"]);

export default function Discar() {
  const nav = useNavigate();
  const { user } = useAuth();

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["discar-leads", user?.id],
    queryFn: fetchLeadsForDashboard,
    enabled: !!user,
  });

  const [testNum, setTestNum] = useState("");
  const [testMsg, setTestMsg] = useState("");
  const [fila, setFila] = useState<Item[]>([]);
  const [idx, setIdx] = useState(0);
  const [running, setRunning] = useState(false);
  const [fase, setFase] = useState<"idle" | "origin" | "ringing" | "connected">("idle");
  const [seg, setSeg] = useState(0);

  const runningRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const pollRef = useRef<number | null>(null);
  const segRef = useRef<number | null>(null);

  // monta a fila a partir dos leads do corretor (com telefone, que precisam de contato)
  useEffect(() => {
    if (!leads.length) return;
    const q = leads
      .filter((l) => soDigitos(l.phone).length >= 10 && ATIVOS.has(String(l.status)))
      .map((l) => ({ lead: l, status: "wait" as QStatus }));
    setFila(q);
  }, [leads]);

  useEffect(() => () => pararTudo(), []); // cleanup

  const atual = fila[idx];
  const feitos = fila.filter((i) => i.status === "ok" || i.status === "no").length;
  const pct = fila.length ? Math.round((feitos / fila.length) * 100) : 0;

  function pararTimers() {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
    if (segRef.current) { clearInterval(segRef.current); segRef.current = null; }
  }
  function pararTudo() {
    runningRef.current = false;
    setRunning(false);
    pararTimers();
    setFase("idle");
  }

  async function ligar(called: string): Promise<string | null> {
    const { data, error } = await supabase.functions.invoke("nvoip-call", {
      body: { acao: "ligar", called },
    });
    if (error) { console.error("[discar] ligar erro", error); return null; }
    if (data?.error) { console.warn("[discar] ligar resp", data); toast.error(mensagemErro(data.error)); return null; }
    return data?.callId ?? null;
  }
  async function status(callId: string): Promise<unknown> {
    const { data } = await supabase.functions.invoke("nvoip-call", { body: { acao: "status", call_id: callId } });
    return data;
  }
  function mensagemErro(e: string) {
    if (e === "sem_licenca") return "Você ainda não tem discador liberado.";
    if (e === "nao_autenticado") return "Sessão expirada, entre de novo.";
    if (e === "numero_invalido") return "Número inválido, pulando.";
    return "Não consegui ligar agora.";
  }

  async function testarLigar() {
    const n = paraNvoip(testNum);
    if (n.length < 12) { setTestMsg("Número inválido — use DDD (ex.: 11988887777)."); return; }
    setTestMsg("Pedindo a ligação…");
    const cid = await ligar(n);
    if (!cid) { setTestMsg("Não saiu — confira o secret no Portainer (ou o console)."); return; }
    setTestMsg(`Ligando! callId ${cid.slice(0, 8)}… seu ramal (144933001) deve tocar.`);
    let t = 0;
    const ver = async () => {
      t++;
      const raw = await status(cid);
      console.log("[discar][teste] status", raw);
      const c = classifica(raw);
      setTestMsg(`Estado: ${c === "atendeu" ? "ATENDEU ✓" : c === "naoatendeu" ? "encerrou/não atendeu" : "em andamento…"} (callId ${cid.slice(0, 8)})`);
      if (c === "andamento" && t < 12) window.setTimeout(ver, 2500);
    };
    window.setTimeout(ver, 2500);
  }

  function marca(i: number, s: QStatus) {
    setFila((f) => f.map((it, k) => (k === i ? { ...it, status: s } : it)));
  }

  async function discarEm(i: number) {
    if (!runningRef.current) return;
    if (i >= fila.length) { pararTudo(); toast.success("Fila concluída."); return; }
    setIdx(i);
    marca(i, "now");
    setFase("origin");
    setSeg(0);

    const callId = await ligar(paraNvoip(fila[i].lead.phone));
    if (!callId) { marca(i, "no"); pollRef.current = window.setTimeout(() => discarEm(i + 1), 800); return; }

    setFase("ringing");
    let tentativas = 0;
    const poll = async () => {
      if (!runningRef.current) return;
      tentativas++;
      const st = classifica(await status(callId));
      if (st === "atendeu") {
        setFase("connected");
        iniciaCronometro();
        return; // para a varredura; espera o corretor marcar o resultado
      }
      if (st === "naoatendeu" || tentativas > 18) { // ~45s de teto por ligação
        marca(i, "no");
        pollRef.current = window.setTimeout(() => discarEm(i + 1), 800);
        return;
      }
      pollRef.current = window.setTimeout(poll, 2500);
    };
    pollRef.current = window.setTimeout(poll, 2500);
  }

  function iniciaCronometro() {
    pararTimers();
    segRef.current = window.setInterval(() => setSeg((s) => s + 1), 1000);
  }

  function iniciar() {
    if (!fila.length) { toast.error("Sem ninguém na fila."); return; }
    runningRef.current = true;
    setRunning(true);
    const prox = fila.findIndex((it) => it.status === "wait");
    discarEm(prox < 0 ? 0 : prox);
  }
  function pausar() { pararTudo(); toast("Discagem pausada."); }
  function pular() {
    pararTimers();
    marca(idx, "no");
    if (runningRef.current) discarEm(idx + 1);
    else setFase("idle");
  }

  // resultado de uma ligação atendida → marca e segue
  function resultado(ok: boolean, nota: string) {
    pararTimers();
    setFila((f) => f.map((it, k) => (k === idx ? { ...it, status: ok ? "ok" : "no", nota } : it)));
    // TODO Fase 1.1: persistir no lead (registerContactAttempt / updateLeadStatus)
    if (runningRef.current) discarEm(idx + 1);
    else setFase("idle");
  }

  const faseTxt = useMemo(() => {
    if (fase === "origin") return "ligando no seu telefone…";
    if (fase === "ringing") return "tocando no cliente…";
    if (fase === "connected") return "atendeu! fale agora";
    return "";
  }, [fase]);

  return (
    <div className="dsc">
      <div className="wrap">
        <div className="top">
          <h1><span className="ic">📞</span> Discar</h1>
          <button className="back" onClick={() => nav(-1)}><ArrowLeft size={15} /> Voltar</button>
        </div>

        <div className="autobar">🔄 Discagem automática — o sistema liga um atrás do outro sozinho e pula quem não atende. Só te conecta quando alguém atende.</div>

        <div className="test">
          <span className="tl">Ligar um número de teste</span>
          <input className="ti" value={testNum} onChange={(e) => setTestNum(e.target.value)} placeholder="11988887777" inputMode="tel" />
          <button className="tb" onClick={testarLigar}>Ligar</button>
          {testMsg && <div className="tm">{testMsg}</div>}
        </div>

        <div className="grid">
          {/* PAINEL */}
          <div className="dial">
            <div className="src"><b className="on">Meus leads ({fila.length})</b></div>

            {isLoading ? (
              <div className="empty">Carregando sua fila…</div>
            ) : !fila.length ? (
              <div className="empty">Nenhum lead com telefone pra ligar agora.</div>
            ) : (
              <>
                <div className="now">
                  <div className="ph">
                    {fase === "idle" ? `${fila.length} na fila` : `Contato ${idx + 1} de ${fila.length} · ${faseTxt}`}
                  </div>
                  <div className="nm">{atual?.lead.name || "—"}</div>
                  <div className="tel">{fmtFone(atual?.lead.phone)}</div>
                  <div className="meta">
                    {[(atual?.lead as any)?.regiao_interesse, (atual?.lead as any)?.campanha_nome].filter(Boolean).join(" · ") || "sem detalhes"}
                  </div>
                </div>

                <div className="steps">
                  <div className={"stp" + (fase !== "idle" ? " on" : "")}>1 · toca no seu cel</div>
                  <div className={"stp" + (fase === "ringing" ? " on ring" : "")}>2 · tocando no cliente…</div>
                  <div className={"stp" + (fase === "connected" ? " on" : "")}>3 · em ligação</div>
                </div>
                {fase === "connected" && <div className="timer">{mmss(seg)}</div>}

                <div className="ctrls">
                  {running
                    ? <button className="btn pause" onClick={pausar}>⏸ Pausar</button>
                    : <button className="btn call" onClick={iniciar}>● Discar lista</button>}
                  <button className="btn skip" onClick={pular} disabled={!running}>Pular ›</button>
                </div>

                {fase === "connected" && (
                  <div className="out">
                    <div className="lb">Como foi essa ligação?</div>
                    <div className="row">
                      <button className="chip g" onClick={() => resultado(true, "Agendou visita")}>✓ Agendou visita</button>
                      <button className="chip" onClick={() => resultado(true, "Vai pensar")}>Vai pensar / depois</button>
                      <button className="chip r" onClick={() => resultado(false, "Sem interesse")}>Sem interesse</button>
                      <button className="chip" onClick={() => resultado(false, "Número errado")}>Número errado</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* FILA */}
          <div className="side">
            <div className="h"><b>Fila de hoje</b><span className="prog">{feitos} / {fila.length}</span></div>
            <div className="bar"><i style={{ width: pct + "%" }} /></div>
            <div className="q">
              {fila.map((it, k) => (
                <div key={it.lead.id} className={"qi" + (k === idx && fase !== "idle" ? " active" : "")}>
                  <span className="av">{iniciais(it.lead.name)}</span>
                  <div className="t"><b>{it.lead.name || "—"}</b><span>{fmtFone(it.lead.phone)}</span></div>
                  <span className={"s " + it.status}>
                    {it.status === "ok" ? (it.nota || "atendeu") : it.status === "no" ? (it.nota || "não atend.") : it.status === "now" ? "discando" : "na fila"}
                  </span>
                </div>
              ))}
            </div>
            <div className="cap">Aperta <b style={{ color: "var(--good)" }}>Discar lista</b> uma vez e o sistema disca sozinho até alguém atender — você não liga um por um. <b>Pausar</b> para a discagem.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
