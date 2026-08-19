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
const MAX_FOLLOWUP_ATTEMPTS = 5;             // teto por lead na janela abaixo
const FOLLOWUP_ATTEMPT_WINDOW_DAYS = 30;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function updateLeadInteraction(supabase: any, leadId: string) {
  const ts = new Date().toISOString();
  await supabase
    .from('leads')
    .update({ last_interaction_at: ts, last_broker_whatsapp_at: ts })
    .eq('id', leadId);
}

async function hasRecentAutoFollowup(supabase: any, leadId: string, hours: number): Promise<boolean> {
  const since = new Date(Date.now() - hours * 3600000).toISOString();
  const { data } = await supabase
    .from('automation_logs')
    .select('id')
    .eq('entity_id', leadId)
    .eq('entity_type', 'followup')
    .gte('executed_at', since)
    .limit(1);
  // Conta TENTATIVA, nao so sucesso: com o envio quebrado, filtrar por 'success'
  // fazia a guarda nunca disparar e o lead era rediscado a cada rodada.
  return !!(data && data.length);
}

// Teto duro por lead. Sem isso, lead em loop acumulava centenas de disparos
// (medido 19/08: 917 tentativas em 7 dias concentradas em 5 leads).
async function followupAttempts(supabase: any, leadId: string): Promise<number> {
  const since = new Date(Date.now() - FOLLOWUP_ATTEMPT_WINDOW_DAYS * 86400000).toISOString();
  const { count } = await supabase
    .from('automation_logs')
    .select('id', { count: 'exact', head: true })
    .eq('entity_id', leadId)
    .eq('entity_type', 'followup')
    .gte('executed_at', since);
  return count || 0;
}

async function ensureConvWithTemplate(
  supabase: any, leadId: string, botId: string,
  leadName: string, leadPhone: string,
  templateId: string | null, templateKind: string | null,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('ia_conversations')
    .select('id, template_id, template_kind')
    .eq('lead_id', leadId)
    .eq('bot_instance_id', botId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    if (!existing.template_id && templateId) {
      await supabase.from('ia_conversations')
        .update({ template_id: templateId, template_kind: templateKind })
        .eq('id', existing.id);
    }
    return existing.id;
  }

  const { data: created } = await supabase.from('ia_conversations').insert({
    bot_instance_id: botId,
    lead_id: leadId,
    lead_name: leadName,
    lead_phone: leadPhone,
    status: 'active',
    sentiment: 'unknown',
    is_crm_lead: true,
    template_id: templateId,
    template_kind: templateKind,
  }).select('id').single();

  return created?.id || null;
}

function interpolate(template: string, name: string, brokerName: string): string {
  return template
    .replace(/\\n/g, '\n')
    .replace(/\{nome\}/gi, name?.split(' ')[0] || name || 'você')
    .replace(/\{broker\}/gi, brokerName || 'nossa equipe');
}

