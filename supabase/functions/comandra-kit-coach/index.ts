import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Comandra — KIT COACH v4: ouve o AUDIO de boas-vindas, transcreve, e sugere 2 versoes que ABREM CONVERSA
// (gancho no bem que o lead JA quer via {bem}, pergunta de AVANCO, sem pitch, sem re-perguntar). body:{ broker_phone, send? }.

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
function phoneVariants(p) { const noPlus = (p || '').replace(/^\+/, ''); const v = [p, noPlus, `+${noPlus}`]; const m = noPlus.match(/^55([1-9][1-9][0-9]{8,9})$/); if (m) v.push(m[1], `+${m[1]}`); else if (/^[1-9][1-9][0-9]{8,9}$/.test(noPlus)) v.push(`55${noPlus}`, `+55${noPlus}`); return [...new Set(v.filter(Boolean))]; }
async function sendSelf(url, key, instance, phone, text) { try { const r = await fetch(`${url}/message/sendText/${instance}`, { method: 'POST', headers: { 'apikey': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ number: phone, text }) }); return r.status >= 200 && r.status < 300; } catch { return false; } }
function b64ToBytes(b64) { const clean = String(b64).replace(/^data:[^,]+,/, ''); const bin = atob(clean); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return arr; }

async function whisper(ok, bytes, mime) {
  try {
    const fd = new FormData();
    fd.append('file', new Blob([bytes], { type: mime || 'audio/ogg' }), 'welcome.ogg');
    fd.append('model', 'whisper-1'); fd.append('language', 'pt');
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { 'Authorization': 'Bearer ' + ok }, body: fd });
    const j = await r.json(); return j?.text || '';
  } catch { return ''; }
}
async function geminiTranscribe(gk, b64, mime) {
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${gk}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data: b64 } }, { text: 'Transcreva fielmente este audio em portugues. Responda so a transcricao.' }] }] }) });
    const j = await r.json(); return j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  } catch { return ''; }
}

