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
    .gte('executed_at', since)
    .maybeSingle();
  return !!data;
}

/**
 * Interpola variáveis {nome} e {broker} no template.
 */
function interpolate(template: string, name: string, brokerName: string): string {
  return template
    .replace(/\\n/g, '\n')          // converte \n literal (digitado no admin) para quebra real
    .replace(/\{nome\}/gi, name?.split(' ')[0] || name || 'você')
    .replace(/\{broker\}/gi, brokerName || 'nossa equipe');
}

/**
 * Fallback: retorna mensagem hardcoded quando não há templates configurados.
 */
function getFallbackMessage(
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
    const startTime = nowMs;
    console.log('[followup_scheduler] running at', now);

    // ── Verifica se o Cérebro está ativo ──────────────────────────────────────
    const { data: cerebroCfg } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'cerebro_enabled')
      .maybeSingle();
    const cerebroEnabled = cerebroCfg?.value === true || cerebroCfg?.value === 'true';
    if (cerebroEnabled) {
      console.log('[followup_scheduler] Cérebro ativo — Blocos 1, 2, 4 e 5 desabilitados');
    }

    // ── BLOCO 1: Leads Críticos ───────────────────────────────────────────────
    // Lead respondeu boas-vindas, corretor ignorou por mais de 2h
    // (substituído pelo Cérebro quando cerebroEnabled = true)
    const twoHoursAgo = new Date(nowMs - 2 * 3600000).toISOString();

    const { data: criticalLeads } = await supabase
      .from('leads')
      .select('id, name, phone, tag, broker_id, welcome_responded_at, last_broker_whatsapp_at, broker:profiles!broker_id(first_name, bot_instance_id)')
      .not('welcome_responded_at', 'is', null)
      .lt('welcome_responded_at', twoHoursAgo)
      .neq('status', 'ABANDONED')
      .neq('status', 'EXCLUDED')
      .neq('status', 'CONCLUDED')
      .neq('status', 'VISIT_SCHEDULED')
      .neq('status', 'DOCS_REQUESTED')
      .limit(30);

    let criticalProcessed = 0;
    for (const lead of cerebroEnabled ? [] : (criticalLeads || [])) {
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
        const { data: result } = await supabase.functions.invoke('send_whatsapp_message', {
          body: {
            botId: broker.bot_instance_id,
            phone: lead.phone,
            send_source: 'ai_followup',
            message: `Olá ${lead.name}! 😊\n\n${brokerName} está verificando sua solicitação e entra em contato em breve.\n\nAgradecemos sua paciência!`,
          },
        });

        if (result?.success) {
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
      .neq('status', 'VISIT_SCHEDULED')
      .neq('status', 'DOCS_REQUESTED')
      .limit(30);

    console.log(`[B2] ${coldLeads?.length || 0} leads frios encontrados`);
    let coldProcessed = 0;
    for (const lead of cerebroEnabled ? [] : (coldLeads || [])) {
      const broker = (lead as any).broker;
      if (!broker?.bot_instance_id || !lead.phone) {
        console.log(`[B2] SKIP ${lead.id} — bot=${broker?.bot_instance_id}, phone=${lead.phone}`);
        continue;
      }

      // Anti-spam: máximo 1 reativação a cada 3 dias
      const { data: recentFollowup } = await supabase
        .from('internal_notifications')
        .select('id')
        .eq('related_lead_id', lead.id)
        .eq('type', 'COLD_FOLLOWUP_SENT')
        .gte('created_at', threeDaysAgo)
        .maybeSingle();
      if (recentFollowup) { console.log(`[B2] ANTISPAM ${lead.id}`); continue; }

      const { data: result, error: sendErr } = await supabase.functions.invoke('send_whatsapp_message', {
        body: {
          botId: broker.bot_instance_id,
          phone: lead.phone,
          send_source: 'campaign',
          message: `Olá ${lead.name}! 👋\n\nPassamos aqui para saber se você ainda tem interesse no imóvel.\n\nEstamos à disposição! 😊`,
        },
      });
      console.log(`[B2] send ${lead.id} → success=${result?.success}, status=${result?.status}, err=${sendErr?.message}`);

      try { await supabase.from('automation_logs').insert({
        entity_type: 'followup',
        entity_id: lead.id,
        status: result?.success ? 'success' : 'failed',
        message_sent: `Olá ${lead.name}! 👋\n\nPassamos aqui para saber se você ainda tem interesse no imóvel.\n\nEstamos à disposição! 😊`,
        recipient_phone: lead.phone,
        error_message: result?.success ? null : (sendErr?.message || JSON.stringify(result?.result) || `HTTP ${result?.status}`),
      }); } catch {}

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
    const TERMINAL_STATUSES = ['CONCLUDED', 'ABANDONED', 'EXCLUDED', 'VISIT_SCHEDULED', 'DOCS_REQUESTED'];

    const { data: executions } = await supabase
      .from('cadence_executions')
      .select('*, leads(*)')
      .eq('status', 'active')
      .lte('next_execution_at', now)
      .limit(100);

    let cadenceProcessed = 0;
    const cadenceLeadsSentThisRun = new Set<string>(); // anti-spam: 1 mensagem por lead por execução
    for (const exec of executions || []) {
      try {
        const lead = exec.leads;
        if (!lead) continue;

        // ── Encerra cadência se lead foi vendido/abandonado ───────────────────
        if (TERMINAL_STATUSES.includes((lead.status || '').toUpperCase())) {
          await supabase.from('cadence_executions').update({
            status: 'completed',
            stopped_reason: `lead_status_${lead.status}`,
            completed_at: new Date().toISOString(),
          }).eq('id', exec.id);
          console.log(`[B3] Cadência encerrada — lead ${lead.id} status=${lead.status}`);
          continue;
        }

        // Anti-spam: no máximo 1 disparo por lead por execução do scheduler
        if (cadenceLeadsSentThisRun.has(lead.id)) {
          console.log(`[B3] Pulando ${lead.id} — já enviou nesta execução`);
          continue;
        }

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

        // ── Busca conteúdo real do passo atual no cadence_steps ───────────────
        const stepNumber = (exec.current_step || 0) + 1;
        const { data: stepData } = await supabase
          .from('cadence_steps')
          .select('content')
          .eq('cadence_id', exec.cadence_id)
          .eq('step_number', stepNumber)
          .eq('media_type', 'text')
          .maybeSingle();

        const brokerName = broker.first_name || 'nossa equipe';
        const rawMessage = stepData?.content || exec.message || getFallbackMessage(lead.status, lead.name, lead.tag, 0, brokerName);
        const message = interpolate(rawMessage, lead.name, brokerName);

        const { error: sendError } = await supabase.functions.invoke('send_whatsapp_message', {
          body: {
            botId: bot.id,
            phone: lead.phone,
            message,
            conversationId: null,
            instanceName: bot.instance_name,
            send_source: 'ai_followup',
          },
        });

        if (sendError) {
          console.error('[B3] send error', sendError.message);
          continue;
        }

        cadenceProcessed++;
        cadenceLeadsSentThisRun.add(lead.id);
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
    // Todos os leads ativos sem interação há mais de STALE_THRESHOLD_HOURS horas.
    // Usa os templates configurados no IaBuilder:
    //   - welcome_responded_at IS NULL  → lead nunca interagiu → welcome_template
    //   - welcome_responded_at NOT NULL → já houve conversa, esfriou → cadence_template (passo 1)
    // Fallback para mensagens hardcoded se não houver templates ativos.

    const thresholdAgo = new Date(nowMs - STALE_THRESHOLD_HOURS * 3600000).toISOString();

    // Carrega templates ativos uma única vez
    const { data: welcomeTemplates } = await supabase
      .from('welcome_templates')
      .select('id, message, name')
      .eq('is_active', true);

    const { data: cadenceTemplates } = await supabase
      .from('cadence_templates')
      .select('id, name, cadence_steps(*)')
      .eq('is_active', true);

    const activeWelcome = welcomeTemplates || [];
    // Agrupa todos os passos de texto de todas as cadências ativas
    const cadenceTextSteps = (cadenceTemplates || []).flatMap((c: any) =>
      (c.cadence_steps || []).filter((s: any) => s.media_type === 'text' && s.content)
    );

    console.log(`[B4] Templates disponíveis — welcome: ${activeWelcome.length}, cadence steps: ${cadenceTextSteps.length}`);

    // Busca leads com last_interaction_at antigo (excluindo DOCS_REQUESTED — lead em fase de documentação)
    // Exclui leads sob qualificação de agente IA (ai_qualification_queue_id NOT NULL)
    const { data: staleWithInteraction } = await supabase
      .from('leads')
      .select('id, name, phone, status, tag, broker_id, last_interaction_at, created_at, welcome_responded_at, last_broker_whatsapp_at, last_lead_response_at, broker:profiles!broker_id(first_name, bot_instance_id)')
      .in('status', ['NEW', 'IN_PROGRESS'])
      .lt('last_interaction_at', thresholdAgo)
      .not('broker_id', 'is', null)
      .is('ai_qualification_queue_id', null)
      .limit(30);

    // Busca leads sem last_interaction_at (nunca registrado) e criados há mais de X horas
    const { data: staleWithoutInteraction } = await supabase
      .from('leads')
      .select('id, name, phone, status, tag, broker_id, last_interaction_at, created_at, welcome_responded_at, last_broker_whatsapp_at, last_lead_response_at, broker:profiles!broker_id(first_name, bot_instance_id)')
      .in('status', ['NEW', 'IN_PROGRESS'])
      .is('last_interaction_at', null)
      .lt('created_at', thresholdAgo)
      .not('broker_id', 'is', null)
      .is('ai_qualification_queue_id', null)
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

    console.log(`[B4] ${staleLeads.length} leads parados encontrados`);
    let staleProcessed = 0;
    for (const lead of cerebroEnabled ? [] : staleLeads) {
      const broker = (lead as any).broker;
      if (!broker?.bot_instance_id || !lead.phone) {
        console.log(`[B4] SKIP ${lead.id} — bot=${broker?.bot_instance_id}, phone=${lead.phone}`);
        continue;
      }

      // Anti-spam: máximo 1 follow-up automático a cada MIN_FOLLOWUP_INTERVAL_HOURS
      const alreadySent = await hasRecentAutoFollowup(supabase, lead.id, MIN_FOLLOWUP_INTERVAL_HOURS);
      if (alreadySent) { console.log(`[B4] ANTISPAM ${lead.id}`); continue; }

      // ── Janelas de silêncio: não perturbar conversa ativa ─────────────────────
      // Corretor falou há menos de 6h → não enviar
      if (lead.last_broker_whatsapp_at) {
        const brokerSentMs = new Date(lead.last_broker_whatsapp_at).getTime();
        if (nowMs - brokerSentMs < 6 * 3600000) {
          console.log(`[B4] SILÊNCIO (corretor <6h) ${lead.id} (${lead.name})`);
          continue;
        }
      }

      // Lead respondeu há menos de 2h → não enviar
      if (lead.last_lead_response_at) {
        const leadRepliedMs = new Date(lead.last_lead_response_at).getTime();
        if (nowMs - leadRepliedMs < 2 * 3600000) {
          console.log(`[B4] SILÊNCIO (lead <2h) ${lead.id} (${lead.name})`);
          continue;
        }
      }

      const hoursStale = (nowMs - new Date(lead.last_interaction_at || lead.created_at).getTime()) / 3600000;
      const brokerName = broker.first_name || 'nossa equipe';

      // ── Escolha do template ──────────────────────────────────────────────────
      let message: string;
      let templateSource: string;

      const hadConversation = !!lead.welcome_responded_at;

      if (!hadConversation && activeWelcome.length > 0) {
        // Nunca interagiu → usa welcome_template aleatório
        const tpl = activeWelcome[Math.floor(Math.random() * activeWelcome.length)];
        message = interpolate(tpl.message, lead.name, brokerName);
        templateSource = `welcome_template: ${tpl.name}`;
      } else if (hadConversation && cadenceTextSteps.length > 0) {
        // Já conversou e esfriou → usa passo de cadência aleatório
        const step = cadenceTextSteps[Math.floor(Math.random() * cadenceTextSteps.length)];
        message = interpolate(step.content, lead.name, brokerName);
        templateSource = `cadence_step: ${step.id}`;
      } else {
        // Fallback: sem templates configurados → mensagem hardcoded por status/tempo
        message = getFallbackMessage(lead.status, lead.name, lead.tag, hoursStale, brokerName);
        templateSource = 'fallback_hardcoded';
      }

      const { data: result, error: sendErr } = await supabase.functions.invoke('send_whatsapp_message', {
        body: {
          botId: broker.bot_instance_id,
          phone: lead.phone,
          message,
          send_source: 'campaign',
        },
      });
      console.log(`[B4] send ${lead.id} → success=${result?.success}, status=${result?.status}, err=${sendErr?.message}`);

      try { await supabase.from('automation_logs').insert({
        entity_type: 'followup',
        entity_id: lead.id,
        status: result?.success ? 'success' : 'failed',
        message_sent: message,
        recipient_phone: lead.phone,
        error_message: result?.success ? null : (sendErr?.message || JSON.stringify(result?.result) || `HTTP ${result?.status}`),
      }); } catch {}

      if (result?.success) {
        // ✅ Reseta contador "horas sem contato"
        await updateLeadInteraction(supabase, lead.id);

        // Notifica corretor
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
        console.log(`[B4] ${lead.id} (${lead.name}) — ${Math.floor(hoursStale)}h, ${templateSource}, hadConversation: ${hadConversation}`);
      }

      await new Promise(r => setTimeout(r, 300));
    }
    console.log(`[followup_scheduler] Bloco 4 — Ativos parados: ${staleProcessed}`);

    // ── BLOCO 5: AI Sentinela ─────────────────────────────────────────────────
    // Desabilitado quando Cérebro está ativo (Cérebro gerencia o toque 'sentinela')
    let sentinelaProcessed = 0;
    if (!cerebroEnabled) {
      try {
        const { data: sr } = await supabase.functions.invoke('ai-sentinela', { body: {} });
        sentinelaProcessed = sr?.processed ?? 0;
        console.log(`[followup_scheduler] Bloco 5 — Sentinela: ${sentinelaProcessed}`);
      } catch (e: any) {
        console.error('[followup_scheduler] Bloco 5 error:', e.message);
      }
    }

    // ── BLOCO 6: Cérebro Central ──────────────────────────────────────────────
    let cerebroProcessed = 0;
    if (cerebroEnabled) {
      try {
        const { data: cr } = await supabase.functions.invoke('cerebro-orquestrador', { body: {} });
        cerebroProcessed = cr?.processed ?? 0;
        console.log(`[followup_scheduler] Bloco 6 — Cérebro: ${cerebroProcessed} (rescheduled=${cr?.rescheduled ?? 0} cancelled=${cr?.cancelled ?? 0})`);
      } catch (e: any) {
        console.error('[followup_scheduler] Bloco 6 error:', e.message);
      }
    }

    // ── BLOCO 14: AI Coach automático ────────────────────────────────────────
    // Processa até 10 corretores da fila a cada ciclo do scheduler
    let coachProcessed = 0;
    try {
      const { data: coachR } = await supabase.functions.invoke('ai_coach_processor', { body: {} });
      coachProcessed = coachR?.processed ?? 0;
      if (coachProcessed > 0 || (coachR?.errors ?? 0) > 0) {
        console.log(`[followup_scheduler] Bloco 14 — AI Coach: processed=${coachProcessed} errors=${coachR?.errors ?? 0}`);
      }
    } catch (e: any) {
      console.error('[followup_scheduler] Bloco 14 error:', e.message);
    }

    // ── BLOCO 6.5: Limpeza automática de logs antigos ────────────────────────
    // Mantém apenas 7 dias de webhook_logs e 30 dias de automation_logs
    // Roda em lotes pequenos para não travar o banco
    try {
      const sevenDaysAgo = new Date(nowMs - 7 * 24 * 3600000).toISOString();
      const thirtyDaysAgo = new Date(nowMs - 30 * 24 * 3600000).toISOString();

      // webhook_logs: deleta lote de 3000 mais antigos que 7 dias
      const { data: oldWebhooks } = await supabase
        .from('webhook_logs').select('id').lt('created_at', sevenDaysAgo).limit(3000);
      if (oldWebhooks && oldWebhooks.length > 0) {
        await supabase.from('webhook_logs').delete().in('id', oldWebhooks.map((r: any) => r.id));
        console.log(`[followup_scheduler] Bloco 6.5 — webhook_logs limpos: ${oldWebhooks.length}`);
      }

      // automation_logs: deleta lote de 1000 mais antigos que 30 dias
      const { data: oldAutoLogs } = await supabase
        .from('automation_logs').select('id').lt('created_at', thirtyDaysAgo).limit(1000);
      if (oldAutoLogs && oldAutoLogs.length > 0) {
        await supabase.from('automation_logs').delete().in('id', oldAutoLogs.map((r: any) => r.id));
        console.log(`[followup_scheduler] Bloco 6.5 — automation_logs limpos: ${oldAutoLogs.length}`);
      }
    } catch (e: any) {
      console.error('[followup_scheduler] Bloco 6.5 error:', e.message);
    }

    // ── BLOCO 7: Health check das instâncias WhatsApp ─────────────────────────
    let botHealthChecked = 0, botHealthUpdated = 0;
    try {
      const { data: bh } = await supabase.functions.invoke('check-bot-health', { body: {} });
      botHealthChecked = bh?.checked ?? 0;
      botHealthUpdated = bh?.updated ?? 0;
      console.log(`[followup_scheduler] Bloco 7 — BotHealth: checked=${botHealthChecked} updated=${botHealthUpdated} open=${bh?.open ?? 0} offline=${bh?.offline ?? 0}`);
    } catch (e: any) {
      console.error('[followup_scheduler] Bloco 7 error:', e.message);
    }

    // ── BLOCO 8: Sistema Guardian ─────────────────────────────────────────────
    let guardianAlerts = 0, guardianFixed = 0;
    try {
      const { data: gr } = await supabase.functions.invoke('sistema-guardian', { body: {} });
      guardianAlerts = gr?.alerts ?? 0;
      guardianFixed = gr?.auto_fixed ?? 0;
      console.log(`[followup_scheduler] Bloco 8 — Guardian: alerts=${guardianAlerts} auto_fixed=${guardianFixed}`);
    } catch (e: any) {
      console.error('[followup_scheduler] Bloco 8 error:', e.message);
    }

    // ── BLOCO 9: Redistribuição Automática ───────────────────────────────────
    let redistribuicaoCount = 0;
    try {
      const { data: rr } = await supabase.functions.invoke('agente-redistribuicao', { body: {} });
      redistribuicaoCount = rr?.redistributed ?? 0;
      console.log(`[followup_scheduler] Bloco 9 — Redistribuição: ${redistribuicaoCount}`);
    } catch (e: any) {
      console.error('[followup_scheduler] Bloco 9 error:', e.message);
    }

    // ── BLOCO 10: Relatório Diário ────────────────────────────────────────────
    let relatorioSent = 0;
    try {
      const { data: relr } = await supabase.functions.invoke('agente-relatorio-diario', { body: {} });
      relatorioSent = relr?.sent ?? 0;
      console.log(`[followup_scheduler] Bloco 10 — Relatório: sent=${relatorioSent}`);
    } catch (e: any) {
      console.error('[followup_scheduler] Bloco 10 error:', e.message);
    }

    // ── BLOCO 11: Recuperação de Abandonados ─────────────────────────────────
    let recuperacaoCount = 0;
    try {
      const { data: recr } = await supabase.functions.invoke('agente-recuperacao-abandonados', { body: {} });
      recuperacaoCount = recr?.reactivated ?? 0;
      console.log(`[followup_scheduler] Bloco 11 — Recuperação: ${recuperacaoCount}`);
    } catch (e: any) {
      console.error('[followup_scheduler] Bloco 11 error:', e.message);
    }

    // ── BLOCO 12: Anti-Sobrecarga ─────────────────────────────────────────────
    let sobrecargaPaused = 0, sobrecargaRestored = 0;
    try {
      const { data: sor } = await supabase.functions.invoke('agente-anti-sobrecarga', { body: {} });
      sobrecargaPaused = sor?.paused ?? 0;
      sobrecargaRestored = sor?.restored ?? 0;
      console.log(`[followup_scheduler] Bloco 12 — Anti-Sobrecarga: paused=${sobrecargaPaused} restored=${sobrecargaRestored}`);
    } catch (e: any) {
      console.error('[followup_scheduler] Bloco 12 error:', e.message);
    }

    // ── BLOCO 13: Scoring de Leads ────────────────────────────────────────────
    let scoringCount = 0;
    try {
      const { data: scr } = await supabase.functions.invoke('agente-scoring', { body: {} });
      scoringCount = scr?.scored ?? 0;
      console.log(`[followup_scheduler] Bloco 13 — Scoring: ${scoringCount}`);
    } catch (e: any) {
      console.error('[followup_scheduler] Bloco 13 error:', e.message);
    }

    // ── BLOCO 14: Prospecção Ativa ────────────────────────────────────────────
    let prospeccaoProcessed = 0;
    try {
      const { data: pr } = await supabase.functions.invoke('agente-prospec\u00e7\u00e3o-ativa', { body: {} });
      prospeccaoProcessed = pr?.processed ?? 0;
      if (prospeccaoProcessed > 0) {
        console.log(`[followup_scheduler] Bloco 14 — Prospecção: ${prospeccaoProcessed} leads enfileirados`);
      }
    } catch (e: any) {
      console.error('[followup_scheduler] Bloco 14 error:', e.message);
    }

    // ── BLOCO 15: Acompanhamento de Visitas ───────────────────────────────────
    let visitasTotal = 0;
    try {
      const { data: vr } = await supabase.functions.invoke('agente-visitas', { body: {} });
      visitasTotal = vr?.total ?? 0;
      if (visitasTotal > 0) {
        console.log(`[followup_scheduler] Bloco 15 — Visitas: f1=${vr?.fase1} f2=${vr?.fase2} f3=${vr?.fase3}`);
      }
    } catch (e: any) {
      console.error('[followup_scheduler] Bloco 15 error:', e.message);
    }

    // ── BLOCO 16: Acompanhamento de Documentação ─────────────────────────────
    let docsTotal = 0;
    try {
      const { data: dr } = await supabase.functions.invoke('agente-documentacao', { body: {} });
      docsTotal = dr?.total ?? 0;
      if (docsTotal > 0) {
        console.log(`[followup_scheduler] Bloco 16 — Docs: f1=${dr?.fase1} f2=${dr?.fase2} f3=${dr?.fase3}`);
      }
    } catch (e: any) {
      console.error('[followup_scheduler] Bloco 16 error:', e.message);
    }

    // ── BLOCO 17: Agentes de Qualificação IA (Judite / Josefa) ───────────────
    // Conduz conversas autônomas via WhatsApp para qualificar leads antes de
    // transferi-los ao round-robin humano da fila de origem.
    try {
      const { data: qaData } = await supabase.functions.invoke('agente-qualificacao-ia', { body: {} });
      if ((qaData?.processed ?? 0) > 0 || (qaData?.qualified ?? 0) > 0) {
        console.log(`[followup_scheduler] Bloco 17 — IA Qualif: processados=${qaData?.processed} qualificados=${qaData?.qualified}`);
      }
    } catch (e: any) {
      console.error('[followup_scheduler] Bloco 17 error:', e.message);
    }

    const total = criticalProcessed + coldProcessed + cadenceProcessed + staleProcessed + sentinelaProcessed + cerebroProcessed;
    const durationMs = Date.now() - startTime;

    // ── Registro de execução (monitoramento) ─────────────────────────────────
    try {
      await supabase.from('scheduler_runs').insert({
        ran_at: now,
        status: 'success',
        critical: criticalProcessed,
        cold: coldProcessed,
        cadence: cadenceProcessed,
        stale: staleProcessed,
        sentinela: sentinelaProcessed,
        cerebro: cerebroProcessed,
        total,
        duration_ms: durationMs,
      });
    } catch (_) { /* tabela pode não existir ainda */ }

    return new Response(
      JSON.stringify({
        critical: criticalProcessed,
        cold: coldProcessed,
        cadence: cadenceProcessed,
        stale: staleProcessed,
        sentinela: sentinelaProcessed,
        cerebro: cerebroProcessed,
        cerebro_enabled: cerebroEnabled,
        bot_health: { checked: botHealthChecked, updated: botHealthUpdated },
        redistribuicao: redistribuicaoCount,
        relatorio: relatorioSent,
        total,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error: any) {
    console.error('[followup_scheduler] error', error.message);
    try {
      await supabase.from('scheduler_runs').insert({
        ran_at: now,
        status: 'error',
        error_message: error.message,
        duration_ms: Date.now() - startTime,
      });
    } catch (_) { /* ignorar */ }
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
