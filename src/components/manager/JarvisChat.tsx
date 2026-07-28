// JarvisChat — o Jarvis do gerente (substitui o CoachChat fake).
// Reflexo (dado real, zero token) + AÇÕES que ele SUGERE e o gerente CONFIRMA (coleira).
// Conversa livre tenta o edge LLM 'manager-jarvis-coach' (se existir) e cai num fallback honesto.
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const hoursSince = (t?: string | null) => (t ? (Date.now() - new Date(t).getTime()) / 3.6e6 : 99999);
function isStalled(l: any) {
  if (!l || ["EXCLUDED", "ABANDONED", "CONCLUDED"].includes(l.status)) return false;
  const r = hoursSince(l.last_lead_response_at);
  if (r < 2 || r > 72) return false;
  return hoursSince(l.last_broker_whatsapp_at) > r;
}

type Action = { kind: "cobrar" | "fila_out" | "fila_in"; brokerId: string; brokerName: string };
type Msg = { id: number; role: "user" | "jarvis"; html: string; action?: Action; done?: boolean };

export default function JarvisChat({
  open, onClose, managerName = "Gestor",
  brokers = [], leads = [], monthlySales = 0, monthlyGoal = null,
  initialQuestion = null, onChargeBroker,
}: {
  open: boolean; onClose: () => void; managerName?: string;
  brokers?: any[]; leads?: any[]; monthlySales?: number; monthlyGoal?: number | null;
  initialQuestion?: string | null; onChargeBroker?: (brokerId: string) => void;
}) {
  const navigate = useNavigate();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const seq = useRef(1);
  const bodyRef = useRef<HTMLDivElement>(null);
  const lastSeed = useRef<string | null>(null);

  const push = (m: Omit<Msg, "id">) => setMsgs((p) => [...p, { id: ++seq.current, ...m }]);
  const findBroker = (t: string) => brokers.find((b) => { const fn = (b.first_name || "").toLowerCase(); return fn && t.includes(fn); }) || null;

  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [msgs, open, busy]);

  useEffect(() => {
    if (open && msgs.length === 0)
      push({ role: "jarvis", html: `Oi, ${managerName}. Sou o Jarvis. Respondo de dado real (vendas, parados, pulso) e proponho ações (cobrar, tirar da fila) — <b>você confirma</b>. Manda.` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && initialQuestion && initialQuestion !== lastSeed.current) { lastSeed.current = initialQuestion; send(initialQuestion); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialQuestion]);

  async function send(raw?: string) {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    setInput("");
    push({ role: "user", html: text });
    const t = text.toLowerCase();
    try {
      const b = findBroker(t);
      const nm = b?.first_name || "";
      // ── AÇÕES: sugere + confirma ──
      if (/(cobr|aperta|chama)/.test(t) && b) { push({ role: "jarvis", html: `Quer que eu cobre <b>${nm}</b> agora (mensagem pelo seu chip)?`, action: { kind: "cobrar", brokerId: b.id, brokerName: nm } }); return; }
      if (/(tira|remov|fora|pausa|desativa)/.test(t) && b) { push({ role: "jarvis", html: `Tirar <b>${nm}</b> da fila de recebimento? Ele para de receber lead novo até você reativar.`, action: { kind: "fila_out", brokerId: b.id, brokerName: nm } }); return; }
      if (/(volta|coloca|ativa|reativa|p[õo]e|bota)/.test(t) && b) { push({ role: "jarvis", html: `Pôr <b>${nm}</b> de volta na fila?`, action: { kind: "fila_in", brokerId: b.id, brokerName: nm } }); return; }
      if (/(redistribu|passa|realoc)/.test(t)) { push({ role: "jarvis", html: `Redistribuição precisa escolher o corretor destino — abre a aba <b>Redistribuir</b> no painel pra fazer isso com segurança.` }); return; }
      // ── DADO: read-only, responde direto ──
      if (/(vend|fech|meta)/.test(t)) { push({ role: "jarvis", html: `No mês: <b>${monthlySales}${monthlyGoal ? " de " + monthlyGoal : ""}</b> venda(s).` }); return; }
      if (/parad/.test(t)) { const n = leads.filter(isStalled).length; push({ role: "jarvis", html: `<b>${n}</b> lead(s) parado(s) — o cliente respondeu há +2h e o corretor não retornou.` }); return; }
      if (/(quem.*trabalh|pulso|quem.*ativ|trabalh.*quem)/.test(t)) {
        const work = new Set(leads.filter((l) => hoursSince(l.last_broker_whatsapp_at) < 2).map((l) => l.broker_id));
        const trab = brokers.filter((x) => work.has(x.id)).map((x) => x.first_name).filter(Boolean);
        push({ role: "jarvis", html: trab.length ? `No ritmo agora: <b>${trab.join(", ")}</b>.` : "Ninguém tocou lead na última 2h." });
        return;
      }
      if (/(trein|coach|gargalo|perde|raio|melhor)/.test(t)) { push({ role: "jarvis", html: b ? `Abrindo o raio-x do <b>${nm}</b>…` : "Abrindo o Coach…" }); onClose(); navigate(b ? `/manager/coach/${b.id}` : "/manager/coach"); return; }
      // ── CONVERSA LIVRE → LLM (edge do gerente) ou fallback honesto ──
      setBusy(true);
      try {
        const { data, error } = await supabase.functions.invoke("manager-jarvis-coach", {
          body: { question: text, managerName, context: { vendas: monthlySales, meta: monthlyGoal, parados: leads.filter(isStalled).length, corretores: brokers.length } },
        });
        if (error || !data?.answer) throw new Error("sem-llm");
        push({ role: "jarvis", html: String(data.answer).replace(/\n/g, "<br>") });
      } catch {
        push({ role: "jarvis", html: `Pra análise aberta eu uso IA, mas o <b>cérebro LLM do gerente ainda não está ligado</b> (falta subir o edge <code>manager-jarvis-coach</code>). Por enquanto eu resolvo: <b>vendas/meta</b>, <b>parados</b>, <b>pulso</b>, <b>cobrar</b> um corretor e <b>coach</b>.` });
      } finally { setBusy(false); }
    } catch (err: any) { push({ role: "jarvis", html: `Ops — erro: ${String(err?.message || err)}` }); }
  }

  async function confirmAction(m: Msg) {
    if (!m.action) return;
    const a = m.action;
    setMsgs((p) => p.map((x) => (x.id === m.id ? { ...x, done: true } : x)));
    try {
      if (a.kind === "cobrar") { onChargeBroker?.(a.brokerId); push({ role: "jarvis", html: `✓ Cobrei <b>${a.brokerName}</b>.` }); }
      else { const enable = a.kind === "fila_in"; await supabase.from("profiles").update({ lead_assignment_enabled: enable }).eq("id", a.brokerId); push({ role: "jarvis", html: `✓ <b>${a.brokerName}</b> ${enable ? "voltou pra fila" : "saiu da fila (não recebe novos leads)"}.` }); }
    } catch (e: any) { push({ role: "jarvis", html: `Falhou: ${String(e?.message || e)}` }); }
  }
  function cancelAction(m: Msg) { setMsgs((p) => p.map((x) => (x.id === m.id ? { ...x, done: true } : x))); push({ role: "jarvis", html: "Ok, cancelado." }); }

  const cvar = (n: string, f: string) => `var(${n}, ${f})`;
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(3,6,12,.55)", opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none", transition: ".3s" }} />
      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(440px,94vw)", zIndex: 70, background: cvar("--crm-bg", "#0b1120"), borderLeft: `1px solid ${cvar("--crm-border", "rgba(255,255,255,.1)")}`, transform: open ? "none" : "translateX(100%)", transition: ".33s cubic-bezier(.2,.8,.2,1)", display: "flex", flexDirection: "column", boxShadow: "-24px 0 50px rgba(0,0,0,.45)" }}>
        <div style={{ padding: "16px 16px 13px", borderBottom: `1px solid ${cvar("--crm-border", "rgba(255,255,255,.1)")}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: cvar("--crm-text", "#eaeef6"), display: "flex", alignItems: "center", gap: 8 }}><span>🧠</span> Jarvis</div>
          <span onClick={onClose} style={{ cursor: "pointer", color: cvar("--crm-text-muted", "#8b93a7"), fontSize: 20, lineHeight: 1 }}>×</span>
        </div>

        <div ref={bodyRef} style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {msgs.map((m) => (
            <div key={m.id} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "86%" }}>
              <div style={{ padding: "9px 12px", borderRadius: 12, fontSize: 13.5, lineHeight: 1.5, color: cvar("--crm-text", "#eaeef6"), background: m.role === "user" ? "rgba(55,224,208,.14)" : cvar("--crm-surface", "rgba(255,255,255,.05)"), border: `1px solid ${m.role === "user" ? "rgba(55,224,208,.25)" : cvar("--crm-border", "rgba(255,255,255,.09)")}`, borderBottomRightRadius: m.role === "user" ? 4 : 12, borderBottomLeftRadius: m.role === "user" ? 12 : 4 }} dangerouslySetInnerHTML={{ __html: m.html }} />
              {m.action && !m.done && (
                <div style={{ display: "flex", gap: 8, marginTop: 7 }}>
                  <button onClick={() => confirmAction(m)} style={{ background: "#37E0D0", color: "#032b28", border: 0, borderRadius: 8, padding: "6px 14px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>Confirmar</button>
                  <button onClick={() => cancelAction(m)} style={{ background: "transparent", color: cvar("--crm-text-muted", "#8b93a7"), border: `1px solid ${cvar("--crm-border", "rgba(255,255,255,.12)")}`, borderRadius: 8, padding: "6px 14px", fontSize: 12.5, cursor: "pointer" }}>Cancelar</button>
                </div>
              )}
            </div>
          ))}
          {busy && <div style={{ alignSelf: "flex-start", fontFamily: "monospace", fontSize: 11, color: cvar("--crm-text-muted", "#8b93a7") }}>Comandra pensando…</div>}
        </div>

        <div style={{ padding: 12, borderTop: `1px solid ${cvar("--crm-border", "rgba(255,255,255,.1)")}`, display: "flex", gap: 8 }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }} autoComplete="off"
            placeholder='Pergunte ou mande: "cobra a Ana", "quem está parado?", "o que treinar?"'
            style={{ flex: 1, background: cvar("--crm-surface", "rgba(255,255,255,.05)"), border: `1px solid ${cvar("--crm-border", "rgba(255,255,255,.12)")}`, borderRadius: 10, padding: "10px 12px", color: cvar("--crm-text", "#eaeef6"), fontSize: 14, outline: "none", minWidth: 0 }} />
          <button onClick={() => send()} aria-label="enviar" style={{ background: "#37E0D0", color: "#032b28", border: 0, borderRadius: 10, width: 40, cursor: "pointer", fontWeight: 700, flex: "none" }}>➤</button>
        </div>
      </div>
    </>
  );
}
