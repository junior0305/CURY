// Menu lateral do painel (gerente/super/diretor). Modelo largo com grupos, rótulos, badge e card do usuário —
// recolhível para o rail de ícones. O original está guardado em RailV10.original.bak (restaurar = copiar de volta).
// Mantém as MESMAS rotas, props e lógica de navegação do original (ehSuper, onAba, destino, B.I., Diretoria/Admin).
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/contexts/ThemeContext";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

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

export const ABAS: { k: Aba; label: string; to: string }[] = [
  { k: "tempo", label: "Tempo real", to: "/manager" },
  { k: "time", label: "Time", to: "/manager?aba=time" },
  { k: "leads", label: "Leads", to: "/manager/leads" },
  { k: "pastas", label: "Pastas", to: "/manager/pastas" },
  { k: "disparar", label: "Disparar", to: "/manager/whatsapp" },
  { k: "estrategia", label: "Onde atacar", to: "/manager/estrategia" },
  { k: "config", label: "Configurar", to: "/manager/config" },
];

export const ABAS_SUPER: { k: Aba; label: string; to: string }[] = [
  { k: "tempo", label: "Painel Geral", to: "/super" },
  { k: "time", label: "Equipes", to: "/super?aba=time" },
  { k: "leads", label: "Leads", to: "/super?aba=leads" },
  { k: "pastas", label: "Pastas", to: "/super?aba=pastas" },
  { k: "disparar", label: "Disparar", to: "/manager/whatsapp" },
  { k: "estrategia", label: "Estratégia", to: "/super?aba=estrategia" },
  { k: "bi", label: "B.I.", to: "/super?aba=bi" },
  { k: "config", label: "Configurar", to: "/super?aba=config" },
];

// agrupamento e rótulo mais claro do menu largo (as rotas não mudam)
const GRUPO: Partial<Record<Aba, string>> = {
  tempo: "Comando", leads: "Comando", pastas: "Comando", time: "Comando", bi: "Comando",
  anuncios: "Mídia & Estratégia", disparar: "Mídia & Estratégia", estrategia: "Mídia & Estratégia",
  campanhas: "Mídia & Estratégia", plano: "Mídia & Estratégia", gastos: "Mídia & Estratégia",
  config: "Ajustes", integracoes: "Ajustes", regua: "Ajustes", plantao: "Ajustes",
};
const LABEL_LARGO: Partial<Record<Aba, string>> = {
  tempo: "Cockpit geral", leads: "Leads & esteira", pastas: "Pastas Caixa", time: "Tropa & presença",
  anuncios: "Anúncios Meta", disparar: "Disparos WhatsApp", estrategia: "Sala de guerra", config: "Configurações",
};
const ORDEM_GRUPO = ["Comando", "Mídia & Estratégia", "Ajustes", "Sistema"];
const svg = (d: string) => <svg viewBox="0 0 24 24"><path d={d} /></svg>;
const papel: Record<string, string> = { MANAGER: "Gestor", SUPERINTENDENT: "Superintendente", DIRECTOR: "Diretor", ADMIN: "Admin", BROKER: "Corretor" };

