// Comandra no WhatsApp — service worker (background).
//
// Faz TODAS as chamadas à API do Comandra. O content script roda dentro do
// web.whatsapp.com, cujo CSP bloqueia fetch pra comandra.com.br — então quem
// fala com a API é este background (service workers não sofrem o CSP da página).
// Guarda o token do corretor em chrome.storage.local.

const CFG = {
  url: "https://comandra.com.br/supabase",
  anon: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5MjYzNDE2LCJleHAiOjIxMDQ2MjM0MTZ9.Ohs3PVk283wk0ozzjiaZkzxGiqyECdY4i02nxInmvao",
};

async function token() {
  const { token } = await chrome.storage.local.get("token");
  return token || null;
}

async function api(path, { method = "GET", body, auth = true, prefer } = {}) {
  const headers = { apikey: CFG.anon, "Content-Type": "application/json" };
  if (prefer) headers["Prefer"] = prefer;
  if (auth) { const t = await token(); if (t) headers["Authorization"] = "Bearer " + t; }
  const res = await fetch(CFG.url + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let data = null; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  return { ok: res.ok, status: res.status, data };
}

async function login(email, password) {
  const r = await api("/auth/v1/token?grant_type=password", {
    method: "POST", auth: false, body: { email, password },
  });
  if (!r.ok) {
    const e = (r.data && (r.data.error_description || r.data.msg || r.data.error)) || "Login falhou";
    return { ok: false, error: e };
  }
  await chrome.storage.local.set({ token: r.data.access_token, refresh: r.data.refresh_token });
  const me = await api("/auth/v1/user");
  const u = me.data || {};
  await chrome.storage.local.set({ userId: u.id || null, email: u.email || email });
  return { ok: true, email: u.email || email };
}

async function session() {
  const s = await chrome.storage.local.get(["token", "email", "userId"]);
  return { ok: !!s.token, email: s.email || null, userId: s.userId || null };
}

// Busca o lead do corretor pelo telefone (últimos dígitos, tolerante a formato).
async function getLead(phone) {
  const digits = (phone || "").replace(/\D/g, "");
  const sfx = digits.slice(-9);
  if (sfx.length < 8) return { ok: false, error: "Número do contato não reconhecido" };
  const sel = "id,name,phone,status,tag,product,fb_campaign,renda_declarada,lead_temperature,last_interaction_at,last_lead_response_at,last_broker_whatsapp_at,contact_attempts,created_at,welcome_responded_at,visit_scheduled_at";
  const r = await api(`/rest/v1/leads?select=${sel}&phone=ilike.*${sfx}*&order=last_interaction_at.desc.nullslast&limit=1`);
  if (!r.ok) return { ok: false, error: "Erro ao buscar (" + r.status + ")" };
  return { ok: true, lead: (Array.isArray(r.data) && r.data[0]) || null };
}

// Fallback pra contato SALVO (WhatsApp não mostra o número): busca por nome.
async function getLeadByName(name) {
  const q = (name || "").trim();
  if (q.length < 3) return { ok: true, lead: null };
  const sel = "id,name,phone,status,tag,product,fb_campaign,renda_declarada,lead_temperature,last_interaction_at,last_lead_response_at,last_broker_whatsapp_at,contact_attempts,created_at,welcome_responded_at,visit_scheduled_at";
  const enc = encodeURIComponent("%" + q + "%");
  const r = await api(`/rest/v1/leads?select=${sel}&name=ilike.${enc}&order=last_interaction_at.desc.nullslast&limit=1`);
  if (!r.ok) return { ok: false, error: "Erro ao buscar (" + r.status + ")" };
  return { ok: true, lead: (Array.isArray(r.data) && r.data[0]) || null };
}

async function setStatus(id, status) {
  const r = await api(`/rest/v1/leads?id=eq.${id}`, {
    method: "PATCH", prefer: "return=minimal",
    body: { status, last_interaction_at: new Date().toISOString() },
  });
  return { ok: r.ok, error: r.ok ? null : "Não consegui atualizar (" + r.status + ")" };
}

async function addNote(id, content) {
  const { userId } = await chrome.storage.local.get("userId");
  const r = await api("/rest/v1/lead_notes", {
    method: "POST", prefer: "return=minimal",
    body: { lead_id: id, broker_id: userId, content },
  });
  return { ok: r.ok, error: r.ok ? null : "Não consegui registrar (" + r.status + ")" };
}

// Captura um contato novo como lead do corretor (RPC segura, com dedupe).
async function capture(phone, name) {
  const r = await api("/rest/v1/rpc/capturar_lead_wa", {
    method: "POST", body: { p_phone: phone, p_name: name || "" },
  });
  if (!r.ok) return { ok: false, error: "Não consegui capturar (" + r.status + ")" };
  if (r.data && r.data.error) return { ok: false, error: r.data.error };
  return { ok: true, id: r.data && r.data.id, existia: !!(r.data && r.data.existia) };
}

// #2: registra "corretor falou com o lead" (sem conteúdo) — RPC bumpa timestamps.
async function logInteraction(phone) {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 10) return { ok: false };
  const r = await api("/rest/v1/rpc/registrar_interacao_wa", { method: "POST", body: { p_phone: digits } });
  if (!r.ok) return { ok: false };
  return { ok: true, found: !!(r.data && r.data.found) };
}

async function agendarVisita(id, dateISO) {
  const r = await api(`/rest/v1/leads?id=eq.${id}`, {
    method: "PATCH", prefer: "return=minimal",
    body: { status: "VISIT_SCHEDULED", visit_scheduled_at: dateISO, last_interaction_at: new Date().toISOString() },
  });
  return { ok: r.ok, error: r.ok ? null : "Não consegui agendar (" + r.status + ")" };
}

chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  (async () => {
    try {
      switch (msg.type) {
        case "login":     return reply(await login(msg.email, msg.password));
        case "logout":    await chrome.storage.local.clear(); return reply({ ok: true });
        case "session":   return reply(await session());
        case "getLead":   return reply(await getLead(msg.phone));
        case "getLeadByName": return reply(await getLeadByName(msg.name));
        case "setStatus": return reply(await setStatus(msg.id, msg.status));
        case "addNote":   return reply(await addNote(msg.id, msg.content));
        case "capture":   return reply(await capture(msg.phone, msg.name));
        case "logInteraction": return reply(await logInteraction(msg.phone));
        case "agendarVisita": return reply(await agendarVisita(msg.id, msg.date));
        default:          return reply({ ok: false, error: "ação desconhecida" });
      }
    } catch (e) { reply({ ok: false, error: String((e && e.message) || e) }); }
  })();
  return true; // resposta assíncrona
});