async function coach(ok, gk, persona, vertical) {
  const sys = `Voce e especialista em COPYWRITING e vendas consultivas (SPIN) para o PRIMEIRO contato no WhatsApp de um ${persona}. O trabalho da mensagem de boas-vindas NAO e vender — e ABRIR A CONVERSA e ganhar a primeira resposta.`;
  const bemEx = vertical === 'consorcio' ? 'imovel ou automovel' : 'imovel';
  const usr = `IMPORTANTE: o lead ja chega QUALIFICADO do anuncio — o sistema JA sabe o BEM que ele quer (${bemEx}), o VALOR e a PARCELA. Entao a mensagem NUNCA deve perguntar \"o que voce quer\" nem o valor (e redundante e passa a sensacao de que ninguem leu o cadastro).\n\nA mensagem de boas-vindas deve: (1) cumprimentar caloroso e citar o bem que ele quer usando o placeholder {bem}; (2) fazer UMA pergunta que AVANCA o proximo passo e e facil de responder (ex: \"quer que eu ja te mande uma simulacao rapida?\", \"prefere que eu te explique por aqui ou te ligo rapidinho?\"); (3) NAO despejar beneficio/pitch (juros, desconto, \"paga o dobro\", simulacao vendida) — isso vem DEPOIS da 1a resposta. Curta (pra falar em ~15-20s), calorosa e informal, brasileira. Use {nome} e {bem}.\n\nGere DUAS opcoes diferentes seguindo isso. Responda SOMENTE JSON valido: {\"diagnostico\":\"1 frase do que falta de fisgada no audio atual dele\",\"opcao1\":\"...\",\"opcao2\":\"...\"}`;
  if (ok) { try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Authorization': 'Bearer ' + ok, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }], temperature: 0.6, max_tokens: 500, response_format: { type: 'json_object' } }) });
    const j = await r.json(); const t = j?.choices?.[0]?.message?.content; if (t) return JSON.parse(t);
  } catch {} }
  if (gk) { try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${gk}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: sys + '\n\n' + usr }] }], generationConfig: { temperature: 0.6, maxOutputTokens: 500 } }) });
    const j = await r.json(); const raw = j?.candidates?.[0]?.content?.parts?.[0]?.text || ''; const m = raw.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]);
  } catch {} }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const body = await req.json().catch(() => ({}));
    const brokerPhone = body?.broker_phone || '';
    const doSend = body?.send === true;
    if (!brokerPhone) return new Response(JSON.stringify({ error: 'broker_phone required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });

    const { data: kit } = await sb.from('comandra_broker_kit').select('slot_type,format,body,audio_base64,audio_mime').eq('broker_phone', brokerPhone).eq('slot_type', 'welcome');
    const wAudio = (kit || []).find((k) => k.format === 'audio' && k.audio_base64);
    const wText = (kit || []).find((k) => k.format === 'text' && k.body);

    let vertical = 'mcmv'; let chip = null;
    const { data: chips } = await sb.from('bot_instances').select('id, instance_name, evolution_api_url, evolution_api_key').in('phone', phoneVariants(brokerPhone)).like('evolution_api_url', 'https://%').limit(1);
    chip = chips?.[0];
    if (chip?.id) { const { data: prof } = await sb.from('profiles').select('team_id').eq('bot_instance_id', chip.id).maybeSingle(); if (prof?.team_id) { const { data: tm } = await sb.from('teams').select('vertical').eq('id', prof.team_id).maybeSingle(); if (tm?.vertical) vertical = tm.vertical; } }
    const persona = vertical === 'consorcio' ? 'consultor de consorcio (cartas de credito)' : 'corretor de imoveis do Minha Casa Minha Vida';

    const ok = Deno.env.get('OPENAI_API_KEY');
    const gk = Deno.env.get('GEMINI_API_KEY');

    let transcricao = '';
    if (wAudio) {
      const mime = String(wAudio.audio_mime || 'audio/ogg').split(';')[0].trim();
      if (ok) transcricao = await whisper(ok, b64ToBytes(wAudio.audio_base64), mime);
      if (!transcricao && gk) transcricao = await geminiTranscribe(gk, String(wAudio.audio_base64).replace(/^data:[^,]+,/, ''), mime);
    }

    const c = await coach(ok, gk, persona, vertical);
    if (!c) return new Response(JSON.stringify({ error: 'coach_falhou', transcricao }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    const out = { vertical, current_text: wText?.body || null, transcricao, diagnostico: c.diagnostico || '', opcao1: c.opcao1 || '', opcao2: c.opcao2 || '' };

    if (doSend && chip?.instance_name && (out.opcao1 || out.opcao2)) {
      const url = chip.evolution_api_url || 'https://api.ape77.com.br';
      const diag = transcricao ? `Ouvi seu áudio de boas-vindas 🎧 é simpático, mas dá pra deixar com mais *fisgada* — ${out.diagnostico}` : `Sobre sua mensagem de boas-vindas: dá pra deixar com mais *fisgada* — ${out.diagnostico}`;
      const msg = `${diag}\n\nLembra que o *primeiro contato é o momento mais quente* — a ideia é puxar a 1ª resposta, não já vender. E como o lead já chega dizendo o que quer, nem precisa perguntar de novo. 😉\n\n2 sugestões no seu jeito (o {bem} e o {nome} eu troco automaticamente por lead):\n\n1️⃣ ${out.opcao1}\n\n2️⃣ ${out.opcao2}\n\nCurtiu? Me diz *1* ou *2*, manda a sua versão, ou grava um áudio novo. 👊`;
      const sent = await sendSelf(url, chip.evolution_api_key || '', chip.instance_name, brokerPhone, msg);
      out.sent = sent;
    }

    return new Response(JSON.stringify(out, null, 2), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err) { return new Response(JSON.stringify({ error: err?.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }); }
}); 
