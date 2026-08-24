import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Comandra — HANDOFF v4 (DOUTRINA JARVIS): lead em conversa respondeu e o corretor sumiu -> o Jarvis SUGERE a resposta
// pro corretor no self-chat (NAO envia cego pro lead). Vertical-aware. Piloto-gated. Cron ~3min.

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const BANNED = `PROIBIDO (soa robo/marketing): \"estou a disposicao\", \"qualquer duvida e so chamar\", \"fico no aguardo\", \"temos otimas opcoes\", \"e so me avisar\".`;
function digits(p) { return (p || '').replace(/\D/g, ''); }
function phoneMatch(a, b) { const da = digits(a), db = digits(b); return !!da && !!db && (da === db || da.endsWith(db) || db.endsWith(da)); }
function firstName(n) { return (n || 'o cliente').trim().split(' ')[0] || 'o cliente'; }

async function sendSelf(url, key, instance, phone, text) {
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 25000);
    const r = await fetch(`${url}/message/sendText/${instance}`, { method: 'POST', headers: { 'apikey': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ number: phone, text }), signal: ctrl.signal });
    clearTimeout(t); return r.status >= 200 && r.status < 300;
  } catch { return false; }
}
async function closeP(sb, id, status) { try { await sb.from('comandra_pending_action').update({ status: String(status).slice(0, 40), resolved_at: new Date().toISOString() }).eq('id', id); } catch {} }
async function markP(sb, id, status, msg) { try { await sb.from('comandra_pending_action').update({ status: String(status).slice(0, 40), message: String(msg || '').slice(0, 500), resolved_at: new Date().toISOString() }).eq('id', id); } catch {} }

async function callLLM(systemPrompt, userPrompt) {
  const gk = Deno.env.get('GEMINI_API_KEY');
  if (gk) { try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${gk}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: userPrompt }] }], systemInstruction: { parts: [{ text: systemPrompt }] }, generationConfig: { maxOutputTokens: 130, temperature: 0.75 } }) });
    const j = await r.json(); const t = j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim(); if (t) return t;
  } catch {} }
  const ok = Deno.env.get('OPENAI_API_KEY');
  if (ok) { try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Authorization': 'Bearer ' + ok, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], max_tokens: 130, temperature: 0.75 }) });
    const j = await r.json(); const t = j?.choices?.[0]?.message?.content?.trim(); if (t) return t;
  } catch {} }
  return null;
}

function buildPrompt(vertical, brokerName, leadFirst, lead, ls, style, hist) {
  let sys, ctx, cta;
  if (vertical === 'consorcio') {
    sys = `Voce e ${brokerName || 'o consultor'}, consultor de CONSORCIO (cartas de credito), escrevendo pelo SEU WhatsApp para o cliente ${leadFirst}. Voce e o PROPRIO consultor — NUNCA diga que e IA. O cliente quer um BEM (imovel ou automovel) via consorcio. NAO fale em financiamento, entrada, MCMV nem visita a imovel.\n\nEscreva SO a proxima mensagem (1 a 2 frases curtas), portugues do Brasil informal, no MEU jeito.\n\nREGRA DE OURO: responda ESPECIFICO o que o cliente falou por ultimo e empurre com um PASSO CONCRETO (simulacao/apresentacao da carta).\n\n${BANNED}\nNAO repita o que ja foi dito; NAO comece com \"oi/ola/bom dia\" se a conversa ja rola.\n\nDevolva APENAS a mensagem, sem aspas.`;
    ctx = `Interesse ja informado: bem=${lead.tipo_bem || '-'}, valor=${lead.valor_bem || '-'}, parcela=${lead.parcela || '-'}. momento=${ls?.momento || '-'}.`;
    cta = 'puxando a apresentacao da carta';
  } else {
    sys = `Voce e ${brokerName || 'o corretor'}, corretor de imoveis do Minha Casa Minha Vida, escrevendo pelo SEU WhatsApp para o cliente ${leadFirst}. Voce e o PROPRIO corretor — NUNCA diga que e IA.\n\nEscreva SO a proxima mensagem (1 a 2 frases curtas), portugues do Brasil informal, no MEU jeito.\n\nREGRA DE OURO: responda ESPECIFICO o que o cliente falou por ultimo e empurre pra VISITA com um PASSO CONCRETO.\n\n${BANNED}\nNAO repita; NAO comece com \"oi/ola/bom dia\" se a conversa ja rola.\n\nDevolva APENAS a mensagem, sem aspas.`;
    ctx = `Contexto: tema=${ls?.tema || '-'}, momento=${ls?.momento || '-'}, temperatura=${ls?.intencao || '-'}.`;
    cta = 'puxando a visita';
  }
  const usr = `Meu jeito de escrever (exemplos meus):\n${style || '(sem exemplos)'}\n\n${ctx}\n\nConversa ate agora:\n${hist || '(o cliente respondeu meu primeiro contato)'}\n\nEscreva minha proxima mensagem (curta, especifica, ${cta}):`;
  return { sys, usr };
}

