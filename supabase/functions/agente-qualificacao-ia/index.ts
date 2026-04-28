import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─────────────────────────────────────────────────────────────────────────────
// agente-qualificacao-ia
//
// Gerencia a conversa IA de qualificação para leads atribuídos a Judite/Josefa.
//
// Fluxo:
//   1. Busca leads com ai_qualification_queue_id preenchido e ai_qualified_at nulo
//   2. Para cada lead, determina se é hora de enviar mensagem (gap mínimo)
//   3. Chama OpenAI para analisar conversa e gerar próxima mensagem
//   4. Se qualificado → transfere para fila original + notifica Junior
//   5. Se max tentativas (6) atingido → transfere como lead frio
// ─────────────────────────────────────────────────────────────────────────────

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const JUNIOR_PHONE   = '5511988628222';
const MAX_ATTEMPTS   = 6;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── BRT window: só opera entre 07h e 22h ─────────────────────────────────────
function isWithinWindow(): boolean {
  const brtH = (new Date().getUTCHours() - 3 + 24) % 24;
  const brtM = new Date().getUTCMinutes();
  const total = brtH * 60 + brtM;
  return total >= 7 * 60 && total <= 22 * 60;
}

// ── Gap mínimo entre mensagens ────────────────────────────────────────────────
// Tentativas 1-2: mínimo 4h  (engajamento inicial rápido)
// Tentativas 3+:  mínimo 20h (não bombardear, respeitar rotina)
function minGapMs(attempts: number): number {
  return attempts < 2 ? 4 * 3600000 : 20 * 3600000;
}

// ── Carrega histórico de conversa (últimas 12 mensagens) ──────────────────────
async function loadHistory(supabase: any, leadId: string): Promise<any[]> {
  const { data: conv } = await supabase
    .from('ia_conversations')
    .select('id')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conv) return [];

  const { data: msgs } = await supabase
    .from('ia_messages')
    .select('direction, message_text, created_at')
    .eq('conversation_id', conv.id)
    .order('created_at', { ascending: false })
    .limit(12);

  return (msgs || []).reverse();
}

// ── Garante que existe uma ia_conversation para o lead ───────────────────────
async function ensureConversation(supabase: any, lead: any): Promise<string | null> {
  const { data: existing } = await supabase
    .from('ia_conversations')
    .select('id')
    .eq('lead_id', lead.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: newConv } = await supabase
    .from('ia_conversations')
    .insert({
      lead_id:    lead.id,
      lead_name:  lead.name,
      lead_phone: lead.phone,
      status:     'active',
      sentiment:  'unknown',
    })
    .select('id')
    .single();

  return newConv?.id ?? null;
}

// ── Chama OpenAI GPT-4o-mini ──────────────────────────────────────────────────
async function callOpenAI(
  lead: any,
  history: any[],
  attempts: number,
  agentName: string,
): Promise<{ qualified: boolean; qualification_type: string | null; message: string | null; summary: string }> {

  const historyText = history.length > 0
    ? history.map(m => `[${m.direction === 'incoming' ? 'LEAD' : 'IA'}] ${m.message_text}`).join('\n')
    : '(sem histórico — primeira mensagem)';

  const systemPrompt = `Você é ${agentName}, assistente virtual de uma imobiliária especializada em MCMV (Minha Casa Minha Vida) no Brasil.

SEU OBJETIVO: qualificar o lead e fazer ele querer:
1. Agendar uma visita ao plantão de vendas
2. Entregar documentos para análise GRATUITA de subsídio

CRITÉRIO DE QUALIFICAÇÃO (qualified=true) — lead demonstrou QUALQUER um destes:
- Interesse em visitar: "quero visitar", "quando tem plantão", "posso ir ver", "quero conhecer", "tem aos fins de semana"
- Interesse em documentos: "vou mandar documentos", "o que preciso enviar", "quero analisar", "me manda a lista", "quero ver meu subsídio"

ROTEIRO NATURAL (adapte ao histórico):
- Primeira mensagem: se apresentar + perguntar o que chamou atenção
- 2ª-3ª: entender situação (renda, tipo de trabalho, tem FGTS)
- 4ª+: guiar para visita ou análise de documentos

REGRAS:
- Português do Brasil, casual e caloroso
- Máximo 3 frases por mensagem
- 1 pergunta por mensagem, nunca 2
- NUNCA repita perguntas já feitas no histórico
- Você NÃO tem fotos/vídeos — nunca prometa isso
- Se lead disser que não tem interesse: agradeça educadamente

RESPONDA APENAS EM JSON VÁLIDO (sem markdown):
{
  "qualified": true|false,
  "qualification_type": "visita"|"documentos"|null,
  "message": "mensagem WhatsApp a enviar (null se qualified=true)",
  "summary": "resumo em 1 frase do interesse/perfil do lead"
}`;

  const userPrompt = `Lead: ${lead.name} | Tag/produto: ${lead.tag || 'imóvel MCMV'} | Tentativa: ${attempts + 1}/${MAX_ATTEMPTS}

Histórico (${history.length} mensagens):
${historyText}

Gere a próxima ação.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 300,
      temperature: 0.5,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt   },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI error: ${response.status} ${err.substring(0, 200)}`);
  }

  const json = await response.json();
  const rawText = json.choices?.[0]?.message?.content?.trim() || '{}';

  try {
    return JSON.parse(rawText.replace(/```json|```/g, '').trim());
  } catch {
    // Se não veio JSON válido, trata como mensagem simples não qualificada
    return { qualified: false, qualification_type: null, message: rawText, summary: '' };
  }
}

