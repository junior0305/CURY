// Central de Leads & Performance — mockup final (v5) embutido (visual) + DADO REAL.
// O visual/markup vem de leadsMockup.ts (CSS/HTML/JS escopados em .mlr). Aqui ligamos os
// numeros reais: funil, pilulas de situacao, tabela de leads e o pulso do Hoje, respeitando
// o periodo escolhido e o escopo do usuario (gerente = sua equipe; super/diretor/admin = RLS).
import { useEffect, useRef, useCallback } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { RailV10, loadFonts } from "@/components/manager-v10/RailV10";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { toast } from "sonner";
import { CSS, HTML, JS } from "./leadsMockup";

// garante a data grudada no topo ao rolar + token --good p/ a tabela da justiça
const STY = `.mlr .sticky-header-bar{position:sticky;top:0;z-index:950;background:var(--bg)}.mlr{--good:#10B981}
/* valores/numeros que o mockup cravou em branco: usar o token de texto p/ ler no tema claro */
.mlr .ptile b,.mlr .bar-row .vl,.mlr .dchip .v,.mlr .sline b,.mlr .rep-top b,.mlr .prev-l b,.mlr .repopt b,.mlr .pz b,.mlr .fstep b,.mlr .trend-row b,.mlr .copilot-bar b,.mlr .fld select,.mlr .fld input,.mlr .fe-row select{color:var(--text-main)}`;

const sb = supabase as any;

type Lead = {
  id: string; name: string | null; phone: string | null;
  campanha_nome: string | null; source: string | null;
  broker_id: string | null; last_broker_whatsapp_at: string | null;
  visit_scheduled_at: string | null; status: string | null; created_at: string;
};

// ── helpers de apresentacao ───────────────────────────────────────────────
const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as any)[c]);
const arg = (s: any) => esc(s).replace(/['"]/g, " ");
const fone = (t: any) => {
  const d = String(t ?? "").replace(/\D/g, "").replace(/^55/, "");
  if (d.length >= 10) { const dd = d.slice(0, 2), r = d.slice(2); return `(${dd}) ${r.slice(0, r.length - 4)}-${r.slice(-4)}`; }
  return esc(t || "—");
};
const inic = (n: string) => (n || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0] || "").join("").toUpperCase() || "?";
const origemTxt = (l: Lead) => l.campanha_nome || ({ facebook_make: "Meta Ads", lista: "Lista", resgate: "Resgate", indicacao: "Indicação", instagram: "Instagram", whatsapp: "WhatsApp" } as any)[l.source || ""] || l.source || "—";
const tempoTxt = (l: Lead) => {
  const h = (Date.now() - new Date(l.created_at).getTime()) / 3600000;
  if (h < 1) return "há minutos"; if (h < 24) return `há ${Math.floor(h)}h`;
  const dias = Math.floor(h / 24); return `${dias} dia${dias > 1 ? "s" : ""}`;
};
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0) + "% conv.";
// situacao exclusiva por lead (p/ a tabela e os data-type dos filtros do mockup)
const situ = (l: Lead): ["avanco" | "vacuo" | "fantasma", string] => {
  if (l.last_broker_whatsapp_at) return ["avanco", "🟢 Em andamento"];
  if (l.broker_id) return ["vacuo", "🟡 No vácuo"];
  return ["fantasma", "🔴 Sem contato"];
};
// casa a pílula/etapa com o lead (bate com as contagens)
function segMatch(l: Lead, seg: string): boolean {
  const age2h = (Date.now() - new Date(l.created_at).getTime()) > 2 * 3600000;
  switch (seg) {
    case "fantasma": return !l.last_broker_whatsapp_at;                                 // Sem contato
    case "vacuo": return !!l.broker_id && !l.last_broker_whatsapp_at && age2h;           // No vácuo (>2h)
    case "avanco": return !!l.last_broker_whatsapp_at;                                   // Avanço (respondeu)
    case "visita": return !!l.visit_scheduled_at;                                        // etapa Visita
    case "retorno": return !!l.visit_scheduled_at && new Date(l.visit_scheduled_at).getTime() >= Date.now();
    default: return true;                                                                 // Todos
  }
}
function rowHtml(l: Lead, nm: Record<string, string>): string {
  const nome = esc(l.name || "Sem nome");
  const cor = l.broker_id ? esc(nm[l.broker_id] || "corretor") : "";
  const [bc, bt] = situ(l);
  const dcor = (l.broker_id ? (nm[l.broker_id] || "") : "sem").toLowerCase().split(" ")[0];
  const corTd = l.broker_id
    ? `<div style="display:flex;align-items:center;gap:8px"><div class="avatar-clean">${esc(inic(nm[l.broker_id] || ""))}</div><b>${cor}</b></div>`
    : `<span style="color:var(--text-dim)">Sem corretor</span>`;
  return `<tr data-type="${bc}" data-corretor="${esc(dcor)}">
    <td><input type="checkbox" class="lead-chk" onclick="updateBatchBar()" /></td>
    <td><b>${nome}</b><span class="mono" style="display:block;color:var(--text-dim);font-size:12px">${fone(l.phone)}</span></td>
    <td><span>${esc(origemTxt(l))}</span></td>
    <td>${corTd}</td>
    <td><span class="sit-badge ${bc}">${bt}</span></td>
    <td class="mono">${tempoTxt(l)}</td>
    <td><div class="action-btn-group">
      <button class="act-btn repassar" onclick="openModalRepassar('${arg(l.name || "Sem nome")}','${arg(origemTxt(l))}','${arg(cor || "—")}')">⚡ Repassar</button>
      <button class="act-btn cobrar" onclick="showToast('Cobrança enviada pelo chip do gerente')">💬 Cobrar</button>
      <button class="act-btn ver" onclick="openModalVer('${arg(l.id)}','${arg(l.name || "Sem nome")}','${arg(fone(l.phone))}','${arg(origemTxt(l))}','${arg(cor || "—")}','${arg(bt)}','${arg(tempoTxt(l))}','${arg(origemTxt(l))}')">👁️ Ver</button>
    </div></td>
  </tr>`;
}