const HIGH = ['VISIT_SCHEDULED', 'VISITA_REALIZADA', 'DOCS_REQUESTED', 'CONCLUDED', 'ABANDONED', 'EXCLUDED'];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sb = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  const body = await req.json().catch(() => ({}));
  const onlyLead = body?.lead_id ? String(body.lead_id) : '';
  const dry = body?.preview === true;

  const { data: scfg } = await sb.from('system_settings').select('key,value').in('key', ['comandra_pilot_phones', 'comandra_handoff_timeout_min']);
  const smap = {}; for (const r of (scfg || [])) smap[r.key] = r.value;
  const pilots = Array.isArray(smap['comandra_pilot_phones']) ? smap['comandra_pilot_phones'] : [];
  const timeoutMin = Number(smap['comandra_handoff_timeout_min']) || 15;
  const now = Date.now();
  const deadlineCut = new Date(now - timeoutMin * 60000).toISOString();
  const staleCut = new Date(now - 6 * 3600000).toISOString();

  let q = sb.from('comandra_pending_action').select('*').eq('objective', 'handoff').eq('status', 'aguardando').gt('created_at', staleCut);
  if (onlyLead) q = q.eq('lead_id', onlyLead); else q = q.lt('created_at', deadlineCut);
  const { data: pendings } = await q.order('created_at', { ascending: true }).limit(20);

  const results = [];
  for (const p of (pendings || [])) {
    try {
      const { data: lead } = await sb.from('leads').select('id,name,phone,status,broker_id,contact_attempts,last_broker_whatsapp_at,pause_auto_messages,tipo_bem,valor_bem,parcela, broker:profiles!broker_id(id,first_name,bot_instance_id,team_id)').eq('id', p.lead_id).maybeSingle();
      if (!lead || !lead.broker_id) { await closeP(sb, p.id, 'lead_sumiu'); results.push({ lead: p.lead_id, action: 'lead_sumiu' }); continue; }
      if (lead.last_broker_whatsapp_at && Date.parse(lead.last_broker_whatsapp_at) > Date.parse(p.created_at)) { await closeP(sb, p.id, 'resolvido_corretor'); results.push({ lead: p.lead_id, action: 'resolvido_corretor' }); continue; }
      const broker = lead.broker;
      if (!broker?.bot_instance_id) { await closeP(sb, p.id, 'sem_chip'); results.push({ lead: p.lead_id, action: 'sem_chip' }); continue; }
      const { data: chip } = await sb.from('bot_instances').select('instance_name,evolution_api_url,evolution_api_key,phone,status,real_state').eq('id', broker.bot_instance_id).maybeSingle();
      if (!chip?.instance_name || !chip?.phone) { await closeP(sb, p.id, 'chip_incompleto'); results.push({ lead: p.lead_id, action: 'chip_incompleto' }); continue; }
      if (!pilots.some((pp) => phoneMatch(pp, chip.phone))) { await closeP(sb, p.id, 'nao_piloto'); results.push({ lead: p.lead_id, action: 'nao_piloto' }); continue; }

      let vertical = 'mcmv';
      if (broker.team_id) { const { data: tm } = await sb.from('teams').select('vertical').eq('id', broker.team_id).maybeSingle(); if (tm?.vertical) vertical = tm.vertical; }

      const { data: ls } = await sb.from('lead_state').select('momento,modo,tema,intencao').eq('lead_id', p.lead_id).maybeSingle();
      const chipAlive = chip.real_state === 'open' || ['open', 'online'].includes(String(chip.status || '').toLowerCase());
      const url = chip.evolution_api_url || 'https://api.ape77.com.br';
      const leadFirst = firstName(lead.name);
      if (!chipAlive) { if (!dry) await closeP(sb, p.id, 'chip_offline'); results.push({ lead: p.lead_id, action: 'chip_offline' }); continue; }

      let alerta = null;
      if (lead.pause_auto_messages) alerta = 'pausado';
      else if (HIGH.includes(lead.status)) alerta = 'estagio_' + lead.status;
      if (alerta) {
        if (!dry) { await sendSelf(url, chip.evolution_api_key || '', chip.instance_name, chip.phone, `⚠️ *${leadFirst} te respondeu e tá esperando.* Esse tá num momento que só você resolve — dá uma olhada e responde ele. 🔥`); await closeP(sb, p.id, 'alertado'); }
        results.push({ lead: p.lead_id, action: 'alertado', alerta }); continue;
      }

      const { data: conv } = await sb.from('ia_conversations').select('id').eq('lead_id', p.lead_id).order('created_at', { ascending: false }).limit(1).maybeSingle();
      let hist = '';
      if (conv?.id) {
        const { data: msgs } = await sb.from('ia_messages').select('direction,message_text').eq('conversation_id', conv.id).not('message_text', 'is', null).order('created_at', { ascending: true }).limit(16);
        hist = (msgs || []).map((m) => (m.direction === 'incoming' ? 'Cliente: ' : 'Eu: ') + (m.message_text || '').slice(0, 300)).join('\n');
      }
      const { data: kit } = await sb.from('comandra_broker_kit').select('body').eq('broker_phone', chip.phone).eq('format', 'text').eq('is_active', true).not('body', 'is', null).limit(6);
      const style = (kit || []).map((k) => '- ' + (k.body || '').slice(0, 200)).join('\n');

      const { sys, usr } = buildPrompt(vertical, broker.first_name, leadFirst, lead, ls, style, hist);
      const raw = await callLLM(sys, usr);
      if (!raw) {
        if (!dry) { await sendSelf(url, chip.evolution_api_key || '', chip.instance_name, chip.phone, `💬 *${leadFirst} te respondeu e tá esperando resposta.* Dá uma olhada nele — tá quente. 🔥`); await closeP(sb, p.id, 'alertado_sem_sugestao'); }
        results.push({ lead: p.lead_id, action: 'alertado_sem_sugestao' }); continue;
      }
      const text = raw.replace(/^[\"']|[\"']$/g, '').trim();

      if (dry) { results.push({ lead: p.lead_id, action: 'would_suggest', vertical, sugestao: text }); continue; }

      const snip = p.message ? `“${String(p.message).slice(0, 140)}”\n` : '';
      const sugMsg = `💬 *${leadFirst} te respondeu e tá esperando.*\n${snip}\nQuer que eu responda por você? Sugestão:\n\n_${text}_\n\n👉 Manda essa, me diz que eu ajusto, ou responde você mesmo. 👊`;
      const okS = await sendSelf(url, chip.evolution_api_key || '', chip.instance_name, chip.phone, sugMsg);
      await markP(sb, p.id, okS ? 'sugerido' : 'erro_envio', text);
      results.push({ lead: p.lead_id, action: okS ? 'sugerido' : 'erro_envio', vertical, sugestao: text });
    } catch (e) { results.push({ lead: p.lead_id, action: 'erro', err: String(e?.message || e) }); }
  }

  return new Response(JSON.stringify({ ok: true, timeoutMin, processed: (pendings || []).length, results }), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
