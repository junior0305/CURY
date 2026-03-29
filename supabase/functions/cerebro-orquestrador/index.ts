import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TERMINAL = ['CONCLUDED', 'ABANDONED', 'EXCLUDED'];

// ── BRT helpers (UTC-3) ────────────────────────────────────────────────────
function getBRTHour(): number {
  return (new Date().getUTCHours() - 3 + 24) % 24;
}

function isWithinWindow(): boolean {
  const now = new Date();
  const brtH = (now.getUTCHours() - 3 + 24) % 24;
  const brtM = now.getUTCMinutes();
  const brtTotal = brtH * 60 + brtM;
  return brtTotal >= 8 * 60 && brtTotal <= 21 * 60 + 45;
}

// Returns ISO timestamp for 08:00 BRT the next valid day
function nextWindowOpen(): string {
  const now = new Date();
  const brtH = (now.getUTCHours() - 3 + 24) % 24;
  const next = new Date(now);
  if (brtH >= 8) next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(11, 0, 0, 0); // 08:00 BRT = 11:00 UTC
  return next.toISOString();
}

// ── WhatsApp helper ────────────────────────────────────────────────────────
async function sendMsg(supabase: any, botId: string, phone: string, message: string): Promise<boolean> {
  try {
    const { data } = await supabase.functions.invoke('send_whatsapp_message', {
      body: { botId, phone, message },
    });
    return data?.success === true;
  } catch {
    return false;
  }
}

// ── Gemini Flash helper ────────────────────────────────────────────────────
async function callGemini(apiKey: string, system: string, user: string): Promise<string | null> {
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: user }] }],
          systemInstruction: { parts: [{ text: system }] },
          generationConfig: { maxOutputTokens: 150, temperature: 0.7 },
        }),
      }
    );
    const json = await resp.json();
    return json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch {
    return null;
  }
}

function interpolate(template: string, name: string, broker: string): string {
  return template
    .replace(/\{nome\}/gi, name?.split(' ')[0] || 'você')
    .replace(/\{broker\}/gi, broker || 'nossa equipe');
}