// periodo (BR = UTC-3; meia-noite BR = 03:00 UTC)
function faixa(nome: string): [string, string] {
  const nb = new Date(Date.now() - 3 * 3600 * 1000);
  const y = nb.getUTCFullYear(), m = nb.getUTCMonth(), d = nb.getUTCDate();
  const dia = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm, dd, 3, 0, 0));
  const dow = (nb.getUTCDay() + 6) % 7; // 0 = segunda
  const agora = new Date();
  switch (nome) {
    case "Hoje": return [dia(y, m, d).toISOString(), agora.toISOString()];
    case "Semana Passada": return [dia(y, m, d - dow - 7).toISOString(), dia(y, m, d - dow).toISOString()];
    case "Este Mês": return [dia(y, m, 1).toISOString(), agora.toISOString()];
    case "Mês Passado": return [dia(y, m - 1, 1).toISOString(), dia(y, m, 1).toISOString()];
    case "Esta Semana": default: return [dia(y, m, d - dow).toISOString(), agora.toISOString()];
  }
}
// período equivalente anterior (p/ a Tendência "x passada")
function faixaAnt(nome: string): [string, string] {
  const nb = new Date(Date.now() - 3 * 3600 * 1000);
  const y = nb.getUTCFullYear(), m = nb.getUTCMonth(), d = nb.getUTCDate();
  const dia = (yy: number, mm: number, dd: number) => new Date(Date.UTC(yy, mm, dd, 3, 0, 0));
  const dow = (nb.getUTCDay() + 6) % 7;
  switch (nome) {
    case "Hoje": return [dia(y, m, d - 1).toISOString(), dia(y, m, d).toISOString()];
    case "Semana Passada": return [dia(y, m, d - dow - 14).toISOString(), dia(y, m, d - dow - 7).toISOString()];
    case "Este Mês": return [dia(y, m - 1, 1).toISOString(), dia(y, m - 1, Math.min(d, 28)).toISOString()];
    case "Mês Passado": return [dia(y, m - 2, 1).toISOString(), dia(y, m - 1, 1).toISOString()];
    case "Esta Semana": default: return [dia(y, m, d - dow - 7).toISOString(), dia(y, m, d - dow).toISOString()];
  }
}

