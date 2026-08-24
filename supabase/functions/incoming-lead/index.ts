import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function phoneVariants(p: string): string[] {
  const noPlus = (p || '').replace(/^\+/, '');
  const v = [p, noPlus, `+${noPlus}`];
  const m = noPlus.match(/^55([1-9][1-9][0-9]{8,9})$/);
  if (m) { v.push(m[1], `+${m[1]}`); }
  else if (/^[1-9][1-9][0-9]{8,9}$/.test(noPlus)) { v.push(`55${noPlus}`, `+55${noPlus}`); }
  return [...new Set(v.filter(Boolean))];
}
async function sendAudioEvo(url: string, key: string, instance: string, phone: string, b64: string): Promise<boolean> {
  try {
    const audio = (b64 || '').replace(/^data:[^;]+;base64,/, '');
    const r = await fetch(`${url}/message/sendWhatsAppAudio/${instance}`, {
      method: 'POST', headers: { 'apikey': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: (phone || '').replace(/\D/g, ''), audio })
    });
    return r.status >= 200 && r.status < 300;
  } catch { return false; }
}
// ---- chip real: probe de envio (unica verdade). '.' no proprio numero do chip ----
async function sendTextEvo(url: string, key: string, instance: string, phone: string, text: string): Promise<boolean> {
  try { const r = await fetch(`${url}/message/sendText/${encodeURIComponent(instance)}`, { method:'POST', headers:{ apikey:key, 'Content-Type':'application/json' }, body: JSON.stringify({ number:(phone||'').replace(/\D/g,''), text }) }); return r.status>=200 && r.status<300; } catch { return false; }
}
async function probeChipAlive(url: string, key: string, instance: string, ownPhone: string): Promise<boolean> {
  if (!instance || !ownPhone) return false;
  return await sendTextEvo(url, key, instance, ownPhone, '.');
}
function brtToday(): string { const b = new Date(Date.now() - 3*3600*1000); return `${b.getUTCFullYear()}-${String(b.getUTCMonth()+1).padStart(2,'0')}-${String(b.getUTCDate()).padStart(2,'0')}`; }
// notifica o corretor pelo chip do GERENTE; se falhar, cai no chip do Junior (notification_bot_instance_id)
async function notifyBrokerViaManager(supabase: any, broker: any, message: string): Promise<boolean> {
  try {
    if (!broker?.phone) return false;
    let botId: string | null = null;
    if (broker.manager_id) { const { data:m } = await supabase.from('profiles').select('bot_instance_id').eq('id', broker.manager_id).maybeSingle(); botId = m?.bot_instance_id || null; }
    let junior: string | null = null;
    { const { data:bs } = await supabase.from('system_settings').select('value').eq('key','notification_bot_instance_id').maybeSingle(); junior = (bs?.value as any) || null; }
    let ok = false;
    if (botId) { const { data:r } = await supabase.functions.invoke('send_whatsapp_message', { body:{ botId, phone: broker.phone, message } }); ok = (r as any)?.success || false; }
    if (!ok && junior && junior !== botId) { const { data:r2 } = await supabase.functions.invoke('send_whatsapp_message', { body:{ botId: junior, phone: broker.phone, message } }); ok = (r2 as any)?.success || false; }
    return ok;
  } catch { return false; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const rawBody = await req.text().catch(() => '');
    if (!rawBody || rawBody.trim() === '') {
      return new Response(JSON.stringify({ error: 'Empty request body' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let payload: any = null;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      try {
        const sanitized = rawBody.replace(/"(?:[^"\\]|\\.)*"/g, (match) => match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t'));
        payload = JSON.parse(sanitized);
        console.warn('[incoming-lead] JSON sanitizado (newlines em strings)');
      } catch (parseErr2) {
        console.error('[incoming-lead] JSON parse error. Body preview:', rawBody.substring(0, 300));
        return new Response(JSON.stringify({ error: 'Invalid JSON', preview: rawBody.substring(0, 200) }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    if (!payload || typeof payload !== 'object') {
      return new Response(JSON.stringify({ error: 'Payload must be a JSON object' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const sourceData = payload.data?.attributes || payload.attributes || payload;
    const name = sourceData.name || sourceData.nome || sourceData.fullName || 'Lead Sem Nome';
    const rawPhone = sourceData.phone || sourceData.telefone || sourceData.cellphone || sourceData.whatsapp || sourceData.contact;
    let phone = rawPhone ? String(rawPhone).replace(/^[a-z]+:/i, '').replace(/[^0-9+]/g, '') : null;
    if (phone) {
      const onlyDigits = phone.replace(/^\+/, '');
      if (/^[1-9][1-9][0-9]{8,9}$/.test(onlyDigits)) { phone = '55' + onlyDigits; }
      else if (/^55[1-9][1-9][0-9]{8,9}$/.test(onlyDigits)) { phone = onlyDigits; }
    }
    const email = sourceData.email || sourceData.mail || '';
    const origin = sourceData.source || sourceData.origin || sourceData.origem || sourceData.campaign || sourceData.campaign_name || sourceData.ad_name || sourceData.channel || sourceData.platform || '';
    const message = sourceData.message || sourceData.mensagem || sourceData.Interesse || '';
    const tag = sourceData.tag || sourceData.primary_tag || (Array.isArray(sourceData.tags) ? sourceData.tags[0] : null) || sourceData.interest || sourceData.source || sourceData.origin || sourceData.origem || '';

    const rendaDeclarada: string | null = sourceData.renda_declarada || sourceData.renda || sourceData.income || null;
    const rawTipoTrabalho: string | null = sourceData.tipo_trabalho || sourceData.tipo_emprego || sourceData.employment_type || null;
    let tipoTrabalho: string | null = null;
    if (rawTipoTrabalho) {
      const normalized = rawTipoTrabalho.toUpperCase().trim();
      if (normalized.includes('CLT') || normalized.includes('CARTEIRA') || normalized.includes('EMPREGADO')) { tipoTrabalho = 'CLT'; }
      else if (normalized.includes('AUTONOMO') || normalized.includes('AUTÔNOMO') || normalized.includes('LIBERAL')) { tipoTrabalho = 'AUTONOMO'; }
      else if (normalized.includes('PUBLICO') || normalized.includes('PÚBLICO') || normalized.includes('SERVIDOR') || normalized.includes('ESTATUTARIO')) { tipoTrabalho = 'FUNCIONARIO_PUBLICO'; }
    }

    function calcFaixaMcmv(renda: string | null): string | null {
      if (!renda) return null;
      const clean = renda.replace(/R\$|\s/g, '').replace(/\./g, '').replace(',', '.');
      const valor = parseFloat(clean);
      if (isNaN(valor) || valor <= 0) return null;
      if (valor <= 2640)  return 'FAIXA_1';
      if (valor <= 4400)  return 'FAIXA_2';
      if (valor <= 8000)  return 'FAIXA_3';
      return 'FORA';
    }
    const faixaMcmv: string | null = calcFaixaMcmv(rendaDeclarada);

    if (!phone) {
      return new Response(JSON.stringify({ error: 'Phone is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');

    const KNOWN_PRODUCTS = ['BARRA_FUNDA','BARRA FUNDA','ZONA SUL','ZONA OESTE','ZONA NORTE','ZONA LESTE','JAGUARE','JAGUARÉ','CARRAO','CARRÃO','GRANJA_JULIETA','GRANJA JULIETA','LAPA','BUTANTA','BUTANTÃ','BUTANTTA','LEOPOLDINA','AGUA BRANCA','ÁGUA BRANCA','PERDIZES','VILA OLIMPIA','MOEMA','TATUAPE','TATUAPÉ','PINHEIROS','SANTANA','IPIRANGA','MOOCA','ANALIA FRANCO','LIBERDADE','PENHA','SAUDE','VILA MARIANA'];
    const tagUpper = (tag || '').toString().toUpperCase();
    const productFromMake = (sourceData.produto || sourceData.product || '').toString();
    const productInferred = !productFromMake && tagUpper ? (KNOWN_PRODUCTS.find(p => tagUpper.includes(p)) || '') : productFromMake;

    const leadValues: Record<string, string> = {
      tag: (tag || '').toString(),
      source: (origin || '').toString(),
      product: productInferred,
      campaign: (sourceData.campanha || sourceData.campaign || '').toString(),
      tipo_trabalho: (tipoTrabalho || '').toString(),
      faixa_mcmv: (faixaMcmv || '').toString(),
    };

    const { data: queues } = await supabase.from('distribution_queues').select('*').eq('is_active', true).order('created_at', { ascending: true });

    let chosenBroker: any = null;
    let chosenQueue: any = null;
    let brokerWarnMode = false;   // chip morto em periodo de graca -> entrega + aviso
    let queueIterated = false;    // ja percorremos a fila (nao usar fallback cego)

    if (queues && queues.length > 0) {
      for (const q of queues) {
        if (!q.match_field || q.match_field === '*') { if (!chosenQueue) { chosenQueue = q; } continue; }
        const expected = (q.match_value || '').toString().trim().toUpperCase();
        const leadVal = (leadValues[q.match_field] || '').toString().trim().toUpperCase();
        if (expected && leadVal && expected === leadVal) { chosenQueue = q; break; }
      }
    }
    console.log(`[MATCHING] Fila final: ${chosenQueue?.name || 'NENHUMA'}`);

    if (chosenQueue?.ai_agent_broker_id) {
      const { data: aiAgent } = await supabase.from('profiles').select('*').eq('id', chosenQueue.ai_agent_broker_id).maybeSingle();
      if (aiAgent) { chosenBroker = aiAgent; }
    }

    // ---- Round-robin com escalada de chip morto ----
    if (!chosenQueue?.ai_agent_broker_id && chosenQueue && chosenQueue.broker_ids?.length > 0) {
      const isExclusive = chosenQueue.lock_after_assignment === true;
      const { data: queueBrokersAll } = await supabase.from('profiles').select('*').in('id', chosenQueue.broker_ids).eq('role', 'BROKER');
      const orderedBrokers = (chosenQueue.broker_ids || []).map((id: string) => (queueBrokersAll || []).find((b: any) => b.id === id)).filter(Boolean);
      const eligible = orderedBrokers.filter((b: any) => b.is_active !== false && b.lead_assignment_enabled !== false);

      if (eligible.length === 0) {
        if (isExclusive && (chosenQueue.broker_ids?.length === 1) && orderedBrokers[0]) { chosenBroker = orderedBrokers[0]; }
      } else {
        queueIterated = true;
        const { data: freshQ } = await supabase.from('distribution_queues').select('last_assigned_index').eq('id', chosenQueue.id).maybeSingle();
        const baseIdx = freshQ?.last_assigned_index || 0;
        const start = baseIdx % eligible.length;
        const todayStr = brtToday();
        const lostList: any[] = [];
        for (let i = 0; i < eligible.length; i++) {
          const cand = eligible[(start + i) % eligible.length];
          let bi: any = null;
          if (cand.bot_instance_id) { const { data } = await supabase.from('bot_instances').select('id, real_state, status, instance_name, evolution_api_url, evolution_api_key, phone').eq('id', cand.bot_instance_id).maybeSingle(); bi = data; }
          let alive = !!bi && (bi.real_state === 'open' || (bi.real_state == null && bi.status === 'open'));
          const cnt = cand.leads_offline_count || 0;
          // so PROVA (probe real) quando vai CORTAR (chip aparenta morto e ja gastou a graca) — evita cortar quem esta vivo
          if (!alive && cnt >= 2 && bi?.instance_name) {
            const p = await probeChipAlive(bi.evolution_api_url || 'https://api.ape77.com.br', bi.evolution_api_key || '', bi.instance_name, (bi.phone || cand.phone || '').replace(/\D/g, ''));
            if (p) { alive = true; await supabase.from('bot_instances').update({ real_state: 'open' }).eq('id', bi.id).then(() => {}, () => {}); }
          }
          if (alive) {
            chosenBroker = cand;
            if (cnt > 0) {
              await supabase.from('profiles').update({ leads_offline_count: 0 }).eq('id', cand.id).then(() => {}, () => {});
              notifyBrokerViaManager(supabase, cand, `✅ ${(cand.first_name || '')}, seu WhatsApp reconectou! Você já volta a receber leads. Bora fechar. 💪`).then(() => {}, () => {});
            }
            await supabase.from('distribution_queues').update({ last_assigned_index: baseIdx + i + 1 }).eq('id', chosenQueue.id).then(() => {}, () => {});
            break;
          } else if (cnt < 2) {
            chosenBroker = cand; brokerWarnMode = true;
            await supabase.from('profiles').update({ leads_offline_count: cnt + 1 }).eq('id', cand.id).then(() => {}, () => {});
            await supabase.from('distribution_queues').update({ last_assigned_index: baseIdx + i + 1 }).eq('id', chosenQueue.id).then(() => {}, () => {});
            break;
          } else {
            lostList.push(cand);
            continue;
          }
        }
        for (const s of lostList) {
          const lostToday = (s.offline_lost_date === todayStr) ? (s.offline_lost_today || 0) : 0;
          await supabase.from('profiles').update({ offline_lost_today: lostToday + 1, offline_lost_date: todayStr }).eq('id', s.id).then(() => {}, () => {});
          if (lostToday < 3) {
            notifyBrokerViaManager(supabase, s, `${(s.first_name || '')}, você acabou de PERDER um lead — foi repassado pra um colega de equipe. Motivo: seu WhatsApp está desconectado. Enquanto não reconectar, você não recebe lead. Reconecta: https://comandra.com.br/dashboard`).then(() => {}, () => {});
          }
        }
      }
    }

    // Fallback (so quando NAO havia elegiveis na fila)
    if (!chosenBroker && !chosenQueue?.ai_agent_broker_id && !queueIterated) {
      if (chosenQueue && chosenQueue.broker_ids?.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        const { data: queueBrokers } = await supabase.from('profiles').select('id, first_name, last_name, phone, team_id, bot_instance_id, manager_id, automation_settings, evolution_instance, lead_assignment_enabled, is_active').in('id', chosenQueue.broker_ids).eq('role', 'BROKER').eq('is_active', true).eq('lead_assignment_enabled', true);
        if (queueBrokers && queueBrokers.length > 0) {
          const counts = await Promise.all(queueBrokers.map(async (b: any) => { const { count } = await supabase.from('leads').select('id', { count: 'exact', head: true }).eq('broker_id', b.id).gte('created_at', today + 'T00:00:00Z'); return { broker: b, count: count || 0 }; }));
          counts.sort((a: any, b: any) => a.count - b.count);
          chosenBroker = counts[0].broker;
        }
      }
    }

    // MODO SDR (Ana): quando ligado, segura o lead pra IA (nao atribui). Reversivel: system_settings.hold_leads_for_ai
    const { data: _hold } = await supabase.from('system_settings').select('value').eq('key','hold_leads_for_ai').maybeSingle();
    const holdForAI = _hold?.value === true || _hold?.value === 'true';
    if (holdForAI) { chosenBroker = null; brokerWarnMode = false; }

    const nowIso = new Date().toISOString();
    const insertPayload: any = {
      name, phone, email,
      tag: tag || message || origin,
      status: 'NEW', source: 'facebook_make',
      last_interaction_at: nowIso, created_at: nowIso, received_at: nowIso,
      no_redistribute: chosenQueue?.ai_agent_broker_id != null || chosenQueue?.lock_after_assignment === true || sourceData.exclusiva === true,
      ...(rendaDeclarada ? { renda_declarada: rendaDeclarada } : {}),
      ...(tipoTrabalho ? { tipo_trabalho: tipoTrabalho } : {}),
      ...(leadValues.product ? { product: leadValues.product } : {}),
      ...(leadValues.campaign ? { fb_campaign: leadValues.campaign } : {}),
      ...((sourceData.page_id || sourceData.pageId || sourceData.page) ? { fb_page_id: String(sourceData.page_id || sourceData.pageId || sourceData.page) } : {}),
      ...(sourceData.ad_id ? { fb_ad_id: String(sourceData.ad_id) } : {}),
      ...(sourceData.adset_id ? { fb_adset_id: String(sourceData.adset_id) } : {}),
      ...(sourceData.campaign_id ? { fb_campaign_id: String(sourceData.campaign_id) } : {}),
      ...((sourceData.fb_lead_id || sourceData.leadgen_id || sourceData.lead_id) ? { fb_lead_id: String(sourceData.fb_lead_id || sourceData.leadgen_id || sourceData.lead_id) } : {}),
      ...(chosenQueue?.ai_agent_broker_id ? { ai_qualification_queue_id: chosenQueue.id } : {}),
    };
    if (chosenBroker) insertPayload.broker_id = chosenBroker.id;

    const { data: newLead, error: insertError } = await supabase.from('leads').insert(insertPayload).select().single();
    if (insertError) throw insertError;

    try {
      await supabase.rpc('upsert_lead_state', { p_lead_id: newLead.id, p_intencao: 'sem_info', p_tema: 'sem_info', p_momento: 'explorando', p_ultimo_evento: 'lead_criado', p_modo: 'automatico', p_proxima_acao: 'aguardar', p_bloqueado: false, p_atualizado_por: 'incoming_lead' });
    } catch {}

    await supabase.from('distribution_logs').insert({ lead_name: name, lead_phone: phone, assigned_to_name: chosenBroker ? `${chosenBroker.first_name || ''} ${chosenBroker.last_name || ''}`.trim() : null, queue_name: chosenQueue ? chosenQueue.name : 'FALLBACK', status: 'SUCCESS' });

    if (!chosenBroker && !holdForAI) {
      const { data: admins } = await supabase.from('profiles').select('id').in('role', ['ADMIN', 'SUPERINTENDENT']);
      if (admins?.length > 0) {
        await supabase.from('internal_notifications').insert(admins.map((a: any) => ({ to_id: a.id, type: 'LEAD_NO_BROKER', title: '⚠️ Lead sem corretor atribuído', message: `${name} (${phone}) chegou mas não foi atribuído. Verifique as filas.`, related_lead_id: newLead.id })));
      }
    }

    // chip vivo agora? (gate do welcome pro LEAD)
    let chipAlive = false;
    if (chosenBroker?.bot_instance_id) {
      const { data: _chip } = await supabase.from('bot_instances').select('status, real_state').eq('id', chosenBroker.bot_instance_id).maybeSingle();
      chipAlive = !!_chip && (_chip.status === 'open' || _chip.real_state === 'open');
    }

    // ---- Notificacao pro corretor (nome, telefone, wa.me, PRODUTO, ORIGEM, renda, trabalho), pelo chip do gerente -> fallback Junior ----
    let notificationSent = false;
    if (chosenBroker?.phone && !insertPayload.ai_qualification_queue_id) {
      const { data: setting } = await supabase.from('system_settings').select('value').eq('key', 'notify_brokers_enabled').maybeSingle();
      if (setting?.value === true || setting?.value === 'true' || setting?.value === 1) {
        const firstName = (chosenBroker.first_name || '').split(' ')[0] || '';
        const phoneDigits = (phone || '').replace(/\D/g, '');
        const prettify = (s: string) => (s || '').replace(/[_-]+/g, ' ').trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
        const produtoLabel = prettify(leadValues.product || '');
        const origemLabel = prettify(origin || '');
        const rendaLabel = rendaDeclarada ? String(rendaDeclarada).replace(/_/g, ' ').replace(/r\$/gi, 'R$') : '';
        const tipoTrabalhoLabel = tipoTrabalho === 'CLT' ? 'CLT' : tipoTrabalho === 'AUTONOMO' ? 'Autônomo' : tipoTrabalho === 'FUNCIONARIO_PUBLICO' ? 'Func. Público' : null;
        const leadBlock = [
          `👤 *${name}*`,
          `📱 ${phone}`,
          `👉 Falar agora: https://wa.me/${phoneDigits}`,
          produtoLabel ? `📍 Produto: ${produtoLabel}` : '',
          origemLabel ? `📣 Origem: ${origemLabel}` : '',
          rendaLabel ? `💰 Renda: ${rendaLabel}` : '',
          tipoTrabalhoLabel ? `💼 ${tipoTrabalhoLabel}` : '',
        ].filter(Boolean).join('\n');
        let notifMsg: string;
        if (brokerWarnMode) {
          notifMsg = [
            `⚠️ *${firstName}, você está recebendo este lead — mas seu WhatsApp está DESCONECTADO do sistema.*`,
            `Os próximos leads vão pro próximo da fila se você não conectar. Evite perder cliente — conecte agora: https://comandra.com.br/dashboard`,
            ``, leadBlock,
          ].join('\n');
        } else {
          notifMsg = [ `🎯 *Novo lead pra você!*`, ``, leadBlock, ``, `⏰ Atenda em até 5 min — depois disso a conversão despenca.` ].join('\n');
        }
        notificationSent = await notifyBrokerViaManager(supabase, chosenBroker, notifMsg);
        if (!notificationSent) {
          try { await supabase.from('internal_notifications').insert({ to_id: chosenBroker.id, type: 'NEW_LEAD', title: '🎯 Novo Lead atribuído', message: `${name} (${phone}) chegou para você.`, related_lead_id: newLead.id }); } catch (_) {}
        }
      }
    }

    // ---- Welcome pro LEAD (kit do corretor > template), so com chip VIVO ----
    let welcomeSent = false;
    const wantsWelcome = !!(chosenBroker?.automation_settings?.welcome_enabled && chosenBroker.bot_instance_id && !insertPayload.ai_qualification_queue_id);
    if (wantsWelcome && chipAlive) {
      const brokerName = `${chosenBroker.first_name || ''} ${chosenBroker.last_name || ''}`.trim() || 'Corretor';
      const leadFirst = (name || 'tudo bem').split(' ')[0] || name;
      let text = `Olá ${name}! 👋\n\nObrigado pelo interesse!`;
      let usedTemplateId: string | null = null;
      let usedKit = false;
      let kitAudioB64: string | null = null;
      try {
        const { data: kchip } = await supabase.from('bot_instances').select('phone').eq('id', chosenBroker.bot_instance_id).maybeSingle();
        const kvariants = [...new Set([chosenBroker.phone, kchip?.phone].filter(Boolean).flatMap((p: string) => phoneVariants(p)))];
        if (kvariants.length) {
          const { data: kwText } = await supabase.from('comandra_broker_kit').select('body').eq('slot_type', 'welcome').eq('format', 'text').eq('is_active', true).in('broker_phone', kvariants).limit(1).maybeSingle();
          if (kwText?.body) { text = String(kwText.body).replace(/\{\s*nome\s*\}/gi, leadFirst).replace(/\{\s*broker\s*\}/gi, brokerName); usedKit = true; }
          const { data: kwAudio } = await supabase.from('comandra_broker_kit').select('audio_base64').eq('slot_type', 'welcome').eq('format', 'audio').eq('is_active', true).in('broker_phone', kvariants).limit(1).maybeSingle();
          if (kwAudio?.audio_base64) kitAudioB64 = kwAudio.audio_base64;
        }
      } catch (e: any) { console.warn('[incoming-lead] kit welcome lookup falhou:', e?.message); }

      if (!usedKit) {
        const { data: templates } = await supabase.from('welcome_templates').select('*').eq('is_active', true);
        if (templates?.length > 0) {
          const { count } = await supabase.from('leads').select('id', { count: 'exact', head: true }).eq('broker_id', chosenBroker.id);
          const idx = (count || 0) % templates.length;
          text = (templates[idx].message || '').replace(/\\n/g, '\n').replace(/\{nome\}/gi, name).replace(/\{broker\}/gi, brokerName);
          usedTemplateId = templates[idx].id;
        }
      }

      const { data: newConv } = await supabase.from('ia_conversations').insert({ bot_instance_id: chosenBroker.bot_instance_id, lead_id: newLead.id, lead_name: name, lead_phone: phone, status: 'active', sentiment: 'unknown', is_crm_lead: true, template_id: usedTemplateId, template_kind: (usedTemplateId || usedKit) ? 'welcome' : null }).select('id').single();

      const { data: result } = await supabase.functions.invoke('send_whatsapp_message', { body: { botId: chosenBroker.bot_instance_id, phone: phone, message: text, conversationId: newConv?.id, send_source: 'welcome' } });
      welcomeSent = (result as any)?.success || false;

      if (welcomeSent && kitAudioB64) {
        try { const { data: achip } = await supabase.from('bot_instances').select('instance_name, evolution_api_url, evolution_api_key').eq('id', chosenBroker.bot_instance_id).maybeSingle(); if (achip?.instance_name) { await sendAudioEvo(achip.evolution_api_url || 'https://api.ape77.com.br', achip.evolution_api_key || '', achip.instance_name, phone!, kitAudioB64); } } catch (e: any) { console.warn('[incoming-lead] kit audio welcome falhou:', e?.message); }
      }

      await supabase.from('automation_logs').insert({ entity_type: 'welcome', entity_id: newLead.id, status: welcomeSent ? 'success' : 'failed', message_sent: (usedKit ? '[KIT] ' : '') + text, recipient_phone: phone, error_message: welcomeSent ? null : ((result as any)?.skipped || (result as any)?.error || 'falha') }).then(() => {}, () => {});

      if (welcomeSent && usedTemplateId) { await supabase.from('leads').update({ welcome_template_id: usedTemplateId }).eq('id', newLead.id); await supabase.rpc('record_welcome_template_sent', { p_template_id: usedTemplateId }); }

      if (welcomeSent) {
        const { data: cerebroCfg } = await supabase.from('system_settings').select('value').eq('key', 'cerebro_enabled').maybeSingle();
        if (cerebroCfg?.value === true || cerebroCfg?.value === 'true') {
          const t = Date.now();
          await supabase.from('lead_activation_queue').insert([
            { lead_id: newLead.id, action_type: 'toque_1', scheduled_for: new Date(t + 3 * 3600000).toISOString() },
            { lead_id: newLead.id, action_type: 'toque_2', scheduled_for: new Date(t + 5 * 3600000).toISOString() },
            { lead_id: newLead.id, action_type: 'sentinela', scheduled_for: new Date(t + 8 * 3600000).toISOString() },
            { lead_id: newLead.id, action_type: 'last_chance', scheduled_for: new Date(t + 24 * 3600000).toISOString() },
          ]);
        }
      }
    } else if (wantsWelcome && !chipAlive) {
      await supabase.from('automation_logs').insert({ entity_type: 'welcome', entity_id: newLead.id, status: 'skipped', message_sent: null, recipient_phone: phone, error_message: 'chip_offline — welcome nao enviado (so com chip vivo).' }).then(() => {}, () => {});
    }

    try {
      await supabase.from('webhook_logs').insert({ integration_key: 'make', payload: { name, phone, email, tag, origin, product_from_make: productFromMake, product_inferred: productInferred, raw_keys: Object.keys(sourceData || {}), raw_payload: sourceData }, status_code: 200, response_body: JSON.stringify({ lead_id: newLead.id, broker: chosenBroker?.first_name || null, queue: chosenQueue?.name || 'FALLBACK', warn: brokerWarnMode }) });
    } catch (_) {}

    return new Response(JSON.stringify({ success: true, lead: newLead, notification_sent: notificationSent, welcome_sent: welcomeSent }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('[incoming-lead] Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
})
