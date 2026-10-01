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
let curKey = "";       // identidade da conversa aberta (phone ou "nome:<x>")
let curPhone = "";     // número, quando a conversa tem número visível
let curName = "";      // nome, quando é contato salvo (sem número no DOM)
let loading = false;

// ---- SABER a conversa aberta ----
// O WhatsApp mudou: o data-id das mensagens virou só hex (sem @c.us) e o número
// não fica mais em span[title]. A verdade agora está na 1ª linha do cabeçalho:
//   - contato NÃO salvo  -> "+55 11 99698-4154"  (é o número)  ← caso dos leads
//   - contato SALVO      -> "Carlos Eduardo"      (é o nome; número não existe no DOM)
function headerLine() {
  const head = document.querySelector("#main header");
  if (!head) return "";
  const lines = (head.innerText || "").split("\n").map((s) => s.trim()).filter(Boolean);
  return lines[0] || "";   // 1ª linha = número (não salvo) ou nome (salvo)
}
function looksPhone(t) {
  if (!t || !/^[\d\s()+\-]+$/.test(t)) return false;
  const d = t.replace(/\D/g, "");
  return d.length >= 10 && d.length <= 13;
}
function activePhone() {
  const t = headerLine();
  return looksPhone(t) ? t.replace(/\D/g, "") : "";
}
function activeName() {
  const t = headerLine();
  return looksPhone(t) ? "" : t;
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

// ---- mensagem sugerida (sem LLM: template pelo estado do lead) ----
function firstName(l) { return (((l && l.name) || "").trim().split(/\s+/)[0]) || ""; }
function fmtDate(iso) {
  try { const d = new Date(iso); const p = (n) => String(n).padStart(2, "0");
    return "dia " + p(d.getDate()) + "/" + p(d.getMonth() + 1) + " às " + p(d.getHours()) + ":" + p(d.getMinutes());
  } catch { return ""; }
}
function suggestMsg(l) {
  if (!l || l === "notfound") return null;
  const nm = firstName(l);
  const oi = nm ? "Oi, " + nm + "! " : "Oi! ";
  const st = l.status;
  if (["CONCLUDED", "ABANDONED", "EXCLUDED"].includes(st)) return null;
  if (l.last_lead_response_at && (!l.last_broker_whatsapp_at || new Date(l.last_lead_response_at) > new Date(l.last_broker_whatsapp_at)))
    return oi + "Vi sua mensagem aqui 🙌 Consigo te ajudar agora — posso te passar as condições e já deixar uma visita marcada?";
  if (st === "VISIT_SCHEDULED")
    return oi + "Passando pra confirmar nossa visita" + (l.visit_scheduled_at ? " " + fmtDate(l.visit_scheduled_at) : "") + ". Fica de pé pra você? Qualquer coisa a gente remarca 👍";
  if (st === "DOCS_REQUESTED")
    return oi + "Pra dar sequência na sua aprovação, me manda por aqui quando puder: RG/CNH, comprovante de renda e comprovante de residência. Assim que chegar eu já toco o processo 📄";
  if ((l.contact_attempts || 0) === 0 && (st === "NEW" || st === "IN_PROGRESS"))
    return oi + "Sou consultor(a) da Econ 🏠 Vi seu interesse em um apartamento pelo Minha Casa Minha Vida. Você já tem uma região preferida? Posso te mostrar opções que cabem no seu bolso.";
  return oi + "Tudo bem? Passando pra retomar nosso contato sobre o apartamento. Ainda faz sentido pra você? Consigo boas condições essa semana 😉";
}

// cola texto no campo de digitação do WhatsApp (editor Lexical) — NÃO envia.
function pasteToWa(text) {
  const box = document.querySelector('#main footer div[contenteditable="true"]');
  if (!box) return false;
  box.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(box);
  sel.removeAllRanges(); sel.addRange(range);
  const dt = new DataTransfer();
  dt.setData("text/plain", text);
  box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  return true;
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

  // nenhuma conversa aberta ainda
  if (!curKey) {
    body.appendChild(el("div", { class: "cmd-hint" }, "Abra uma conversa no WhatsApp que eu já trago o lead."));
    body.appendChild(fallbackInput());
    return;
  }

  // cabeçalho do painel: a conversa que eu detectei
  const convLabel = curPhone ? ("📱 " + fmt(curPhone)) : ("👤 " + curName);
  body.appendChild(el("div", { class: "cmd-conv" }, convLabel,
    el("span", { class: "cmd-link", onclick: () => { const i = fallbackInput(true); body.appendChild(i); } }, "não é esse?")));

  if (loading) { body.appendChild(el("div", { class: "cmd-hint" }, "Carregando…")); return; }

  if (lead === "notfound") {
    if (curPhone) {
      const nm = activeName();
      body.appendChild(el("div", { class: "cmd-empty" }, "Essa pessoa ainda não é um lead seu."));
      body.appendChild(el("button", { class: "cmd-btn wide", onclick: () => doCapture() },
        "➕ Capturar este contato" + (nm ? " (" + nm + ")" : "")));
    } else {
      body.appendChild(el("div", { class: "cmd-empty" },
        "Não achei lead com o nome “" + curName + "”. Esse contato está salvo no seu celular, então o WhatsApp não mostra o número aqui — abra pela conversa do número, ou digite abaixo."));
      body.appendChild(fallbackInput());
    }
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

  // resposta sugerida (o corretor revisa e envia pelo próprio número)
  const sug = suggestMsg(lead);
  if (sug) {
    body.appendChild(el("div", { class: "cmd-label", text: "RESPOSTA SUGERIDA" }));
    const ta = el("textarea", { class: "cmd-ta" });
    ta.value = sug;
    body.appendChild(ta);
    body.appendChild(el("button", { class: "cmd-btn wide", onclick: () => {
      if (pasteToWa(ta.value)) toast("Colei no WhatsApp — revise e envie 📩");
      else toast("Abra o campo de mensagem primeiro", false);
    } }, "📋 Usar essa mensagem"));
  }

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
    el("button", { class: "cmd-btn", onclick: () => loadForPhone(inp.value) }, "Buscar"));
  if (focus) setTimeout(() => inp.focus(), 50);
  return row;
}

// ---- carregar o lead da conversa ----
async function loadForPhone(phone) {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 10) return;
  curKey = digits; curPhone = digits; curName = ""; lead = null; loading = true; await render();
  const r = await send({ type: "getLead", phone: digits });
  loading = false;
  lead = r && r.ok ? (r.lead || "notfound") : "notfound";
  if (r && !r.ok) toast(r.error || "Erro ao buscar", false);
  await render();
}

