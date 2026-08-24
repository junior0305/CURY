import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const COMANDRA_INSTANCE = 'COMANDRA';

function normalizeText(text) { return (text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }

const OPT_OUT_PATTERNS = ['nao quero mais','nao quero receber','nao quero contato','para de me','pare de me','para de enviar','pare de enviar','para de mandar','pare de mandar','nao tenho interesse','sem interesse','me retire','me tire da lista','me remova','me descadastre','descadastrar','nao me contacte','nao me contate','nao me envie','nao me mande','nao preciso','nao quero','stop','unsubscribe','cancelar mensagens','parar mensagens','remover contato'];
function detectOptOut(text) { if (!text) return false; const n = normalizeText(text); return OPT_OUT_PATTERNS.some(p => n.includes(p)); }

const PIPELINE_KEYWORDS = ['visita','visit','agend','amanha','semana que vem','proxima semana','tour','conhecer o imovel','ver o imovel','document','rg',' cpf','comprovante','renda','contrato','proposta','assinar','mandei','enviei','mando','vou enviar','ja enviei'];
function hasPipelineKeyword(text) { if (!text) return false; const n = normalizeText(text); return PIPELINE_KEYWORDS.some(kw => n.includes(kw)); }

async function openaiJSON(system, user, key, maxTokens) {
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], response_format: { type: 'json_object' }, max_tokens: maxTokens, temperature: 0 }) });
    const j = await r.json().catch(() => null); const txt = j?.choices?.[0]?.message?.content; return txt ? JSON.parse(txt) : null;
  } catch { return null; }
}

async function analyzeConversationStatus(supabase, leadId, lastMessage, openaiKey) {
  try {
    const { data: conv } = await supabase.from('ia_conversations').select('id').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!conv?.id) return null;
    const { data: msgs } = await supabase.from('ia_messages').select('direction, message_text').eq('conversation_id', conv.id).order('created_at', { ascending: false }).limit(10);
    if (!msgs || msgs.length < 2) return null;
    const history = [...msgs].reverse().map((m) => `[${m.direction === 'incoming' ? 'LEAD' : 'BOT'}] ${m.message_text}`).join('\n');
    const parsed = await openaiJSON('Identifique avano no pipeline MCMV. Responda APENAS JSON: {"suggested_status":"VISIT_SCHEDULED" ou "DOCS_REQUESTED" ou null,"reason":"motivo curto"}. VISIT_SCHEDULED=confirmou visita. DOCS_REQUESTED=enviou/confirmou documentos. null=sem evidencia.', `Historico:\n${history}\n\nUltima: "${lastMessage}"`, openaiKey, 80);
    if (!parsed) return null;
    return { suggested_status: parsed.suggested_status || null, reason: parsed.reason || '' };
  } catch { return null; }
}

