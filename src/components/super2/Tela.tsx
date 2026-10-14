// Moldura das telas do superintendente: o mesmo visual da tela do diretor (classe .dir de diretoria.css:
// cores, fonte e cartões), dentro do painel com o menu lateral. Traduz os tokens que as telas do super
// usam para os do diretor, sem mexer no arquivo do diretor.
import type { ReactNode } from "react";
import "@/styles/diretoria.css";

export default function TelaSuper({ children }: { children: ReactNode }) {
  return (
    <div className="dir s2-tela">
      <style>{`
.mgr10 .s2-tela{min-height:0;background:transparent;padding:0;width:100%;box-sizing:border-box;
  --good:var(--grn);--good-air:var(--grn-bg);--amber:var(--org);--amber-air:var(--org-bg);
  --red-air:var(--red-bg);--blue-air:var(--blue-bg);--hair:var(--line-2);--r:16px}
.mgr10 .s2-tela h1{font-weight:800;letter-spacing:-.02em}
.mgr10 .s2-sub{display:flex;gap:4px;margin-top:20px}
`}</style>
      {children}
    </div>
  );
}

/** Abas internas no estilo do diretor (ex.: Leads | Mídia). */
export function AbasInternas<T extends string>({ abas, atual, onTroca }: { abas: [T, string][]; atual: T; onTroca: (k: T) => void }) {
  return (
    <div className="s2-sub">
      <div className="dir-per">{abas.map(([k, r]) => <button key={k} className={atual === k ? "on" : ""} onClick={() => onTroca(k)}>{r}</button>)}</div>
    </div>
  );
}
