// O seletor de período, compartilhado por todas as abas.
//
// "Escolher datas" abre no lugar, logo abaixo dos botões — no celular um
// balãozinho flutuante some atrás do teclado quando o campo de data ganha foco.

import { useState } from "react";
import { usePeriodo, diaSP, type Preset } from "@/hooks/usePeriodo";

const OPCOES: { k: Preset; label: string }[] = [
  { k: "hoje", label: "Hoje" },
  { k: "semana", label: "Esta semana" },
  { k: "7", label: "7 dias" },
  { k: "30", label: "30 dias" },
  { k: "90", label: "90 dias" },
];

export default function SeletorPeriodo() {
  const { periodo, definir } = usePeriodo();
  const [abrir, setAbrir] = useState(false);
  const [de, setDe] = useState(periodo.de);
  const [ate, setAte] = useState(periodo.ate);

  return (
    <div className="per">
      <div className="per-chips" role="group" aria-label="Período">
        {OPCOES.map((o) => (
          <button key={o.k} type="button" className={periodo.preset === o.k ? "on" : ""}
            aria-pressed={periodo.preset === o.k}
            onClick={() => { definir(o.k); setAbrir(false); }}>
            {o.label}
          </button>
        ))}
        <button type="button" className={periodo.preset === "custom" ? "on" : ""}
          aria-pressed={periodo.preset === "custom"} aria-expanded={abrir}
          onClick={() => setAbrir((v) => !v)}>
          {periodo.preset === "custom" ? periodo.rotulo : "Escolher datas"}
        </button>
      </div>

      {abrir && (
        <div className="per-data">
          <label>De<input type="date" value={de} max={diaSP()}
            onChange={(e) => setDe(e.target.value)} /></label>
          <label>Até<input type="date" value={ate} max={diaSP()}
            onChange={(e) => setAte(e.target.value)} /></label>
          <button className="mini solid" onClick={() => {
            if (de && ate && de <= ate) { definir("custom", de, ate); setAbrir(false); }
          }}>Aplicar</button>
          <button className="mini" onClick={() => setAbrir(false)}>Cancelar</button>
        </div>
      )}
    </div>
  );
}
