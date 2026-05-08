import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Detecção de opt-out ────────────────────────────────────────────────────
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const OPT_OUT_PATTERNS = [
  'nao quero mais',
  'nao quero receber',
  'nao quero contato',
  'para de me',
  'pare de me',
  'para de enviar',
  'pare de enviar',
  'para de mandar',
  'pare de mandar',
  'nao tenho interesse',
  'sem interesse',
  'me retire',
  'me tire da lista',
  'me remova',
  'me descadastre',
  'descadastrar',
  'nao me contacte',
  'nao me contate',
  'nao me envie',
  'nao me mande',
  'nao preciso',
  'nao quero',   // curto mas direto
  'stop',
  'unsubscribe',
  'cancelar mensagens',
  'parar mensagens',
  'remover contato',
];

function detectOptOut(text: string): boolean {
  if (!text) return false;
  const normalized = normalizeText(text);
  return OPT_OUT_PATTERNS.some(pattern => normalized.includes(pattern));
}

// ── Palavras-chave que indicam possível avanço de pipeline ─────────────────
const PIPELINE_KEYWORDS = [
  'visita', 'visit', 'agend', 'amanha', 'semana que vem', 'proxima semana',
  'tour', 'conhecer o imovel', 'ver o imovel',
  'document', 'rg', ' cpf', 'comprovante', 'renda', 'contrato', 'proposta',
  'assinar', 'mandei', 'enviei', 'mando', 'vou enviar', 'ja enviei',
];

function hasPipelineKeyword(text: string): boolean {
  if (!text) return false;
  const norm = normalizeText(text);
  return PIPELINE_KEYWORDS.some(kw => norm.includes(kw));
}

