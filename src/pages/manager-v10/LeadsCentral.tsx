// Central de Leads & Performance — mockup final (v5) embutido (visual) + DADO REAL.
// O visual/markup vem de leadsMockup.ts (CSS/HTML/JS escopados em .mlr). Aqui ligamos os
// numeros reais: funil, pilulas de situacao, tabela de leads e o pulso do Hoje, respeitando
// o periodo escolhido e o escopo do usuario (gerente = sua equipe; super/diretor/admin = RLS).
import { useEffect, useRef, useCallback } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { RailV10, loadFonts } from "@/components/manager-v10/RailV10";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { CSS, HTML, JS } from "./leadsMockup";

const sb = supabase as any;

type Lead = {
  id: string; nome: string | null; telefone: string | null;
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

export default function LeadsCentral() {
  const { mode, toggle } = useTheme();
  const { session, role } = useAuth() as any;
  const box = useRef<HTMLDivElement>(null);
  const injetado = useRef(false);

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
  const carregar = useCallback(async (nome: string) => {
    const root = box.current; if (!root) return;
    const [de, ate] = faixa(nome);
    let q = sb.from("leads")
      .select("id,nome,telefone,campanha_nome,source,broker_id,last_broker_whatsapp_at,visit_scheduled_at,status,created_at")
      .gte("created_at", de).lt("created_at", ate)
      .not("status", "in", "(EXCLUDED,ABANDONED)")
      .order("created_at", { ascending: false }).limit(5000);
    if (scopeManager) q = q.eq("manager_id", scopeManager);
    const [{ data }, nm] = await Promise.all([q, brokers()]);
    const ls = (data ?? []) as Lead[];

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
    const sub2 = root.querySelector<HTMLElement>(".funnel-stage-card.bottleneck .stage-sub");
    if (sub2) sub2.innerHTML = `<span>⚠️ <b>${semToque}</b> sem toque (&gt;2h)</span>`;

    // PÍLULAS (ordem: todos, sem contato, vácuo, avanço, retorno)
    const pb = root.querySelectorAll<HTMLElement>(".pill-health .tab-badge");
    const pv = [total, semContato, semToque, avanco, retorno];
    pb.forEach((el, i) => { if (pv[i] != null) el.textContent = String(pv[i]); });

    // TABELA
    const tb = root.querySelector("#leads-tbody");
    if (tb) {
      if (!ls.length) {
        tb.innerHTML = `<tr><td colspan="7" style="padding:28px;text-align:center;color:var(--text-dim)">Nenhum lead neste período.</td></tr>`;
      } else {
        tb.innerHTML = ls.slice(0, 400).map((l) => {
          const nome = esc(l.nome || "Sem nome");
          const cor = l.broker_id ? esc(nm[l.broker_id] || "corretor") : "";
          const [bc, bt] = situ(l);
          const dcor = (l.broker_id ? (nm[l.broker_id] || "") : "sem").toLowerCase().split(" ")[0];
          const corTd = l.broker_id
            ? `<div style="display:flex;align-items:center;gap:8px"><div class="avatar-clean">${esc(inic(nm[l.broker_id] || ""))}</div><b>${cor}</b></div>`
            : `<span style="color:var(--text-dim)">Sem corretor</span>`;
          return `<tr data-type="${bc}" data-corretor="${esc(dcor)}">
            <td><input type="checkbox" class="lead-chk" onclick="updateBatchBar()" /></td>
            <td><b>${nome}</b><span class="mono" style="display:block;color:var(--text-dim);font-size:12px">${fone(l.telefone)}</span></td>
            <td><span>${esc(origemTxt(l))}</span></td>
            <td>${corTd}</td>
            <td><span class="sit-badge ${bc}">${bt}</span></td>
            <td class="mono">${tempoTxt(l)}</td>
            <td><div class="action-btn-group">
              <button class="act-btn ver" onclick="openModalVer('${arg(l.id)}','${arg(l.nome || "Sem nome")}','${arg(fone(l.telefone))}','${arg(origemTxt(l))}','${arg(cor || "—")}','${arg(bt)}','${arg(tempoTxt(l))}','${arg(origemTxt(l))}')">👁️ Ver</button>
            </div></td>
          </tr>`;
        }).join("");
      }
    }

    // COPILOTO (topo) — insight real simples: corretor com mais leads sem toque
    const porCorretor: Record<string, number> = {};
    ls.forEach((l) => { if (l.broker_id && !l.last_broker_whatsapp_at) porCorretor[l.broker_id] = (porCorretor[l.broker_id] || 0) + 1; });
    const pior = Object.entries(porCorretor).sort((a, b) => b[1] - a[1])[0];
    const cop = root.querySelector<HTMLElement>(".copilot-text, #copilot-text, .suss-resumo");
    if (cop) {
      cop.textContent = pior
        ? `${nm[pior[0]] || "corretor"} com ${pior[1]} sem toque · ${total} leads no período · ${semContato} sem contato`
        : `${total} leads no período · ${semContato} sem contato`;
    }
  }, [scopeManager, brokers]);

  // pulso do Hoje (sempre "hoje", independente do período do funil)
  const pulso = useCallback(async () => {
    const root = box.current; if (!root) return;
    const [de] = faixa("Hoje");
    let q = sb.from("leads").select("broker_id,last_broker_whatsapp_at,represa_at")
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
    const reps = root.querySelectorAll(".rep-row");
    const setRep = (el: Element | undefined, n: number, label: string, btn: string) => {
      if (!el) return;
      const b = el.querySelector("b"); if (b) b.textContent = `${n} ${label}`;
      const bt = el.querySelector(".act-btn"); if (bt) bt.textContent = `${btn} (${n})`;
    };
    setRep(reps[0], represados, "segurados", "Soltar");
    setRep(reps[1], semDono, "sem dono", "Direcionar");
  }, [scopeManager]);

  loadFonts();

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
      carregar(nomeP);
    };
    return () => { const e = document.getElementById("mlr-script"); if (e) e.remove(); };
  }, [carregar]);

  // (re)carrega quando o escopo/role muda
  useEffect(() => {
    if (!role) return;
    carregar("Esta Semana");
    pulso();
    const t = setInterval(() => { pulso(); }, 60_000);
    return () => clearInterval(t);
  }, [role, scopeManager, carregar, pulso]);

  return (
    <div className="mgr10 app2">
      <RailV10 atual={"leads" as any} mode={mode} toggle={toggle} />
      <style>{CSS}</style>
      <div ref={box} className="mlr" dangerouslySetInnerHTML={{ __html: HTML }} />
    </div>
  );
}