async function loadForName(name) {
  curKey = "nome:" + name; curPhone = ""; curName = name; lead = null; loading = true; await render();
  const r = await send({ type: "getLeadByName", name });
  loading = false;
  if (r && r.ok && r.lead) { lead = r.lead; curPhone = (r.lead.phone || "").replace(/\D/g, ""); }
  else lead = "notfound";
  await render();
}

// ---- #2: registro PASSIVO de interação ----
// Quando o corretor envia uma mensagem (Enter no campo ou botão Enviar), marca
// "andou com o lead" no Comandra — sem ler/gravar o conteúdo. Alimenta o Tempo
// Real do gerente e zera o relógio dos 15 dias do pescar. Debounce por número.
const lastLog = {};
function onSend() {
  const digits = (curPhone || activePhone() || "").replace(/\D/g, "");
  if (digits.length < 10) return;                 // contato salvo sem número → não dá pra resolver
  const now = Date.now();
  if (lastLog[digits] && now - lastLog[digits] < 45000) return;
  lastLog[digits] = now;
  send({ type: "logInteraction", phone: digits }).then((r) => {
    if (r && r.ok && r.found && isOpen()) toast("✓ registrado no Comandra");
  });
}

// roda quando abre o painel e quando troca de conversa
async function track() {
  if (!isOpen()) return;
  const ph = activePhone();
  if (ph) { if (ph !== curPhone) loadForPhone(ph); return; }
  const nm = activeName();
  if (nm) { if (curKey !== "nome:" + nm) loadForName(nm); return; }
  // nenhuma conversa aberta
  if (curKey) { curKey = ""; curPhone = ""; curName = ""; lead = null; }
  render();
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
  if (r && r.ok) { toast(r.existia ? "Já era seu lead" : "Contato capturado ✅"); await loadForPhone(curPhone); }
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

// detecção de envio (roda mesmo com o painel fechado)
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
  const box = e.target && e.target.closest && e.target.closest('#main footer div[contenteditable="true"]');
  if (box && box.innerText.trim()) onSend();
}, true);
document.addEventListener("click", (e) => {
  const btn = e.target && e.target.closest && e.target.closest('[data-icon="send"], [data-icon^="send"], button[aria-label="Enviar"]');
  if (btn) onSend();
}, true);

const wait = setInterval(() => {
  if (!document.body) return;
  clearInterval(wait);
  mount();
  obs.observe(document.body, { childList: true, subtree: true });
}, 500);