// ── Análise de avanço de pipeline via Gemini ──────────────────────────────
async function analyzeConversationStatus(
  supabase: any,
  leadId: string,
  lastMessage: string,
  geminiKey: string
): Promise<{ suggested_status: string | null; reason: string } | null> {
  try {
    const { data: conv } = await supabase
      .from('ia_conversations')
      .select('id')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conv?.id) return null;

    const { data: msgs } = await supabase
      .from('ia_messages')
      .select('direction, message_text')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (!msgs || msgs.length < 2) return null;

    const history = [...msgs].reverse()
      .map((m: any) => `[${m.direction === 'incoming' ? 'LEAD' : 'BOT'}] ${m.message_text}`)
      .join('\n');

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `Histórico:\n${history}\n\nÚltima mensagem do lead: "${lastMessage}"` }] }],
          systemInstruction: { parts: [{ text:
            `Identifique avanço no pipeline de venda de imóvel MCMV.
Responda APENAS em JSON válido, sem markdown:
{"suggested_status":"VISIT_SCHEDULED"|"DOCS_REQUESTED"|null,"reason":"motivo curto"}

Regras:
- "VISIT_SCHEDULED": lead confirmou visita ou tour presencial
- "DOCS_REQUESTED": lead enviou ou confirmou envio de documentos (RG, CPF, comprovante de renda)
- null: sem evidência clara de avanço de pipeline`
          }] },
          generationConfig: { maxOutputTokens: 80, temperature: 0.1 },
        }),
      }
    );
    const respJson = await resp.json();
    const rawText = respJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    const parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim());
    return { suggested_status: parsed.suggested_status || null, reason: parsed.reason || '' };
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const payload = await req.json().catch(() => null);
    console.log('[webhook_receiver] payload:', JSON.stringify(payload).substring(0, 1000));

    // Log do evento Evolution — salva apenas resumo para evitar TOAST gigante
    const slimPayload = payload ? {
      event:    payload.event || payload.type || null,
      instance: payload.instance || payload.data?.instance || null,
      phone:    payload?.data?.key?.remoteJid || payload?.key?.remoteJid || null,
      fromMe:   payload?.data?.key?.fromMe ?? payload?.key?.fromMe ?? null,
      msgPreview: (payload?.data?.message?.conversation || payload?.data?.message?.extendedTextMessage?.text || '').substring(0, 200) || null,
    } : null;
    supabase.from('webhook_logs').insert({
      integration_key: 'evolution',
      payload: slimPayload,
      status_code: 200,
    }).then(() => {}).catch(() => {}); // fire-and-forget

    const now = new Date().toISOString();
    const eventType   = payload?.event || payload?.type || '';
    const instanceName = payload?.instance || payload?.data?.instance || '';

    // ── CONNECTION_UPDATE — atualiza status do chip em tempo real ─────────────
    // A Evolution API dispara este evento sempre que a conexão muda:
    // open (conectado), connecting (escaneando QR), close/closed (desconectado).
    // Sem este handler, o banco só é atualizado pelo check-bot-health (cron) — com atraso.
    if (eventType === 'CONNECTION_UPDATE' && instanceName) {
      const rawState = payload?.data?.state || 'unknown';
      const state = String(rawState).toLowerCase();

      let newStatus: string;
      let healthScore: number;
      if (state === 'open')       { newStatus = 'open';       healthScore = 100; }
      else if (state === 'connecting') { newStatus = 'connecting'; healthScore = 50;  }
      else                        { newStatus = 'offline';    healthScore = 0;   }

      const { data: updated } = await supabase
        .from('bot_instances')
        .update({ status: newStatus, health_score: healthScore })
        .eq('instance_name', instanceName)
        .select('id, name')
        .maybeSingle();

      console.log(`[webhook_receiver] CONNECTION_UPDATE instance=${instanceName} state=${rawState} → status=${newStatus} bot="${updated?.name ?? 'not found'}"`);

      return new Response(
        JSON.stringify({ success: true, event: 'CONNECTION_UPDATE', status: newStatus }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── QRCODE_UPDATED — salva QR no banco para o Gatekeeper buscar sem chamar Evolution ─
    if ((eventType === 'QRCODE_UPDATED' || eventType === 'qrcode.updated') && instanceName) {
      const qrBase64 = payload?.data?.qrcode?.base64 || payload?.data?.base64 || null;
      if (qrBase64) {
        await supabase
          .from('bot_instances')
          .update({ last_qr_base64: qrBase64, last_qr_at: now, status: 'connecting' })
          .eq('instance_name', instanceName);
        console.log(`[webhook_receiver] QRCODE_UPDATED instance=${instanceName} — QR salvo no banco`);
      }
      return new Response(
        JSON.stringify({ success: true, event: 'QRCODE_UPDATED' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rawPhone = payload?.data?.key?.remoteJid?.replace('@s.whatsapp.net', '') ||
                     payload?.key?.remoteJid?.replace('@s.whatsapp.net', '');
    // Normaliza: remove prefixo '+' para comparação uniforme (Evolution nunca envia com +)
    const phoneNumber = rawPhone;
    // Variantes para lookup no banco (alguns leads são salvos com + outros sem)
    // Inclui variantes com/sem prefixo país 55 — leads históricos foram salvos
    // sem "55" no incoming-lead antigo, e Evolution sempre envia com 55
    const phoneVariantsGlobal = (() => {
      if (!rawPhone) return [];
      const noPlus = rawPhone.replace(/^\+/, '');
      const variants = [rawPhone, `+${noPlus}`, noPlus];
      // Se tem 55 como código país (12-13 dígitos) gera também sem o "55"
      const m55 = noPlus.match(/^55([1-9][1-9][0-9]{8,9})$/);
      if (m55) {
        variants.push(m55[1]);
        variants.push(`+${m55[1]}`);
      }
      // Se NÃO tem 55 mas é DDD válido (10-11 dígitos) gera também com "55"
      else if (/^[1-9][1-9][0-9]{8,9}$/.test(noPlus)) {
        variants.push(`55${noPlus}`);
        variants.push(`+55${noPlus}`);
      }
      return variants.filter((v, i, a) => a.indexOf(v) === i);
    })();
    const fromMe = payload?.data?.key?.fromMe === true || payload?.key?.fromMe === true;
    const messageText = payload?.data?.message?.conversation || payload?.data?.message?.extendedTextMessage?.text || payload?.message?.conversation || payload?.message?.extendedTextMessage?.text;
    const messageId = payload?.data?.key?.id || payload?.key?.id;

    // ── Deduplicação por messageId ─────────────────────────────────────────
    // A Evolution API dispara o mesmo MESSAGES_UPSERT múltiplas vezes em paralelo.
    // Sem este guard, a IA responde N vezes com a mesma mensagem.
    // Usamos o messageId único da Evolution como chave de dedup no webhook_logs.
    if (messageId && !fromMe) {
      const dedupeKey = `evol_${messageId}`;
      const { data: alreadySeen } = await supabase
        .from('webhook_logs')
        .select('id')
        .eq('integration_key', dedupeKey)
        .limit(1)
        .maybeSingle();

      if (alreadySeen) {
        console.log(`[webhook_receiver] ⚡ DUPLICATE ignorado — messageId=${messageId} phone=${phoneNumber}`);
        return new Response(JSON.stringify({ success: true, duplicate: true }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Marca como processado — fire-and-forget (webhook_logs é rotacionado periodicamente)
      supabase.from('webhook_logs').insert({
        integration_key: dedupeKey,
        payload: { messageId, phone: phoneNumber },
        status_code: 200,
        response_body: 'dedup_marker',
      }).then(() => {}, () => {});
    }

    if (phoneNumber) {
      if (fromMe) {
        // ── Corretor enviou mensagem → atualiza last_broker_whatsapp_at
        await supabase
          .from('leads')
          .update({ last_broker_whatsapp_at: now })
          .in('phone', phoneVariantsGlobal)
          .not('status', 'in', '("ABANDONED","EXCLUDED")');
        console.log(`[webhook_receiver] corretor → lead ${phoneNumber}`);

        // ── Ativa modo humano: pausa automações para este lead ────────────
        const { data: humanLeads } = await supabase
          .from('leads')
          .select('id')
          .in('phone', phoneVariantsGlobal)
          .not('status', 'in', '("ABANDONED","EXCLUDED","CONCLUDED")')
          .limit(5);
        for (const l of humanLeads || []) {
          await supabase.rpc('upsert_lead_state', {
            p_lead_id:        l.id,
            p_modo:           'humano_ativo',
            p_bloqueado:      true,
            p_ultimo_evento:  'corretor_respondeu',
            p_proxima_acao:   'aguardar',
            p_atualizado_por: 'webhook_receiver',
          }).then(() => {}, () => {});
        }

        // Pausar sessão Sentinela ativa se corretor assumiu a conversa
        const { data: brokerLead } = await supabase
          .from('leads')
          .select('id, status')
          .in('phone', phoneVariantsGlobal)
          .not('status', 'in', '("ABANDONED","EXCLUDED")')
          .limit(1)
          .maybeSingle();

        if (brokerLead?.id) {
          // Auto-avança NEW → IN_PROGRESS quando corretor envia 1ª mensagem
          if (brokerLead.status === 'NEW') {
            await supabase.from('leads').update({ status: 'IN_PROGRESS' }).eq('id', brokerLead.id);
            console.log(`[webhook_receiver] Lead ${brokerLead.id} NEW → IN_PROGRESS`);
          }

          const { data: activeSess } = await supabase
            .from('ai_sentinela_sessions')
            .select('id')
            .eq('lead_id', brokerLead.id)
            .eq('status', 'active')
            .maybeSingle();
          if (activeSess) {
            await supabase.from('ai_sentinela_sessions').update({
              status: 'broker_takeover',
              ended_at: now,
              end_reason: 'broker_takeover',
            }).eq('id', activeSess.id);
            console.log(`[webhook_receiver] Sentinela pausada para lead ${brokerLead.id} (broker_takeover)`);
          }

          // Cérebro: cancelar warmup e alertas pendentes (corretor assumiu)
          await supabase
            .from('lead_activation_queue')
            .update({ status: 'cancelled', cancel_reason: 'broker_replied' })
            .eq('lead_id', brokerLead.id)
            .eq('status', 'pending')
            .in('action_type', ['broker_warmup', 'broker_alert', 'manager_alert']);

          // Salvar mensagem do corretor em ia_messages para Análise IA
          if (messageText) {
            const { data: conv } = await supabase
              .from('ia_conversations')
              .select('id')
              .eq('lead_id', brokerLead.id)
              .eq('status', 'active')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (conv?.id) {
              await supabase.from('ia_messages').insert({
                conversation_id: conv.id,
                message_text: messageText,
                direction: 'outgoing',
                sender_type: 'broker',
                send_source: 'broker_manual',
                created_at: now,
              });
            }
          }
        }

      } else {
        // ── Lead enviou mensagem → atualiza last_lead_response_at
        // Normaliza o telefone: Evolution envia sem '+', mas alguns leads têm '+' no banco
        const phoneVariants = phoneVariantsGlobal;

        const { data: lead } = await supabase
          .from('leads')
          .select('id, broker_id, name, welcome_responded_at, welcome_template_id, ai_qualification_queue_id, ai_qualified_at, broker:profiles!broker_id(id, first_name, phone, bot_instance_id, manager_id)')
          .in('phone', phoneVariants)
          .not('status', 'in', '("ABANDONED","EXCLUDED")')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lead) {
          // ── Verificar opt-out ──────────────────────────────────────────
          if (messageText && detectOptOut(messageText)) {
            console.log(`[webhook_receiver] 🚫 OPT-OUT detectado — lead ${lead.id} (${lead.name}): "${messageText.substring(0, 80)}"`);

            // Marcar como EXCLUDED para bloquear todos os envios futuros
            await supabase
              .from('leads')
              .update({ status: 'EXCLUDED', last_interaction_at: now })
              .eq('id', lead.id);

            // Cancelar TODOS os itens pendentes da fila de automação
            await supabase
              .from('lead_activation_queue')
              .update({ status: 'cancelled', cancel_reason: 'opt_out' })
              .eq('lead_id', lead.id)
              .eq('status', 'pending');

            // Encerrar sessões Sentinela ativas
            await supabase
              .from('ai_sentinela_sessions')
              .update({ status: 'ended', ended_at: now, end_reason: 'opt_out' })
              .eq('lead_id', lead.id)
              .eq('status', 'active');

            // Notificar corretor sobre o opt-out
            if (lead.broker_id) {
              await supabase.from('internal_notifications').insert({
                to_id: lead.broker_id,
                type: 'LEAD_OPT_OUT',
                title: '🚫 Lead pediu para não ser contactado',
                message: `${lead.name} solicitou parar de receber mensagens. Automações pausadas e lead marcado como Excluído.`,
                related_lead_id: lead.id,
              });
            }

            // Registrar evento no histórico do lead
            await supabase.from('lead_notes').insert({
              lead_id: lead.id,
              content: `🚫 Opt-out detectado automaticamente. Mensagem recebida: "${messageText.substring(0, 150)}". Lead marcado como EXCLUÍDO e automações canceladas.`,
              type: 'SYSTEM',
            });

            return new Response(
              JSON.stringify({ success: true, opt_out: true, lead_id: lead.id }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          const updates: any = { last_lead_response_at: now };

          // Primeira resposta do lead → registra welcome_responded_at
          if (!lead.welcome_responded_at) {
            updates.welcome_responded_at = now;
            console.log(`[webhook_receiver] 🔥 PRIMEIRA RESPOSTA do lead ${phoneNumber}`);

            // Atualiza stats do template de boas-vindas
            if (lead.welcome_template_id) {
              await supabase.rpc('record_welcome_template_responded', {
                p_template_id: lead.welcome_template_id
              });
            }

            // Notifica corretor urgentemente: lead está quente
            if (lead.broker_id) {
              await supabase.from('internal_notifications').insert({
                to_id: lead.broker_id,
                type: 'LEAD_RESPONDED',
                title: '🔥 Lead respondeu! Atenda agora',
                message: `${lead.name} respondeu à mensagem de boas-vindas e está esperando você. Não perca esse momento!`,
                related_lead_id: lead.id,
              });

              // ── WhatsApp pro corretor — mesmo padrão do new-lead ──────────
              try {
                const broker = (lead as any).broker;
                if (broker?.phone) {
                  // Bot prioritário: manager do corretor → fallback global
                  let notifBotId: string | null = null;
                  if (broker.manager_id) {
                    const { data: mgr } = await supabase
                      .from('profiles').select('bot_instance_id').eq('id', broker.manager_id).maybeSingle();
                    notifBotId = mgr?.bot_instance_id ?? null;
                  }
                  if (!notifBotId) {
                    const { data: bs } = await supabase
                      .from('system_settings').select('value').eq('key', 'notification_bot_instance_id').maybeSingle();
                    notifBotId = bs?.value ?? null;
                  }
                  if (notifBotId) {
                    const msg = `🔥 *Lead respondeu!*\n\n👤 *${lead.name}* acabou de responder a mensagem de boas-vindas e está esperando você.\n\n⚡ Abra o Comandra agora e atenda!`;
                    await supabase.functions.invoke('send_whatsapp_message', {
                      body: { botId: notifBotId, phone: broker.phone, message: msg }
                    });
                    console.log(`[webhook_receiver] WhatsApp enviado para corretor ${broker.first_name}`);
                  }
                }
              } catch (wErr: any) {
                console.error('[webhook_receiver] Falha WhatsApp corretor:', wErr.message);
              }
            }
          }

          await supabase
            .from('leads')
            .update(updates)
            .eq('id', lead.id);

          // ── Classificador de Intenção: reclassifica a cada resposta do lead ──
          if (messageText) {
            const geminiKey = Deno.env.get('GEMINI_API_KEY') || '';
            if (geminiKey) {
              try {
                const classResp = await fetch(
                  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      contents: [{ role: 'user', parts: [{ text: `Mensagem do lead: "${messageText}"` }] }],
                      systemInstruction: { parts: [{ text:
                        `Classifique a mensagem de um lead de imóvel MCMV.
Responda APENAS em JSON válido, sem markdown:
{"intencao":"quente|morno|frio","tema":"preco|entrada|localizacao|documentacao|sem_info","momento":"explorando|comparando|decidido|sumiu"}`
                      }] },
                      generationConfig: { maxOutputTokens: 60, temperature: 0.1 },
                    }),
                  }
                );
                const classJson = await classResp.json();
                const rawClass = classJson.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
                const cls = JSON.parse(rawClass.replace(/```json|```/g, '').trim());

                await supabase.rpc('upsert_lead_state', {
                  p_lead_id:        lead.id,
                  p_intencao:       cls.intencao,
                  p_tema:           cls.tema,
                  p_momento:        cls.momento,
                  p_ultimo_evento:  'lead_respondeu',
                  p_proxima_acao:   cls.intencao === 'quente' ? 'alertar_gerente' : 'aguardar',
                  p_atualizado_por: 'classificador_ia',
                }).then(() => {}, () => {});

                console.log(`[webhook_receiver] Classificação: ${cls.intencao}/${cls.tema}/${cls.momento}`);
              } catch (e: any) {
                console.warn('[webhook_receiver] Classificador IA falhou:', e.message);
              }
            } else {
              // Sem IA: marca evento mínimo
              await supabase.rpc('upsert_lead_state', {
                p_lead_id:        lead.id,
                p_ultimo_evento:  'lead_respondeu',
                p_proxima_acao:   'aguardar',
                p_atualizado_por: 'webhook_receiver',
              }).then(() => {}, () => {});
            }
          }

          // ── Análise de avanço de pipeline ─────────────────────────────
          // Só roda se mensagem tem palavras-chave relevantes + cooldown 2h
          if (messageText && hasPipelineKeyword(messageText)) {
            const geminiKey2 = Deno.env.get('GEMINI_API_KEY') || '';
            if (geminiKey2) {
              try {
                const { data: recentCheck } = await supabase
                  .from('automation_logs')
                  .select('id')
                  .eq('entity_id', lead.id)
                  .eq('entity_type', 'ia_status_analysis')
                  .gte('executed_at', new Date(Date.now() - 2 * 3600000).toISOString())
                  .limit(1)
                  .maybeSingle();

                if (!recentCheck) {
                  const statusAnalysis = await analyzeConversationStatus(supabase, lead.id, messageText, geminiKey2);

                  // Log cooldown (independente de ter mudado o status)
                  await supabase.from('automation_logs').insert({
                    entity_type: 'ia_status_analysis',
                    entity_id: lead.id,
                    status: 'success',
                    message_sent: statusAnalysis?.suggested_status
                      ? `${lead.status} → ${statusAnalysis.suggested_status}: ${statusAnalysis.reason}`
                      : `sem mudança: ${statusAnalysis?.reason || 'nenhuma evidência'}`,
                    recipient_phone: lead.phone,
                  }).then(() => {}, () => {});

                  if (statusAnalysis?.suggested_status) {
                    const PIPELINE_ORDER = ['NEW', 'IN_PROGRESS', 'VISIT_SCHEDULED', 'DOCS_REQUESTED', 'CONCLUDED'];
                    const curIdx = PIPELINE_ORDER.indexOf((lead.status || 'NEW').toUpperCase());
                    const newIdx = PIPELINE_ORDER.indexOf(statusAnalysis.suggested_status);

                    if (newIdx > curIdx) {
                      await supabase.from('leads')
                        .update({ status: statusAnalysis.suggested_status })
                        .eq('id', lead.id);

                      await supabase.from('lead_notes').insert({
                        lead_id: lead.id,
                        content: `📊 Status atualizado pela IA: ${lead.status} → ${statusAnalysis.suggested_status}. Motivo: ${statusAnalysis.reason}`,
                        type: 'SYSTEM',
                      }).then(() => {}, () => {});

                      console.log(`[webhook_receiver] 📊 ${lead.name}: ${lead.status} → ${statusAnalysis.suggested_status}`);
                    }
                  }
                }
              } catch (e: any) {
                console.warn('[webhook_receiver] Análise pipeline IA falhou:', e.message);
              }
            }
          }

          // Cérebro: cancelar toques pendentes + agendar warmup e escalações
          await supabase
            .from('lead_activation_queue')
            .update({ status: 'cancelled', cancel_reason: 'lead_responded' })
            .eq('lead_id', lead.id)
            .eq('status', 'pending')
            .in('action_type', ['toque_1', 'toque_2', 'sentinela', 'last_chance']);

          // Lê intenção do lead para ajustar urgência dos timers
          const { data: ls } = await supabase
            .from('lead_state').select('intencao')
            .eq('lead_id', lead.id).maybeSingle();
          const isHot = ls?.intencao === 'quente';

          // Lead quente: timers agressivos (5min alerta, 15min auto-resposta, 30min gerente)
          // Lead normal: timers conservadores (35min warmup, 2h alerta, 4h gerente)
          const queueItems = isHot
            ? [
                { lead_id: lead.id, action_type: 'broker_alert',    scheduled_for: new Date(Date.now() +  5 * 60000).toISOString() },
                { lead_id: lead.id, action_type: 'auto_resposta',   scheduled_for: new Date(Date.now() + 15 * 60000).toISOString() },
                { lead_id: lead.id, action_type: 'manager_alert',   scheduled_for: new Date(Date.now() + 30 * 60000).toISOString() },
              ]
            : [
                { lead_id: lead.id, action_type: 'broker_warmup',   scheduled_for: new Date(Date.now() + 35 * 60000).toISOString() },
                { lead_id: lead.id, action_type: 'broker_alert',    scheduled_for: new Date(Date.now() +  2 * 3600000).toISOString() },
                { lead_id: lead.id, action_type: 'manager_alert',   scheduled_for: new Date(Date.now() +  4 * 3600000).toISOString() },
              ];

          if (isHot) console.log(`[webhook_receiver] 🔥 Lead QUENTE — timers agressivos para ${lead.name}`);
          try { await supabase.from('lead_activation_queue').insert(queueItems); } catch {}
        } else {
          // ── Não achou em leads → checa cold_contacts (prospecção manual do broker) ──
          const { data: cold } = await supabase
            .from('cold_contacts')
            .select('id, claimed_by, name')
            .in('phone', phoneVariants)
            .eq('status', 'claimed')
            .not('claimed_by', 'is', null)
            .limit(1)
            .maybeSingle();

          if (cold?.id) {
            const { data: newLeadId } = await supabase.rpc('promote_cold_to_lead', { p_contact_id: cold.id });
            if (newLeadId) {
              console.log(`[webhook_receiver] ❄️→🔥 cold "${cold.name}" respondeu e virou lead ${newLeadId}`);
              if (cold.claimed_by) {
                await supabase.from('internal_notifications').insert({
                  to_id: cold.claimed_by,
                  type: 'COLD_PROMOTED',
                  title: '🔥 Prospect respondeu — virou lead!',
                  message: `${cold.name} respondeu sua mensagem de prospecção. Já está no seu dashboard como Em Atendimento.`,
                  related_lead_id: newLeadId,
                });
              }
            }
          }
        }
        console.log(`[webhook_receiver] lead → corretor ${phoneNumber}`);
      }
    }

    if (!phoneNumber || !messageText) {
      console.warn('[webhook_receiver] missing phone or message');
      return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── Bloqueia IA para leads EXCLUDED / ABANDONED / CONCLUDED ─────────────
    // Verifica status do lead ANTES de qualquer resposta automática
    const { data: leadStatusCheck } = await supabase
      .from('leads')
      .select('id, status, pause_auto_messages')
      .in('phone', phoneVariantsGlobal)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (leadStatusCheck && ['EXCLUDED', 'ABANDONED', 'CONCLUDED'].includes(leadStatusCheck.status)) {
      console.log(`[webhook_receiver] 🚫 Lead ${phoneNumber} com status ${leadStatusCheck.status} — IA bloqueada, sem resposta automática`);
      return new Response(JSON.stringify({ success: true, blocked: true, reason: leadStatusCheck.status }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Toggle por lead: corretor pausou automações no dashboard.
    // Registra a mensagem normalmente (histórico, last_lead_response_at, messages_count),
    // mas NÃO invoca nenhuma IA (ia_chat_engine, agente-qualificacao-ia).
    const pauseAutoMessages = leadStatusCheck?.pause_auto_messages === true;
    if (pauseAutoMessages) {
      console.log(`[webhook_receiver] ⏸️ Lead ${phoneNumber} com pause_auto_messages=true — IA não responderá (mensagem ainda será registrada)`);
    }

    // Find active conversation for this lead (tenta todas as variantes do telefone)
    const { data: conversation } = await supabase
      .from('ia_conversations')
      .select('*')
      .in('lead_phone', phoneVariantsGlobal)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conversation) {
      console.log('[webhook_receiver] no active conversation found for', phoneNumber);
      // Try to find lead to determine broker (só leads ativos)
      const { data: lead } = await supabase.from('leads').select('*, profiles!broker_id(*)')
        .in('phone', phoneVariantsGlobal)
        .not('status', 'in', '("ABANDONED","EXCLUDED","CONCLUDED")')
        .maybeSingle();

      if (lead && lead.profiles) {
        const broker = lead.profiles;
        // Get broker's bot_instance_id
        if (broker.bot_instance_id) {
          const { data: botInstance } = await supabase.from('bot_instances').select('*').eq('id', broker.bot_instance_id).maybeSingle();
          // create a new conversation assigned to broker's bot
          const { data: newConv } = await supabase.from('ia_conversations').insert({
            campaign_id: null,
            bot_instance_id: botInstance?.id || null,
            lead_id: lead.id,
            lead_name: lead.name,
            lead_phone: phoneNumber,
            status: 'active',
            sentiment: 'unknown'
          }).select().single();

          console.log('[webhook_receiver] created conversation', newConv?.id);

          // FIX: responder a primeira mensagem do lead — antes retornava sem chamar a IA
          if (newConv?.id && messageText) {
            await supabase.from('ia_messages').insert({
              conversation_id: newConv.id,
              message_text: messageText,
              direction: 'incoming',
              sender_type: 'lead',
              created_at: new Date().toISOString(),
            });
            const aiAssistOn = (broker as any)?.automation_settings?.ai_assist_enabled === true;
            if (pauseAutoMessages) {
              console.log('[webhook_receiver] ⏸️ pause_auto_messages=true — pulando ia_chat_engine (primeira msg)');
            } else if (!aiAssistOn) {
              console.log(`[webhook_receiver] ⏸️ ai_assist_enabled != true para broker ${broker.id} — pulando ia_chat_engine (primeira msg)`);
            } else {
              const { error: iaErr } = await supabase.functions.invoke('ia_chat_engine', {
                body: { conversationId: newConv.id, incomingMessage: messageText }
              });
              if (iaErr) console.error('[webhook_receiver] ia_chat_engine error (first msg):', iaErr.message);
              else console.log('[webhook_receiver] IA respondeu à primeira mensagem do lead');
            }
          }

          return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      // Lead sem bot configurado — apenas loga
      return new Response(JSON.stringify({ message: 'No active conversation' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('[webhook_receiver] conversation found', conversation.id);

    // Save incoming message
    await supabase.from('ia_messages').insert({
      conversation_id: conversation.id,
      message_text: messageText,
      direction: 'incoming',
      sender_type: 'lead',
      created_at: new Date().toISOString(),
    });

    // Métrica de template: primeira resposta do lead numa conversa que originou de um template
    // (messages_count antes do incremento conta apenas as mensagens outgoing iniciais do disparador)
    const isFirstLeadResponse = !conversation.last_message_at; // ainda não houve resposta antes
    if (isFirstLeadResponse && conversation.template_id) {
      await supabase.rpc('increment_template_response', { p_template_id: conversation.template_id })
        .then(() => {}, (err: any) => console.warn('[webhook_receiver] increment_template_response falhou:', err?.message));
    }

    // Update conversation metadata
    await supabase.from('ia_conversations').update({
      messages_count: (conversation.messages_count || 0) + 1,
      last_message_at: new Date().toISOString(),
    }).eq('id', conversation.id);

    // ── Roteamento de resposta ─────────────────────────────────────────────
    // Leads de qualificação IA (Judite/Josefa): aciona agente-qualificacao-ia
    // Leads normais: usa ia_chat_engine
    const { data: convLead } = await supabase
      .from('leads')
      .select('ai_qualification_queue_id, ai_qualified_at, broker:profiles!broker_id(automation_settings)')
      .eq('id', conversation.lead_id)
      .maybeSingle();
    const convBrokerAiOn = (convLead as any)?.broker?.automation_settings?.ai_assist_enabled === true;
    // Conversa de prospecção (campaign_id) usa IA da campanha, não do broker — sempre roda
    const isProspeccao = !!conversation.campaign_id;

    if (convLead?.ai_qualification_queue_id && !convLead?.ai_qualified_at) {
      // Lead ainda em qualificação → aciona agente IA
      if (pauseAutoMessages) {
        console.log('[webhook_receiver] ⏸️ pause_auto_messages=true — pulando agente-qualificacao-ia');
      } else {
        console.log(`[webhook_receiver] 🤖 Lead de qualificação IA — acionando agente-qualificacao-ia`);
        supabase.functions.invoke('agente-qualificacao-ia', { body: {} }).then(() => {}, () => {});
      }

    } else if (convLead?.ai_qualification_queue_id && convLead?.ai_qualified_at && !pauseAutoMessages) {
      // Lead já qualificado e transferido → envia aviso automático via bot da fila
      // (evita silêncio total quando o lead manda mensagem depois do handoff)
      console.log(`[webhook_receiver] 🤝 Lead qualificado respondeu após handoff — enviando aviso`);
      try {
        const { data: queue } = await supabase
          .from('distribution_queues')
          .select('ai_agent_broker_id')
          .eq('id', convLead.ai_qualification_queue_id)
          .maybeSingle();

        if (queue?.ai_agent_broker_id) {
          const { data: aiAgent } = await supabase
            .from('profiles')
            .select('bot_instance_id, first_name')
            .eq('id', queue.ai_agent_broker_id)
            .maybeSingle();

          if (aiAgent?.bot_instance_id) {
            const { data: convLeadFull } = await supabase
              .from('leads')
              .select('name, phone, broker:profiles!broker_id(first_name)')
              .eq('id', conversation.lead_id)
              .maybeSingle();

            const brokerName = (convLeadFull as any)?.broker?.first_name || 'nosso corretor';
            const firstName = convLeadFull?.name?.split(' ')[0] || '';
            const msg = `Oi ${firstName}! Você já está sendo atendido por ${brokerName}, que vai entrar em contato com você em breve. 😊`;

            await supabase.functions.invoke('send_whatsapp_message', {
              body: { botId: aiAgent.bot_instance_id, phone: convLeadFull?.phone, message: msg },
            });
          }
        }
      } catch (e: any) {
        console.warn('[webhook_receiver] Falha ao enviar aviso pós-handoff:', e.message);
      }

    } else {
      if (pauseAutoMessages) {
        console.log('[webhook_receiver] ⏸️ pause_auto_messages=true — pulando ia_chat_engine');
      } else if (!isProspeccao && !convBrokerAiOn) {
        // CRM (sem campaign_id): respeita ai_assist_enabled do broker.
        // Prospecção pula esse gate — IA da campanha sempre responde.
        console.log('[webhook_receiver] ⏸️ ai_assist_enabled != true — pulando ia_chat_engine (CRM)');
      } else {
        const { error: iaError } = await supabase.functions.invoke('ia_chat_engine', {
          body: {
            conversationId: conversation.id,
            incomingMessage: messageText,
          }
        });
        if (iaError) console.error('[webhook_receiver] ia_chat_engine error', iaError.message);
      }
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('[webhook_receiver] error', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