// ── Transfere lead para fila de corretores humanos ────────────────────────────
async function transferToQueue(
  supabase: any,
  lead: any,
  queueId: string,
  qualificationType: string | null,
): Promise<{ brokerName: string; brokerId: string; brokerPhone: string | null; managerId: string | null } | null> {

  // Busca fila + próximo corretor via round-robin
  for (let i = 0; i < 5; i++) {
    const { data: q } = await supabase
      .from('distribution_queues')
      .select('broker_ids, last_assigned_index')
      .eq('id', queueId)
      .maybeSingle();

    if (!q?.broker_ids?.length) break;

    const oldIndex = q.last_assigned_index || 0;
    const idx = oldIndex % q.broker_ids.length;

    const { data: updated } = await supabase
      .from('distribution_queues')
      .update({ last_assigned_index: oldIndex + 1 })
      .eq('id', queueId)
      .eq('last_assigned_index', oldIndex)
      .select()
      .maybeSingle();

    if (!updated) continue; // CAS falhou, tenta de novo

    const { data: broker } = await supabase
      .from('profiles')
      .select('id, first_name, phone, bot_instance_id, lead_assignment_enabled, manager_id')
      .eq('id', q.broker_ids[idx])
      .maybeSingle();

    if (!broker || broker.lead_assignment_enabled === false) continue;

    const now = new Date().toISOString();

    // Transfere o lead
    await supabase.from('leads').update({
      broker_id:              broker.id,
      ai_qualified_at:        now,
      ai_qualification_type:  qualificationType,
      status:                 'IN_PROGRESS',
      last_interaction_at:    now,
    }).eq('id', lead.id);

    // Notificação interna para o corretor
    try {
      await supabase.from('internal_notifications').insert({
        to_id:           broker.id,
        type:            'NEW_LEAD',
        title:           '🤖 Lead qualificado pela IA',
        message:         `${lead.name} foi qualificado pela IA (${qualificationType === 'visita' ? 'quer visitar' : qualificationType === 'documentos' ? 'quer entregar docs' : 'lead frio'}) e atribuído a você.`,
        related_lead_id: lead.id,
      });
    } catch {}

    return {
      brokerName:  broker.first_name || 'Corretor',
      brokerId:    broker.id,
      brokerPhone: broker.phone || null,
      managerId:   broker.manager_id || null,
    };
  }

  return null;
}

