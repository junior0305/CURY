import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Configurações ─────────────────────────────────────────────────────────────
// Threshold de horas sem interação para disparar follow-up automático (Block 4)
const STALE_THRESHOLD_HOURS = 24;
// Intervalo mínimo entre follow-ups automáticos para o mesmo lead
const MIN_FOLLOWUP_INTERVAL_HOURS = 24;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Atualiza last_interaction_at E last_broker_whatsapp_at do lead.
 * Chamado sempre que o sistema envia uma mensagem com sucesso,
 * garantindo que o contador "horas sem contato" seja resetado.
 */
async function updateLeadInteraction(supabase: any, leadId: string) {
  const ts = new Date().toISOString();
  await supabase
    .from('leads')
    .update({
      last_interaction_at: ts,
      last_broker_whatsapp_at: ts,
    })
    .eq('id', leadId);
}

/**
 * Verifica se já foi enviado follow-up automático para esse lead
 * nas últimas N horas (anti-spam).
 */
async function hasRecentAutoFollowup(supabase: any, leadId: string, hours: number): Promise<boolean> {
  const since = new Date(Date.now() - hours * 3600000).toISOString();
  const { data } = await supabase
    .from('automation_logs')
    .select('id')
    .eq('entity_id', leadId)
    .eq('entity_type', 'followup')
    .eq('status', 'success')
    .gte('created_at', since)
    .maybeSingle();
  return !!data;
}

/**
 * Retorna a mensagem de follow-up adequada ao status e tempo parado do lead.
 * Sem custo de IA — templates por contexto.
 */
function getFollowupMessage(
  status: string,
  name: string,
  tag: string,
  hoursStale: number,
  brokerName: string,
): string {
  const firstName = name?.split(' ')[0] || name || 'você';
  const product = tag || 'nosso imóvel';
  const broker = brokerName || 'nossa equipe';

  switch (status) {
    case 'NEW':
      if (hoursStale < 4) {
        return `Olá ${firstName}! ⚡ Vi seu interesse em ${product} agora mesmo. Estou separando as informações. Prefere que eu mande um vídeo rápido ou as plantas? 😊`;
      }
      return `${firstName}, ainda não conseguimos conversar sobre ${product}. Tenho condições especiais disponíveis hoje. Consegue dar uma olhada? 👋`;

    case 'IN_PROGRESS':
      if (hoursStale > 72) {
        return `${firstName}, não quero que você perca a oportunidade de ${product}. Ainda faz sentido conversarmos? Responde 1 para Sim ou 2 para mais tarde. 😊`;
      }
      return `Olá ${firstName}! 😊 ${broker} aqui. Passando para saber se surgiu alguma dúvida sobre ${product}. Estou à disposição!`;

    case 'DOCS_REQUESTED':
      return `${firstName}, precisamos dos seus documentos para garantir sua proposta em ${product}. Uma foto legível já basta! Consegue enviar hoje? 📄`;

    default:
      return `Olá ${firstName}! 😊 ${broker} aqui. Como posso te ajudar com ${product}?`;
  }
}