function getFallbackMessage(
  status: string, name: string, tag: string, hoursStale: number, brokerName: string,
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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let now: string = new Date().toISOString();
  const startTime = Date.now();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  );

  try {
    const nowMs = Date.now();
    console.log('[followup_scheduler] running at', now);

    const { data: cerebroCfg } = await supabase
      .from('system_settings').select('value').eq('key', 'cerebro_enabled').maybeSingle();
    const cerebroEnabled = cerebroCfg?.value === true || cerebroCfg?.value === 'true';
    if (cerebroEnabled) console.log('[followup_scheduler] Cérebro ativo — Blocos 1, 2, 4 e 5 desabilitados');

    // BLOCO 1: Leads Críticos
    const twoHoursAgo = new Date(nowMs - 2 * 3600000).toISOString();
    const { data: criticalLeads } = await supabase
      .from('leads')
      .select('id, name, phone, tag, broker_id, welcome_responded_at, last_broker_whatsapp_at, broker:profiles!broker_id(first_name, bot_instance_id, automation_settings)')
      .not('welcome_responded_at', 'is', null).lt('welcome_responded_at', twoHoursAgo)
      .neq('status', 'ABANDONED').neq('status', 'EXCLUDED').neq('status', 'CONCLUDED')
      .neq('status', 'VISIT_SCHEDULED').neq('status', 'DOCS_REQUESTED')
      .eq('pause_auto_messages', false).limit(30);

    let criticalProcessed = 0;
    for (const lead of cerebroEnabled ? [] : (criticalLeads || [])) {
      const broker = (lead as any).broker;
      if (broker?.automation_settings?.follow_up_enabled === false) continue;
      if (await followupAttempts(supabase, lead.id) >= MAX_FOLLOWUP_ATTEMPTS) continue;
      if (lead.last_broker_whatsapp_at && lead.welcome_responded_at &&
          new Date(lead.last_broker_whatsapp_at) > new Date(lead.welcome_responded_at)) continue;
      const fourHoursAgo = new Date(nowMs - 4 * 3600000).toISOString();
      const { data: recentNotif } = await supabase.from('internal_notifications').select('id')
        .eq('related_lead_id', lead.id).eq('type', 'LEAD_CRITICAL_IGNORED').gte('created_at', fourHoursAgo).maybeSingle();
      if (recentNotif) continue;
      if (lead.broker_id) {
        await supabase.from('internal_notifications').insert({
          to_id: lead.broker_id, type: 'LEAD_CRITICAL_IGNORED',
          title: '🚨 Lead aguardando resposta urgente!',
          message: `${lead.name} respondeu sua mensagem e está aguardando há mais de 2 horas. Atenda agora!`,
          related_lead_id: lead.id,
        });
      }
      if (broker?.bot_instance_id && lead.phone) {
        const brokerName = broker.first_name || 'nosso corretor';
        const { data: result } = await supabase.functions.invoke('send_whatsapp_message', {
          body: { botId: broker.bot_instance_id, phone: lead.phone, send_source: 'ai_followup',
            message: `Olá ${lead.name}! 😊\n\n${brokerName} está verificando sua solicitação e entra em contato em breve.\n\nAgradecemos sua paciência!` },
        });
        if (result?.success) { await updateLeadInteraction(supabase, lead.id); criticalProcessed++; }
      }
    }
    console.log(`[followup_scheduler] Bloco 1 — Críticos: ${criticalProcessed}`);

    // BLOCO 2: Leads Frios
    const fortyEightHoursAgo = new Date(nowMs - 48 * 3600000).toISOString();
    const threeDaysAgo = new Date(nowMs - 3 * 24 * 3600000).toISOString();
    const { data: coldLeads } = await supabase.from('leads')
      .select('id, name, phone, tag, broker_id, broker:profiles!broker_id(first_name, bot_instance_id, automation_settings)')
      .is('welcome_responded_at', null).not('last_broker_whatsapp_at', 'is', null)
      .lt('last_broker_whatsapp_at', fortyEightHoursAgo)
      .neq('status', 'ABANDONED').neq('status', 'EXCLUDED').neq('status', 'CONCLUDED')
      .neq('status', 'VISIT_SCHEDULED').neq('status', 'DOCS_REQUESTED')
      .eq('pause_auto_messages', false).limit(30);

    let coldProcessed = 0;
    for (const lead of cerebroEnabled ? [] : (coldLeads || [])) {
      const broker = (lead as any).broker;
      if (!broker?.bot_instance_id || !lead.phone) continue;
      if (broker?.automation_settings?.follow_up_enabled === false) continue;
      if (await followupAttempts(supabase, lead.id) >= MAX_FOLLOWUP_ATTEMPTS) continue;
      const { data: recentFollowup } = await supabase.from('internal_notifications').select('id')
        .eq('related_lead_id', lead.id).eq('type', 'COLD_FOLLOWUP_SENT').gte('created_at', threeDaysAgo).maybeSingle();
      if (recentFollowup) continue;
      const { data: result, error: sendErr } = await supabase.functions.invoke('send_whatsapp_message', {
        body: { botId: broker.bot_instance_id, phone: lead.phone, send_source: 'campaign',
          message: `Olá ${lead.name}! 👋\n\nPassamos aqui para saber se você ainda tem interesse no imóvel.\n\nEstamos à disposição! 😊` },
      });
      try { await supabase.from('automation_logs').insert({
        entity_type: 'followup', entity_id: lead.id,
        status: result?.success ? 'success' : 'failed',
        message_sent: `Olá ${lead.name}! 👋\n\nPassamos aqui para saber se você ainda tem interesse no imóvel.\n\nEstamos à disposição! 😊`,
        recipient_phone: lead.phone,
        error_message: result?.success ? null : (sendErr?.message || JSON.stringify(result?.result) || `HTTP ${result?.status}`),
      }); } catch {}
      if (result?.success) {
        if (lead.broker_id) {
          await supabase.from('internal_notifications').insert({
            to_id: lead.broker_id, type: 'COLD_FOLLOWUP_SENT',
            title: '🤖 Follow-up automático enviado',
            message: `Mensagem de reativação enviada para ${lead.name}.`,
            related_lead_id: lead.id,
          });
        }
        await updateLeadInteraction(supabase, lead.id); coldProcessed++;
      }
    }
    console.log(`[followup_scheduler] Bloco 2 — Frios: ${coldProcessed}`);

    // BLOCO 3: Cadências
    const TERMINAL_STATUSES = ['CONCLUDED', 'ABANDONED', 'EXCLUDED', 'VISIT_SCHEDULED', 'DOCS_REQUESTED'];
    const { data: executions } = await supabase.from('cadence_executions')
      .select('*, leads(*)').eq('status', 'active').lte('next_execution_at', now).limit(100);
    let cadenceProcessed = 0;
    const cadenceLeadsSentThisRun = new Set<string>();
    for (const exec of executions || []) {
      try {
        const lead = exec.leads;
        if (!lead) continue;
        if (TERMINAL_STATUSES.includes((lead.status || '').toUpperCase())) {
          await supabase.from('cadence_executions').update({
            status: 'completed', stopped_reason: `lead_status_${lead.status}`,
            completed_at: new Date().toISOString(),
          }).eq('id', exec.id);
          continue;
        }
        if (cadenceLeadsSentThisRun.has(lead.id)) continue;
        const { data: broker } = await supabase.from('profiles').select('*').eq('id', lead.broker_id).maybeSingle();
        if (!broker || !broker.bot_instance_id) continue;
        if ((broker as any)?.automation_settings?.follow_up_enabled === false) continue;
        const { data: bot } = await supabase.from('bot_instances').select('*').eq('id', broker.bot_instance_id).maybeSingle();
        if (!bot) continue;
        const stepNumber = (exec.current_step || 0) + 1;
        const { data: stepData } = await supabase.from('cadence_steps').select('id, content')
          .eq('cadence_id', exec.cadence_id).eq('step_number', stepNumber).eq('media_type', 'text').maybeSingle();
        const brokerName = broker.first_name || 'nossa equipe';
        const rawMessage = stepData?.content || exec.message || getFallbackMessage(lead.status, lead.name, lead.tag, 0, brokerName);
        const message = interpolate(rawMessage, lead.name, brokerName);
        const conversationId = await ensureConvWithTemplate(
          supabase, lead.id, bot.id, lead.name, lead.phone,
          stepData?.id || null, stepData?.id ? 'cadence_step' : null,
        );
        const { error: sendError } = await supabase.functions.invoke('send_whatsapp_message', {
          body: { botId: bot.id, phone: lead.phone, message, conversationId,
            instanceName: bot.instance_name, send_source: 'ai_followup' },
        });
        if (!sendError && stepData?.id) {
          await supabase.rpc('track_template_sent', { p_template_id: stepData.id, p_kind: 'cadence_step' }).then(() => {}, () => {});
        }
        if (sendError) continue;
        cadenceProcessed++;
        cadenceLeadsSentThisRun.add(lead.id);
        const nextDate = new Date(); nextDate.setDate(nextDate.getDate() + 1);
        await supabase.from('cadence_executions').update({
          current_step: (exec.current_step || 0) + 1, next_execution_at: nextDate.toISOString(),
        }).eq('id', exec.id);
        await updateLeadInteraction(supabase, lead.id);
        await new Promise(r => setTimeout(r, 500));
      } catch (e: any) { console.error('[B3] cadence error', e.message); }
    }
    console.log(`[followup_scheduler] Bloco 3 — Cadências: ${cadenceProcessed}`);

    // BLOCO 4: Follow-up Geral — só leads frios ou sem temperatura
    const thresholdAgo = new Date(nowMs - STALE_THRESHOLD_HOURS * 3600000).toISOString();
    const { data: welcomeTemplates } = await supabase.from('welcome_templates').select('id, message, name').eq('is_active', true);
    const { data: cadenceTemplates } = await supabase.from('cadence_templates').select('id, name, cadence_steps(*)').eq('is_active', true);
    const activeWelcome = welcomeTemplates || [];
    const cadenceTextSteps = (cadenceTemplates || []).flatMap((c: any) =>
      (c.cadence_steps || []).filter((s: any) => s.media_type === 'text' && s.content));

    const { data: staleWithInteraction } = await supabase.from('leads')
      .select('id, name, phone, status, tag, broker_id, last_interaction_at, created_at, welcome_responded_at, last_broker_whatsapp_at, last_lead_response_at, broker:profiles!broker_id(first_name, bot_instance_id, automation_settings)')
      .in('status', ['NEW', 'IN_PROGRESS'])
      .lt('last_interaction_at', thresholdAgo)
      .not('broker_id', 'is', null)
      .eq('pause_auto_messages', false)
      .is('ai_qualification_queue_id', null)
      .or('lead_temperature.is.null,lead_temperature.eq.frio')
      .limit(30);

    const { data: staleWithoutInteraction } = await supabase.from('leads')
      .select('id, name, phone, status, tag, broker_id, last_interaction_at, created_at, welcome_responded_at, last_broker_whatsapp_at, last_lead_response_at, broker:profiles!broker_id(first_name, bot_instance_id, automation_settings)')
      .in('status', ['NEW', 'IN_PROGRESS'])
      .is('last_interaction_at', null)
      .lt('created_at', thresholdAgo)
      .not('broker_id', 'is', null)
      .eq('pause_auto_messages', false)
      .is('ai_qualification_queue_id', null)
      .or('lead_temperature.is.null,lead_temperature.eq.frio')
      .limit(20);

    const seenIds = new Set<string>();
    const staleLeads = [...(staleWithInteraction || []), ...(staleWithoutInteraction || [])].filter(l => {
      if (seenIds.has(l.id)) return false;
      seenIds.add(l.id); return true;
    });
    console.log(`[B4] ${staleLeads.length} leads parados (frios ou s/ temperatura) encontrados`);

    let staleProcessed = 0;
    for (const lead of cerebroEnabled ? [] : staleLeads) {
      const broker = (lead as any).broker;
      if (!broker?.bot_instance_id || !lead.phone) continue;
      if (broker?.automation_settings?.follow_up_enabled === false) continue;
      if (await followupAttempts(supabase, lead.id) >= MAX_FOLLOWUP_ATTEMPTS) continue;
      const alreadySent = await hasRecentAutoFollowup(supabase, lead.id, MIN_FOLLOWUP_INTERVAL_HOURS);
      if (alreadySent) continue;
      if (lead.last_broker_whatsapp_at) {
        const brokerSentMs = new Date(lead.last_broker_whatsapp_at).getTime();
        if (nowMs - brokerSentMs < 6 * 3600000) continue;
      }
      if (lead.last_lead_response_at) {
        const leadRepliedMs = new Date(lead.last_lead_response_at).getTime();
        if (nowMs - leadRepliedMs < 2 * 3600000) continue;
      }
      const hoursStale = (nowMs - new Date(lead.last_interaction_at || lead.created_at).getTime()) / 3600000;
      const brokerName = broker.first_name || 'nossa equipe';
      let message: string;
      let chosenTemplateId: string | null = null;
      let chosenTemplateKind: string | null = null;
      const hadConversation = !!lead.welcome_responded_at;
      if (!hadConversation && activeWelcome.length > 0) {
        const tpl = activeWelcome[Math.floor(Math.random() * activeWelcome.length)];
        message = interpolate(tpl.message, lead.name, brokerName);
        chosenTemplateId = tpl.id; chosenTemplateKind = 'welcome';
      } else if (hadConversation && cadenceTextSteps.length > 0) {
        const step = cadenceTextSteps[Math.floor(Math.random() * cadenceTextSteps.length)];
        message = interpolate(step.content, lead.name, brokerName);
        chosenTemplateId = step.id; chosenTemplateKind = 'cadence_step';
      } else {
        message = getFallbackMessage(lead.status, lead.name, lead.tag, hoursStale, brokerName);
      }
      const conversationId = await ensureConvWithTemplate(
        supabase, lead.id, broker.bot_instance_id, lead.name, lead.phone,
        chosenTemplateId, chosenTemplateKind,
      );
      const { data: result, error: sendErr } = await supabase.functions.invoke('send_whatsapp_message', {
        body: { botId: broker.bot_instance_id, phone: lead.phone, message, conversationId, send_source: 'campaign' },
      });
      if (result?.success && chosenTemplateId && chosenTemplateKind) {
        await supabase.rpc('track_template_sent', { p_template_id: chosenTemplateId, p_kind: chosenTemplateKind }).then(() => {}, () => {});
      }
      try { await supabase.from('automation_logs').insert({
        entity_type: 'followup', entity_id: lead.id,
        status: result?.success ? 'success' : 'failed',
        message_sent: message, recipient_phone: lead.phone,
        error_message: result?.success ? null : (sendErr?.message || JSON.stringify(result?.result) || `HTTP ${result?.status}`),
      }); } catch {}
      if (result?.success) {
        await updateLeadInteraction(supabase, lead.id);
        if (lead.broker_id) {
          await supabase.from('internal_notifications').insert({
            to_id: lead.broker_id, type: 'AUTO_FOLLOWUP_SENT',
            title: '🤖 Follow-up automático enviado',
            message: `Mensagem enviada para ${lead.name} (${Math.floor(hoursStale)}h sem interação). Fique atento à resposta!`,
            related_lead_id: lead.id,
          });
        }
        staleProcessed++;
      }
      await new Promise(r => setTimeout(r, 300));
    }
    console.log(`[followup_scheduler] Bloco 4 — Ativos parados: ${staleProcessed}`);

    // BLOCO 5: AI Sentinela
    let sentinelaProcessed = 0;
    if (!cerebroEnabled) {
      try {
        const { data: sr } = await supabase.functions.invoke('ai-sentinela', { body: {} });
        sentinelaProcessed = sr?.processed ?? 0;
      } catch (e: any) { console.error('[followup_scheduler] Bloco 5 error:', e.message); }
    }

    // BLOCO 6: Cérebro Central
    let cerebroProcessed = 0;
    if (cerebroEnabled) {
      try {
        const { data: cr } = await supabase.functions.invoke('cerebro-orquestrador', { body: {} });
        cerebroProcessed = cr?.processed ?? 0;
      } catch (e: any) { console.error('[followup_scheduler] Bloco 6 error:', e.message); }
    }

    // BLOCO 14: AI Coach
    let coachProcessed = 0;
    try {
      const { data: coachR } = await supabase.functions.invoke('ai_coach_processor', { body: {} });
      coachProcessed = coachR?.processed ?? 0;
    } catch (e: any) { console.error('[followup_scheduler] Bloco 14 error:', e.message); }

    // BLOCO 6.5: Limpeza de logs
    try {
      const sevenDaysAgo = new Date(nowMs - 7 * 24 * 3600000).toISOString();
      const thirtyDaysAgo = new Date(nowMs - 30 * 24 * 3600000).toISOString();
      const { data: oldWebhooks } = await supabase.from('webhook_logs').select('id').lt('created_at', sevenDaysAgo).limit(3000);
      if (oldWebhooks && oldWebhooks.length > 0) {
        await supabase.from('webhook_logs').delete().in('id', oldWebhooks.map((r: any) => r.id));
      }
      const { data: oldAutoLogs } = await supabase.from('automation_logs').select('id').lt('created_at', thirtyDaysAgo).limit(1000);
      if (oldAutoLogs && oldAutoLogs.length > 0) {
        await supabase.from('automation_logs').delete().in('id', oldAutoLogs.map((r: any) => r.id));
      }
    } catch (e: any) { console.error('[followup_scheduler] Bloco 6.5 error:', e.message); }

    // BLOCO 7: Bot Health
    let botHealthChecked = 0, botHealthUpdated = 0;
    try {
      const { data: bh } = await supabase.functions.invoke('check-bot-health', { body: {} });
      botHealthChecked = bh?.checked ?? 0; botHealthUpdated = bh?.updated ?? 0;
    } catch (e: any) { console.error('[followup_scheduler] Bloco 7 error:', e.message); }

    // BLOCO 8: Guardian
    let guardianAlerts = 0, guardianFixed = 0;
    try {
      const { data: gr } = await supabase.functions.invoke('sistema-guardian', { body: {} });
      guardianAlerts = gr?.alerts ?? 0; guardianFixed = gr?.auto_fixed ?? 0;
    } catch (e: any) { console.error('[followup_scheduler] Bloco 8 error:', e.message); }

    // BLOCO 8b: Notify Disconnected Managers
    try { await supabase.functions.invoke('notify-disconnected-managers', { body: {} }); }
    catch (e: any) { console.error('[followup_scheduler] Bloco 8b error:', e.message); }

    // BLOCO 8c: Announcement Reminder
    try { await supabase.functions.invoke('announcement-reminder', { body: {} }); }
    catch (e: any) { console.error('[followup_scheduler] Bloco 8c error:', e.message); }

    // BLOCO 9: Redistribuição — DESLIGADO
    const redistribuicaoCount = 0;

    // BLOCO 10: Relatório
    let relatorioSent = 0;
    try {
      const { data: relr } = await supabase.functions.invoke('agente-relatorio-diario', { body: {} });
      relatorioSent = relr?.sent ?? 0;
    } catch (e: any) { console.error('[followup_scheduler] Bloco 10 error:', e.message); }

    // BLOCO 11-17 outros agentes
    try { await supabase.functions.invoke('agente-recuperacao-abandonados', { body: {} }); } catch (e: any) { console.error('[B11]', e.message); }
    try { await supabase.functions.invoke('agente-anti-sobrecarga', { body: {} }); } catch (e: any) { console.error('[B12]', e.message); }
    try { await supabase.functions.invoke('agente-scoring', { body: {} }); } catch (e: any) { console.error('[B13]', e.message); }
    try { await supabase.functions.invoke('agente-prospecção-ativa', { body: {} }); } catch (e: any) { console.error('[B14p]', e.message); }
    try { await supabase.functions.invoke('agente-visitas', { body: {} }); } catch (e: any) { console.error('[B15]', e.message); }
    try { await supabase.functions.invoke('agente-documentacao', { body: {} }); } catch (e: any) { console.error('[B16]', e.message); }
    try { await supabase.functions.invoke('agente-qualificacao-ia', { body: {} }); } catch (e: any) { console.error('[B17]', e.message); }

    const total = criticalProcessed + coldProcessed + cadenceProcessed + staleProcessed + sentinelaProcessed + cerebroProcessed;
    const durationMs = Date.now() - startTime;

    try {
      await supabase.from('scheduler_runs').insert({
        ran_at: now, status: 'success',
        critical: criticalProcessed, cold: coldProcessed, cadence: cadenceProcessed,
        stale: staleProcessed, sentinela: sentinelaProcessed, cerebro: cerebroProcessed,
        total, duration_ms: durationMs,
      });
    } catch (_) {}

    return new Response(JSON.stringify({
      critical: criticalProcessed, cold: coldProcessed, cadence: cadenceProcessed,
      stale: staleProcessed, sentinela: sentinelaProcessed, cerebro: cerebroProcessed,
      cerebro_enabled: cerebroEnabled,
      bot_health: { checked: botHealthChecked, updated: botHealthUpdated },
      redistribuicao: redistribuicaoCount, relatorio: relatorioSent, total,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('[followup_scheduler] error', error.message);
    try {
      await supabase.from('scheduler_runs').insert({
        ran_at: now, status: 'error', error_message: error.message, duration_ms: Date.now() - startTime,
      });
    } catch (_) {}
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
