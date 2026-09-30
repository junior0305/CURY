// Comandra no WhatsApp — content script.
// Injeta um botão flutuante + painel no web.whatsapp.com. Detecta o número do
// chat aberto, busca o lead do corretor (via background) e deixa avançar o
// status e registrar o atendimento — tudo sem sair da conversa.

const send = (m) => new Promise((res) => chrome.runtime.sendMessage(m, res));

const STATUS = [
  { k: "IN_PROGRESS",     l: "Em atendimento" },
  { k: "VISIT_SCHEDULED", l: "📅 Visita agendada" },
  { k: "VISITA_REALIZADA",l: "✅ Visita feita" },
  { k: "NEGOTIATING",     l: "💬 Negociando" },
  { k: "DOCS_REQUESTED",  l: "📄 Documentos" },
  { k: "CONCLUDED",       l: "🏆 Vendeu" },
  { k: "ABANDONED",       l: "✖ Perdeu" },
];
const STATUS_LABEL = Object.fromEntries(STATUS.map((s) => [s.k, s.l]));

let lead = null;      // lead atual
let lastPhone = "";   // último número detectado

// ---- detecção do número do chat aberto ----
function detectPhone() {
  const head = document.querySelector("#main header");
  if (!head) return "";
  const cands = [];
  head.querySelectorAll("span[title]").forEach((s) => cands.push(s.getAttribute("title")));
  cands.push(head.textContent || "");
  for (const c of cands) {
    const d = (c || "").replace(/\D/g, "");
    if (d.length >= 10 && d.length <= 13) return d;
  }
  return "";
}

// nome do contato aberto (pra capturar contato novo). Se o topo mostra número, volta vazio.
function detectName() {
  const head = document.querySelector("#main header");
  if (!head) return "";
  const s = head.querySelector("span[title]");
  const t = ((s && s.getAttribute("title")) || "").trim();
  if (t && /^[\d\s()+\-]+$/.test(t)) return ""; // é número, não nome
  return t;
}

// Jarvis: a próxima ação sugerida pra ESTE lead (mesma régua do painel).
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

// ---- UI ----
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

function panelEl() { return document.getElementById("cmd-panel"); }

async function renderBody() {
  const body = document.getElementById("cmd-body");
  if (!body) return;
  body.innerHTML = "";

  const s = await send({ type: "session" });
  if (!s || !s.ok) {
    body.appendChild(el("div", { class: "cmd-empty" },
      "Você não está conectado. Clique no ícone da extensão (ao lado da barra de endereço) e faça login com seu usuário do Comandra."));
    return;
  }

  // linha do telefone
  const phoneInput = el("input", { class: "cmd-input", id: "cmd-phone", placeholder: "Número (ex: 5511...)", value: lastPhone });
  const buscar = el("button", { class: "cmd-btn", onclick: () => doSearch(phoneInput.value) }, "Buscar");
  body.appendChild(el("div", { class: "cmd-row" }, phoneInput, buscar));

  if (lead === "notfound") {
    const nm = detectName();
    body.appendChild(el("div", { class: "cmd-empty" }, "Esse número ainda não é um lead seu."));
    body.appendChild(el("button", { class: "cmd-btn wide", onclick: () => doCapture(lastPhone, nm) },
      "➕ Capturar este contato" + (nm ? " (" + nm + ")" : "")));
    return;
  }
  if (!lead) {
    body.appendChild(el("div", { class: "cmd-hint" }, "Abra uma conversa — eu busco o lead pelo número automaticamente."));
    return;
  }

  // ficha
  const badge = el("span", { class: "cmd-badge", text: STATUS_LABEL[lead.status] || lead.status || "—" });
  body.appendChild(el("div", { class: "cmd-name" }, lead.name || "Sem nome", badge));
  const facts = [
    lead.tag ? "📍 " + lead.tag : "",
    lead.product ? "🏢 " + lead.product : "",
    lead.renda_declarada ? "💰 " + String(lead.renda_declarada).replace(/_/g, " ") : "",
  ].filter(Boolean).join("  ·  ");
  if (facts) body.appendChild(el("div", { class: "cmd-facts", text: facts }));

  // Jarvis — próxima ação
  const j = jarvis(lead);
  if (j) body.appendChild(el("div", { class: "cmd-jarvis" }, el("span", { class: "cmd-j-ic", text: j.icon }), el("span", { text: j.txt })));

  // status
  body.appendChild(el("div", { class: "cmd-label", text: "AVANÇAR STATUS" }));
  const grid = el("div", { class: "cmd-grid" });
  STATUS.forEach((st) => {
    const b = el("button", {
      class: "cmd-chip" + (lead.status === st.k ? " on" : ""),
      onclick: () => doStatus(st.k),
    }, st.l);
    grid.appendChild(b);
  });
  body.appendChild(grid);

  // agendar visita
  body.appendChild(el("div", { class: "cmd-label", text: "AGENDAR VISITA" }));
  const dt = el("input", { class: "cmd-input", id: "cmd-date", type: "datetime-local" });
  body.appendChild(el("div", { class: "cmd-row" }, dt, el("button", { class: "cmd-btn", onclick: () => doVisita(dt.value) }, "Agendar")));

  // registro de atendimento
  body.appendChild(el("div", { class: "cmd-label", text: "REGISTRAR ATENDIMENTO" }));
  const ta = el("textarea", { class: "cmd-ta", id: "cmd-note", placeholder: "O que rolou nessa conversa…" });
  body.appendChild(ta);
  body.appendChild(el("button", { class: "cmd-btn wide", onclick: () => doNote(ta.value) }, "Salvar no Comandra"));
}