// ── Handler principal ─────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    );
    const now = new Date().toISOString();
    const nowMs = Date.now();
    console.log('[followup_scheduler] running at', now);

    // ── BLOCO 1: Leads Críticos ───────────────────────────────────────────────
    // Lead respondeu boas-vindas, corretor ignorou por mais de 2h
    const twoHoursAgo = new Date(nowMs - 2 * 3600000).toISOString();

    const { data: criticalLeads } = await supabase
      .from('leads')
      .select('id, name, phone, tag, broker_id, welcome_responded_at, last_broker_whatsapp_at, broker:profiles!broker_id(first_name, bot_instance_id)')
      .not('welcome_responded_at', 'is', null)
      .lt('welcome_responded_at', twoHoursAgo)
      .neq('status', 'ABANDONED')
      .neq('status', 'EXCLUDED')
      .neq('status', 'CONCLUDED')
      .limit(30);

    let criticalProcessed = 0;
    for (const lead of criticalLeads || []) {
      const broker = (lead as any).broker;

      // Ignorar se o corretor já respondeu depois que o lead mandou mensagem
      if (
        lead.last_broker_whatsapp_at && lead.welcome_responded_at &&
        new Date(lead.last_broker_whatsapp_at) > new Date(lead.welcome_responded_at)
      ) continue;

      // Anti-spam: checar notificação nas últimas 4h
      const fourHoursAgo = new Date(nowMs - 4 * 3600000).toISOString();
      const { data: recentNotif } = await supabase
        .from('internal_notifications')
        .select('id')
        .eq('related_lead_id', lead.id)
        .eq('type', 'LEAD_CRITICAL_IGNORED')
        .gte('created_at', fourHoursAgo)
        .maybeSingle();
      if (recentNotif) continue;

      // Notifica corretor
      if (lead.broker_id) {
        await supabase.from('internal_notifications').insert({
          to_id: lead.broker_id,
          type: 'LEAD_CRITICAL_IGNORED',
          title: '🚨 Lead aguardando resposta urgente!',
          message: `${lead.name} respondeu sua mensagem e está aguardando há mais de 2 horas. Atenda agora!`,
          related_lead_id: lead.id,
        });
      }

      // Envia mensagem de aquecimento pelo bot do corretor
      if (broker?.bot_instance_id && lead.phone) {
        const brokerName = broker.first_name || 'nosso corretor';
        const { data: result } = await supabase.functions.invoke('send-whatsapp', {
          body: {
            instance_id: broker.bot_instance_id,
            phone: lead.phone,
            message: `Olá ${lead.name}! 😊\n\n${brokerName} está verificando sua solicitação e entra em contato em breve.\n\nAgradecemos sua paciência!`,
            lead_id: lead.id,
            type: 'followup',
          },
        });

        if (result?.success !== false) {
          // ✅ Reseta contador "horas sem contato"
          await updateLeadInteraction(supabase, lead.id);
          criticalProcessed++;
          console.log(`[B1] Crítico processado: ${lead.id} (${lead.name})`);
        }
      }
    }
    console.log(`[followup_scheduler] Bloco 1 — Críticos: ${criticalProcessed}`);

    // ── BLOCO 2: Leads Frios ──────────────────────────────────────────────────
    // Nunca responderam boas-vindas, último contato há mais de 48h
    const fortyEightHoursAgo = new Date(nowMs - 48 * 3600000).toISOString();
    const threeDaysAgo = new Date(nowMs - 3 * 24 * 3600000).toISOString();

    const { data: coldLeads } = await supabase
      .from('leads')
      .select('id, name, phone, tag, broker_id, broker:profiles!broker_id(first_name, bot_instance_id)')
      .is('welcome_responded_at', null)
      .not('last_broker_whatsapp_at', 'is', null)
      .lt('last_broker_whatsapp_at', fortyEightHoursAgo)
      .neq('status', 'ABANDONED')
      .neq('status', 'EXCLUDED')
      .neq('status', 'CONCLUDED')
      .limit(30);

    let coldProcessed = 0;
    for (const lead of coldLeads || []) {
      const broker = (lead as any).broker;
      if (!broker?.bot_instance_id || !lead.phone) continue;

      // Anti-spam: máximo 1 reativação a cada 3 dias
      const { data: recentFollowup } = await supabase
        .from('internal_notifications')
        .select('id')
        .eq('related_lead_id', lead.id)
        .eq('type', 'COLD_FOLLOWUP_SENT')
        .gte('created_at', threeDaysAgo)
        .maybeSingle();
      if (recentFollowup) continue;

      const { data: result } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          instance_id: broker.bot_instance_id,
          phone: lead.phone,
          message: `Olá ${lead.name}! 👋\n\nPassamos aqui para saber se você ainda tem interesse no imóvel.\n\nEstamos à disposição! 😊`,
          lead_id: lead.id,
          type: 'followup',
        },
      });

      if (result?.success) {
        if (lead.broker_id) {
          await supabase.from('internal_notifications').insert({
            to_id: lead.broker_id,
            type: 'COLD_FOLLOWUP_SENT',
            title: '🤖 Follow-up automático enviado',
            message: `Mensagem de reativação enviada para ${lead.name}.`,
            related_lead_id: lead.id,
          });
        }

        // ✅ Reseta contador "horas sem contato"
        await updateLeadInteraction(supabase, lead.id);
        coldProcessed++;
        console.log(`[B2] Cold follow-up: ${lead.id} (${lead.name})`);
      }
    }
    console.log(`[followup_scheduler] Bloco 2 — Frios: ${coldProcessed}`);

    // ── BLOCO 3: Cadências existentes ─────────────────────────────────────────
    const { data: executions } = await supabase
      .from('cadence_executions')
      .select('*, leads(*)')
      .eq('status', 'active')
      .lte('next_execution_at', now)
      .limit(100);

    let cadenceProcessed = 0;
    for (const exec of executions || []) {
      try {
        const lead = exec.leads;
        if (!lead) continue;

        const { data: broker } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', lead.broker_id)
          .maybeSingle();
        if (!broker || !broker.bot_instance_id) continue;

        const { data: bot } = await supabase
          .from('bot_instances')
          .select('*')
          .eq('id', broker.bot_instance_id)
          .maybeSingle();
        if (!bot) continue;

        const message = exec.message || `Olá ${lead.name || ''}, tudo bem? Só um lembrete. 😊`;

        const { error: sendError } = await supabase.functions.invoke('send_whatsapp_message', {
          body: {
            botId: bot.id,
            phone: lead.phone,
            message,
            conversationId: null,
            instanceName: bot.instance_name,
          },
        });

        if (sendError) {
          console.error('[B3] send error', sendError.message);
          continue;
        }

        cadenceProcessed++;
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + 1);

        await supabase
          .from('cadence_executions')
          .update({
            current_step: (exec.current_step || 0) + 1,
            next_execution_at: nextDate.toISOString(),
          })
          .eq('id', exec.id);

        // ✅ Reseta contador "horas sem contato" nas cadências também
        await updateLeadInteraction(supabase, lead.id);

        await new Promise(r => setTimeout(r, 500));
      } catch (e: any) {
        console.error('[B3] cadence error', e.message);
      }
    }
    console.log(`[followup_scheduler] Bloco 3 — Cadências: ${cadenceProcessed}`);

    // ── BLOCO 4: Follow-up Geral ──────────────────────────────────────────────
    // Todos os leads ativos (NEW / IN_PROGRESS / DOCS_REQUESTED) sem interação
    // há mais de STALE_THRESHOLD_HOURS horas — independente de welcome/resposta.
    const thresholdAgo = new Date(nowMs - STALE_THRESHOLD_HOURS * 3600000).toISOString();

    // Busca leads com last_interaction_at antigo
    const { data: staleWithInteraction } = await supabase
      .from('leads')
      .select('id, name, phone, status, tag, broker_id, last_interaction_at, created_at, broker:profiles!broker_id(first_name, bot_instance_id)')
      .in('status', ['NEW', 'IN_PROGRESS', 'DOCS_REQUESTED'])
      .lt('last_interaction_at', thresholdAgo)
      .not('broker_id', 'is', null)
      .limit(30);

    // Busca leads sem last_interaction_at (nunca registrado) e created há mais de X horas
    const { data: staleWithoutInteraction } = await supabase
      .from('leads')
      .select('id, name, phone, status, tag, broker_id, last_interaction_at, created_at, broker:profiles!broker_id(first_name, bot_instance_id)')
      .in('status', ['NEW', 'IN_PROGRESS', 'DOCS_REQUESTED'])
      .is('last_interaction_at', null)
      .lt('created_at', thresholdAgo)
      .not('broker_id', 'is', null)
      .limit(20);

    // Unifica e deduplica
    const seenIds = new Set<string>();
    const staleLeads = [
      ...(staleWithInteraction || []),
      ...(staleWithoutInteraction || []),
    ].filter(l => {
      if (seenIds.has(l.id)) return false;
      seenIds.add(l.id);
      return true;
    });

    let staleProcessed = 0;
    for (const lead of staleLeads) {
      const broker = (lead as any).broker;
      if (!broker?.bot_instance_id || !lead.phone) continue;

      // Anti-spam: máximo 1 follow-up automático a cada MIN_FOLLOWUP_INTERVAL_HOURS
      const alreadySent = await hasRecentAutoFollowup(supabase, lead.id, MIN_FOLLOWUP_INTERVAL_HOURS);
      if (alreadySent) continue;

      const hoursStale = (nowMs - new Date(lead.last_interaction_at || lead.created_at).getTime()) / 3600000;
      const brokerName = broker.first_name || 'nossa equipe';
      const message = getFollowupMessage(lead.status, lead.name, lead.tag, hoursStale, brokerName);

      const { data: result } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          instance_id: broker.bot_instance_id,
          phone: lead.phone,
          message,
          lead_id: lead.id,
          type: 'followup',
        },
      });

      if (result?.success) {
        // ✅ Reseta contador "horas sem contato"
        await updateLeadInteraction(supabase, lead.id);

        // Notifica corretor para acompanhar a resposta
        if (lead.broker_id) {
          await supabase.from('internal_notifications').insert({
            to_id: lead.broker_id,
            type: 'AUTO_FOLLOWUP_SENT',
            title: '🤖 Follow-up automático enviado',
            message: `Mensagem enviada para ${lead.name} (${Math.floor(hoursStale)}h sem interação). Fique atento à resposta!`,
            related_lead_id: lead.id,
          });
        }

        staleProcessed++;
        console.log(`[B4] Stale follow-up: ${lead.id} (${lead.name}) — ${Math.floor(hoursStale)}h sem interação, status: ${lead.status}`);
      }

      // Throttle para não sobrecarregar a API de WhatsApp
      await new Promise(r => setTimeout(r, 300));
    }
    console.log(`[followup_scheduler] Bloco 4 — Ativos parados: ${staleProcessed}`);

    return new Response(
      JSON.stringify({
        critical: criticalProcessed,
        cold: coldProcessed,
        cadence: cadenceProcessed,
        stale: staleProcessed,
        total: criticalProcessed + coldProcessed + cadenceProcessed + staleProcessed,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error: any) {
    console.error('[followup_scheduler] error', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
