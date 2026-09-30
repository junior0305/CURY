// Comandra no WhatsApp — content script.
// Painel que SABE em qual conversa você está (lê o número do chat aberto) e já
// mostra o lead, com Jarvis, status, agendar visita e registrar atendimento —
// sem buscar nada na mão.

const send = (m) => new Promise((res) => { try { chrome.runtime.sendMessage(m, res); } catch { res(null); } });

const STATUS = [
  { k: "IN_PROGRESS",      l: "Em atendimento" },
  { k: "VISIT_SCHEDULED",  l: "📅 Visita agendada" },
  { k: "VISITA_REALIZADA", l: "✅ Visita feita" },
  { k: "NEGOTIATING",      l: "💬 Negociando" },
  { k: "DOCS_REQUESTED",   l: "📄 Documentos" },
  { k: "CONCLUDED",        l: "🏆 Vendeu" },
  { k: "ABANDONED",        l: "✖ Perdeu" },
];
const STATUS_LABEL = Object.fromEntries(STATUS.map((s) => [s.k, s.l]));

let lead = null;       // objeto | "notfound" | null
let curPhone = "";     // número da conversa aberta agora
let loading = false;

// ---- SABER a conversa aberta: o número vem do JID das mensagens (data-id).
//      Funciona pra contato SALVO e não salvo (o cabeçalho só mostra número
//      quando não é salvo — por isso não dá pra depender dele). ----
function activePhone() {
  const nodes = document.querySelectorAll('#main [data-id]');
  for (const n of nodes) {
    const m = (n.getAttribute("data-id") || "").match(/(\d{10,15})@c\.us/);
    if (m) return m[1];
  }
  // fallback: cabeçalho (número de contato não salvo)
  const head = document.querySelector("#main header");
  if (head) {
    for (const s of head.querySelectorAll("span[title]")) {
      const d = (s.getAttribute("title") || "").replace(/\D/g, "");
      if (d.length >= 10 && d.length <= 13) return d;
    }
  }
  return "";
}

function activeName() {
  const head = document.querySelector("#main header");
  if (!head) return "";
  const s = head.querySelector("span[title]");
  const t = ((s && s.getAttribute("title")) || "").trim();
  if (t && /^[\d\s()+\-]+$/.test(t)) return "";
  return t;
}

function jarvis(l) {
  if (!l || l === "notfound") return null;
  const h = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 3.6e6 : 9999);
  const st = l.status;
  if (["CONCLUDED", "ABANDONED", "EXCLUDED"].includes(st)) return null;
  if (l.last_lead_response_at && (!l.last_broker_whatsapp_at || new Date(l.last_lead_response_at) > new Date(l.last_broker_whatsapp_at)))
    return { icon: "💬", txt: "Respondeu e está te esperando — retorne agora" };
  if (l.lead_temperature === "quente" && h(l.last_interaction_at) >= 2)
    return { icon: "🔥", txt: "Quente e parado há " + Math.round(h(l.last_interaction_at)) + "h — fale agora" };
  if (st === "VISIT_SCHEDULED") return { icon: "📅", txt: "Confirme a visita" };
  if (st === "DOCS_REQUESTED") return { icon: "📄", txt: "Cobre os documentos" };
  if ((l.contact_attempts || 0) === 0 && (st === "NEW" || st === "IN_PROGRESS"))
    return { icon: "🆕", txt: "Faça o primeiro contato" };
  return null;
}

// ---- helpers DOM ----
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  kids.forEach((c) => n.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
  return n;
}
const panelEl = () => document.getElementById("cmd-panel");
const isOpen = () => { const p = panelEl(); return p && !p.classList.contains("hidden"); };

function toast(txt, ok = true) {
  const t = document.getElementById("cmd-toast");
  if (!t) return;
  t.textContent = txt; t.className = "cmd-toast show " + (ok ? "ok" : "err");
  setTimeout(() => { t.className = "cmd-toast"; }, 2600);
}

