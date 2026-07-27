// Console do Jarvis — campo de digitação "pergunte ou mande" para o painel do gerente (v2).
// Auto-contido: recebe brokers/leads/meta por props e responde de dado real.
import { useState } from "react";
import { useNavigate } from "react-router-dom";

function hoursSince(t?: string | null) {
  if (!t) return 99999;
  return (Date.now() - new Date(t).getTime()) / 3.6e6;
}
function isStalled(l: any) {
  if (!l) return false;
  if (["EXCLUDED", "ABANDONED", "CONCLUDED"].includes(l.status)) return false;
  const r = hoursSince(l.last_lead_response_at);
  if (r < 2 || r > 72) return false;
  return hoursSince(l.last_broker_whatsapp_at) > r;
}

export default function JarvisConsole({
  brokers = [],
  leads = [],
  monthlySales = 0,
  monthlyGoal = null,
  onChargeBroker,
}: {
  brokers?: any[];
  leads?: any[];
  monthlySales?: number;
  monthlyGoal?: number | null;
  onChargeBroker?: (brokerId: string) => void;
}) {
  const navigate = useNavigate();
  const [cmd, setCmd] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [showEx, setShowEx] = useState(false);

  function findBroker(t: string) {
    return (
      brokers.find((b) => {
        const fn = (b.first_name || "").toLowerCase();
        return fn && t.includes(fn);
      }) || null
    );
  }

  function run(raw?: string) {
    const text = (raw ?? cmd).trim();
    if (!text) return;
    const t = text.toLowerCase();
    setCmd("");
    setShowEx(false);
    try {
      const b = findBroker(t);
      const nm = b?.first_name || null;

      if (/(cobr|aperta|chama)/.test(t) && b) {
        if (onChargeBroker) {
          onChargeBroker(b.id);
          setAnswer(`Cobrei <b>${nm}</b> — enviado pelo seu chip e registrado.`);
        } else {
          setAnswer(`Abra o card do <b>${nm}</b> na lista pra cobrar.`);
        }
        return;
      }
      if (/(trein|coach|gargalo|perde|onde|raio|melhor|desenvolv|ensina)/.test(t)) {
        if (b) {
          setAnswer(`Abrindo o raio-x do <b>${nm}</b>…`);
          navigate(`/manager/coach/${b.id}`);
        } else {
          setAnswer("Abrindo o Coach…");
          navigate("/manager/coach");
        }
        return;
      }
      if (/(vend|fech|meta)/.test(t)) {
        setAnswer(`No mês: <b>${monthlySales}${monthlyGoal ? " de " + monthlyGoal : ""}</b> venda(s).`);
        return;
      }
      if (/parad/.test(t)) {
        const n = leads.filter(isStalled).length;
        setAnswer(`<b>${n}</b> lead(s) parado(s) — respondeu há +2h e o corretor não retornou.`);
        return;
      }
      if (/(quem.*trabalh|trabalh.*quem|pulso|quem.*ativ)/.test(t)) {
        const work = new Set(leads.filter((l) => hoursSince(l.last_broker_whatsapp_at) < 2).map((l) => l.broker_id));
        const trab = brokers.filter((b) => work.has(b.id)).map((b) => b.first_name).filter(Boolean);
        setAnswer(trab.length ? `No ritmo agora: <b>${trab.join(", ")}</b>.` : "Ninguém tocou lead na última 2h.");
        return;
      }
      if (/(redistribu|passa|realoc)/.test(t)) {
        setAnswer('Use a aba <b>Redistribuir</b> pra passar o lead pra outro corretor.');
        return;
      }
      if (b) {
        setAnswer(`Abrindo o raio-x do <b>${nm}</b>…`);
        navigate(`/manager/coach/${b.id}`);
        return;
      }
      setAnswer(`Entendi <i>"${text}"</i>. Eu sei: <b>vendas/meta</b>, <b>quem está parado</b>, <b>pulso do time</b>, <b>cobrar</b> um corretor e <b>treinar</b> (coach).`);
    } catch (err: any) {
      setAnswer(`Ops — deu um erro: ${String(err?.message || err)}`);
    }
  }

  const box: React.CSSProperties = {
    background: "var(--crm-surface)",
    border: "1px solid var(--crm-border)",
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 12, padding: "10px 14px", ...box }}>
        <span style={{ fontSize: 16 }}>🧠</span>
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") run(); }}
          autoComplete="off"
          placeholder='Pergunte ou mande a Comandra: "quantas vendas?", "quem está parado?", "o que treinar?", "cobra a Ana"'
          style={{ flex: 1, background: "transparent", border: 0, outline: "none", color: "var(--crm-text)", fontSize: 14, minWidth: 0 }}
        />
        <button onClick={() => setShowEx((v) => !v)} title="exemplos" style={{ background: "transparent", border: "1px solid var(--crm-border)", borderRadius: 8, color: "var(--crm-text-muted)", padding: "4px 9px", cursor: "pointer", fontSize: 12 }}>?</button>
        <button onClick={() => run()} aria-label="enviar" style={{ background: "#37E0D0", color: "#032b28", border: 0, borderRadius: 8, width: 34, height: 34, cursor: "pointer", fontWeight: 700, flex: "none" }}>➤</button>
      </div>

      {showEx && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {["quantas vendas hoje?", "quem está parado?", "pulso do time", "o que treinar hoje?"].map((ex) => (
            <button key={ex} onClick={() => run(ex)} style={{ borderRadius: 8, color: "var(--crm-text-muted)", padding: "5px 10px", cursor: "pointer", fontSize: 12, ...box }}>{ex}</button>
          ))}
        </div>
      )}

      {answer && (
        <div style={{ marginTop: 8, borderRadius: 10, padding: "10px 12px", display: "flex", gap: 10, alignItems: "flex-start", ...box }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: ".12em", color: "#37E0D0", marginBottom: 4 }}>COMANDRA</div>
            <div style={{ fontSize: 13.5, color: "var(--crm-text)", lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: answer }} />
          </div>
          <span onClick={() => setAnswer(null)} style={{ cursor: "pointer", color: "var(--crm-text-muted)", fontSize: 16, lineHeight: 1, flex: "none" }}>×</span>
        </div>
      )}
    </div>
  );
}
