// O menu lateral do painel do gerente.
//
// Vive aqui porque mais de uma tela usa: o /manager (com abas internas) e as
// páginas próprias como /manager/anuncios. Duplicar a barra seria duplicar a
// ordem dos botões, e ela já mudou duas vezes.

import { Link, useLocation } from "react-router-dom";
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

export type Aba = "tempo" | "time" | "leads" | "pastas" | "anuncios" | "disparar" | "estrategia" | "plantao" | "integracoes" | "bi" | "regua" | "config" | "campanhas" | "plano" | "gastos";

export const ICONES: Record<Aba, string> = {
  tempo: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 7v5l3.5 2",
  time: "M2.5 20c0-3.6 2.9-5.6 6.5-5.6s6.5 2 6.5 5.6M17 5.5a3 3 0 0 1 0 5.6M18.5 14.6c2 .7 3 2.4 3 5.4",
  leads: "M4 6h16M4 12h11M4 18h7",
  anuncios: "M3 17l5-6 4 3 5-8M14 6h4v4",
  disparar: "M21 11.5a8.4 8.4 0 0 1-12 7.6L3 21l1.9-5.7A8.4 8.4 0 1 1 21 11.5z",
  pastas: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  estrategia: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  plantao: "M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zM9 9l2 2 4-4",
  integracoes: "M10 3v5M14 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4",
  bi: "M5 20V10M12 20V4M19 20v-7",
  regua: "M3 7h18v10H3zM7 7v4M11 7v6M15 7v4M19 7v6",
  campanhas: "M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15 9a3 3 0 0 1 0 6M18 6a7 7 0 0 1 0 12",
  plano: "M9 4h6v3H9zM6 6h12v15H6zM9 12h6M9 16h4",
  gastos: "M3 7h18v12H3zM3 10h18M16 15h2",
  config: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
};

/** Ordem do dia do gerente (Junior, 15/09). Leads e B.I. vêm depois. */
export const ABAS: { k: Aba; label: string; to: string }[] = [
  { k: "tempo", label: "Tempo real", to: "/manager" },
  { k: "time", label: "Time", to: "/manager?aba=time" },
  { k: "leads", label: "Leads", to: "/manager/leads" },
  { k: "pastas", label: "Pastas", to: "/manager/pastas" },
  { k: "disparar", label: "Disparar", to: "/manager/whatsapp" },
  { k: "estrategia", label: "Onde atacar", to: "/manager/estrategia" },
  { k: "config", label: "Configurar", to: "/manager/config" },
];

/** 6 Módulos Mestres do Superintendente (Cockpit Executivo sem sobreposição) */
export const ABAS_SUPER: { k: Aba; label: string; to: string }[] = [
  { k: "tempo", label: "Painel Geral", to: "/super" },
  { k: "estrategia", label: "Sala de Guerra", to: "/super?aba=estrategia" },
  { k: "pastas", label: "Pastas", to: "/super?aba=pastas" },
  { k: "leads", label: "Leads", to: "/super?aba=leads" },
  { k: "anuncios", label: "Mídia", to: "/super?aba=midia" },
  { k: "time", label: "Minha Tropa", to: "/super?aba=time" },
  { k: "bi", label: "B.I.", to: "/super?aba=bi" },
  { k: "config", label: "Configurar", to: "/super?aba=config" },
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
  const { signOut, role } = useAuth();
  const { pathname } = useLocation();
  // Diretor e admin abrindo o /super usam o mesmo menu do super (antes caíam no menu do gerente
  // e as abas do super apareciam como botões no alto da tela).
  const ehSuper = role === "SUPERINTENDENT" || ((role === "DIRECTOR" || role === "ADMIN") && pathname.startsWith("/super"));
  const listaAbas = ehSuper ? ABAS_SUPER : ABAS;

  const destino = (a: { k: Aba; to: string }) => {
    if (ehSuper) return a.to;
    if (role === "DIRECTOR" || role === "ADMIN") {
      return a.k === "tempo" ? "/diretor" : a.k === "time" ? "/super?aba=time" : a.to;
    }
    return a.to;
  };

  return (
    <nav className="rail" aria-label="Seções">
      <div className="rail-brand">
        <div className="rail-m">C</div>
        <div><b>Comandra</b>{sub ? <i>{sub}</i> : null}</div>
      </div>

      {listaAbas.map((a) => {
        const on = a.k === atual;
        const conteudo = (
          <>
            <svg viewBox="0 0 24 24"><path d={ICONES[a.k]} /></svg>
            {a.label}
            {a.k === "tempo" && pip ? <i className="pip">{pip}</i> : null}
          </>
        );
        // O /super resolve todas as abas na própria tela; o /manager só Tempo real e Time
        // (Leads, Pastas, Disparar... são páginas próprias). Sem isso, toda aba do gerente caía no B.I.
        return onAba && (ehSuper || a.k === "tempo" || a.k === "time") ? (
          <button key={a.k} type="button" className={`railb${on ? " on" : ""}`}
            aria-current={on ? "page" : undefined} onClick={() => onAba(a.k)}>
            {conteudo}
          </button>
        ) : (
          <Link key={a.k} to={destino(a)} className={on ? "on" : undefined}
            aria-current={on ? "page" : undefined}>
            {conteudo}
          </Link>
        );
      })}

      {!ehSuper && (
        <>
          <div className="rail-sep" />
          {onAba ? (
            <button type="button" className={`railb${atual === "bi" ? " on" : ""}`}
              aria-current={atual === "bi" ? "page" : undefined} onClick={() => onAba("bi")}>
              <svg viewBox="0 0 24 24"><path d={ICONES.bi} /></svg>B.I.
            </button>
          ) : (
            <Link to="/manager?aba=bi" className={atual === "bi" ? "on" : undefined}
              aria-current={atual === "bi" ? "page" : undefined}>
              <svg viewBox="0 0 24 24"><path d={ICONES.bi} /></svg>B.I.
            </Link>
          )}
        </>
      )}

      {role === "ADMIN" || role === "DIRECTOR" ? (
        <Link to="/diretor" title="Tela do diretor">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6" /></svg>Diretoria
        </Link>
      ) : null}
      {role === "ADMIN" ? (
        <Link to="/admin" title="Voltar para a área de admin">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M15 18l-6-6 6-6" /></svg>Admin
        </Link>
      ) : null}

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
