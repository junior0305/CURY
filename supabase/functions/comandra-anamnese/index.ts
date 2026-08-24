import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

// --- Os 5 follow-ups aprovados pelo Junior ("essas para mim sao boas") ---
const FU_EXAMPLES = [
  'Oi {nome}, tudo bem? Olha, estou fazendo uma limpa aqui nos meus contatos da semana passada e vi que a gente acabou nao se falando mais sobre o imovel. So para eu nao ficar te incomodando: voce ainda esta interessado em um apartamento dentro do Minha Casa Minha Vida?',
  '{nome}, tudo bem? Voce sumiu... Deu certo aquilo que voce estava vendo de comprar o imovel ou deu alguma travada? Ainda estou com aquela oportunidade de financiamento 100%, ou seja, dependendo do perfil isso significa ZERO de entrada.',
  '{nome}, peco desculpas pela correria dos ultimos tempos, acabei nao conseguindo te dar o retorno que voce merecia aquela vez. Como estao os planos do imovel? Conseguiu avancar ou quer que eu te atualize das novidades?',
  'Oi {nome}, tudo certo? So uma duvida rapida para eu atualizar seu historico aqui: voce ainda tem interesse em sair do aluguel / comprar o seu imovel este ano? ( ) Sim ( ) Nao',
  '{nome}, passando para te dar um toque rapido. Teve uma mudanca bem positiva essa semana dentro do Minha Casa Minha Vida. O Governo aumentou a ajuda e a aprovacao do credito ficou mais facil. Pensei em voce. Quer que eu simule para ver como ficaria o seu caso hoje?'
];
// --- 3 modelos de boas-vindas que funcionam (a Comandra sugere se a corretora pedir) ---
const WELCOME_EXAMPLES = [
  'Oi {nome}, tudo bem? Vi que voce tem interesse em um imovel do Minha Casa Minha Vida. Posso te mandar algumas opcoes com a parcela que cabe no seu bolso?',
  'Ola {nome}! Que bom seu interesse em sair do aluguel. Trabalho com o Minha Casa Minha Vida e consigo simular pra voce sem compromisso. Quer que eu veja as melhores condicoes pro seu perfil?',
  'Oi {nome}, tudo certo? Tenho novidades do Minha Casa Minha Vida que facilitaram MUITO a aprovacao (em alguns casos ZERO de entrada). Posso te explicar rapidinho como ficaria no seu caso?'
];
const DEFAULT_WELCOME = WELCOME_EXAMPLES[0];
const AUDIO_TIP = 'Oi, tentei falar com voce algumas vezes, desculpe por ser chato, mas tenho uma oportunidade com parcela de 800 reais e acho que voce vai gostar';

function norm(t: string): string { return (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s:]/g, ' ').replace(/\s+/g, ' ').trim(); }
function digits(p: string): string { return (p || '').replace(/\D/g, ''); }
function phoneVariants(p: string): string[] { const noPlus = (p || '').replace(/^\+/, ''); const v = [p, noPlus, `+${noPlus}`]; const m = noPlus.match(/^55([1-9][1-9][0-9]{8,9})$/); if (m) { v.push(m[1], `+${m[1]}`); } else if (/^[1-9][1-9][0-9]{8,9}$/.test(noPlus)) { v.push(`55${noPlus}`, `+55${noPlus}`); } return [...new Set(v.filter(Boolean))]; }
function isTrigger(t: string): boolean { const n = norm(t); return /\b(anamnese|meus modelos|minhas mensagens|montar (meus )?(modelos|kit)|configurar (mensagens|kit|modelos))\b/.test(n); }
function isSkip(t: string): boolean { const n = norm(t); return ['pular','pula','depois','sem audio','skip','nao quero','passa'].includes(n) || /\bpular\b/.test(n); }
// sugestao so dispara em mensagem CURTA com palavra explicita (evita falso-positivo num welcome real)
function isSuggest(t: string): boolean { const n = norm(t); if (n.length > 40) return false; return /\b(exemplo|exemplos|sugere|sugira|sugestao|sugestoes|sugerir|me ajuda|nao sei|ideia|ideias|modelo|modelos)\b/.test(n); }
function isDone(t: string): boolean { const n = norm(t); return /\b(pronto|finaliza|finalizar|terminei|acabou|so isso|e isso|encerra)\b/.test(n); }
function normNome(t: string): string { return (t || '').replace(/\[\s*nome\s*\]/gi, '{nome}'); }

