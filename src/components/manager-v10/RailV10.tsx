// O menu lateral do painel do gerente.
//
// Vive aqui porque mais de uma tela usa: o /manager (com abas internas) e as
// páginas próprias como /manager/anuncios. Duplicar a barra seria duplicar a
// ordem dos botões, e ela já mudou duas vezes.

import { Link } from "react-router-dom";
import { useAuth } from "@/components/AuthProvider";

export function loadFonts() {
  if (typeof document === "undefined") return;
  if (document.querySelector("link[data-v10-fonts]")) return;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap";
  l.setAttribute("data-v10-fonts", "true");
  document.head.appendChild(l);
}

export type Aba = "tempo" | "time" | "leads" | "pastas" | "anuncios" | "disparar";

export const ICONES: Record<Aba, string> = {
  tempo: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 7v5l3.5 2",
  time: "M2.5 20c0-3.6 2.9-5.6 6.5-5.6s6.5 2 6.5 5.6M17 5.5a3 3 0 0 1 0 5.6M18.5 14.6c2 .7 3 2.4 3 5.4",
  leads: "M4 6h16M4 12h11M4 18h7",
  anuncios: "M3 17l5-6 4 3 5-8M14 6h4v4",
  disparar: "M21 11.5a8.4 8.4 0 0 1-12 7.6L3 21l1.9-5.7A8.4 8.4 0 1 1 21 11.5z",
  pastas: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
};

/** Ordem do dia do gerente (Junior, 15/09). Leads e B.I. vêm depois. */
export const ABAS: { k: Aba; label: string; to: string }[] = [
  { k: "tempo", label: "Tempo real", to: "/manager" },
  { k: "time", label: "Time", to: "/manager?aba=time" },
  { k: "leads", label: "Leads", to: "/manager/leads" },
  { k: "pastas", label: "Pastas", to: "/manager/pastas" },
  { k: "anuncios", label: "Anúncios", to: "/manager/anuncios" },
  { k: "disparar", label: "Disparar", to: "/manager/whatsapp" },
];

export function RailV10({
  atual, sub, mode, toggle, onAba, pip,
}: {
  atual: Aba;
  sub?: string;
  mode: "dark" | "light";
  toggle: () => void;
  /** quando a tela resolve a aba internamente (o /manager), em vez de navegar */
  onAba?: (k: Aba) => void;
  pip?: number;
}) {
  const { signOut } = useAuth();
  return (
    <nav className="rail" aria-label="Seções">
      <div className="rail-brand">
        <div className="rail-m">C</div>
        <div><b>Comandra</b>{sub ? <i>{sub}</i> : null}</div>
      </div>

      {ABAS.map((a) => {
        const on = a.k === atual;
        const conteudo = (
          <>
            <svg viewBox="0 0 24 24"><path d={ICONES[a.k]} /></svg>
            {a.label}
            {a.k === "tempo" && pip ? <i className="pip">{pip}</i> : null}
          </>
        );
        // As duas primeiras são abas internas do /manager quando estamos nele;
        // fora dele viram link, senão o clique não sai da página.
        return onAba && (a.k === "tempo" || a.k === "time") ? (
          <button key={a.k} type="button" className={`railb${on ? " on" : ""}`}
            aria-current={on ? "page" : undefined} onClick={() => onAba(a.k)}>
            {conteudo}
          </button>
        ) : (
          <Link key={a.k} to={a.to} className={on ? "on" : undefined}
            aria-current={on ? "page" : undefined}>
            {conteudo}
          </Link>
        );
      })}

      <div className="rail-sep" />
      <a className="soon" aria-disabled="true">
        <svg viewBox="0 0 24 24"><path d="M5 20V10M12 20V4M19 20v-7" /></svg>B.I.
      </a>

      <div className="rail-foot">
        {/* Sair não existia em tela nenhuma do v10: quem entrava no painel do
            gerente só saía fechando o navegador — e num computador de estande,
            compartilhado, isso deixa a sessão do gerente aberta para o próximo. */}
        <button className="railb sair" onClick={signOut} title="Sair da conta">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M15 17l5-5-5-5M20 12H9M12 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6" />
          </svg>
          Sair
        </button>
        <button className="icobtn" onClick={toggle} title="Alternar tema" aria-label="Alternar tema">
          {mode === "dark"
            ? <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="4.2" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></svg>
            : <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>}
        </button>
      </div>
    </nav>
  );
}
