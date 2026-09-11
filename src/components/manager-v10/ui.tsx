// Primitivas visuais do painel v10.
//
// Cada uma corresponde a uma classe do protótipo (memory/assets/manager-v10.html),
// portada 1:1 pra src/styles/manager-v10.css. A regra aqui é chata de propósito:
// estes componentes NÃO decidem cor nem espaçamento — eles só emitem a classe
// certa. Quem decide é a folha de estilo, que é a fonte única do sistema. No dia
// em que o v10 substituir o painel antigo, é um arquivo que muda, não trinta.

import React from "react";

/* Rótulo em versalete monoespaçado. No v10 ele nunca compete com o título —
   é a etiqueta que diz de onde o número veio. */
export function Tag({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`tag ${className}`.trim()}>{children}</span>;
}

export function Sec({
  title, tag, sub, children,
}: { title: string; tag?: React.ReactNode; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="sec">
      <div className="sec-h">
        <h2>{title}</h2>
        {tag ? <Tag>{tag}</Tag> : null}
      </div>
      {sub ? <p className="sec-sub">{sub}</p> : null}
      {children}
    </section>
  );
}

export function Panel({
  children, header, style,
}: { children: React.ReactNode; header?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="panel" style={style}>
      {header ? <div className="panel-h">{header}</div> : null}
      {children}
    </div>
  );
}

/* Placar. `six` muda a grade de 4 pra 6 colunas no desktop — é o que separa
   "o dia até agora" (6 números) de um placar comum. */
export function ScoreRow({ six, children }: { six?: boolean; children: React.ReactNode }) {
  return <div className={`score-row${six ? " six" : ""}`}>{children}</div>;
}

export function Cell({
  label, value, sub, tone, onClick, active,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** `alert` pinta o número de vermelho, `good` de verde. Sem tom = tinta. */
  tone?: "alert" | "good";
  onClick?: () => void;
  active?: boolean;
}) {
  const cls = ["cell", tone || "", onClick ? "act" : "", active ? "on" : ""].filter(Boolean).join(" ");
  const inner = (
    <>
      <span className="tag">{label}</span>
      <b>{value}</b>
      {sub ? <i>{sub}</i> : null}
    </>
  );
  return onClick
    ? <button type="button" className={cls} onClick={onClick}>{inner}</button>
    : <div className={cls}>{inner}</div>;
}

/* Linha de fila. As ações só aparecem no hover (no desktop) — no protótipo isso
   é o que mantém a lista legível quando ela tem trinta linhas. */
export function Item({
  title, sub, right, actions, pip,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  right?: React.ReactNode;
  actions?: React.ReactNode;
  pip?: "hot" | "ok" | "idle";
}) {
  return (
    <div className="item">
      {pip ? <span className={`pip${pip === "idle" ? "" : ` ${pip}`}`} /> : null}
      <div className="item-b">
        <b>{title}</b>
        {sub ? <span>{sub}</span> : null}
      </div>
      {right ? <div className="item-t">{right}</div> : null}
      {actions ? <div className="acts">{actions}</div> : null}
    </div>
  );
}

export function Mini({
  children, onClick, variant, disabled, title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  /** `key` = ação nomeada; `solid` = a ação principal, tinta sólida. */
  variant?: "key" | "solid";
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`mini${variant ? ` ${variant}` : ""}`}
    >
      {children}
    </button>
  );
}

export function Blank({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="blank">
      <b>{title}</b>
      {children}
    </div>
  );
}

/* Trilho de ritmo: barra azul = o que já entrou, tracejado vermelho = onde
   você precisaria estar hoje. A distância entre os dois É a mensagem. */
export function Pace({
  donePct, needPct, left, right, say,
}: { donePct: number; needPct: number; left: string; right: string; say?: React.ReactNode }) {
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  return (
    <div className="pace">
      <div className="pace-track">
        <div className="pace-fill" style={{ width: `${clamp(donePct)}%` }} />
        <div className="pace-need" style={{ left: `${clamp(needPct)}%` }} />
        <div className="pace-lab l">{left}</div>
        <div className="pace-lab r">{right}</div>
      </div>
      {say ? <p className="sec-sub" style={{ margin: 0 }}>{say}</p> : null}
    </div>
  );
}

/* Funil de RETENÇÃO — cada degrau mostra quanto SOBROU do degrau anterior,
   não a fatia do total. É a diferença entre "onde as pessoas estão" e "onde
   elas somem", e só a segunda pergunta tem ação. */
export function Funnel({
  steps, onStep,
}: {
  steps: { label: string; n: number; keptPct: number | null; drop?: boolean }[];
  onStep?: (i: number) => void;
}) {
  return (
    <div className="fun">
      {steps.map((s, i) => (
        <div
          key={s.label}
          className={`fs${s.drop ? " drop" : ""}`}
          onClick={onStep ? () => onStep(i) : undefined}
          role={onStep ? "button" : undefined}
        >
          <div className="fsf" style={{ width: `${Math.max(0, Math.min(100, s.keptPct ?? 100))}%` }} />
          <div className="fs-t">
            <b>{s.label}</b>
            <span className="n">{s.n}</span>
            <span className="pc">{s.keptPct === null ? "—" : `${Math.round(s.keptPct)}%`}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Bars({
  rows,
}: { rows: { label: string; pct: number; value: React.ReactNode; tone?: "weak" | "ink" }[] }) {
  return (
    <div className="bars">
      {rows.map((r) => (
        <div key={r.label} className={`bl${r.tone ? ` ${r.tone}` : ""}`}>
          <span className="lb">{r.label}</span>
          <span className="btrack">
            <i className="bfill" style={{ transform: `scaleX(${Math.max(0, Math.min(1, r.pct))})` }} />
          </span>
          <span className="bn">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/* Tabela hairline. As colunas vêm de fora porque cada tabela do v10 tem uma
   grade própria — forçar uma grade genérica aqui só empurraria o problema. */
export function Tbl({
  cols, head, children,
}: { cols: string; head: React.ReactNode[]; children: React.ReactNode }) {
  return (
    <div className="tbl">
      <div className="tr hd" style={{ gridTemplateColumns: cols }}>
        {head.map((h, i) => <span key={i}>{h}</span>)}
      </div>
      {children}
    </div>
  );
}

export function Tr({
  cols, children, onClick,
}: { cols: string; children: React.ReactNode; onClick?: () => void }) {
  return (
    <div
      className={`tr${onClick ? " act" : ""}`}
      style={{ gridTemplateColumns: cols }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      {children}
    </div>
  );
}