export default function LeadsCentral() {
  const { mode, toggle } = useTheme();
  const { session, role } = useAuth() as any;
  const box = useRef<HTMLDivElement>(null);
  const injetado = useRef(false);
  const leadsRef = useRef<Lead[]>([]);
  const nmTabRef = useRef<Record<string, string>>({});
  const filtroRef = useRef<{ seg: string; page: number; q: string; cor: string }>({ seg: "todos", page: 1, q: "", cor: "" });
  const renderRef = useRef<() => void>(() => {});

  // escopo: gerente vê a própria equipe (manager_id); super/diretor/admin deixam o RLS filtrar,
  // salvo "entrar como / drill" (?manager=<id>), que limita àquele gerente.
  const manParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("manager") : null;
  const scopeManager: string | null =
    role === "MANAGER" ? (session?.user?.id ?? null)
    : (["SUPERINTENDENT", "ADMIN", "DIRECTOR"].includes(role) ? (manParam || null) : (session?.user?.id ?? null));

  const nomesRef = useRef<Record<string, string>>({});

  const brokers = useCallback(async () => {
    if (Object.keys(nomesRef.current).length) return nomesRef.current;
    let q = sb.from("profiles").select("id,first_name").eq("role", "BROKER");
    if (scopeManager) q = q.eq("manager_id", scopeManager);
    const { data } = await q;
    const map: Record<string, string> = {};
    (data ?? []).forEach((b: any) => { map[b.id] = b.first_name || "corretor"; });
    nomesRef.current = map;
    return map;
  }, [scopeManager]);

  // carrega funil + pílulas + tabela para um período
  // controla a TABELA (filtro por pílula/etapa, busca, corretor e paginação real)
  const renderTabela = useCallback(() => {
    const root = box.current; if (!root) return;
    const tb = root.querySelector("#leads-tbody"); if (!tb) return;
    const { seg, q, cor } = filtroRef.current;
    const nm = nmTabRef.current;
    let arr = leadsRef.current.filter((l) => segMatch(l, seg));
    if (q) { const s = q.toLowerCase(); arr = arr.filter((l) => (l.name || "").toLowerCase().includes(s) || (l.phone || "").includes(s) || origemTxt(l).toLowerCase().includes(s)); }
    if (cor) arr = arr.filter((l) => (l.broker_id ? (nm[l.broker_id] || "") : "").toLowerCase().split(" ")[0] === cor);
    const perPage = 50;
    const totalP = Math.max(1, Math.ceil(arr.length / perPage));
    const pg = Math.min(Math.max(1, filtroRef.current.page), totalP);
    filtroRef.current.page = pg;
    const slice = arr.slice((pg - 1) * perPage, pg * perPage);
    tb.innerHTML = slice.length ? slice.map((l) => rowHtml(l, nm)).join("") : `<tr><td colspan="7" style="padding:28px;text-align:center;color:var(--text-dim)">Nenhum lead neste filtro.</td></tr>`;
    // rodapé "Mostrando X a Y de Z" + paginação funcional
    let infoEl: HTMLElement | null = null;
    root.querySelectorAll<HTMLElement>("span").forEach((s) => { if ((s.textContent || "").trim().startsWith("Mostrando")) infoEl = s; });
    if (infoEl) {
      const ini = arr.length ? (pg - 1) * perPage + 1 : 0;
      const fim = Math.min(pg * perPage, arr.length);
      (infoEl as HTMLElement).innerHTML = `Mostrando <b>${ini} a ${fim} de ${arr.length.toLocaleString("pt-BR")} leads</b>`;
      const pagBox = (infoEl as HTMLElement).nextElementSibling as HTMLElement | null;
      if (pagBox) {
        const btn = (lbl: string, p: number, dis: boolean, atual = false) => `<button class="act-btn ${atual ? "repassar" : "ver"}" data-pg="${p}" ${dis ? "disabled" : ""}>${lbl}</button>`;
        let a = Math.max(1, pg - 1); const b = Math.min(totalP, a + 2); a = Math.max(1, b - 2);
        const nums: string[] = []; for (let i = a; i <= b; i++) nums.push(btn(String(i), i, false, i === pg));
        pagBox.innerHTML = btn("Anterior", pg - 1, pg <= 1) + nums.join("") + btn("Próximo", pg + 1, pg >= totalP);
        pagBox.querySelectorAll<HTMLButtonElement>("button[data-pg]").forEach((b2) => { if (!b2.disabled) b2.addEventListener("click", () => { filtroRef.current.page = +(b2.dataset.pg || "1"); renderRef.current(); }); });
      }
    }
  }, []);
  renderRef.current = renderTabela;

  const carregar = useCallback(async (nome: string) => {
    const root = box.current; if (!root) return;
    const [de, ate] = faixa(nome);
    let q = sb.from("leads")
      .select("id,name,phone,campanha_nome,source,broker_id,last_broker_whatsapp_at,visit_scheduled_at,status,created_at")
      .gte("created_at", de).lt("created_at", ate)
      .not("status", "in", "(EXCLUDED,ABANDONED)")
      .order("created_at", { ascending: false }).limit(5000);
    if (scopeManager) q = q.eq("manager_id", scopeManager);
    const [{ data }, nm] = await Promise.all([q, brokers()]);
    const ls = (data ?? []) as Lead[];
    leadsRef.current = ls; nmTabRef.current = nm;

    const total = ls.length;
    const resposta = ls.filter((l) => l.last_broker_whatsapp_at).length;
    const semToque = ls.filter((l) => l.broker_id && !l.last_broker_whatsapp_at &&
      (Date.now() - new Date(l.created_at).getTime()) > 2 * 3600000).length;
    const visita = ls.filter((l) => l.visit_scheduled_at).length;
    const semContato = ls.filter((l) => !l.last_broker_whatsapp_at).length;
    const avanco = resposta;
    const retorno = ls.filter((l) => l.visit_scheduled_at && new Date(l.visit_scheduled_at).getTime() >= Date.now()).length;

    // FUNIL
    const sc = root.querySelectorAll<HTMLElement>(".funnel-stage-card .stage-count");
    const cv = root.querySelectorAll<HTMLElement>(".funnel-stage-card .stage-conv-rate");
    if (sc[0]) sc[0].textContent = String(total);
    if (sc[1]) sc[1].textContent = String(resposta);
    if (sc[2]) sc[2].textContent = String(visita);
    if (sc[3]) sc[3].textContent = "—";
    if (sc[4]) sc[4].textContent = "—";
    if (cv[1]) cv[1].textContent = pct(resposta, total);
    if (cv[2]) cv[2].textContent = pct(visita, resposta);
    if (cv[3]) cv[3].textContent = "—";
    if (cv[4]) cv[4].textContent = "—";
    // sub-textos das etapas (CPL/previsão/VGV vêm de Facebook/Junix — marcados; sem toque e agendadas reais)
    const subs = root.querySelectorAll<HTMLElement>(".funnel-stage-card .stage-sub");
    if (subs[0]) subs[0].innerHTML = `<span>CPL médio: <b class="mono">—</b></span>`;
    if (subs[1]) subs[1].innerHTML = `<span>⚠️ <b>${semToque}</b> sem toque (&gt;2h)</span>`;
    if (subs[2]) subs[2].innerHTML = `<span>${visita} agendada${visita !== 1 ? "s" : ""}</span>`;
    if (subs[3]) subs[3].innerHTML = `<span>Previsão: <b>—</b> (Junix)</span>`;
    if (subs[4]) subs[4].innerHTML = `<span>VGV: <b>—</b> (Junix)</span>`;

    // PÍLULAS (ordem: todos, sem contato, vácuo, avanço, retorno)
    const pb = root.querySelectorAll<HTMLElement>(".pill-health .tab-badge");
    const pv = [total, semContato, semToque, avanco, retorno];
    pb.forEach((el, i) => { if (pv[i] != null) el.textContent = String(pv[i]); });
    const tabB = root.querySelectorAll<HTMLElement>(".lead-tab-btn .tab-badge");
    if (tabB[1]) tabB[1].textContent = total.toLocaleString("pt-BR");

    // opções reais do seletor de corretor
    const selCor = root.querySelector<HTMLSelectElement>("#select-corretor");
    if (selCor) {
      const nomes = [...new Set(ls.filter((l) => l.broker_id).map((l) => (nm[l.broker_id!] || "").split(" ")[0]).filter(Boolean))].sort();
      selCor.innerHTML = `<option value="">Todos os Corretores</option>` + nomes.map((n) => `<option value="${esc(n.toLowerCase())}">${esc(n)}</option>`).join("");
    }

    // TABELA — reset do filtro e render (controlada por renderTabela)
    filtroRef.current = { seg: "todos", page: 1, q: "", cor: "" };
    renderRef.current();

    // COPILOTO (topo) — insight real simples: corretor com mais leads sem toque
    const porCorretor: Record<string, number> = {};
    ls.forEach((l) => { if (l.broker_id && !l.last_broker_whatsapp_at) porCorretor[l.broker_id] = (porCorretor[l.broker_id] || 0) + 1; });
    const pior = Object.entries(porCorretor).sort((a, b) => b[1] - a[1])[0];
    root.querySelectorAll<HTMLElement>(".copilot-bar .cb-tx").forEach((cop) => {
      const txt = pior
        ? `${esc(nm[pior[0]] || "corretor")} com ${pior[1]} sem toque · ${total} leads no período · ${semContato} sem contato`
        : `${total} leads no período · ${semContato} sem contato · ${resposta} responderam`;
      cop.innerHTML = `<b>Copiloto</b> — ${txt}`;
    });
  }, [scopeManager, brokers]);

  // pulso do Hoje (sempre "hoje", independente do período do funil)
  const pulso = useCallback(async () => {
    const root = box.current; if (!root) return;
    const [de] = faixa("Hoje");
    let q = sb.from("leads").select("broker_id,last_broker_whatsapp_at,represa_at,regiao_interesse")
      .gte("created_at", de).not("status", "in", "(EXCLUDED,ABANDONED)");
    if (scopeManager) q = q.eq("manager_id", scopeManager);
    const { data } = await q;
    const ls = (data ?? []) as any[];
    const entraram = ls.length;
    const distribuidos = ls.filter((l) => l.broker_id).length;
    const represados = ls.filter((l) => l.represa_at && !l.broker_id).length;
    const semDono = ls.filter((l) => !l.broker_id && !l.represa_at).length;
    const vacuo = ls.filter((l) => l.broker_id && !l.last_broker_whatsapp_at).length;
    const pz = root.querySelectorAll<HTMLElement>(".pulso .pz b");
    if (pz.length >= 4) { pz[0].textContent = String(entraram); pz[1].textContent = String(distribuidos); pz[2].textContent = String(represados); pz[3].textContent = String(vacuo); }
    // escopa as linhas ao painel "Leads esperando soltar" (há .rep-row em outros lugares)
    let repPanel: Element | null = null;
    root.querySelectorAll(".panel-box").forEach((p) => { const h = p.querySelector("h3"); if (h && /esperando soltar/i.test(h.textContent || "")) repPanel = p; });
    const reps = repPanel ? (repPanel as Element).querySelectorAll(".rep-row") : root.querySelectorAll(".rep-row");
    const setRep = (el: Element | undefined, n: number, label: string, btn: string) => {
      if (!el) return;
      const b = el.querySelector("b"); if (b) b.textContent = `${n} ${label}`;
      const bt = el.querySelector(".act-btn"); if (bt) bt.textContent = `${btn} (${n})`;
    };
    setRep(reps[0], represados, "segurados", "Soltar");
    setRep(reps[1], semDono, "sem dono", "Direcionar");
    // o botão "Soltar" solta de verdade (represados_acao) — necessário p/ a Antonia
    const sBtn = reps[0]?.querySelector(".act-btn");
    if (sBtn) sBtn.setAttribute("onclick", "event.stopPropagation();window.__soltarRepresados&&window.__soltarRepresados()");
    const dBtn = reps[1]?.querySelector(".act-btn");
    if (dBtn) dBtn.setAttribute("onclick", "event.stopPropagation();window.__direcionarSemDono&&window.__direcionarSemDono()");
    // prévia "se soltar agora" — sem nomes fictícios
    const r1 = root.querySelector("#rec-r1");
    if (r1) r1.innerHTML = `<span class="mini-lbl">${represados ? `Se soltar agora, os ${represados} represados vão para os corretores presentes, em rodízio.` : "Nenhum lead represado no momento."}</span>`;
    const r2 = root.querySelector("#rec-r2");
    if (r2) r2.innerHTML = `<span class="mini-lbl">${semDono ? `Os ${semDono} sem dono vão para a fila exclusiva do formulário.` : "Nenhum lead sem dono no momento."}</span>`;

    // selos das abas: Hoje = "p/ resolver" (represados + sem dono); Mídia não tem contagem real → oculta
    const tabB = root.querySelectorAll<HTMLElement>(".lead-tab-btn .tab-badge");
    if (tabB[0]) tabB[0].textContent = `${represados + semDono} p/ resolver`;
    if (tabB[2]) tabB[2].style.display = "none";

    // Entrada de hoje por região (real)
    const panels = root.querySelectorAll(".panel-box");
    let entP: Element | null = null;
    panels.forEach((p) => { const h = p.querySelector("h3"); if (h && /entrada de hoje/i.test(h.textContent || "")) entP = p; });
    if (entP) {
      const sub = entP.querySelector(".panel-header span");
      if (sub) sub.textContent = `${entraram} entraram · ${distribuidos} distribuídos`;
      const porReg: Record<string, number> = {};
      ls.forEach((l) => { const r = (l.regiao_interesse || "").trim() || "Sem região"; porReg[r] = (porReg[r] || 0) + 1; });
      const ord = Object.entries(porReg).sort((a, b) => b[1] - a[1]).slice(0, 6);
      const max = ord.length ? ord[0][1] : 1;
      const body = entP.querySelector(".panel-header")?.nextElementSibling as HTMLElement | null;
      if (body) {
        body.innerHTML = ord.length
          ? ord.map(([r, n]) => `<div class="bar-row"><span class="nm">${esc(r)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round((n / max) * 100)}%"></div></div><span class="vl">${n}</span></div>`).join("")
          : `<div style="padding:14px;color:var(--text-dim)">Nenhum lead hoje ainda.</div>`;
      }
    }
  }, [scopeManager]);

  // "A distribuição está justa?" — por corretor, hoje (recebeu × respondeu de verdade × situação)
  const justica = useCallback(async () => {
    const root = box.current; if (!root) return;
    const panels = root.querySelectorAll(".panel-box");
    let tbody: HTMLElement | null = null;
    let painel: Element | null = null;
    panels.forEach((p) => { const h = p.querySelector("h3"); if (h && /distribui.*just/i.test(h.textContent || "")) { tbody = p.querySelector("tbody"); painel = p; } });
    if (!tbody) return;
    const setFoot = (html: string) => { const f = painel?.querySelector("p"); if (f) f.innerHTML = html; };
    const [de] = faixa("Hoje");
    let lq = sb.from("leads").select("broker_id,last_broker_whatsapp_at").gte("created_at", de).not("status", "in", "(EXCLUDED,ABANDONED)");
    if (scopeManager) lq = lq.eq("manager_id", scopeManager);
    let pq = sb.from("profiles").select("id,first_name,manager_id").eq("role", "BROKER");
    if (scopeManager) pq = pq.eq("manager_id", scopeManager);
    const [{ data: ld }, { data: pf }] = await Promise.all([lq, pq]);
    const leads = (ld ?? []) as any[];
    const nomeP: Record<string, string> = {}, mgrOf: Record<string, string | null> = {};
    (pf ?? []).forEach((p: any) => { nomeP[p.id] = p.first_name || "corretor"; mgrOf[p.id] = p.manager_id || null; });
    const g: Record<string, { rec: number; resp: number }> = {};
    leads.forEach((l: any) => { if (!l.broker_id) return; const o = g[l.broker_id] || (g[l.broker_id] = { rec: 0, resp: 0 }); o.rec++; if (l.last_broker_whatsapp_at) o.resp++; });
    let rows = Object.entries(g).map(([id, o]) => ({ id, nome: nomeP[id] || "corretor", mgr: mgrOf[id], rec: o.rec, resp: o.resp })).filter((r) => r.rec > 0);
    if (!rows.length) { tbody.innerHTML = `<tr><td colspan="5" style="padding:18px;color:var(--text-dim)">Ninguém recebeu lead ainda hoje.</td></tr>`; setFoot("Ninguém recebeu lead ainda hoje — sem distribuição pra avaliar."); return; }
    const media = rows.reduce((s, r) => s + r.rec, 0) / rows.length;
    const mgrIds = [...new Set(rows.map((r) => r.mgr).filter(Boolean))] as string[];
    const mgrName: Record<string, string> = {};
    if (mgrIds.length) { const { data: mn } = await sb.from("profiles").select("id,first_name").in("id", mgrIds); (mn ?? []).forEach((m: any) => { mgrName[m.id] = m.first_name; }); }
    const cl = (r: typeof rows[0]) => (r.rec >= media + 4 && r.resp < r.rec * 0.5) ? "afog" : (media >= 4 && r.rec <= Math.max(1, Math.floor(media - 4))) ? "pul" : "ok";
    rows.sort((a, b) => (cl(b) === "afog" ? 1 : 0) - (cl(a) === "afog" ? 1 : 0) || b.rec - a.rec);
    tbody.innerHTML = rows.map((r) => {
      const c = cl(r);
      const sit = c === "afog" ? "afogado" : c === "pul" ? "sendo pulado" : "equilibrado";
      const col = c === "afog" ? "var(--rose)" : c === "pul" ? "var(--amber)" : "var(--good)";
      const dot = r.resp < r.rec * 0.5 ? "var(--rose)" : "var(--good)";
      const sub = r.mgr && mgrName[r.mgr] ? ` <span style="color:var(--text-dim)">· ${esc(mgrName[r.mgr])}</span>` : "";
      return `<tr><td><b>${esc(r.nome)}</b>${sub}</td><td class="mono">${r.rec}</td><td><span style="color:${dot};font-weight:700">● ${r.resp}</span></td><td><span style="color:${col};font-weight:700">${sit}</span></td><td></td></tr>`;
    }).join("");
    const afog = rows.filter((r) => cl(r) === "afog"), pul = rows.filter((r) => cl(r) === "pul");
    const pontos = afog.length + pul.length;
    if (pontos) {
      const na = afog.slice(0, 2).map((r) => esc(r.nome)).join(", "), np = pul.slice(0, 2).map((r) => esc(r.nome)).join(", ");
      setFoot(`<b>${pontos} ponto${pontos > 1 ? "s" : ""} de atenção</b> (de ${rows.length} que receberam hoje). ${afog.length ? `${na} afogado${afog.length > 1 ? "s" : ""}; ` : ""}${pul.length ? `${np} sendo pulado${pul.length > 1 ? "s" : ""}. ` : ""}`);
    } else setFoot(`${rows.length} corretor${rows.length > 1 ? "es" : ""} receberam hoje — distribuição equilibrada.`);
  }, [scopeManager]);

  // RESULTADOS — tudo real a partir dos leads do período (tendência, conversão por canal,
  // quem mais transforma, 1ª resposta). Venda/meta/custo marcados (Junix/Facebook).
  const resultados = useCallback(async (nome: string) => {
    const root = box.current; if (!root) return;
    const view = root.querySelector("#view-resultados"); if (!view) return;
    const [de, ate] = faixa(nome), [pde, pate] = faixaAnt(nome);
    const campos = "source,broker_id,last_broker_whatsapp_at,visit_scheduled_at,created_at,primeiro_contato_em,atribuido_em";
    const qAtual = () => { let q = sb.from("leads").select(campos).gte("created_at", de).lt("created_at", ate).not("status", "in", "(EXCLUDED,ABANDONED)").limit(20000); if (scopeManager) q = q.eq("manager_id", scopeManager); return q; };
    const qPrev = () => { let q = sb.from("leads").select("last_broker_whatsapp_at,visit_scheduled_at").gte("created_at", pde).lt("created_at", pate).not("status", "in", "(EXCLUDED,ABANDONED)").limit(20000); if (scopeManager) q = q.eq("manager_id", scopeManager); return q; };
    let pq = sb.from("profiles").select("id,first_name,manager_id").eq("role", "BROKER");
    if (scopeManager) pq = pq.eq("manager_id", scopeManager);
    const [{ data: dA }, { data: dP }, { data: pf }] = await Promise.all([qAtual(), qPrev(), pq]);
    const ls = (dA ?? []) as any[], prev = (dP ?? []) as any[];
    const nmP: Record<string, string> = {}, mgrOf: Record<string, string | null> = {};
    (pf ?? []).forEach((p: any) => { nmP[p.id] = p.first_name || "corretor"; mgrOf[p.id] = p.manager_id || null; });
    const pctN = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
    const deltaN = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : 0);
    const find = (re: RegExp) => { let r: Element | null = null; view.querySelectorAll(".panel-box").forEach((p) => { const h = p.querySelector("h3"); if (h && re.test(h.textContent || "")) r = p; }); return r; };

    const total = ls.length, resp = ls.filter((l) => l.last_broker_whatsapp_at).length, vis = ls.filter((l) => l.visit_scheduled_at).length;
    const pTotal = prev.length, pResp = prev.filter((l) => l.last_broker_whatsapp_at).length, pVis = prev.filter((l) => l.visit_scheduled_at).length;

    // TENDÊNCIA
    const tp = find(/tend/i);
    if (tp) {
      const rows = tp.querySelectorAll<HTMLElement>(".trend-row");
      const setRow = (el: HTMLElement | undefined, val: string, up: boolean | null, delta: string) => {
        if (!el) return;
        const bb = el.querySelector("b"); if (bb) bb.textContent = val;
        const tr = el.querySelector(".tr"); if (tr) { tr.textContent = delta; (tr as HTMLElement).className = "tr " + (up == null ? "" : up ? "up" : "down"); }
      };
      setRow(rows[0], total.toLocaleString("pt-BR"), total >= pTotal, `${total >= pTotal ? "↑" : "↓"} ${Math.abs(deltaN(total, pTotal))}%`);
      setRow(rows[1], pctN(resp, total) + "%", pctN(resp, total) >= pctN(pResp, pTotal), `${pctN(resp, total) >= pctN(pResp, pTotal) ? "↑" : "↓"} ${Math.abs(pctN(resp, total) - pctN(pResp, pTotal))}pp`);
      setRow(rows[2], String(vis), vis >= pVis, `${vis >= pVis ? "↑" : "↓"} ${Math.abs(deltaN(vis, pVis))}%`);
      setRow(rows[3], "—", null, "Junix");
      const rod = tp.querySelector("p"); if (rod) rod.textContent = pctN(resp, total) < pctN(pResp, pTotal) ? "A % de resposta caiu — time atendendo pior, não lead pior." : "A % de resposta está estável ou subindo.";
    }

    // DO LEAD ATÉ A VENDA — onde cai (Leads/Responderam/Visita reais; Pasta/Venda = Junix)
    const fp = find(/do lead|onde cai/i);
    if (fp) {
      const steps = fp.querySelectorAll<HTMLElement>(".fstep b");
      if (steps[0]) steps[0].textContent = total.toLocaleString("pt-BR");
      if (steps[1]) steps[1].innerHTML = `${resp} <i>${pctN(resp, total)}%</i>`;
      if (steps[2]) steps[2].innerHTML = `${vis} <i>${pctN(vis, total)}%</i>`;
      if (steps[3]) steps[3].innerHTML = `— <i>Junix</i>`;
      if (steps[4]) steps[4].innerHTML = `— <i>Junix</i>`;
      const fpp = fp.querySelector("p"); if (fpp) fpp.innerHTML = `O maior tombo é de <b>lead → resposta</b> (${100 - pctN(resp, total)}% não respondem). É onde o SLA de 1ª resposta mais pesa.`;
    }

    // CONVERSÃO POR CANAL
    const canalDe = (s: string) => (({ facebook_make: "📣 Anúncio (Meta)", lista: "🎣 Pescaria (repesca)", resgate: "♻️ Resgate", disparo: "📢 Disparo WhatsApp", whatsapp: "📢 Disparo WhatsApp", discador: "📞 Discador (ligações)", plantao: "🏪 Plantão (estande)", checkin: "🏪 Plantão (estande)", indicacao: "🤝 Indicação" } as any)[s] || (s || "Outros"));
    const porCanal: Record<string, { n: number; r: number; v: number }> = {};
    ls.forEach((l) => { const c = canalDe(l.source); const o = porCanal[c] || (porCanal[c] = { n: 0, r: 0, v: 0 }); o.n++; if (l.last_broker_whatsapp_at) o.r++; if (l.visit_scheduled_at) o.v++; });
    const cp = find(/convers.*canal/i);
    if (cp) { const tb = cp.querySelector("tbody"); if (tb) { const arr = Object.entries(porCanal).sort((a, b) => b[1].n - a[1].n);
      tb.innerHTML = arr.length ? arr.map(([c, o]) => { const rp = pctN(o.r, o.n), vp = pctN(o.v, o.n); const bom = rp >= 25, ruim = rp < 15; const ver = bom ? "melhor retorno" : ruim ? "o que menos converte" : "volume, qualidade média"; const col = bom ? "var(--good)" : ruim ? "var(--rose)" : "var(--amber)"; return `<tr><td><b>${esc(c)}</b></td><td class="mono">${o.n}</td><td class="mono" style="color:${col}">${rp}%</td><td class="mono">${vp}%</td><td class="mono" style="color:var(--text-dim)">—</td><td><span style="color:${col};font-weight:700">${ver}</span></td></tr>`; }).join("") : `<tr><td colspan="6" style="padding:16px;color:var(--text-dim)">Sem leads no período.</td></tr>`;
    }}

    // QUEM MAIS TRANSFORMA
    const porB: Record<string, { n: number; v: number }> = {};
    ls.forEach((l) => { if (!l.broker_id) return; const o = porB[l.broker_id] || (porB[l.broker_id] = { n: 0, v: 0 }); o.n++; if (l.visit_scheduled_at) o.v++; });
    const qt = find(/quem mais transforma/i);
    if (qt) { const tb = qt.querySelector("tbody"); if (tb) {
      const arr = Object.entries(porB).filter(([, o]) => o.n >= 5).map(([id, o]) => ({ id, n: o.n, taxa: o.v / o.n })).sort((a, b) => b.taxa - a.taxa).slice(0, 8);
      const mgrIds = [...new Set(arr.map((r) => mgrOf[r.id]).filter(Boolean))] as string[];
      const mgrN: Record<string, string> = {};
      if (mgrIds.length) { const { data: mn } = await sb.from("profiles").select("id,first_name").in("id", mgrIds); (mn ?? []).forEach((m: any) => { mgrN[m.id] = m.first_name; }); }
      tb.innerHTML = arr.length ? arr.map((r) => { const mg = mgrOf[r.id] && mgrN[mgrOf[r.id]!] ? ` <span style="color:var(--text-dim)">· ${esc(mgrN[mgrOf[r.id]!])}</span>` : ""; return `<tr><td><b>${esc(nmP[r.id] || "corretor")}</b>${mg}</td><td class="mono">${r.n} leads</td><td><span style="color:var(--good);font-weight:700">${Math.round(r.taxa * 100)}% viram visita</span></td></tr>`; }).join("") : `<tr><td colspan="3" style="padding:16px;color:var(--text-dim)">Ainda sem dados suficientes.</td></tr>`;
    }}

    // 1ª RESPOSTA — VELOCIDADE
    const difs = ls.filter((l) => l.primeiro_contato_em && l.atribuido_em).map((l) => (new Date(l.primeiro_contato_em).getTime() - new Date(l.atribuido_em).getTime()) / 60000).filter((x) => x >= 0 && x < 60 * 72);
    const vpnl = find(/resposta.*velocidade|1ª resposta/i);
    if (vpnl) { const body = vpnl.querySelector(".panel-header")?.nextElementSibling as HTMLElement | null; const big = body?.firstElementChild as HTMLElement | null;
      if (big) big.textContent = difs.length ? (() => { const med = difs.reduce((s, x) => s + x, 0) / difs.length; return med < 60 ? `${Math.round(med)} min` : `${(med / 60).toFixed(1)} h`; })() : "—";
    }

    // per-note + neutraliza meta/custo (Junix/Facebook)
    const note = view.querySelector<HTMLElement>(".per-note");
    if (note) note.innerHTML = `📊 O que está dando resultado — período <b>${esc(nome)}</b>. Troque o período lá em cima pra recalcular.`;
    view.querySelectorAll<HTMLElement>(".panel-box").forEach((p) => {
      const h = p.querySelector("h3")?.textContent || "";
      if (/meta de/i.test(h) || /custo/i.test(h)) {
        if (!p.querySelector(".em-breve")) {
          const body = p.querySelector(".panel-header")?.nextElementSibling as HTMLElement | null;
          const nota = `<div class="em-breve" style="padding:18px;color:var(--text-dim);font-size:13px;line-height:1.5">Dado real em breve — depende de vendas/pastas (Junix) e gasto de mídia (Facebook).</div>`;
          if (body) body.outerHTML = nota; else p.insertAdjacentHTML("beforeend", nota);
        }
      }
    });
  }, [scopeManager]);

  // MÍDIA & FILAS — cards do mockup populados com as filas REAIS (formularios_catalogo + distribution_queues)
  const filas = useCallback(async () => {
    const root = box.current; if (!root) return;
    const grid = root.querySelector("#view-filas .queues-grid");
    const sel = root.querySelector<HTMLSelectElement>("#view-filas select");
    if (!grid && !sel) return;
    let arvore: string[] | null = null;
    if (scopeManager) {
      const { data } = await sb.rpc("ids_da_arvore", { p: scopeManager });
      arvore = (data ?? []).map((r: any) => (typeof r === "string" ? r : r.ids_da_arvore));
    }
    const [de] = faixa("Hoje");
    let lq = sb.from("leads").select("fb_form_id").gte("created_at", de).not("status", "in", "(EXCLUDED,ABANDONED)");
    if (scopeManager) lq = lq.eq("manager_id", scopeManager);
    let pq = sb.from("profiles").select("id,first_name").eq("role", "BROKER");
    if (scopeManager) pq = pq.eq("manager_id", scopeManager);
    const [{ data: cat }, { data: qs }, { data: lf }, { data: pf }] = await Promise.all([
      sb.from("formularios_catalogo").select("form_id,page_id,nome,nome_fonte,status,leads_7d,anuncio_ativo,owner_id"),
      sb.from("distribution_queues").select("match_value,broker_ids").eq("match_field", "form_id").eq("is_active", true),
      lq, pq,
    ]);
    let forms = (cat ?? []) as any[];
    if (arvore) forms = forms.filter((f) => !f.owner_id || arvore!.includes(f.owner_id));
    const hojePorForm: Record<string, number> = {};
    (lf ?? []).forEach((l: any) => { if (l.fb_form_id) hojePorForm[l.fb_form_id] = (hojePorForm[l.fb_form_id] || 0) + 1; });
    const qByForm: Record<string, string[]> = {};
    (qs ?? []).forEach((q: any) => { qByForm[q.match_value] = q.broker_ids || []; });
    const nm: Record<string, string> = {};
    (pf ?? []).forEach((p: any) => { nm[p.id] = p.first_name || "corretor"; });
    const mostrar = forms.filter((f) => f.anuncio_ativo || qByForm[f.form_id]);
    const optsBrokers = Object.entries(nm).sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => `<option value="${id}">${esc(n)}</option>`).join("");
    if (sel) sel.innerHTML = mostrar.length
      ? mostrar.map((f) => `<option value="${esc(f.form_id)}">Formulário — ${esc(f.nome || f.nome_fonte || f.form_id)}</option>`).join("")
      : `<option>Nenhum formulário ativo</option>`;
    if (grid) {
      grid.innerHTML = mostrar.length ? mostrar.slice(0, 24).map((f) => {
        const brokers = qByForm[f.form_id] || [];
        const ativa = brokers.length > 0;
        const chips = brokers.length
          ? brokers.slice(0, 12).map((id) => `<span class="broker-chip"><span class="dot"></span> ${esc(nm[id] || "corretor")} <button class="chip-x" title="remover" onclick="window.__filaRemover&&window.__filaRemover('${esc(f.form_id)}','${id}')">×</button></span>`).join("")
          : `<span style="color:var(--text-dim)">— sem corretores dedicados —</span>`;
        const hoje = hojePorForm[f.form_id] || 0;
        return `<div class="queue-form-card" data-form="${esc(f.form_id)}" data-page="${esc(f.page_id || "")}" data-nome="${esc(f.nome || f.nome_fonte || "")}" data-brokers='${esc(JSON.stringify(brokers))}'>
          <div class="queue-form-top"><div>
            <span class="queue-form-title">${esc(f.nome || f.nome_fonte || "Formulário")}</span>
            <span class="queue-form-sub">${ativa ? "rodízio exclusivo" : "sem fila · roleta do plantão"}</span>
          </div><span class="sit-badge ${ativa ? "retorno" : "vacuo"}">${ativa ? "🟢 Ativa" : "⚠️ Sem fila"}</span></div>
          <div style="margin-top:8px"><span>👥 ${brokers.length} corretores na roleta · <b>${hoje} leads hoje</b></span>
          <div class="queue-brokers-chips" style="margin-top:8px">${chips}</div></div>
          <div style="margin-top:8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <select class="fila-add-sel" style="background:var(--surface-subtle);border:1px solid var(--border);border-radius:8px;padding:6px 8px;color:var(--text-main);font-size:12px;max-width:170px"><option value="">+ corretor…</option>${optsBrokers}</select>
            <button class="act-btn ver" onclick="window.__filaAdd&&window.__filaAdd(this)">Adicionar</button>
          </div>
          <div style="margin-top:6px;color:var(--text-dim);font-size:11.5px">Tirando todos os corretores, os leads deste formulário voltam para a <b>roleta do plantão</b>.</div>
          <div style="margin-top:8px;color:var(--text-dim);font-size:12px">${f.leads_7d ?? 0} leads em 7d</div>
        </div>`;
      }).join("") : `<div style="padding:16px;color:var(--text-dim)">Nenhum formulário ativo com fila nesta estrutura.</div>`;
    }
    // botão "Criar fila" (topo) — liga a roleta da equipe pro formulário selecionado
    const criarBtn = Array.from(root.querySelectorAll<HTMLButtonElement>("#view-filas button")).find((b) => (b.textContent || "").trim() === "Criar fila");
    if (criarBtn) criarBtn.setAttribute("onclick", "window.__filaCriar&&window.__filaCriar()");
  }, [scopeManager]);

  // ANÚNCIOS (META) — painel do mockup populado com gasto/CPL reais (fb_saude)
  const anuncios = useCallback(async () => {
    const root = box.current; if (!root) return;
    const sub = root.querySelector("#sub-anuncios"); if (!sub) return;
    let arvore: string[] | null = null;
    if (scopeManager) { const { data } = await sb.rpc("ids_da_arvore", { p: scopeManager }); arvore = (data ?? []).map((r: any) => (typeof r === "string" ? r : r.ids_da_arvore)); }
    const { data: fs } = await sb.from("fb_saude").select("dono_id,dados");
    let rows = (fs ?? []) as any[];
    if (arvore) rows = rows.filter((r) => !r.dono_id || arvore!.includes(r.dono_id));
    const camps: any[] = [];
    rows.forEach((r) => { const cs = r.dados?.campanhas; if (Array.isArray(cs)) cs.forEach((c: any) => camps.push(c)); });
    const comGasto = camps.filter((c) => (c.gasto || 0) > 0 || (c.leads || 0) > 0);
    const cpl = (c: any) => (c.leads > 0 ? (c.gasto || 0) / c.leads : 0);
    const brl = (n: number) => "R$ " + (n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

    const tb = sub.querySelector(".leads-table tbody");
    if (tb) {
      const arr = comGasto.slice().sort((a, b) => (b.gasto || 0) - (a.gasto || 0)).slice(0, 30);
      tb.innerHTML = arr.length ? arr.map((c) => `<tr>
        <td><b>${esc(c.nome || "Campanha")}</b><span style="display:block;color:var(--text-dim);font-size:12px">Meta Ads</span></td>
        <td class="mono">${brl(c.gasto || 0)}</td>
        <td class="mono">${c.leads > 0 ? brl(cpl(c)) : "—"}</td>
        <td class="mono">${c.leads || 0} leads</td>
        <td class="mono" style="color:var(--text-dim)">—</td>
        <td class="mono" style="color:var(--text-dim)">—</td>
        <td><div class="action-btn-group"><button class="act-btn ver" onclick="showToast('${esc((c.nome || "Campanha").replace(/['"]/g, " "))}')">👁️ Ver</button></div></td>
      </tr>`).join("") : `<tr><td colspan="7" style="padding:16px;color:var(--text-dim)">Sem gasto de mídia nesta estrutura (fb_saude vazio).</td></tr>`;
    }

    const comCpl = comGasto.filter((c) => c.leads > 0).sort((a, b) => cpl(b) - cpl(a));
    const media = comCpl.length ? comCpl.reduce((s, c) => s + cpl(c), 0) / comCpl.length : 0;
    const setCard = (cls: string, show: boolean, titulo?: string, texto?: string) => {
      const card = sub.querySelector<HTMLElement>("." + cls); if (!card) return;
      card.style.display = show ? "" : "none";
      if (show) { const h = card.querySelector("h4"); if (h && titulo) h.textContent = titulo; const p = card.querySelector("p"); if (p && texto) p.innerHTML = texto; }
    };
    if (comCpl.length) {
      const caro = comCpl[0], barato = comCpl[comCpl.length - 1];
      setCard("lead-caro", true, `${caro.nome} — CPL ${brl(cpl(caro))}`, `Custo por lead ${cpl(caro) > media ? `acima da média (${brl(media)})` : "na média"}. Gasto de ${brl(caro.gasto)} gerou ${caro.leads} leads.`);
      setCard("aumentar-verba", true, `${barato.nome} — CPL ${brl(cpl(barato))}`, `Melhor custo por lead da estrutura. Gasto de ${brl(barato.gasto)} gerou ${barato.leads} leads — dá pra escalar.`);
    } else { setCard("lead-caro", false); setCard("aumentar-verba", false); }
    setCard("trocar-criativo", false);
    setCard("leads-queimados", false);
    const note = sub.querySelector<HTMLElement>(".per-note");
    if (note) note.innerHTML = `📅 Gasto e leads da Meta (fb_saude). Visitas e vendas por campanha entram com o cruzamento CRM/Junix.`;
  }, [scopeManager]);

  loadFonts();

  // sempre aponta para as funções atuais (evita closure velho no seletor de período)
  const periodFns = useRef({ carregar, resultados });
  periodFns.current = { carregar, resultados };

  // injeta o JS do mockup uma vez e religa o seletor de período p/ recarregar dado real
  useEffect(() => {
    if (injetado.current) return;
    injetado.current = true;
    const s = document.createElement("script");
    s.id = "mlr-script"; s.textContent = JS;
    document.body.appendChild(s);
    const orig = (window as any).selecionarPeriodo;
    (window as any).selecionarPeriodo = (nomeP: string, el: any) => {
      try { if (orig) orig(nomeP, el); } catch { /* ok */ }
      periodFns.current.carregar(nomeP);
      periodFns.current.resultados(nomeP);
    };
    // controle real da tabela: pílulas, etapas do funil, busca e corretor
    (window as any).filterPill = (type: string, el: any) => {
      if (el) { box.current?.querySelectorAll(".pill-health").forEach((p) => p.classList.remove("active")); el.classList.add("active"); }
      filtroRef.current.seg = type; filtroRef.current.page = 1; renderRef.current();
    };
    (window as any).selectFunnelStage = (n: number, el: any) => {
      box.current?.querySelectorAll(".funnel-stage-card").forEach((c) => c.classList.remove("active")); if (el) el.classList.add("active");
      const map = ["todos", "todos", "avanco", "visita", "todos", "todos"];
      filtroRef.current.seg = map[n] || "todos"; filtroRef.current.page = 1; renderRef.current();
    };
    const si = box.current?.querySelector<HTMLInputElement>("#search-leads-input");
    if (si) si.addEventListener("input", () => { filtroRef.current.q = si.value; filtroRef.current.page = 1; renderRef.current(); });
    const scSel = box.current?.querySelector<HTMLSelectElement>("#select-corretor");
    if (scSel) scSel.addEventListener("change", () => { filtroRef.current.cor = scSel.value; filtroRef.current.page = 1; renderRef.current(); });
    return () => { const e = document.getElementById("mlr-script"); if (e) e.remove(); };
  }, [carregar, resultados]);

  // (re)carrega quando o escopo/role muda
  useEffect(() => {
    if (!role) return;
    const root = box.current;
    // abre sempre no HOJE (o gerente troca se quiser)
    if (root) {
      const chips = root.querySelectorAll(".per-chip");
      let hoje: Element | null = null;
      chips.forEach((c) => { c.classList.remove("active"); if ((c.textContent || "").trim() === "Hoje") hoje = c; });
      if (hoje) (hoje as HTMLElement).classList.add("active");
      const desc = root.querySelector("#periodo-descricao-txt");
      if (desc) desc.innerHTML = "Período Selecionado: <b>Hoje</b>";
    }
    carregar("Hoje");
    resultados("Hoje");
    pulso();
    justica();
    filas();
    anuncios();
    const t = setInterval(() => { pulso(); justica(); }, 60_000);
    return () => clearInterval(t);
  }, [role, scopeManager, carregar, pulso, justica, resultados, filas, anuncios]);

  // botão "Soltar" (represados) solta de verdade via RPC represados_acao
  useEffect(() => {
    (window as any).__soltarRepresados = async () => {
      try {
        const { data, error } = await sb.rpc("represados_acao", { p_como: manParam || null, p_executar: true });
        if (error) throw error;
        const n = (data as any)?.soltos ?? (data as any)?.total;
        toast.success(`Represados soltos${n != null ? ` (${n})` : ""} — corretores avisados.`);
        pulso(); justica();
      } catch (e: any) {
        const m = String(e?.message || "");
        toast.error(m.includes("entrar_como") ? "Saia do 'Entrar como' pra soltar." : m.includes("sem_permissao") ? "Sem permissão pra soltar aqui." : "Não consegui soltar os represados.");
      }
    };
    // "Direcionar" (sem dono): distribui os órfãos aos corretores presentes da própria estrutura (real)
    (window as any).__direcionarSemDono = async () => {
      try {
        const [de] = faixa("Hoje");
        let lq = sb.from("leads").select("id").is("broker_id", null).is("represa_at", null).gte("created_at", de).not("status", "in", "(EXCLUDED,ABANDONED)");
        if (scopeManager) lq = lq.eq("manager_id", scopeManager);
        const { data: ld } = await lq;
        const ids = (ld ?? []).map((l: any) => l.id);
        if (!ids.length) { toast.info("Nenhum lead sem dono pra direcionar."); return; }
        let pq = sb.from("profiles").select("id").eq("role", "BROKER").eq("is_active", true).neq("lead_assignment_enabled", false);
        if (scopeManager) pq = pq.eq("manager_id", scopeManager);
        const { data: pf } = await pq;
        const alvo = (pf ?? []).map((p: any) => p.id);
        if (!alvo.length) { toast.error("Sem corretor elegível pra receber."); return; }
        const { data, error } = await sb.rpc("redistribuir_lote", { p_leads: ids, p_para: alvo, p_como: manParam || null, p_motivo: "Direcionar sem dono — Central de Leads" });
        if (error) throw error;
        toast.success(`${(data as any)?.feitos ?? ids.length} lead(s) direcionado(s) aos corretores presentes.`);
        pulso(); justica(); carregar("Hoje");
      } catch (e: any) { toast.error(e?.message || "Não consegui direcionar os sem dono."); }
    };
    return () => { try { delete (window as any).__soltarRepresados; delete (window as any).__direcionarSemDono; } catch { /* ok */ } };
  }, [manParam, scopeManager, pulso, justica, carregar]);

  // filas (Mídia & Filas): add/remover corretor e criar fila de verdade (RPCs reais)
  useEffect(() => {
    (window as any).__filaRemover = async (formId: string, brokerId: string) => {
      try {
        const card = box.current?.querySelector<HTMLElement>(`[data-form="${formId}"]`);
        let brokers: string[] = []; try { brokers = JSON.parse(card?.dataset.brokers || "[]"); } catch { /* */ }
        brokers = brokers.filter((b) => b !== brokerId);
        if (!brokers.length) { const { error } = await sb.rpc("tirar_fila_formulario", { p_form_id: formId }); if (error) throw error; toast.success("Fila removida — os leads voltam para a roleta do plantão."); }
        else { const { error } = await sb.rpc("salvar_fila_formulario", { p_form_id: formId, p_page_id: card?.dataset.page || null, p_nome: card?.dataset.nome || "", p_broker_ids: brokers }); if (error) throw error; toast.success("Corretor removido da fila."); }
        filas();
      } catch (e: any) { toast.error(e?.message || "Não consegui atualizar a fila."); }
    };
    (window as any).__filaAdd = async (btn: HTMLElement) => {
      try {
        const card = btn.closest<HTMLElement>("[data-form]"); if (!card) return;
        const selEl = card.querySelector<HTMLSelectElement>(".fila-add-sel"); const id = selEl?.value;
        if (!id) { toast.info("Escolha um corretor."); return; }
        let brokers: string[] = []; try { brokers = JSON.parse(card.dataset.brokers || "[]"); } catch { /* */ }
        if (brokers.includes(id)) { toast.info("Esse corretor já está na fila."); return; }
        brokers.push(id);
        const { error } = await sb.rpc("salvar_fila_formulario", { p_form_id: card.dataset.form, p_page_id: card.dataset.page || null, p_nome: card.dataset.nome || "", p_broker_ids: brokers });
        if (error) throw error; toast.success("Corretor adicionado à fila."); filas();
      } catch (e: any) { toast.error(e?.message || "Não consegui adicionar."); }
    };
    (window as any).__filaCriar = async () => {
      try {
        const selEl = box.current?.querySelector<HTMLSelectElement>("#view-filas select"); const form = selEl?.value;
        if (!form) { toast.info("Escolha um formulário."); return; }
        const { error } = await sb.rpc("ligar_formulario", { p_form: form, p_modo: "roleta", p_destino: null, p_como: manParam || null, p_corretores: [] });
        if (error) throw error; toast.success("Fila criada na roleta da equipe."); filas();
      } catch (e: any) { toast.error(e?.message || "Não consegui criar a fila."); }
    };
    return () => { try { delete (window as any).__filaRemover; delete (window as any).__filaAdd; delete (window as any).__filaCriar; } catch { /* ok */ } };
  }, [filas, manParam]);

  return (
    <div className="mgr10 app2">
      <RailV10 atual={"leads" as any} mode={mode} toggle={toggle} />
      <style>{CSS}</style>
      <style>{STY}</style>
      <div ref={box} className="mlr" data-theme={mode} dangerouslySetInnerHTML={{ __html: HTML }} />
    </div>
  );
}