// ── Main ───────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const startTime = Date.now();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  );
  const now = new Date().toISOString();

  try {
    // ── 1. Check cerebro_enabled ───────────────────────────────────────────
    const { data: cfg } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'cerebro_enabled')
      .maybeSingle();

    if (cfg?.value !== true && cfg?.value !== 'true') {
      return new Response(JSON.stringify({ skipped: 'cerebro_disabled' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const withinWindow = isWithinWindow();
    const brtHour = getBRTHour();

    // ── 2. Auto-queue: leads parados sem item pendente na fila ────────────
    // Garante que todos os leads ativos parados 24h+ entrem na fila automaticamente
    const twentyFourAgo = new Date(Date.now() - 24 * 3600000).toISOString();
    const fortyEightAgo = new Date(Date.now() - 48 * 3600000).toISOString();

    // NEW/IN_PROGRESS sem interação há 24h+
    const { data: staleLeadsForQueue } = await supabase
      .from('leads')
      .select('id')
      .in('status', ['NEW', 'IN_PROGRESS'])
      .not('broker_id', 'is', null)
      .or(`last_interaction_at.lt.${twentyFourAgo},and(last_interaction_at.is.null,created_at.lt.${twentyFourAgo})`)
      .limit(60);

    for (const sl of staleLeadsForQueue || []) {
      const { data: existing } = await supabase
        .from('lead_activation_queue')
        .select('id')
        .eq('lead_id', sl.id)
        .eq('status', 'pending')
        .maybeSingle();
      if (!existing) {
        await supabase.from('lead_activation_queue').insert({
          lead_id: sl.id,
          action_type: 'toque_1',
          scheduled_for: now,
          status: 'pending',
        });
      }
    }

    // DOCS_REQUESTED sem docs_reminder agendado
    const { data: docsLeads } = await supabase
      .from('leads')
      .select('id')
      .eq('status', 'DOCS_REQUESTED')
      .lt('last_interaction_at', fortyEightAgo)
      .limit(20);

    for (const dl of docsLeads || []) {
      const { data: existing } = await supabase
        .from('lead_activation_queue')
        .select('id')
        .eq('lead_id', dl.id)
        .eq('action_type', 'docs_reminder')
        .eq('status', 'pending')
        .maybeSingle();
      if (!existing) {
        await supabase.from('lead_activation_queue').insert({
          lead_id: dl.id,
          action_type: 'docs_reminder',
          scheduled_for: now,
          status: 'pending',
        });
      }
    }

    // ── 3. Fetch pending queue items ───────────────────────────────────────
    const { data: items } = await supabase
      .from('lead_activation_queue')
      .select('id, lead_id, action_type, scheduled_for, metadata, attempts')
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .order('scheduled_for', { ascending: true })
      .limit(60);

    // Load templates once
    const { data: welcomeTemplates } = await supabase
      .from('welcome_templates').select('message').eq('is_active', true);
    const { data: cadenceTemplates } = await supabase
      .from('cadence_templates').select('cadence_steps(content, media_type)').eq('is_active', true);
    const cadenceSteps = (cadenceTemplates || [])
      .flatMap((c: any) => (c.cadence_steps || []).filter((s: any) => s.media_type === 'text' && s.content));
    const welcomeTpls = welcomeTemplates || [];
    const geminiKey = Deno.env.get('GEMINI_API_KEY') || '';

    let processed = 0, rescheduled = 0, cancelled = 0, skipped = 0;
    const details: any[] = [];

    for (const item of items || []) {
      try {
        // Load lead
        const { data: lead } = await supabase
          .from('leads')
          .select('id, name, phone, status, tag, source, broker_id, created_at, last_lead_response_at, last_broker_whatsapp_at')
          .eq('id', item.lead_id)
          .maybeSingle();

        if (!lead) {
          await supabase.from('lead_activation_queue')
            .update({ status: 'cancelled', cancel_reason: 'lead_not_found' })
            .eq('id', item.id);
          cancelled++;
          continue;
        }

        // Terminal lead → cancel all
        if (TERMINAL.includes((lead.status || '').toUpperCase())) {
          await supabase.from('lead_activation_queue')
            .update({ status: 'cancelled', cancel_reason: `lead_${lead.status}` })
            .eq('id', item.id);
          cancelled++;
          continue;
        }

        // Load broker
        const { data: broker } = lead.broker_id ? await supabase
          .from('profiles')
          .select('id, first_name, bot_instance_id, manager_id, phone')
          .eq('id', lead.broker_id)
          .maybeSingle() : { data: null };

        const isOutbound = !['broker_alert', 'manager_alert'].includes(item.action_type);

        // Window enforcement for outbound messages
        if (isOutbound && !withinWindow) {
          await supabase.from('lead_activation_queue')
            .update({ scheduled_for: nextWindowOpen() })
            .eq('id', item.id);
          rescheduled++;
          continue;
        }

        // ── Process action ─────────────────────────────────────────────────
        let success = false;

        switch (item.action_type) {

          case 'toque_1':
          case 'toque_2': {
            if (!broker?.bot_instance_id || !lead.phone) { skipped++; break; }
            const bn = broker.first_name || 'nossa equipe';
            const firstName = lead.name?.split(' ')[0] || 'você';
            const hadConv = !!lead.last_lead_response_at;
            let msg: string;
            if (!hadConv && welcomeTpls.length > 0) {
              const tpl = welcomeTpls[Math.floor(Math.random() * welcomeTpls.length)];
              msg = interpolate(tpl.message, lead.name, bn);
            } else if (hadConv && cadenceSteps.length > 0) {
              const step = cadenceSteps[Math.floor(Math.random() * cadenceSteps.length)];
              msg = interpolate(step.content, lead.name, bn);
            } else {
              msg = item.action_type === 'toque_1'
                ? `Olá ${firstName}! 👋 Vi seu interesse em nosso empreendimento. Estou separando as melhores condições para você. Posso te ajudar? 😊`
                : `${firstName}! 🏠 Passando para ver se surgiu alguma dúvida. Estou aqui para ajudar!`;
            }
            success = await sendMsg(supabase, broker.bot_instance_id, lead.phone, msg);
            break;
          }

          case 'sentinela': {
            if (!broker?.bot_instance_id || !lead.phone || !geminiKey) { skipped++; break; }

            // Load conversation history
            const { data: conv } = await supabase
              .from('ia_conversations')
              .select('id')
              .eq('lead_id', lead.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            let historyText = 'Sem histórico de conversa anterior.';
            if (conv?.id) {
              const { data: msgs } = await supabase
                .from('ia_messages')
                .select('direction, message_text')
                .eq('conversation_id', conv.id)
                .order('created_at', { ascending: false })
                .limit(10);
              if (msgs?.length > 0) {
                historyText = msgs.reverse()
                  .map((m: any) => `[${m.direction === 'incoming' ? 'LEAD' : 'IA'}] ${m.message_text}`)
                  .join('\n');
              }
            }

            const hoursStale = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 3600000);

            const aiText = await callGemini(
              geminiKey,
              `Você é um assistente de vendas de imóveis MCMV (Minha Casa Minha Vida) na planta.
NUNCA mencione fotos, vídeos ou conteúdo visual — não há disponíveis.
Objetivo: levar o lead a trazer documentos para análise GRATUITA de subsídio do governo OU agendar visita.
Português do Brasil, tom casual e caloroso. Máximo 3 frases. 1 pergunta por mensagem.
Baseie-se no histórico para NÃO repetir perguntas já feitas.`,
              `Lead: ${lead.name} | Tag: ${lead.tag || 'sem tag'} | ${hoursStale}h sem resposta

HISTÓRICO:
${historyText}

Escreva UMA mensagem WhatsApp para reengajar este lead em direção à análise gratuita ou visita.
Responda APENAS com o texto da mensagem, sem prefixos, sem aspas.`
            );

            if (aiText) {
              success = await sendMsg(supabase, broker.bot_instance_id, lead.phone, aiText);
              if (success && conv?.id) {
                await supabase.from('ia_messages').insert({
                  conversation_id: conv.id,
                  message_text: aiText,
                  direction: 'outgoing',
                  sender_type: 'ia',
                  created_at: new Date().toISOString(),
                });
              }
            }
            break;
          }

          case 'last_chance': {
            if (!broker?.bot_instance_id || !lead.phone) { skipped++; break; }
            const firstName = lead.name?.split(' ')[0] || 'você';
            success = await sendMsg(
              supabase, broker.bot_instance_id, lead.phone,
              `${firstName}, esta é minha última tentativa de contato. 🙏\n\nSe tiver interesse no imóvel, me responda qualquer coisa e retomo o atendimento.\n\nSe não tiver mais interesse, tudo bem — boa sorte! 😊`
            );
            break;
          }

          case 'broker_warmup': {
            if (!broker?.bot_instance_id || !lead.phone) { skipped++; break; }
            // Cancelar se corretor já respondeu depois que lead enviou mensagem
            if (lead.last_broker_whatsapp_at && lead.last_lead_response_at &&
                new Date(lead.last_broker_whatsapp_at) > new Date(lead.last_lead_response_at)) {
              await supabase.from('lead_activation_queue')
                .update({ status: 'cancelled', cancel_reason: 'broker_already_replied' })
                .eq('id', item.id);
              cancelled++;
              continue;
            }
            const firstName = lead.name?.split(' ')[0] || 'você';
            const bn = broker.first_name || 'nosso corretor';
            success = await sendMsg(
              supabase, broker.bot_instance_id, lead.phone,
              `Olá ${firstName}! 😊\n\n${bn} está verificando sua solicitação e entra em contato em breve. Agradecemos sua paciência! 🏠`
            );
            break;
          }

          case 'docs_reminder': {
            if (!broker?.bot_instance_id || !lead.phone) { skipped++; break; }
            const firstName = lead.name?.split(' ')[0] || 'você';
            success = await sendMsg(
              supabase, broker.bot_instance_id, lead.phone,
              `${firstName}, sua proposta está quase pronta! 📄\n\nSó precisamos dos seus documentos para garantir o subsídio do governo. Uma foto legível já basta!\n\nConsegue enviar hoje? 😊`
            );
            break;
          }

          case 'broker_alert': {
            if (!lead.broker_id) { skipped++; break; }
            // Cancelar se corretor já respondeu
            if (lead.last_broker_whatsapp_at && lead.last_lead_response_at &&
                new Date(lead.last_broker_whatsapp_at) > new Date(lead.last_lead_response_at)) {
              await supabase.from('lead_activation_queue')
                .update({ status: 'cancelled', cancel_reason: 'broker_already_replied' })
                .eq('id', item.id);
              cancelled++;
              continue;
            }
            await supabase.from('internal_notifications').insert({
              to_id: lead.broker_id,
              type: 'CEREBRO_BROKER_ALERT',
              title: '⚡ Lead aguardando retorno urgente',
              message: `${lead.name} respondeu sua mensagem há mais de 2h e está aguardando. Atenda agora!`,
              related_lead_id: lead.id,
            });
            success = true;
            break;
          }

          case 'manager_alert': {
            if (!broker?.manager_id) { skipped++; break; }
            // Cancelar se corretor já respondeu
            if (lead.last_broker_whatsapp_at && lead.last_lead_response_at &&
                new Date(lead.last_broker_whatsapp_at) > new Date(lead.last_lead_response_at)) {
              await supabase.from('lead_activation_queue')
                .update({ status: 'cancelled', cancel_reason: 'broker_already_replied' })
                .eq('id', item.id);
              cancelled++;
              continue;
            }
            await supabase.from('internal_notifications').insert({
              to_id: broker.manager_id,
              type: 'CEREBRO_MANAGER_ALERT',
              title: '🚨 Lead crítico sem atendimento',
              message: `${lead.name} está há mais de 4h sem resposta do corretor ${broker.first_name || ''}. Intervenha!`,
              related_lead_id: lead.id,
            });
            success = true;
            break;
          }
        }

        // ── Update queue item ──────────────────────────────────────────────
        if (success) {
          await supabase.from('lead_activation_queue').update({
            status: 'sent',
            last_attempt_at: new Date().toISOString(),
            attempts: (item.attempts || 0) + 1,
          }).eq('id', item.id);

          // Reset lead interaction counter for outbound messages to lead
          const outboundToLead = ['toque_1','toque_2','sentinela','last_chance','broker_warmup','docs_reminder'];
          if (outboundToLead.includes(item.action_type)) {
            const ts = new Date().toISOString();
            await supabase.from('leads').update({
              last_interaction_at: ts,
              last_broker_whatsapp_at: ts,
            }).eq('id', lead.id);
          }

          // Log to cerebro_learning
          try { await supabase.from('cerebro_learning').insert({
            lead_id: lead.id,
            action_type: item.action_type,
            lead_source: lead.source,
            lead_tag: lead.tag,
            sent_hour_brt: brtHour,
            responded: false,
          }); } catch {}

          processed++;
          details.push({ action: item.action_type, lead: lead.name, status: 'sent' });
          console.log(`[cerebro] ✅ ${item.action_type} → ${lead.name}`);
        } else if (isOutbound) {
          await supabase.from('lead_activation_queue').update({
            status: 'failed',
            last_attempt_at: new Date().toISOString(),
            attempts: (item.attempts || 0) + 1,
          }).eq('id', item.id);
          details.push({ action: item.action_type, lead: lead.name, status: 'failed' });
        }

        await new Promise(r => setTimeout(r, 300));

      } catch (e: any) {
        console.error(`[cerebro] item error (${item.id}):`, e.message);
        skipped++;
      }
    }

    const durationMs = Date.now() - startTime;
    try { await supabase.from('cerebro_runs').insert({
      ran_at: now, status: 'success',
      processed, rescheduled, cancelled, skipped,
      duration_ms: durationMs,
      details: { items: details },
    }); } catch {}

    console.log(`[cerebro] done — processed=${processed} rescheduled=${rescheduled} cancelled=${cancelled} skipped=${skipped} (${durationMs}ms)`);

    return new Response(JSON.stringify({ processed, rescheduled, cancelled, skipped }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[cerebro] fatal:', error.message);
    try { await supabase.from('cerebro_runs').insert({
      ran_at: now, status: 'error',
      error_message: error.message,
      duration_ms: Date.now() - startTime,
    }); } catch {}
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