async function sendSelf(url: string, key: string, instance: string, phone: string, text: string): Promise<boolean> { try { const r = await fetch(`${url}/message/sendText/${instance}`, { method: 'POST', headers: { 'apikey': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ number: phone, text }) }); return r.status >= 200 && r.status < 300; } catch { return false; } }
async function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// pega o base64 do audio que o corretor gravou (pra reenviar na voz dele depois)
async function getAudioB64(url: string, key: string, instance: string, messageId: string, raw: any): Promise<{ b64: string; mime: string } | null> {
  const m = raw?.message || raw?.data?.message || raw || {};
  const mime = m?.audioMessage?.mimetype || 'audio/ogg; codecs=opus';
  const emb = m?.base64 || raw?.base64 || raw?.data?.base64;
  if (emb && typeof emb === 'string' && emb.length > 100) return { b64: emb, mime };
  const bodies: any[] = [];
  if (messageId) bodies.push({ message: { key: { id: messageId } }, convertToMp4: false });
  if (m && Object.keys(m).length) bodies.push({ message: m, convertToMp4: false });
  for (const b of bodies) {
    try {
      const r = await fetch(`${url}/chat/getBase64FromMediaMessage/${instance}`, { method: 'POST', headers: { 'apikey': key, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
      if (!r.ok) continue;
      const j = await r.json().catch(() => null);
      const b64 = j?.base64 || j?.media || j?.buffer;
      if (b64 && typeof b64 === 'string' && b64.length > 100) return { b64, mime: j?.mimetype || mime };
    } catch { /* tenta o proximo */ }
  }
  return null;
}

async function fuCount(supabase: any, phone: string): Promise<number> { const { count } = await supabase.from('comandra_broker_kit').select('id', { count: 'exact', head: true }).eq('broker_phone', phone).eq('slot_type', 'followup'); return count || 0; }
async function usedRefs(supabase: any, phone: string): Promise<number[]> { const { data } = await supabase.from('comandra_broker_kit').select('example_ref').eq('broker_phone', phone).eq('slot_type', 'followup'); return (data || []).map((r: any) => r.example_ref).filter((x: any) => x != null); }

async function setState(supabase: any, phone: string, status: string | null, step: any = {}) { await supabase.from('comandra_broker').upsert({ broker_phone: phone, anamnese_status: status, anamnese_step: step }, { onConflict: 'broker_phone' }); }

const MSG = {
  welcomeAsk: (nome: string) => `Bora deixar a Comandra com a *sua cara*, ${nome}! Leva 2 min e dai todo lead seu recebe na sua voz. 👊\n\n*1/3 — Sua mensagem de boas-vindas* (a 1a que o lead recebe de voce).\nEscreve do seu jeito, como voce gosta de se apresentar. Pode usar *{nome}* onde quiser que entre o nome do cliente.\n\n✍️ Manda a sua mensagem agora, digita *exemplo* que eu te sugiro 3 que ja funcionam, ou *pular* pra usar uma padrao.`,
  welcomeExamples: () => { const lines = WELCOME_EXAMPLES.map((m, i) => `${i + 1}️⃣ ${m}`).join('\n\n'); return `Essas aqui costumam funcionar bem 👇\n\n${lines}\n\nManda o *numero* da que voce gostou (ex: *1*), ou escreve a sua propria do jeito que preferir.`; },
  audioAsk: () => `🎙️ *2/3 — Audio de boas-vindas* (opcional, mas voz converte MUITO mais).\nGrava um audio curto na *sua voz*. Um que funciona bem:\n_\"${AUDIO_TIP}\"_\n\n👉 *Grava um audio agora* ou digita *pular*.`,
  fuIntro: () => { const lines = FU_EXAMPLES.map((m, i) => `${i + 1}️⃣ ${m}`).join('\n\n'); return `✅ Boas-vindas pronto!\n\n*3/3 — Seus follow-ups* (quando o lead some). Pode ter ate *5*, texto ou audio.\nEstas costumam funcionar — me manda os *numeros* que voce quer usar (ex: *1 3 5*):\n\n${lines}\n\n• Quer trocar uma pelo seu jeito? Manda *Alterar 2: sua mensagem*.\n• Quer um follow-up em *audio*? So *gravar* agora.\n• Quando terminar, digita *pronto*.`; },
  progress: (n: number) => `✅ Ja tenho *${n}/5* follow-ups.\nManda mais numeros, *Alterar N: ...*, um *audio*, ou *pronto* pra finalizar.`,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const body = await req.json().catch(() => ({}));
    const brokerPhone = body?.broker_phone || '';
    const text = body?.text || '';
    const messageType = body?.message_type || 'text';
    const messageId = body?.message_id || '';
    const raw = body?.raw || null;
    const inboxId = body?.inbox_id || null;
    const isText = !messageType || messageType === 'text' || messageType === 'conversation' || messageType === 'extendedTextMessage';
    if (!brokerPhone) return new Response(JSON.stringify({ error: 'broker_phone required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // resolve chip do corretor (self-chat) + perfil
    const { data: chips } = await supabase.from('bot_instances').select('id, instance_name, evolution_api_url, evolution_api_key').in('phone', phoneVariants(brokerPhone)).like('evolution_api_url', 'https://%').limit(1);
    const chip = chips?.[0];
    const url = chip?.evolution_api_url || 'https://api.ape77.com.br';
    const key = chip?.evolution_api_key || '';
    const instance = body?.instance_name || chip?.instance_name || '';
    let profileId = ''; let firstName = '';
    if (chip?.id) { const { data: prof } = await supabase.from('profiles').select('id, first_name').eq('bot_instance_id', chip.id).limit(1).maybeSingle(); profileId = prof?.id || ''; firstName = prof?.first_name || ''; }
    const nome = firstName || 'corretor';

    const { data: bstate } = await supabase.from('comandra_broker').select('anamnese_status, anamnese_step, onboarded_at').eq('broker_phone', brokerPhone).maybeSingle();
    const status = bstate?.anamnese_status || null;

    const finish = async (sup: any) => { await sup.from('comandra_broker').upsert({ broker_phone: brokerPhone, anamnese_status: 'done', anamnese_done_at: new Date().toISOString(), anamnese_step: {}, onboarded_at: bstate?.onboarded_at || new Date().toISOString() }, { onConflict: 'broker_phone' }); };
    const reply = async (t: string) => { const ok = await sendSelf(url, key, instance, brokerPhone, t); if (inboxId) await supabase.from('comandra_inbox').update({ status: ok ? 'done' : 'error', processed_at: new Date().toISOString() }).eq('id', inboxId); return ok; };

    // === Nao esta em anamnese: so inicia se for comando-gatilho ===
    if (!status || status === 'done') {
      if (isText && isTrigger(text)) { await setState(supabase, brokerPhone, 'welcome_text', {}); await reply(MSG.welcomeAsk(nome)); return new Response(JSON.stringify({ handled: true, status: 'welcome_text' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
      return new Response(JSON.stringify({ handled: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === PASSO 1: welcome texto ===
    if (status === 'welcome_text') {
      if (!isText) { await reply('Esse passo e por *texto* 🙂 Me escreve a sua mensagem de boas-vindas (ou digita *exemplo*). O audio e o proximo passo.'); return new Response(JSON.stringify({ handled: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
      const tnorm = norm(text);
      // a corretora pediu sugestao -> manda os 3 modelos e continua nesse passo
      if (isSuggest(text) && !isSkip(text)) { await reply(MSG.welcomeExamples()); return new Response(JSON.stringify({ handled: true, status: 'welcome_text', suggested: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
      // escolheu um numero do exemplo (mensagem curta = so o digito)
      const pick = tnorm.match(/^([1-3])$/);
      let wbody: string;
      if (isSkip(text)) { wbody = DEFAULT_WELCOME; }
      else if (pick) { wbody = WELCOME_EXAMPLES[parseInt(pick[1], 10) - 1]; }
      else { wbody = normNome(text.trim()); }
      await supabase.from('comandra_broker_kit').upsert({ broker_phone: brokerPhone, profile_id: profileId || null, slot_type: 'welcome', slot_index: 0, format: 'text', body: wbody, source: pick ? 'picked' : 'custom', updated_at: new Date().toISOString() }, { onConflict: 'broker_phone,slot_type,slot_index' });
      await setState(supabase, brokerPhone, 'welcome_audio', {});
      await reply(`Boa! Welcome salvo:\n\n_${wbody}_\n\n${MSG.audioAsk()}`);
      return new Response(JSON.stringify({ handled: true, status: 'welcome_audio' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === PASSO 2: welcome audio (opcional) ===
    if (status === 'welcome_audio') {
      if (!isText) {
        const a = await getAudioB64(url, key, instance, messageId, raw);
        if (a) { await supabase.from('comandra_broker_kit').upsert({ broker_phone: brokerPhone, profile_id: profileId || null, slot_type: 'welcome', slot_index: 1, format: 'audio', audio_base64: a.b64, audio_mime: a.mime, source: 'recorded', updated_at: new Date().toISOString() }, { onConflict: 'broker_phone,slot_type,slot_index' }); await setState(supabase, brokerPhone, 'followups', {}); await reply(`🎙️ Audio de boas-vindas salvo na sua voz!\n\n${MSG.fuIntro()}`); }
        else { await reply('Quase! Nao consegui capturar o audio agora 😕 Tenta gravar de novo, ou digita *pular*.'); }
        return new Response(JSON.stringify({ handled: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (isSkip(text)) { await setState(supabase, brokerPhone, 'followups', {}); await reply(MSG.fuIntro()); return new Response(JSON.stringify({ handled: true, status: 'followups' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
      await reply('Pra esse passo e so *gravar um audio* na sua voz, ou digitar *pular* 🙂');
      return new Response(JSON.stringify({ handled: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === PASSO 3: follow-ups (ate 5) ===
    if (status === 'followups') {
      let count = await fuCount(supabase, brokerPhone);
      const finishNow = async () => { await finish(supabase); const { data: kit } = await supabase.from('comandra_broker_kit').select('slot_type, format').eq('broker_phone', brokerPhone); const fus = (kit || []).filter((k: any) => k.slot_type === 'followup'); const wAudio = (kit || []).some((k: any) => k.slot_type === 'welcome' && k.format === 'audio'); await reply(`🎉 Pronto, ${nome}! Sua Comandra agora fala na *sua voz*:\n• Boas-vindas: texto${wAudio ? ' + audio' : ''}\n• ${fus.length} follow-up(s)\n\nDaqui pra frente, todo lead seu pode receber assim. Quer mudar depois? Manda *meus modelos*.`); };

      if (isText && isDone(text)) { if (count === 0) { await reply('Escolhe pelo menos *1* follow-up (manda um numero de 1 a 5) antes de finalizar 🙂'); return new Response(JSON.stringify({ handled: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } await finishNow(); return new Response(JSON.stringify({ handled: true, status: 'done' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }

      // audio como follow-up
      if (!isText) {
        if (count >= 5) { await reply('Voce ja tem *5* follow-ups (o maximo). Digita *pronto* pra finalizar.'); return new Response(JSON.stringify({ handled: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
        const a = await getAudioB64(url, key, instance, messageId, raw);
        if (a) { await supabase.from('comandra_broker_kit').insert({ broker_phone: brokerPhone, profile_id: profileId || null, slot_type: 'followup', slot_index: count + 1, format: 'audio', audio_base64: a.b64, audio_mime: a.mime, source: 'recorded' }); count++; await reply(`🎙️ Follow-up em audio salvo!\n${MSG.progress(count)}`); if (count >= 5) await finishNow(); }
        else { await reply('Nao consegui pegar esse audio 😕 Tenta de novo, ou manda um *numero* / *pronto*.'); }
        return new Response(JSON.stringify({ handled: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Alterar N: texto
      const alt = text.match(/alterar\s*(\d)\s*[:\-–]?\s*([\s\S]+)/i);
      if (alt) { if (count >= 5) { await reply('Ja tem *5* follow-ups. Digita *pronto*.'); return new Response(JSON.stringify({ handled: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } const ref = parseInt(alt[1], 10); const custom = normNome(alt[2].trim()); await supabase.from('comandra_broker_kit').insert({ broker_phone: brokerPhone, profile_id: profileId || null, slot_type: 'followup', slot_index: count + 1, format: 'text', body: custom, example_ref: ref >= 1 && ref <= 5 ? ref : null, source: 'custom' }); count++; await reply(`✏️ Anotei a sua versao!\n${MSG.progress(count)}`); if (count >= 5) await finishNow(); return new Response(JSON.stringify({ handled: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }

      // numeros escolhidos
      const picks = [...new Set((text.match(/[1-5]/g) || []).map((d: string) => parseInt(d, 10)))];
      if (picks.length) {
        const already = await usedRefs(supabase, brokerPhone); const added: number[] = [];
        for (const p of picks) { if (count >= 5) break; if (already.includes(p) || added.includes(p)) continue; await supabase.from('comandra_broker_kit').insert({ broker_phone: brokerPhone, profile_id: profileId || null, slot_type: 'followup', slot_index: count + 1, format: 'text', body: FU_EXAMPLES[p - 1], example_ref: p, source: 'picked' }); count++; added.push(p); }
        if (!added.length) await reply(`Esses voce ja escolheu 🙂 ${MSG.progress(count)}`);
        else { await reply(`✅ Adicionei o(s) ${added.join(', ')}.\n${MSG.progress(count)}`); if (count >= 5) await finishNow(); }
        return new Response(JSON.stringify({ handled: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      await reply(`Nao entendi 🙂 Manda os *numeros* (ex: *1 3 5*), *Alterar N: sua mensagem*, um *audio*, ou *pronto*.\n${MSG.progress(count)}`);
      return new Response(JSON.stringify({ handled: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ handled: false }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) { console.error('[comandra-anamnese] fatal', err?.message); return new Response(JSON.stringify({ error: err?.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
});
