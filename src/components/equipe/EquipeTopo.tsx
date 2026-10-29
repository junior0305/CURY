/* Topo do super e do diretor (29/10): no lugar do "Quem está sem gerar resultado", duas abas sobre TODAS as equipes da pessoa —
 * Equipe hoje (agenda de visitas + pastas) e Rendimento da Equipe. O gerente tem as mesmas abas dentro do TimeTab. */
import { useState } from "react";
import AgendaEquipe from "./AgendaEquipe";
import RendimentoEquipe from "./RendimentoEquipe";

const CSS = `.eqt{display:grid;gap:12px}.eqt .eqt-tabs{display:flex;gap:6px;flex-wrap:wrap}
.eqt .eqt-tabs button{font:inherit;border:1px solid var(--cv-border,#e2e8f0);background:var(--cv-surface,#fff);color:var(--cv-text-muted,#64748b);border-radius:99px;padding:8px 16px;font-weight:700;cursor:pointer}
.eqt .eqt-tabs button.on{background:var(--cv-text-main,#0f1b2d);border-color:var(--cv-text-main,#0f1b2d);color:var(--cv-surface,#fff)}`;

export default function EquipeTopo({ donoId }: { donoId?: string | null }) {
  const [aba, setAba] = useState<"hoje" | "rend">("hoje");
  return (
    <section className="eqt"><style>{CSS}</style>
      <div className="eqt-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={aba === "hoje"} className={aba === "hoje" ? "on" : ""} onClick={() => setAba("hoje")}>Equipe hoje</button>
        <button type="button" role="tab" aria-selected={aba === "rend"} className={aba === "rend" ? "on" : ""} onClick={() => setAba("rend")}>Rendimento da Equipe</button>
      </div>
      {aba === "hoje" ? <AgendaEquipe donoId={donoId} /> : <RendimentoEquipe donoId={donoId} />}
    </section>
  );
}