export function RailV10({ atual, sub, mode, toggle, onAba }: {
  atual: Aba; sub?: string; mode: "dark" | "light"; toggle: () => void; onAba?: (k: Aba) => void; pip?: number;
}) {
  const { signOut, role, session } = useAuth();
  const { preferLight } = useTheme();
  useEffect(() => { preferLight(); }, [preferLight]);
  const { pathname } = useLocation();
  const [recolhido, setRecolhido] = useState<boolean>(() => { try { return localStorage.getItem("cmd_menu_recolhido") === "1"; } catch { return false; } });
  const toggleRecolher = () => setRecolhido((v) => { const n = !v; try { localStorage.setItem("cmd_menu_recolhido", n ? "1" : "0"); } catch { /* */ } return n; });

  const ehSuper = role === "SUPERINTENDENT" || ((role === "DIRECTOR" || role === "ADMIN") && pathname.startsWith("/super"));
  const listaAbas = ehSuper ? ABAS_SUPER : ABAS;
  const uid = session?.user?.id;

  const { data: eu } = useQuery({
    queryKey: ["rail-eu", uid],
    enabled: !!uid, staleTime: 5 * 60_000,
    queryFn: async () => {
      const p = (await sb.from("profiles").select("first_name,last_name").eq("id", uid).maybeSingle()).data;
      const { count } = await sb.from("profiles").select("id", { count: "exact", head: true }).eq("manager_id", uid).eq("role", "BROKER").eq("is_active", true);
      return { nome: [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() || "Você", n: count ?? 0 };
    },
  });

  const destino = (a: { k: Aba; to: string }) => {
    if (ehSuper) return a.to;
    if (role === "DIRECTOR" || role === "ADMIN") return a.k === "tempo" ? "/diretor" : a.k === "time" ? "/super?aba=time" : a.to;
    return a.to;
  };

  // monta os itens (abas + B.I. + Diretoria/Admin) com grupo e rótulo
  type It = { key: string; label: string; grupo: string; icon: JSX.Element; on: boolean; aba?: Aba; to?: string; badge?: number };
  const itens: It[] = [];
  for (const a of listaAbas) {
    itens.push({ key: a.k, aba: a.k, to: destino(a), on: a.k === atual, grupo: GRUPO[a.k] ?? "Comando",
      label: ehSuper ? a.label : (LABEL_LARGO[a.k] ?? a.label), icon: svg(ICONES[a.k]) });
  }
  if (!ehSuper) itens.push({ key: "bi", aba: "bi", to: "/manager?aba=bi", on: atual === "bi", grupo: "Comando", label: "B.I.", icon: svg(ICONES.bi) });
  if (role === "ADMIN" || role === "DIRECTOR") itens.push({ key: "diretoria", to: "/diretor", on: false, grupo: "Sistema", label: "Diretoria", icon: svg("M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6") });
  if (role === "ADMIN") itens.push({ key: "admin", to: "/admin", on: false, grupo: "Sistema", label: "Admin", icon: svg("M15 18l-6-6 6-6") });

  const usaAba = (aba?: Aba, to?: string) => onAba && aba && ((ehSuper && (to ?? "").startsWith("/super")) || (!ehSuper && (aba === "tempo" || aba === "time" || aba === "bi")));
  const Item = (it: It) => {
    const conteudo = <>{it.icon}<span className="sb-lb">{it.label}</span>{it.badge ? <i className="sb-badge">{it.badge}</i> : null}</>;
    return usaAba(it.aba, it.to)
      ? <button key={it.key} type="button" className={`sb-item${it.on ? " on" : ""}`} aria-current={it.on ? "page" : undefined} onClick={() => onAba!(it.aba!)} title={it.label}>{conteudo}</button>
      : <Link key={it.key} to={it.to!} className={`sb-item${it.on ? " on" : ""}`} aria-current={it.on ? "page" : undefined} title={it.label}>{conteudo}</Link>;
  };

  return (
    <nav className={`sbnav${recolhido ? " recolhido" : ""}`} aria-label="Menu">
      <style>{CSS(recolhido)}</style>

      <div className="sb-brand">
        <div className="sb-logo" onClick={recolhido ? toggleRecolher : undefined} style={recolhido ? { cursor: "pointer" } : undefined} title={recolhido ? "Expandir menu" : "Comandra"} aria-label="Comandra">C</div>
        <div className="sb-bt"><b>Comandra</b>{sub ? <i>{sub}</i> : null}</div>
        <button className="sb-recolher" onClick={toggleRecolher} title={recolhido ? "Expandir menu" : "Recolher menu"} aria-label={recolhido ? "Expandir menu" : "Recolher menu"}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"><path d={recolhido ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} /></svg>
        </button>
      </div>

      <div className="sb-scroll">
        {ORDEM_GRUPO.map((g) => {
          const doGrupo = itens.filter((i) => i.grupo === g);
          if (!doGrupo.length) return null;
          return (
            <div className="sb-grupo" key={g}>
              <div className="sb-gh">{g}</div>
              {doGrupo.map(Item)}
            </div>
          );
        })}
      </div>

      <div className="sb-foot">
        <div className="sb-user" title={eu?.nome}>
          <span className="sb-av">{(eu?.nome ?? "?").slice(0, 2).toUpperCase()}</span>
          <div className="sb-ut"><b>{eu?.nome ?? "…"}{role ? ` (${papel[role] ?? role})` : ""}</b>
            <small><span className="sb-on" /> Online{eu?.n ? ` · ${eu.n} corretores` : ""}</small></div>
        </div>
        <div className="sb-fbtns">
          <button className="sb-mini" onClick={toggle} title="Alternar tema" aria-label="Alternar tema">
            {mode === "dark"
              ? <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="4.2" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></svg>
              : <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>}
          </button>
          <button className="sb-mini sair" onClick={signOut} title="Sair da conta" aria-label="Sair">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 17l5-5-5-5M20 12H9M12 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6" /></svg>
            <span className="sb-lb">Sair</span>
          </button>
        </div>
      </div>
    </nav>
  );
}

const CSS = (recolhido: boolean) => `
.mgr10.app2{grid-template-columns:${recolhido ? "72px" : "250px"} 1fr}
.sbnav{background:#0E1626;color:#C7D2E0;height:100%;display:flex;flex-direction:column;overflow:hidden;font-family:Archivo,system-ui,sans-serif;border-right:1px solid rgba(255,255,255,.05)}
.sb-brand{display:flex;align-items:center;gap:10px;padding:16px 14px 12px}
.sb-logo{width:40px;height:40px;flex:none;border-radius:12px;background:linear-gradient(135deg,#1CC6F2,#0E8FE0);color:#fff;font-size:22px;font-weight:800;display:grid;place-items:center;font-family:Archivo,sans-serif;box-shadow:0 3px 12px rgba(20,184,230,.4);user-select:none}
.sb-bt{flex:1;min-width:0}.sb-bt b{display:block;font-size:17px;font-weight:800;color:#fff;letter-spacing:-.02em}.sb-bt i{font-style:normal;font-size:11.5px;color:#7E8DA3;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sb-recolher{background:none;border:0;color:#7E8DA3;cursor:pointer;padding:4px;border-radius:7px;flex:none}
.sb-recolher:hover{background:rgba(255,255,255,.06);color:#fff}
.sb-scroll{flex:1;overflow-y:auto;overflow-x:hidden;padding:4px 10px 10px}
.sb-grupo{margin-top:14px}
.sb-gh{font-size:10.5px;font-weight:800;letter-spacing:.11em;text-transform:uppercase;color:#5A6880;padding:0 10px 7px}
.sbnav .sb-item{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:10px 11px;border-radius:11px;color:#AFBBCD;text-decoration:none;border:0;background:none;cursor:pointer;font-size:14.5px;font-weight:600;position:relative;transition:background .13s,color .13s}
.sbnav .sb-item:hover{background:rgba(255,255,255,.05);color:#fff}
.sbnav .sb-item.on{background:rgba(31,110,230,.16);color:#6FB0FF;box-shadow:inset 0 0 0 1px rgba(79,150,255,.3)}
.sbnav .sb-item svg{width:21px;height:21px;flex:none;stroke:currentColor;fill:none;stroke-width:1.8}
.sb-lb{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sb-badge{font-style:normal;font-family:"JetBrains Mono",monospace;font-size:11px;font-weight:700;background:#E2384B;color:#fff;border-radius:999px;padding:2px 8px;flex:none}
.sb-foot{border-top:1px solid rgba(255,255,255,.06);padding:10px}
.sb-user{display:flex;align-items:center;gap:10px;padding:8px;border-radius:12px;background:rgba(255,255,255,.04)}
.sb-av{width:38px;height:38px;border-radius:11px;background:#1E2C44;color:#8FB7FF;font-size:12px;font-weight:800;display:grid;place-items:center;flex:none;border:1px solid rgba(120,160,255,.25)}
.sb-ut{min-width:0}.sb-ut b{display:block;font-size:13.5px;font-weight:700;color:#EAF0F8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sb-ut small{font-size:11.5px;color:#49C988;display:flex;align-items:center;gap:5px}
.sb-on{width:7px;height:7px;border-radius:50%;background:#2FD07C;flex:none}
.sb-fbtns{display:flex;gap:8px;margin-top:8px}
.sbnav .sb-mini{display:flex;align-items:center;justify-content:center;gap:8px;min-height:38px;flex:1;border:0;border-radius:10px;background:rgba(255,255,255,.05);color:#AFBBCD;cursor:pointer;font:inherit;font-size:13px;font-weight:700}
.sbnav .sb-mini:hover{background:rgba(255,255,255,.1);color:#fff}
.sbnav .sb-mini.sair:hover{color:#FF9B9B}
/* recolhido = só ícones */
.sbnav.recolhido .sb-bt,.sbnav.recolhido .sb-gh,.sbnav.recolhido .sb-lb,.sbnav.recolhido .sb-badge,.sbnav.recolhido .sb-ut{display:none}
.sbnav.recolhido .sb-item{justify-content:center;padding:11px 0}
.sbnav.recolhido .sb-brand{flex-direction:column;justify-content:center;align-items:center;gap:8px;padding:14px 6px 10px}
.sbnav.recolhido .sb-recolher{background:rgba(255,255,255,.07);color:#fff;width:34px;height:30px;display:flex;align-items:center;justify-content:center}
.sbnav.recolhido .sb-user{justify-content:center;padding:8px 0;background:none}
.sbnav.recolhido .sb-fbtns{flex-direction:column}
@media(max-width:860px){.mgr10.app2{grid-template-columns:72px 1fr}
  .sbnav .sb-bt,.sbnav .sb-gh,.sbnav .sb-lb,.sbnav .sb-badge,.sbnav .sb-ut{display:none}
  .sbnav .sb-item{justify-content:center;padding:11px 0}.sbnav .sb-brand{justify-content:center}.sbnav .sb-user{justify-content:center;background:none}.sbnav .sb-fbtns{flex-direction:column}}
`;