// ---- render (nunca deixa vazio: sempre mostra algo) ----
async function render() {
  const body = document.getElementById("cmd-body");
  if (!body) return;

  const s = await send({ type: "session" });
  body.innerHTML = "";

  if (!s || !s.ok) {
    body.appendChild(el("div", { class: "cmd-empty" },
      "Faça login: clique no ícone da extensão (🧩 na barra do Chrome → Comandra) e entre com seu usuário do Comandra. Depois volte aqui."));
    return;
  }

  // qual conversa
  if (!curPhone) {
    body.appendChild(el("div", { class: "cmd-hint" }, "Abra uma conversa no WhatsApp que eu já trago o lead."));
    body.appendChild(fallbackInput());
    return;
  }
  body.appendChild(el("div", { class: "cmd-conv" }, "📱 " + fmt(curPhone),
    el("span", { class: "cmd-link", onclick: () => { const i = fallbackInput(true); body.appendChild(i); } }, "não é esse?")));

  if (loading) { body.appendChild(el("div", { class: "cmd-hint" }, "Carregando…")); return; }

  if (lead === "notfound") {
    const nm = activeName();
    body.appendChild(el("div", { class: "cmd-empty" }, "Essa pessoa ainda não é um lead seu."));
    body.appendChild(el("button", { class: "cmd-btn wide", onclick: () => doCapture() },
      "➕ Capturar este contato" + (nm ? " (" + nm + ")" : "")));
    return;
  }
  if (!lead) { body.appendChild(el("div", { class: "cmd-hint" }, "—")); return; }

  // ficha
  body.appendChild(el("div", { class: "cmd-name" }, lead.name || "Sem nome",
    el("span", { class: "cmd-badge", text: STATUS_LABEL[lead.status] || lead.status || "—" })));
  const facts = [
    lead.tag ? "📍 " + lead.tag : "",
    lead.product ? "🏢 " + lead.product : "",
    lead.renda_declarada ? "💰 " + String(lead.renda_declarada).replace(/_/g, " ") : "",
  ].filter(Boolean).join("  ·  ");
  if (facts) body.appendChild(el("div", { class: "cmd-facts", text: facts }));

  const j = jarvis(lead);
  if (j) body.appendChild(el("div", { class: "cmd-jarvis" }, el("span", { class: "cmd-j-ic", text: j.icon }), el("span", { text: j.txt })));

  body.appendChild(el("div", { class: "cmd-label", text: "AVANÇAR STATUS" }));
  const grid = el("div", { class: "cmd-grid" });
  STATUS.forEach((st) => grid.appendChild(el("button", {
    class: "cmd-chip" + (lead.status === st.k ? " on" : ""), onclick: () => doStatus(st.k),
  }, st.l)));
  body.appendChild(grid);

  body.appendChild(el("div", { class: "cmd-label", text: "AGENDAR VISITA" }));
  const dt = el("input", { class: "cmd-input", type: "datetime-local" });
  body.appendChild(el("div", { class: "cmd-row" }, dt, el("button", { class: "cmd-btn", onclick: () => doVisita(dt.value) }, "Agendar")));

  body.appendChild(el("div", { class: "cmd-label", text: "REGISTRAR ATENDIMENTO" }));
  const ta = el("textarea", { class: "cmd-ta", placeholder: "O que rolou nessa conversa…" });
  body.appendChild(ta);
  body.appendChild(el("button", { class: "cmd-btn wide", onclick: () => doNote(ta.value) }, "Salvar no Comandra"));
}

function fmt(d) { d = (d || "").replace(/\D/g, ""); return d.length >= 12 ? d : "55" + d; }

function fallbackInput(focus) {
  const inp = el("input", { class: "cmd-input", placeholder: "Digite o número (5511...)", value: curPhone });
  const row = el("div", { class: "cmd-row", style: "margin-top:8px" }, inp,
    el("button", { class: "cmd-btn", onclick: () => loadFor(inp.value) }, "Buscar"));
  if (focus) setTimeout(() => inp.focus(), 50);
  return row;
}

// ---- carregar o lead da conversa ----
async function loadFor(phone) {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 10) return;
  curPhone = digits; lead = null; loading = true; await render();
  const r = await send({ type: "getLead", phone: curPhone });
  loading = false;
  lead = r && r.ok ? (r.lead || "notfound") : "notfound";
  if (r && !r.ok) toast(r.error || "Erro ao buscar", false);
  await render();
}

// roda quando abre o painel e quando troca de conversa
async function track() {
  if (!isOpen()) return;
  const ph = activePhone();
  if (ph && ph !== curPhone) return loadFor(ph);
  if (!ph && !curPhone) render();
}

// ---- ações ----
async function doStatus(status) {
  if (!lead || lead === "notfound") return;
  const r = await send({ type: "setStatus", id: lead.id, status });
  if (r && r.ok) { lead.status = status; toast("Status: " + (STATUS_LABEL[status] || status)); await render(); }
  else toast((r && r.error) || "Falhou", false);
}
async function doNote(content) {
  if (!lead || lead === "notfound") return;
  if (!content || !content.trim()) { toast("Escreva algo primeiro", false); return; }
  const r = await send({ type: "addNote", id: lead.id, content: content.trim() });
  if (r && r.ok) toast("Atendimento registrado ✅");
  else toast((r && r.error) || "Falhou", false);
}
async function doCapture() {
  const r = await send({ type: "capture", phone: curPhone, name: activeName() });
  if (r && r.ok) { toast(r.existia ? "Já era seu lead" : "Contato capturado ✅"); await loadFor(curPhone); }
  else toast((r && r.error) || "Não consegui capturar", false);
}
async function doVisita(val) {
  if (!lead || lead === "notfound") return;
  if (!val) { toast("Escolha a data da visita", false); return; }
  const r = await send({ type: "agendarVisita", id: lead.id, date: new Date(val).toISOString() });
  if (r && r.ok) { lead.status = "VISIT_SCHEDULED"; toast("Visita agendada 📅"); await render(); }
  else toast((r && r.error) || "Não consegui agendar", false);
}

// ---- painel ----
function toggle(open) {
  const p = panelEl(); if (!p) return;
  const show = open ?? p.classList.contains("hidden");
  p.classList.toggle("hidden", !show);
  if (show) track();
}

function mount() {
  if (document.getElementById("cmd-fab")) return;
  document.body.append(
    el("button", { id: "cmd-fab", title: "Comandra", onclick: () => toggle() }, "Comandra"),
    (() => {
      const panel = el("div", { id: "cmd-panel", class: "hidden" });
      panel.append(
        el("div", { id: "cmd-head" }, el("span", { text: "Comandra" }),
          el("span", { id: "cmd-close", onclick: () => toggle(false), text: "✕" })),
        el("div", { id: "cmd-body" }),
        el("div", { id: "cmd-toast", class: "cmd-toast" }),
      );
      return panel;
    })(),
  );
}

let tmr = null;
const obs = new MutationObserver(() => { clearTimeout(tmr); tmr = setTimeout(track, 500); });

const wait = setInterval(() => {
  if (!document.body) return;
  clearInterval(wait);
  mount();
  obs.observe(document.body, { childList: true, subtree: true });
}, 500);