// ── Notifica Junior via WhatsApp ──────────────────────────────────────────────
async function notifyJunior(
  supabase: any,
  lead: any,
  qualificationType: string | null,
  summary: string,
  brokerName: string,
  agentName: string,
  notifBotId: string,
): Promise<void> {

  const typeLabel =
    qualificationType === 'visita'      ? '🏠 Quer agendar visita' :
    qualificationType === 'documentos'  ? '📄 Quer entregar documentos' :
                                          '❄️ Transferido (max tentativas)';

  const appUrl = Deno.env.get('APP_URL') || 'https://comandra.com.br/dashboard';

  const msg = [
    `🤖 *Lead qualificado pela IA!*`,
    ``,
    `👤 *${lead.name}*`,
    `🎯 Agente: ${agentName} | Tag: ${lead.tag || '—'}`,
    `✅ ${typeLabel}`,
    ``,
    `💬 *Resumo:* ${summary || '—'}`,
    ``,
    `➡️ *Transferido para:* ${brokerName}`,
    ``,
    `📲 ${appUrl}`,
  ].join('\n');

  try {
    await supabase.functions.invoke('send_whatsapp_message', {
      body: { botId: notifBotId, phone: JUNIOR_PHONE, message: msg },
    });
  } catch {}
}

// ── Notifica o corretor via WhatsApp do chip do manager ──────────────────────
async function notifyBroker(
  supabase: any,
  lead: any,
  qualificationType: string | null,
  summary: string,
  brokerPhone: string,
  managerId: string,
  agentName: string,
): Promise<void> {

  // Busca o bot do manager para usar como remetente
  const { data: manager } = await supabase
    .from('profiles')
    .select('first_name, bot_instance_id')
    .eq('id', managerId)
    .maybeSingle();

  if (!manager?.bot_instance_id) return;

  const typeLabel =
    qualificationType === 'visita'     ? '🏠 Quer agendar visita' :
    qualificationType === 'documentos' ? '📄 Quer entregar documentos' :
                                         '❄️ Lead transferido (esgotou tentativas)';

  const appUrl = Deno.env.get('APP_URL') || 'https://comandra.com.br/dashboard';

  const msg = [
    `🤖 *Lead qualificado pela IA ${agentName}!*`,
    ``,
    `👤 *${lead.name}* foi atribuído a você agora.`,
    `✅ ${typeLabel}`,
    ``,
    `💬 *Resumo:* ${summary || '—'}`,
    ``,
    `⚡ Abra o Comandra e atenda agora:`,
    `📲 ${appUrl}`,
  ].join('\n');

  try {
    await supabase.functions.invoke('send_whatsapp_message', {
      body: { botId: manager.bot_instance_id, phone: brokerPhone, message: msg },
    });
    console.log(`[qualificacao-ia] WhatsApp enviado para corretor via chip de ${manager.first_name}`);
  } catch {}
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  );

  if (!isWithinWindow()) {
    return new Response(JSON.stringify({ skipped: 'outside_window' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: 'OPENAI_API_KEY não configurada' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const now = Date.now();

    // Bot de notificação para alertar Junior
    const { data: notifBotSetting } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'notification_bot_instance_id')
      .maybeSingle();
    const notifBotId = notifBotSetting?.value ?? null;

    // Busca leads sob gestão de agente IA, ainda não qualificados
    const { data: aiLeads } = await supabase
      .from('leads')
      .select(`
        id, name, phone, tag, status, broker_id,
        ai_qualification_queue_id, ai_qualification_attempts,
        last_broker_whatsapp_at, last_lead_response_at,
        broker:profiles!broker_id(first_name, bot_instance_id)
      `)
      .not('ai_qualification_queue_id', 'is', null)
      .is('ai_qualified_at', null)
      .in('status', ['NEW', 'IN_PROGRESS'])
      .not('broker_id', 'is', null)
      .eq('pause_auto_messages', false)
      .limit(20);

    if (!aiLeads?.length) {
      return new Response(JSON.stringify({ processed: 0, reason: 'no_ai_leads' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[agente-qualificacao-ia] ${aiLeads.length} leads em qualificação`);

    let qualified = 0;
    let messaged  = 0;
    let transferred = 0;
    const errors: string[] = [];

    // IDs dos agentes IA (Judite e Josefa) — broker_ids que podem conduzir qualificação
    const { data: aiAgentQueues } = await supabase
      .from('distribution_queues')
      .select('ai_agent_broker_id')
      .not('ai_agent_broker_id', 'is', null);
    const aiAgentBrokerIds = new Set((aiAgentQueues || []).map((q: any) => q.ai_agent_broker_id));

    for (const lead of aiLeads) {
      try {
        const broker = (lead as any).broker;

        // ── Segurança: lead foi reatribuído a corretor humano (Judite/Josefa suspensas) ──
        // Limpar o campo de qualificação para não processar leads com broker humano
        if (!aiAgentBrokerIds.has(lead.broker_id)) {
          console.log(`[qualificacao-ia] ${lead.name} — broker não é agente IA, limpando ai_qualification_queue_id`);
          await supabase.from('leads').update({
            ai_qualification_queue_id: null,
          }).eq('id', lead.id);
          continue;
        }

        if (!broker?.bot_instance_id || !lead.phone) continue;

        const attempts = lead.ai_qualification_attempts || 0;

        // ── Transferência por esgotamento de tentativas ───────────────────
        if (attempts >= MAX_ATTEMPTS) {
          console.log(`[qualificacao-ia] ${lead.id} (${lead.name}) — max tentativas, transferindo como lead frio`);
          const result = await transferToQueue(supabase, lead, lead.ai_qualification_queue_id, null);
          if (result) {
            if (notifBotId) {
              await notifyJunior(supabase, lead, null, 'Lead não respondeu após 6 tentativas.', result.brokerName, broker.first_name || 'IA', notifBotId);
            }
            if (result.brokerPhone && result.managerId) {
              await notifyBroker(supabase, lead, null, 'Lead não respondeu após 6 tentativas.', result.brokerPhone, result.managerId, broker.first_name || 'IA');
            }
          }
          transferred++;
          continue;
        }

        // ── Verifica gap mínimo entre mensagens ───────────────────────────
        const lastSent = lead.last_broker_whatsapp_at
          ? new Date(lead.last_broker_whatsapp_at).getTime() : 0;
        const lastLeadReply = lead.last_lead_response_at
          ? new Date(lead.last_lead_response_at).getTime() : 0;
        const gap = now - lastSent;

        // Se o lead respondeu DEPOIS da última mensagem do bot → reply imediato (ignora gap)
        const leadRepliedAfterBot = lastLeadReply > lastSent;

        // Primeira mensagem: enviar se nunca foi enviada
        // Lead respondeu: reply imediato
        // Demais: respeitar gap mínimo
        if (attempts > 0 && !leadRepliedAfterBot && gap < minGapMs(attempts)) {
          continue; // ainda não é hora
        }

        // ── Primeira mensagem: usa welcome_template em vez de OpenAI ─────
        // Mensagens curadas, naturais, variadas — IA entra só da 2ª em diante
        let aiResult: { qualified: boolean; qualification_type: string | null; message: string | null; summary: string };

        if (attempts === 0) {
          const { data: templates } = await supabase
            .from('welcome_templates')
            .select('message')
            .eq('is_active', true);

          if (templates?.length) {
            // Rotação baseada no ID do lead para consistência
            const idx = Math.abs(lead.id.charCodeAt(0) + lead.id.charCodeAt(1)) % templates.length;
            const firstName = lead.name?.split(' ')[0] || lead.name || 'você';
            const agentName = broker.first_name || 'Judite';
            const rawMsg = templates[idx].message || '';
            const welcomeMsg = rawMsg
              .replace(/\{nome\}/gi, firstName)
              .replace(/\{broker\}/gi, agentName);
            aiResult = { qualified: false, qualification_type: null, message: welcomeMsg, summary: '' };
          } else {
            // Fallback se não houver templates
            const firstName = lead.name?.split(' ')[0] || 'você';
            aiResult = {
              qualified: false, qualification_type: null, summary: '',
              message: `Olá ${firstName}! Vi seu interesse em imóveis pelo Minha Casa Minha Vida. Posso te fazer uma pergunta rápida para te ajudar melhor? 😊`,
            };
          }
        } else {
          // ── Da 2ª mensagem em diante: OpenAI conduz a conversa ───────────
          const history = await loadHistory(supabase, lead.id);
          aiResult = await callOpenAI(lead, history, attempts, broker.first_name || 'Judite');
        }

        console.log(`[qualificacao-ia] ${lead.name} — attempt=${attempts} qualified=${aiResult.qualified} type=${aiResult.qualification_type}`);

        if (aiResult.qualified) {
          // ── Mensagem de encerramento antes da transferência ───────────
          // Judite avisa o lead que um corretor vai assumir, evitando silêncio
          const handoffMsg = [
            `Boa notícia! 🎉`,
            `Vou te conectar agora com um de nossos especialistas que vai te ajudar pessoalmente com tudo.`,
            `Em breve você receberá o contato dele. Foi um prazer falar com você, ${lead.name?.split(' ')[0] || ''}! 😊`,
          ].join(' ');

          try {
            await supabase.functions.invoke('send_whatsapp_message', {
              body: { botId: broker.bot_instance_id, phone: lead.phone, message: handoffMsg },
            });
          } catch {}

          // ── Transferir para fila ──────────────────────────────────────
          const transfer = await transferToQueue(
            supabase, lead, lead.ai_qualification_queue_id, aiResult.qualification_type,
          );

          if (transfer) {
            if (notifBotId) {
              await notifyJunior(
                supabase, lead, aiResult.qualification_type,
                aiResult.summary, transfer.brokerName,
                broker.first_name || 'IA', notifBotId,
              );
            }
            if (transfer.brokerPhone && transfer.managerId) {
              await notifyBroker(
                supabase, lead, aiResult.qualification_type,
                aiResult.summary, transfer.brokerPhone,
                transfer.managerId, broker.first_name || 'IA',
              );
            }
          }

          // Nota no timeline
          try {
            await supabase.from('lead_notes').insert({
              lead_id: lead.id,
              content: `🤖 Lead qualificado pela IA (${aiResult.qualification_type === 'visita' ? 'quer visitar' : 'quer entregar docs'}) após ${attempts + 1} mensagem(ns). Transferido para ${transfer?.brokerName || 'fila'}. Resumo: ${aiResult.summary}`,
            });
          } catch {}

          qualified++;

        } else if (aiResult.message) {
          // ── Enviar mensagem ───────────────────────────────────────────
          const { data: sendResult } = await supabase.functions.invoke('send_whatsapp_message', {
            body: { botId: broker.bot_instance_id, phone: lead.phone, message: aiResult.message },
          });

          if (sendResult?.success) {
            const ts = new Date().toISOString();

            // Incrementa contador de tentativas
            await supabase.from('leads').update({
              ai_qualification_attempts: attempts + 1,
              last_broker_whatsapp_at:   ts,
              last_interaction_at:       ts,
            }).eq('id', lead.id);

            // Registra mensagem na conversa
            const convId = await ensureConversation(supabase, lead);
            if (convId) {
              try {
                await supabase.from('ia_messages').insert({
                  conversation_id: convId,
                  message_text:    aiResult.message,
                  direction:       'outgoing',
                  sender_type:     'ia',
                  created_at:      ts,
                });
              } catch {}
            }

            // Log de automação
            try {
              await supabase.from('automation_logs').insert({
                entity_type:     'qualificacao_ia',
                entity_id:       lead.id,
                status:          'success',
                message_sent:    aiResult.message,
                recipient_phone: lead.phone,
                executed_at:     ts,
              });
            } catch {}

            messaged++;
            console.log(`[qualificacao-ia] ✉️ ${lead.name} — tentativa ${attempts + 1}/${MAX_ATTEMPTS}`);
          } else {
            console.warn(`[qualificacao-ia] Falha ao enviar para ${lead.id}`);
          }
        }

      } catch (e: any) {
        const msg = `${lead.id} (${lead.name}): ${e.message}`;
        console.error(`[qualificacao-ia] Erro: ${msg}`);
        errors.push(msg);
      }

      // Pequeno delay entre leads para não sobrecarregar APIs
      await new Promise(r => setTimeout(r, 300));
    }

    console.log(`[agente-qualificacao-ia] done — qualified=${qualified} messaged=${messaged} transferred=${transferred}`);

    return new Response(JSON.stringify({ qualified, messaged, transferred, errors }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[agente-qualificacao-ia] fatal:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
