// JarvisConsole — campo de entrada rápida no topo do painel. Abre a thread do Jarvis (JarvisChat).
import { useState } from "react";

export default function JarvisConsole({ onLaunch }: { onLaunch: (msg: string) => void }) {
  const [cmd, setCmd] = useState("");
  const [showEx, setShowEx] = useState(false);

  function go(text?: string) {
    const m = (text ?? cmd).trim();
    if (!m) return;
    setCmd("");
    setShowEx(false);
    onLaunch(m);
  }

  const box: React.CSSProperties = { background: "var(--crm-surface)", border: "1px solid var(--crm-border)" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 12, padding: "10px 14px", ...box }}>
        <span style={{ fontSize: 16 }}>🧠</span>
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") go(); }}
          autoComplete="off"
          placeholder='Fale com o Jarvis: "quantas vendas?", "quem está parado?", "cobra a Ana", "o que treinar?"'
          style={{ flex: 1, background: "transparent", border: 0, outline: "none", color: "var(--crm-text)", fontSize: 14, minWidth: 0 }}
        />
        <button onClick={() => setShowEx((v) => !v)} title="exemplos" style={{ background: "transparent", border: "1px solid var(--crm-border)", borderRadius: 8, color: "var(--crm-text-muted)", padding: "4px 9px", cursor: "pointer", fontSize: 12 }}>?</button>
        <button onClick={() => go()} aria-label="abrir jarvis" style={{ background: "#37E0D0", color: "#032b28", border: 0, borderRadius: 8, width: 34, height: 34, cursor: "pointer", fontWeight: 700, flex: "none" }}>➤</button>
      </div>
      {showEx && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {["quantas vendas hoje?", "quem está parado?", "pulso do time", "o que treinar hoje?"].map((ex) => (
            <button key={ex} onClick={() => go(ex)} style={{ borderRadius: 8, color: "var(--crm-text-muted)", padding: "5px 10px", cursor: "pointer", fontSize: 12, ...box }}>{ex}</button>
          ))}
        </div>
      )}
    </div>
  );
}