function toast(txt, ok = true) {
  const t = document.getElementById("cmd-toast");
  if (!t) return;
  t.textContent = txt; t.className = "cmd-toast show " + (ok ? "ok" : "err");
  setTimeout(() => { t.className = "cmd-toast"; }, 2600);
}

async function doSearch(phone) {
  lastPhone = (phone || "").replace(/\D/g, "");
  lead = null; await renderBody();
  const r = await send({ type: "getLead", phone: lastPhone });
  lead = r && r.ok ? (r.lead || "notfound") : "notfound";
  if (r && !r.ok) toast(r.error || "Erro ao buscar", false);
  await renderBody();
}

async function doStatus(status) {
  if (!lead || lead === "notfound") return;
  const r = await send({ type: "setStatus", id: lead.id, status });
  if (r && r.ok) { lead.status = status; toast("Status: " + (STATUS_LABEL[status] || status)); await renderBody(); }
  else toast((r && r.error) || "Falhou", false);
}

async function doNote(content) {
  if (!lead || lead === "notfound") return;
  if (!content || !content.trim()) { toast("Escreva algo primeiro", false); return; }
  const r = await send({ type: "addNote", id: lead.id, content: content.trim() });
  if (r && r.ok) { toast("Atendimento registrado ✅"); const t = document.getElementById("cmd-note"); if (t) t.value = ""; }
  else toast((r && r.error) || "Falhou", false);
}

async function doCapture(phone, name) {
  const r = await send({ type: "capture", phone: phone || lastPhone, name });
  if (r && r.ok) { toast(r.existia ? "Já era seu lead" : "Contato capturado ✅"); await doSearch(phone || lastPhone); }
  else toast((r && r.error) || "Não consegui capturar", false);
}

async function doVisita(val) {
  if (!lead || lead === "notfound") return;
  if (!val) { toast("Escolha a data da visita", false); return; }
  const iso = new Date(val).toISOString();
  const r = await send({ type: "agendarVisita", id: lead.id, date: iso });
  if (r && r.ok) { lead.status = "VISIT_SCHEDULED"; lead.visit_scheduled_at = iso; toast("Visita agendada 📅"); await renderBody(); }
  else toast((r && r.error) || "Não consegui agendar", false);
}

function togglePanel(open) {
  const p = panelEl();
  if (!p) return;
  const show = open ?? p.classList.contains("hidden");
  p.classList.toggle("hidden", !show);
  if (show) { const ph = detectPhone(); if (ph && ph !== lastPhone) doSearch(ph); else renderBody(); }
}

function mount() {
  if (document.getElementById("cmd-fab")) return;
  const fab = el("button", { id: "cmd-fab", title: "Comandra", onclick: () => togglePanel() }, "Comandra");
  const panel = el("div", { id: "cmd-panel", class: "hidden" });
  const head = el("div", { id: "cmd-head" },
    el("span", { text: "Comandra" }),
    el("span", { id: "cmd-close", onclick: () => togglePanel(false), text: "✕" }));
  const bodyWrap = el("div", { id: "cmd-body" });
  const toastEl = el("div", { id: "cmd-toast", class: "cmd-toast" });
  panel.append(head, bodyWrap, toastEl);
  document.body.append(fab, panel);
}

// re-detecta quando o corretor troca de conversa (se o painel estiver aberto)
let tmr = null;
const obs = new MutationObserver(() => {
  clearTimeout(tmr);
  tmr = setTimeout(() => {
    const p = panelEl();
    if (!p || p.classList.contains("hidden")) return;
    const ph = detectPhone();
    if (ph && ph !== lastPhone) doSearch(ph);
  }, 600);
});

function boot() {
  mount();
  obs.observe(document.body, { childList: true, subtree: true });
}
// o WhatsApp Web demora pra montar; tenta até achar o body
const wait = setInterval(() => { if (document.body) { clearInterval(wait); boot(); } }, 500);
