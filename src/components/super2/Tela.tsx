// Moldura das telas do superintendente: 100% alinhado ao Design System do Cockpit do Gerente (cockpit-gerente.css)
import type { ReactNode } from "react";
import "@/styles/cockpit-gerente.css";

export default function TelaSuper({ children }: { children: ReactNode }) {
  return (
    <div className="cockpit-v3" style={{ width: "100%", maxWidth: 1600, margin: "0 auto" }}>
      {children}
    </div>
  );
}

/** Abas internas no estilo pílulas do Cockpit do Gerente (.origem-pills-bar-v3). */
export function AbasInternas<T extends string>({ abas, atual, onTroca }: { abas: [T, string][]; atual: T; onTroca: (k: T) => void }) {
  return (
    <div className="origem-pills-bar-v3" style={{ margin: "4px 0 16px" }}>
      {abas.map(([k, r]) => (
        <button
          key={k}
          type="button"
          className={`origem-pill-btn-v3 ${atual === k ? "active" : ""}`}
          onClick={() => onTroca(k)}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