async function transcribeAudio(b64, mime, openaiKey) {
  try {
    const cleanB64 = b64.replace(/^data:[^;]+;base64,/, '');
    const bin = atob(cleanB64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const cleanMime = (mime || 'audio/ogg').split(';')[0].trim();
    const ext = cleanMime.includes('mp4') || cleanMime.includes('m4a') ? 'm4a' : cleanMime.includes('mpeg') || cleanMime.includes('mp3') ? 'mp3' : cleanMime.includes('wav') ? 'wav' : 'ogg';
    const form = new FormData(); form.append('file', new Blob([bytes], { type: cleanMime }), `audio.${ext}`); form.append('model', 'whisper-1'); form.append('language', 'pt');
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { 'Authorization': `Bearer ${openaiKey}` }, body: form });
    const j = await r.json().catch(() => null); return { text: (j?.text || '').trim() || null, raw: (JSON.stringify(j) || '').substring(0, 400) };
  } catch (e) { return { text: null, raw: 'exc:' + (e?.message || '') }; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const payload = await req.json().catch(() => null);
    console.log('[webhook_receiver] payload:', JSON.stringify(payload).substring(0, 1000));
    const slimPayload = payload ? { event: payload.event || payload.type || null, instance: payload.instance || payload.data?.instance || null, phone: payload?.data?.key?.remoteJid || payload?.key?.remoteJid || null, fromMe: payload?.data?.key?.fromMe ?? payload?.key?.fromMe ?? null, msgPreview: (payload?.data?.message?.conversation || payload?.data?.message?.extendedTextMessage?.text || '').substring(0, 200) || null } : null;
    const _evt = String(payload?.event || payload?.type || '').toLowerCase();
    if (payload && !(_evt.includes('qrcode') || _evt.includes('connection') || _evt === 'messages.update' || _evt.includes('presence') || _evt.includes('chats') || _evt.includes('contacts'))) {
      supabase.from('webhook_logs').insert({ integration_key: 'evolution', payload: slimPayload, status_code: 200 }).then(() => {}).catch(() => {});
    }

    const now = new Date().toISOString();
    const eventType = payload?.event || payload?.type || '';
    const instanceName = payload?.instance || payload?.data?.instance || '';

    if (eventType === 'CONNECTION_UPDATE' && instanceName) {
      const state = String(payload?.data?.state || 'unknown').toLowerCase();
      let newStatus; let healthScore;
      if (state === 'open') { newStatus = 'open'; healthScore = 100; } else if (state === 'connecting') { newStatus = 'connecting'; healthScore = 50; } else { newStatus = 'offline'; healthScore = 0; }
      await supabase.from('bot_instances').update({ status: newStatus, health_score: healthScore }).eq('instance_name', instanceName);
      return new Response(JSON.stringify({ success: true, event: 'CONNECTION_UPDATE', status: newStatus }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if ((eventType === 'QRCODE_UPDATED' || eventType === 'qrcode.updated') && instanceName) {
      const qrBase64 = payload?.data?.qrcode?.base64 || payload?.data?.base64 || null;
      if (qrBase64) { await supabase.from('bot_instances').update({ last_qr_base64: qrBase64, last_qr_at: now, status: 'connecting' }).eq('instance_name', instanceName); }
      return new Response(JSON.stringify({ success: true, event: 'QRCODE_UPDATED' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const rawPhone = payload?.data?.key?.remoteJid?.replace('@s.whatsapp.net', '') || payload?.key?.remoteJid?.replace('@s.whatsapp.net', '');
    const phoneNumber = rawPhone;
    const phoneVariantsGlobal = (() => {
      if (!rawPhone) return [];
      const noPlus = rawPhone.replace(/^\+/, '');
      const variants = [rawPhone, `+${noPlus}`, noPlus];
      const m55 = noPlus.match(/^55([1-9][1-9][0-9]{8,9})$/);
      if (m55) { variants.push(m55[1]); variants.push(`+${m55[1]}`); } else if (/^[1-9][1-9][0-9]{8,9}$/.test(noPlus)) { variants.push(`55${noPlus}`); variants.push(`+55${noPlus}`); }
      return variants.filter((v, i, a) => a.indexOf(v) === i);
    })();
    const fromMe = payload?.data?.key?.fromMe === true || payload?.key?.fromMe === true;
    let messageText = payload?.data?.message?.conversation || payload?.data?.message?.extendedTextMessage?.text || payload?.message?.conversation || payload?.message?.extendedTextMessage?.text;
    const messageId = payload?.data?.key?.id || payload?.key?.id;
    const _isAudioMsg = !!(payload?.data?.message?.audioMessage || payload?.message?.audioMessage) || /audio|ptt/i.test(String(payload?.data?.messageType || payload?.messageType || ''));

    async function isKnownBroker() {
      try {
        const { data: prof } = await supabase.from('profiles').select('id').in('phone', phoneVariantsGlobal).limit(1).maybeSingle();
        if (prof) return true;
        const { data: cb } = await supabase.from('comandra_broker').select('broker_phone').in('broker_phone', phoneVariantsGlobal).limit(1).maybeSingle();
        if (cb) return true;
        const { data: chip } = await supabase.from('bot_instances').select('id').in('phone', phoneVariantsGlobal).limit(1).maybeSingle();
        return !!chip;
      } catch { return false; }
    }

    if (instanceName === COMANDRA_INSTANCE && !fromMe && phoneNumber) {
      const known = await isKnownBroker();
      if (!known) {
        console.log(`[webhook_receiver] COMANDRA canal: numero desconhecido ignorado ${phoneNumber}`);
        return new Response(JSON.stringify({ success: true, ignored_unknown: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      try {
        await supabase.from('comandra_inbox').upsert({ instance_name: instanceName, broker_phone: phoneNumber, message_id: messageId, message_text: messageText ?? null, message_type: messageText ? 'text' : 'media', raw: slimPayload }, { onConflict: 'message_id', ignoreDuplicates: true });
        console.log(`[webhook_receiver] COMANDRA canal dedicado de ${phoneNumber}`);
      } catch (e) { console.warn('[webhook_receiver] comandra dedicado erro:', e?.message); }
      return new Response(JSON.stringify({ success: true, comandra: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (fromMe && phoneNumber && instanceName) {
      try {
        const { data: ownChips } = await supabase.from('bot_instances').select('phone').eq('instance_name', instanceName).limit(1);
        const ownChip = ownChips?.[0];
        const ownDigits = (ownChip?.phone || '').replace(/\D/g, '');
        const msgDigits = String(phoneNumber).replace(/\D/g, '');
        const isSelfChat = !!ownDigits && !!msgDigits && (ownDigits === msgDigits || ownDigits.endsWith(msgDigits) || msgDigits.endsWith(ownDigits));
        if (isSelfChat) {
          await supabase.from('comandra_inbox').upsert({ instance_name: instanceName, broker_phone: phoneNumber, message_id: messageId, message_text: messageText ?? null, message_type: messageText ? 'text' : 'media', raw: slimPayload }, { onConflict: 'message_id', ignoreDuplicates: true });
          return new Response(JSON.stringify({ success: true, comandra: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      } catch (e) { console.warn('[webhook_receiver] guard erro:', e?.message); }
    }

    if (!fromMe && messageText && phoneNumber) {
      try {
        const { data: echoConv } = await supabase.from('ia_conversations').select('id').in('lead_phone', phoneVariantsGlobal).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (echoConv?.id) {
          const { data: recentOut } = await supabase.from('ia_messages').select('message_text').eq('conversation_id', echoConv.id).eq('direction', 'outgoing').gte('created_at', new Date(Date.now() - 120000).toISOString()).order('created_at', { ascending: false }).limit(6);
          const nEcho = normalizeText(messageText);
          if (nEcho && (recentOut || []).some((m) => normalizeText(m.message_text || '') === nEcho)) {
            console.log('[webhook_receiver] ECO do corretor ignorado (fromMe=false)');
            return new Response(JSON.stringify({ success: true, echo_ignored: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
        }
      } catch (e) { console.warn('[webhook_receiver] anti-eco erro:', e?.message); }
    }

    if (!fromMe && !messageText && messageId && instanceName) {
      const isAudio = !!(payload?.data?.message?.audioMessage) || /audio|ptt/i.test(String(payload?.data?.messageType || ''));
      if (isAudio) {
        const { data: audioLead } = await supabase.from('leads').select('id').in('phone', phoneVariantsGlobal).not('status', 'in', '("ABANDONED","EXCLUDED")').limit(1).maybeSingle();
        const dbg = { phone: phoneNumber, is_lead: !!audioLead, message_type: payload?.data?.messageType || null, b64_payload: !!(payload?.data?.message?.base64 || payload?.data?.base64), b64_source: null, fetch_status: null, fetch_keys: null, transcribed: false, transcript: null, err: null, gemini_raw: null };
        if (audioLead?.id) {
          try {
            const openaiKey = Deno.env.get('OPENAI_API_KEY') || '';
            let b64 = payload?.data?.message?.base64 || payload?.data?.base64 || null;
            let useMime = payload?.data?.message?.audioMessage?.mimetype || 'audio/ogg';
            if (b64) dbg.b64_source = 'payload';
            if (!b64) {
              const { data: chipAs } = await supabase.from('bot_instances').select('evolution_api_url, evolution_api_key').eq('instance_name', instanceName).like('evolution_api_url', 'https://%').limit(1);
              const chipA = chipAs?.[0];
              if (chipA?.evolution_api_url) {
                const r = await fetch(`${chipA.evolution_api_url}/chat/getBase64FromMediaMessage/${instanceName}`, { method: 'POST', headers: { 'apikey': chipA.evolution_api_key || '', 'Content-Type': 'application/json' }, body: JSON.stringify({ message: { key: { id: messageId } } }) });
                dbg.fetch_status = r.status; const j = await r.json().catch(() => null); dbg.fetch_keys = j ? Object.keys(j).join(',') : null;
                if (r.ok && j) { b64 = j.base64 || j.media || j.buffer || null; if (j.mimetype) useMime = j.mimetype; if (b64) dbg.b64_source = 'fetch'; }
              }
            }
            if (b64 && openaiKey) { const tr = await transcribeAudio(b64, useMime, openaiKey); if (tr.text) { messageText = `🎤 ${tr.text}`; dbg.transcribed = true; dbg.transcript = tr.text.substring(0, 200); } else { dbg.err = 'whisper_vazio'; dbg.gemini_raw = tr.raw; } } else if (!b64) { dbg.err = 'sem_base64'; } else if (!openaiKey) { dbg.err = 'sem_openai_key'; }
          } catch (e) { dbg.err = 'exc: ' + (e?.message || ''); }
        }
        await supabase.from('comandra_audio_debug').insert(dbg).then(() => {}, () => {});
      }
    }

    if (messageId && !fromMe) {
      const dedupeKey = `evol_${messageId}`;
      const { data: alreadySeen } = await supabase.from('webhook_logs').select('id').eq('integration_key', dedupeKey).limit(1).maybeSingle();
      if (alreadySeen) { return new Response(JSON.stringify({ success: true, duplicate: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
      supabase.from('webhook_logs').insert({ integration_key: dedupeKey, payload: { messageId, phone: phoneNumber }, status_code: 200, response_body: 'dedup_marker' }).then(() => {}, () => {});
    }

    if (phoneNumber) {
      if (fromMe) {
        await supabase.from('leads').update({ last_broker_whatsapp_at: now }).in('phone', phoneVariantsGlobal).not('status', 'in', '("ABANDONED","EXCLUDED")');
        const { data: humanLeads } = await supabase.from('leads').select('id').in('phone', phoneVariantsGlobal).not('status', 'in', '("ABANDONED","EXCLUDED","CONCLUDED")').limit(5);
        for (const l of humanLeads || []) { await supabase.rpc('upsert_lead_state', { p_lead_id: l.id, p_modo: 'humano_ativo', p_bloqueado: true, p_ultimo_evento: 'corretor_respondeu', p_proxima_acao: 'aguardar', p_atualizado_por: 'webhook_receiver' }).then(() => {}, () => {}); }
        const { data: brokerLead } = await supabase.from('leads').select('id, status, name').in('phone', phoneVariantsGlobal).not('status', 'in', '("ABANDONED","EXCLUDED")').limit(1).maybeSingle();
        if (brokerLead?.id) {
          if (brokerLead.status === 'NEW') { await supabase.from('leads').update({ status: 'IN_PROGRESS' }).eq('id', brokerLead.id); }
          const { data: activeSess } = await supabase.from('ai_sentinela_sessions').select('id').eq('lead_id', brokerLead.id).eq('status', 'active').maybeSingle();
          if (activeSess) { await supabase.from('ai_sentinela_sessions').update({ status: 'broker_takeover', ended_at: now, end_reason: 'broker_takeover' }).eq('id', activeSess.id); }
          await supabase.from('lead_activation_queue').update({ status: 'cancelled', cancel_reason: 'broker_replied' }).eq('lead_id', brokerLead.id).eq('status', 'pending').in('action_type', ['broker_warmup', 'broker_alert', 'manager_alert']);
          const brokerLogText = messageText || (_isAudioMsg ? '🎤 [audio]' : null);
          if (brokerLogText) {
            const { data: selfBot } = await supabase.from('bot_instances').select('id').eq('instance_name', instanceName).limit(1).maybeSingle();
            const { data: gcId } = await supabase.rpc('get_or_create_active_conversation', { p_lead_id: brokerLead.id, p_bot: selfBot?.id || null, p_lead_name: brokerLead.name, p_lead_phone: phoneNumber });
            const convId = gcId || null;
            if (convId) {
              let dup = false;
              if (messageText) { const { data: recent } = await supabase.from('ia_messages').select('message_text').eq('conversation_id', convId).eq('direction', 'outgoing').gte('created_at', new Date(Date.now() - 180000).toISOString()).order('created_at', { ascending: false }).limit(20); const nT = normalizeText(messageText); dup = (recent || []).some((m) => normalizeText(m.message_text || '') === nT); }
              if (!dup) {
                await supabase.from('ia_messages').insert({ conversation_id: convId, message_text: brokerLogText, direction: 'outgoing', sender_type: 'broker', send_source: 'broker_manual', created_at: now });
                await supabase.from('ia_conversations').update({ last_message_at: now }).eq('id', convId).then(() => {}, () => {});
              }
            }
          }
        }
        return new Response(JSON.stringify({ success: true, fromMe: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } else {
        const phoneVariants = phoneVariantsGlobal;
        const { data: lead } = await supabase.from('leads').select('id, status, broker_id, name, welcome_responded_at, welcome_template_id, ai_qualification_queue_id, ai_qualified_at, broker:profiles!broker_id(id, first_name, phone, bot_instance_id, manager_id)').in('phone', phoneVariants).not('status', 'in', '("ABANDONED","EXCLUDED")').order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (lead) {
          if (messageText && detectOptOut(messageText)) {
            await supabase.from('leads').update({ status: 'EXCLUDED', last_interaction_at: now }).eq('id', lead.id);
            await supabase.from('lead_activation_queue').update({ status: 'cancelled', cancel_reason: 'opt_out' }).eq('lead_id', lead.id).eq('status', 'pending');
            await supabase.from('ai_sentinela_sessions').update({ status: 'ended', ended_at: now, end_reason: 'opt_out' }).eq('lead_id', lead.id).eq('status', 'active');
            if (lead.broker_id) { await supabase.from('internal_notifications').insert({ to_id: lead.broker_id, type: 'LEAD_OPT_OUT', title: '🚫 Lead pediu para nao ser contactado', message: `${lead.name} solicitou parar.`, related_lead_id: lead.id }); }
            await supabase.from('lead_notes').insert({ lead_id: lead.id, content: `🚫 Opt-out automatico.`, type: 'SYSTEM' });
            return new Response(JSON.stringify({ success: true, opt_out: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
          const updates = { last_lead_response_at: now };
          if (!lead.welcome_responded_at) {
            updates.welcome_responded_at = now;
            if (lead.welcome_template_id) { await supabase.rpc('record_welcome_template_responded', { p_template_id: lead.welcome_template_id }); }
            if (lead.broker_id) {
              await supabase.from('internal_notifications').insert({ to_id: lead.broker_id, type: 'LEAD_RESPONDED', title: '🔥 Lead respondeu! Atenda agora', message: `${lead.name} respondeu e esta esperando voce.`, related_lead_id: lead.id });
              try { const broker = lead.broker; if (broker?.phone) { let notifBotId = null; if (broker.manager_id) { const { data: mgr } = await supabase.from('profiles').select('bot_instance_id').eq('id', broker.manager_id).maybeSingle(); notifBotId = mgr?.bot_instance_id ?? null; } if (!notifBotId) { const { data: bs } = await supabase.from('system_settings').select('value').eq('key', 'notification_bot_instance_id').maybeSingle(); notifBotId = bs?.value ?? null; } if (notifBotId) { await supabase.functions.invoke('send_whatsapp_message', { body: { botId: notifBotId, phone: broker.phone, message: `🔥 *Lead respondeu!*\n\n👤 *${lead.name}* esta esperando voce.\n\n⚡ Abra o Comandra e atenda!` } }); } } } catch (wErr) { console.error('[webhook_receiver] Falha WhatsApp:', wErr.message); }
            }
          }
          await supabase.from('leads').update(updates).eq('id', lead.id);
          if (messageText) {
            const openaiKey = Deno.env.get('OPENAI_API_KEY') || '';
            if (openaiKey) {
              const cls = await openaiJSON('Classifique a mensagem de um lead de imovel MCMV. Responda APENAS JSON: {"intencao":"quente" ou "morno" ou "frio","tema":"preco" ou "entrada" ou "localizacao" ou "documentacao" ou "sem_info","momento":"explorando" ou "comparando" ou "decidido" ou "sumiu"}', `Mensagem do lead: "${messageText}"`, openaiKey, 60);
              if (cls?.intencao) { await supabase.rpc('upsert_lead_state', { p_lead_id: lead.id, p_intencao: cls.intencao, p_tema: cls.tema, p_momento: cls.momento, p_ultimo_evento: 'lead_respondeu', p_proxima_acao: cls.intencao === 'quente' ? 'alertar_gerente' : 'aguardar', p_atualizado_por: 'classificador_ia' }).then(() => {}, () => {}); }
              else { await supabase.rpc('upsert_lead_state', { p_lead_id: lead.id, p_ultimo_evento: 'lead_respondeu', p_proxima_acao: 'aguardar', p_atualizado_por: 'webhook_receiver' }).then(() => {}, () => {}); }
            } else { await supabase.rpc('upsert_lead_state', { p_lead_id: lead.id, p_ultimo_evento: 'lead_respondeu', p_proxima_acao: 'aguardar', p_atualizado_por: 'webhook_receiver' }).then(() => {}, () => {}); }
          }
          if (messageText && hasPipelineKeyword(messageText)) {
            const openaiKey2 = Deno.env.get('OPENAI_API_KEY') || '';
            if (openaiKey2) { try { const { data: recentCheck } = await supabase.from('automation_logs').select('id').eq('entity_id', lead.id).eq('entity_type', 'ia_status_analysis').gte('executed_at', new Date(Date.now() - 2 * 3600000).toISOString()).limit(1).maybeSingle(); if (!recentCheck) { const sa = await analyzeConversationStatus(supabase, lead.id, messageText, openaiKey2); await supabase.from('automation_logs').insert({ entity_type: 'ia_status_analysis', entity_id: lead.id, status: 'success', message_sent: sa?.suggested_status ? `${lead.status} → ${sa.suggested_status}` : 'sem mudanca', recipient_phone: lead.phone }).then(() => {}, () => {}); if (sa?.suggested_status) { const ORD = ['NEW', 'IN_PROGRESS', 'VISIT_SCHEDULED', 'DOCS_REQUESTED', 'CONCLUDED']; if (ORD.indexOf(sa.suggested_status) > ORD.indexOf((lead.status || 'NEW').toUpperCase())) { await supabase.from('leads').update({ status: sa.suggested_status }).eq('id', lead.id); await supabase.from('lead_notes').insert({ lead_id: lead.id, content: `📊 Status pela IA: ${lead.status} → ${sa.suggested_status}. ${sa.reason}`, type: 'SYSTEM' }).then(() => {}, () => {}); } } } } catch (e) { console.warn('[webhook_receiver] Pipeline falhou:', e.message); } }
          }
          await supabase.from('lead_activation_queue').update({ status: 'cancelled', cancel_reason: 'lead_responded' }).eq('lead_id', lead.id).eq('status', 'pending').in('action_type', ['toque_1', 'toque_2', 'sentinela', 'last_chance']);
          const { data: ls } = await supabase.from('lead_state').select('intencao').eq('lead_id', lead.id).maybeSingle();
          const isHot = ls?.intencao === 'quente';
          const queueItems = isHot ? [{ lead_id: lead.id, action_type: 'broker_alert', scheduled_for: new Date(Date.now() + 5 * 60000).toISOString() }, { lead_id: lead.id, action_type: 'auto_resposta', scheduled_for: new Date(Date.now() + 15 * 60000).toISOString() }, { lead_id: lead.id, action_type: 'manager_alert', scheduled_for: new Date(Date.now() + 30 * 60000).toISOString() }] : [{ lead_id: lead.id, action_type: 'broker_warmup', scheduled_for: new Date(Date.now() + 35 * 60000).toISOString() }, { lead_id: lead.id, action_type: 'broker_alert', scheduled_for: new Date(Date.now() + 2 * 3600000).toISOString() }, { lead_id: lead.id, action_type: 'manager_alert', scheduled_for: new Date(Date.now() + 4 * 3600000).toISOString() }];
          try { await supabase.from('lead_activation_queue').insert(queueItems); } catch {}
        } else {
          const { data: cold } = await supabase.from('cold_contacts').select('id, claimed_by, name').in('phone', phoneVariants).eq('status', 'claimed').not('claimed_by', 'is', null).limit(1).maybeSingle();
          if (cold?.id) { const { data: newLeadId } = await supabase.rpc('promote_cold_to_lead', { p_contact_id: cold.id }); if (newLeadId && cold.claimed_by) { await supabase.from('internal_notifications').insert({ to_id: cold.claimed_by, type: 'COLD_PROMOTED', title: '🔥 Prospect respondeu — virou lead!', message: `${cold.name} respondeu.`, related_lead_id: newLeadId }); } }
        }
      }
    }

    if (!phoneNumber || !messageText) { return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }

    const { data: leadStatusCheck } = await supabase.from('leads').select('id, status, pause_auto_messages').in('phone', phoneVariantsGlobal).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (leadStatusCheck && ['EXCLUDED', 'ABANDONED', 'CONCLUDED'].includes(leadStatusCheck.status)) { return new Response(JSON.stringify({ success: true, blocked: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
    const pauseAutoMessages = leadStatusCheck?.pause_auto_messages === true;

    const { data: conversation } = await supabase.from('ia_conversations').select('*').in('lead_phone', phoneVariantsGlobal).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!conversation) {
      const { data: lead } = await supabase.from('leads').select('*, profiles!broker_id(*)').in('phone', phoneVariantsGlobal).not('status', 'in', '("ABANDONED","EXCLUDED","CONCLUDED")').maybeSingle();
      if (lead && lead.profiles && lead.profiles.bot_instance_id) {
        const broker = lead.profiles;
        const { data: convId2 } = await supabase.rpc('get_or_create_active_conversation', { p_lead_id: lead.id, p_bot: broker.bot_instance_id, p_lead_name: lead.name, p_lead_phone: phoneNumber });
        if (convId2 && messageText) { await supabase.from('ia_messages').insert({ conversation_id: convId2, message_text: messageText, direction: 'incoming', sender_type: 'lead', created_at: new Date().toISOString() }); const aiAssistOn = broker?.automation_settings?.ai_assist_enabled === true; if (!pauseAutoMessages && aiAssistOn) { await supabase.functions.invoke('ia_chat_engine', { body: { conversationId: convId2, incomingMessage: messageText } }); } }
        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ message: 'No active conversation' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await supabase.from('ia_messages').insert({ conversation_id: conversation.id, message_text: messageText, direction: 'incoming', sender_type: 'lead', created_at: new Date().toISOString() });
    if (!conversation.last_message_at && conversation.template_id) { await supabase.rpc('increment_template_response', { p_template_id: conversation.template_id }).then(() => {}, () => {}); }
    await supabase.from('ia_conversations').update({ messages_count: (conversation.messages_count || 0) + 1, last_message_at: new Date().toISOString() }).eq('id', conversation.id);

    const { data: convLead } = await supabase.from('leads').select('ai_qualification_queue_id, ai_qualified_at, broker:profiles!broker_id(automation_settings)').eq('id', conversation.lead_id).maybeSingle();
    const convBrokerAiOn = convLead?.broker?.automation_settings?.ai_assist_enabled === true;
    const isProspeccao = !!conversation.campaign_id;
    if (convLead?.ai_qualification_queue_id && !convLead?.ai_qualified_at) { if (!pauseAutoMessages) { supabase.functions.invoke('agente-qualificacao-ia', { body: {} }).then(() => {}, () => {}); } }
    else if (convLead?.ai_qualification_queue_id && convLead?.ai_qualified_at && !pauseAutoMessages) { try { const { data: queue } = await supabase.from('distribution_queues').select('ai_agent_broker_id').eq('id', convLead.ai_qualification_queue_id).maybeSingle(); if (queue?.ai_agent_broker_id) { const { data: aiAgent } = await supabase.from('profiles').select('bot_instance_id, first_name').eq('id', queue.ai_agent_broker_id).maybeSingle(); if (aiAgent?.bot_instance_id) { const { data: cf } = await supabase.from('leads').select('name, phone, broker:profiles!broker_id(first_name)').eq('id', conversation.lead_id).maybeSingle(); const bn = cf?.broker?.first_name || 'nosso corretor'; await supabase.functions.invoke('send_whatsapp_message', { body: { botId: aiAgent.bot_instance_id, phone: cf?.phone, message: `Oi ${cf?.name?.split(' ')[0] || ''}! Voce ja esta sendo atendido por ${bn}, que vai entrar em contato em breve. 😊` } }); } } } catch (e) { console.warn('[webhook_receiver] handoff falhou:', e.message); } }
    else { if (!pauseAutoMessages && (isProspeccao || convBrokerAiOn)) { await supabase.functions.invoke('ia_chat_engine', { body: { conversationId: conversation.id, incomingMessage: messageText } }); } }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[webhook_receiver] error', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
