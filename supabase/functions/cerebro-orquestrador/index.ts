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

function nextWindowOpen(): string {
  const now = new Date();
  const brtH = (now.getUTCHours() - 3 + 24) % 24;
  const brtM = now.getUTCMinutes();
  const brtTotal = brtH * 60 + brtM;
  const next = new Date(now);
  if (brtTotal > 21 * 60 + 45) next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(11, 0, 0, 0);
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

// ── Lead State helpers ─────────────────────────────────────────────────────

interface LeadState {
  intencao:      string;
  tema:          string;
  momento:       string;
  ultimo_evento: string;
  modo:          string;
  proxima_acao:  string;
  bloqueado:     boolean;
}

async function getLeadState(supabase: any, leadId: string): Promise<LeadState | null> {
  const { data } = await supabase
    .from('lead_state')
    .select('intencao,tema,momento,ultimo_evento,modo,proxima_acao,bloqueado')
    .eq('lead_id', leadId)
    .maybeSingle();
  return data || null;
}

async function setLeadState(
  supabase: any,
  leadId: string,
  patch: Partial<LeadState> & { atualizado_por?: string }
): Promise<void> {
  try {
    await supabase.rpc('upsert_lead_state', {
      p_lead_id:       leadId,
      p_intencao:      patch.intencao      ?? null,
      p_tema:          patch.tema          ?? null,
      p_momento:       patch.momento       ?? null,
      p_ultimo_evento: patch.ultimo_evento ?? null,
      p_modo:          patch.modo          ?? null,
      p_proxima_acao:  patch.proxima_acao  ?? null,
      p_bloqueado:     patch.bloqueado     ?? null,
      p_atualizado_por: patch.atualizado_por ?? 'cerebro',
    });
  } catch (e: any) {
    console.warn('[cerebro] setLeadState error:', e.message);
  }
}

// Classifica intenção com base no evento e estado atual
function deriveNextState(
  actionType: string,
  currentState: LeadState | null,
  hadLeadResponse: boolean
): Partial<LeadState> {
  const current = currentState ?? { intencao: 'sem_info', tema: 'sem_info', momento: 'explorando' } as LeadState;

  switch (actionType) {
    case 'toque_1':
      return {
        ultimo_evento: 'toque_1_enviado',
        proxima_acao:  'aguardar',
        modo:          current.modo === 'humano_ativo' ? 'humano_ativo' : 'automatico',
      };
    case 'toque_2':
      return {
        ultimo_evento: 'toque_2_enviado',
        proxima_acao:  hadLeadResponse ? 'aguardar' : 'alertar_gerente',
      };
    case 'sentinela':
      return {
        ultimo_evento: 'sentinela_enviado',
        momento:       'sumiu',
        proxima_acao:  'aguardar',
      };
    case 'last_chance':
      return {
        ultimo_evento: 'ultima_tentativa_enviada',
        proxima_acao:  'encerrar',
        momento:       'sumiu',
      };
    case 'auto_resposta':
      return {
        ultimo_evento: 'auto_resposta_enviada',
        proxima_acao:  'aguardar',
      };
    case 'broker_warmup':
      return {
        ultimo_evento: 'warmup_enviado',
        proxima_acao:  'aguardar',
      };
    case 'docs_reminder':
      return {
        ultimo_evento: 'docs_reminder_enviado',
        proxima_acao:  'aguardar',
      };
    case 'broker_alert':
      return {
        ultimo_evento: 'corretor_alertado',
        proxima_acao:  'aguardar',
      };
    case 'manager_alert':
      return {
        ultimo_evento: 'gerente_alertado',
        proxima_acao:  'aguardar',
      };
    default:
      return { ultimo_evento: actionType };
  }
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
    const twentyFourAgo = new Date(Date.now() - 24 * 3600000).toISOString();
    const fortyEightAgo = new Date(Date.now() - 48 * 3600000).toISOString();

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
        .select('id, status, attempts')
        .eq('lead_id', sl.id)
        .in('status', ['pending', 'failed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const shouldQueue = !existing || (existing.status === 'failed' && (existing.attempts || 0) >= 5);
      if (shouldQueue) {
        await supabase.from('lead_activation_queue').insert({
          lead_id: sl.id,
          action_type: 'toque_1',
          scheduled_for: now,
          status: 'pending',
        });
      }
    }

    const { data: docsLeads } = await supabase
      .from('leads')
      .select('id')
      .eq('status', 'DOCS_REQUESTED')
      .lt('last_interaction_at', fortyEightAgo)
      .limit(20);

    for (const dl of docsLeads || []) {
      const { data: existing } = await supabase
        .from('lead_activation_queue')
        .select('id, status, attempts')
        .eq('lead_id', dl.id)
        .eq('action_type', 'docs_reminder')
        .in('status', ['pending', 'failed'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const shouldQueue = !existing || (existing.status === 'failed' && (existing.attempts || 0) >= 5);
      if (shouldQueue) {
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

        if (TERMINAL.includes((lead.status || '').toUpperCase())) {
          await supabase.from('lead_activation_queue')
            .update({ status: 'cancelled', cancel_reason: `lead_${lead.status}` })
            .eq('id', item.id);
          // Marca estado como encerrado
          await setLeadState(supabase, lead.id, {
            ultimo_evento: `lead_${lead.status.toLowerCase()}`,
            proxima_acao:  'encerrar',
            atualizado_por: 'cerebro',
          });
          cancelled++;
          continue;
        }

        // ── LEITURA DO ESTADO ──────────────────────────────────────────────
        const leadState = await getLeadState(supabase, lead.id);

        // Se modo=humano_ativo ou bloqueado=true: pula ações outbound ao lead
        const outboundToLead = ['toque_1','toque_2','sentinela','last_chance','broker_warmup','docs_reminder','auto_resposta'];
        if (outboundToLead.includes(item.action_type)) {
          if (leadState?.bloqueado === true || leadState?.modo === 'humano_ativo') {
            await supabase.from('lead_activation_queue')
              .update({ status: 'cancelled', cancel_reason: 'human_mode_active' })
              .eq('id', item.id);
            console.log(`[cerebro] ⏸ ${item.action_type} bloqueado (modo humano) → ${lead.name}`);
            cancelled++;
            continue;
          }
        }

        const broker = lead.broker_id ? (await supabase
          .from('profiles')
          .select('id, first_name, bot_instance_id, manager_id, phone')
          .eq('id', lead.broker_id)
          .maybeSingle()).data : null;

        const isOutbound = !['broker_alert', 'manager_alert'].includes(item.action_type);

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
                ? `Olá ${lead.name?.split(' ')[0] || 'você'}! 👋 Vi seu interesse em nosso empreendimento. Estou separando as melhores condições para você. Posso te ajudar? 😊`
                : `${lead.name?.split(' ')[0] || 'você'}! 🏠 Passando para ver se surgiu alguma dúvida. Estou aqui para ajudar!`;
            }
            success = await sendMsg(supabase, broker.bot_instance_id, lead.phone, msg);
            break;
          }

          case 'sentinela': {
            if (!broker?.bot_instance_id || !lead.phone || !geminiKey) { skipped++; break; }

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

            // Usa tema do lead_state para personalizar a mensagem
            const temaContext = leadState?.tema !== 'sem_info'
              ? `O lead demonstrou interesse em: ${leadState?.tema}.`
              : '';

            const hoursStale = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 3600000);

            const aiText = await callGemini(
              geminiKey,
              `Você é um assistente de vendas de imóveis MCMV (Minha Casa Minha Vida) na planta.
NUNCA mencione fotos, vídeos ou conteúdo visual — não há disponíveis.
Objetivo: levar o lead a trazer documentos para análise GRATUITA de subsídio do governo OU agendar visita.
Português do Brasil, tom casual e caloroso. Máximo 3 frases. 1 pergunta por mensagem.
Baseie-se no histórico para NÃO repetir perguntas já feitas.`,
              `Lead: ${lead.name} | Tag: ${lead.tag || 'sem tag'} | ${hoursStale}h sem resposta
${temaContext}

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

          case 'auto_resposta': {
            // Disparado quando lead quente respondeu mas corretor ainda não agiu
            // Só envia se corretor realmente não respondeu desde a última resposta do lead
            if (!broker?.bot_instance_id || !lead.phone) { skipped++; break; }
            if (
              lead.last_broker_whatsapp_at && lead.last_lead_response_at &&
              new Date(lead.last_broker_whatsapp_at) > new Date(lead.last_lead_response_at)
            ) {
              await supabase.from('lead_activation_queue')
                .update({ status: 'cancelled', cancel_reason: 'broker_already_replied' })
                .eq('id', item.id);
              cancelled++;
              continue;
            }

            const firstName = lead.name?.split(' ')[0] || 'você';
            const tema = leadState?.tema ?? 'sem_info';
            const temaMsg: Record<string, string> = {
              preco:        `${firstName}, entendo que o valor é uma preocupação importante. Me conta: você já tem ideia de qual parcela caberia no seu orçamento?`,
              entrada:      `${firstName}, a boa notícia é que temos opções com entrada bem facilitada. Posso te mostrar como funciona?`,
              localizacao:  `${firstName}, a localização é ótima mesmo! Quer que eu te explique como chegar ou marque uma visita rápida?`,
              documentacao: `${firstName}, a análise de documentos é gratuita e sem compromisso. Posso te ajudar a entender o que precisa?`,
              sem_info:     `${firstName}, estou aqui para tirar qualquer dúvida. O que posso esclarecer para você? 😊`,
            };
            const autoMsg = temaMsg[tema] ?? temaMsg['sem_info'];
            success = await sendMsg(supabase, broker.bot_instance_id, lead.phone, autoMsg);
            if (success) {
              console.log(`[cerebro] 🤖 auto_resposta (tema=${tema}) → ${lead.name}`);
            }
            break;
          }

          case 'broker_alert': {
            if (!lead.broker_id) { skipped++; break; }
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

        // ── Atualiza fila ──────────────────────────────────────────────────
        if (success) {
          await supabase.from('lead_activation_queue').update({
            status: 'sent',
            last_attempt_at: new Date().toISOString(),
            attempts: (item.attempts || 0) + 1,
          }).eq('id', item.id);

          if (outboundToLead.includes(item.action_type)) {
            const ts = new Date().toISOString();
            await supabase.from('leads').update({
              last_interaction_at: ts,
              last_broker_whatsapp_at: ts,
            }).eq('id', lead.id);
          }

          // ── ATUALIZA ESTADO DO LEAD ──────────────────────────────────────
          const nextState = deriveNextState(
            item.action_type,
            leadState,
            !!lead.last_lead_response_at
          );
          await setLeadState(supabase, lead.id, {
            ...nextState,
            atualizado_por: 'cerebro',
          });

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
          console.log(`[cerebro] ✅ ${item.action_type} → ${lead.name} | estado: ${nextState.ultimo_evento}`);

        } else if (isOutbound) {
          const newAttempts = (item.attempts || 0) + 1;
          if (newAttempts >= 5) {
            await supabase.from('lead_activation_queue').update({
              status: 'failed',
              last_attempt_at: new Date().toISOString(),
              attempts: newAttempts,
            }).eq('id', item.id);
            details.push({ action: item.action_type, lead: lead.name, status: 'failed' });
          } else {
            const retryTime = withinWindow
              ? new Date(Date.now() + 30 * 60000).toISOString()
              : nextWindowOpen();
            await supabase.from('lead_activation_queue').update({
              scheduled_for: retryTime,
              last_attempt_at: new Date().toISOString(),
              attempts: newAttempts,
            }).eq('id', item.id);
            rescheduled++;
            details.push({ action: item.action_type, lead: lead.name, status: `retry_${newAttempts}` });
          }
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
