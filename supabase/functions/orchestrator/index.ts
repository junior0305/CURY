import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Carrega templates de prospecção da biblioteca ─────────────────────────
// Prioridade:
//   1. campaign.template_ids (subset explícito)
//   2. campaign.template_category (filtro por categoria)
//   3. todos os templates com is_active = true
// Fallback: se a biblioteca estiver vazia/não retornar nada, usa
// campaign.message_templates (formato legado jsonb) para retrocompatibilidade.
async function loadTemplates(supabase: any, campaign: any) {
  let query = supabase
    .from('prospecting_message_templates')
    .select('id, name, message, category')
    .eq('is_active', true);

  if (campaign.template_ids && Array.isArray(campaign.template_ids) && campaign.template_ids.length > 0) {
    query = query.in('id', campaign.template_ids);
  } else if (campaign.template_category) {
    query = query.eq('category', campaign.template_category);
  }

  // Round-robin justo: o que foi usado há mais tempo (ou nunca usado) vem primeiro
  query = query.order('last_used_at', { ascending: true, nullsFirst: true });

  const { data: libraryTemplates, error } = await query;

  if (!error && libraryTemplates && libraryTemplates.length > 0) {
    console.log(`[orchestrator] 📚 Biblioteca: ${libraryTemplates.length} templates ativos`);
    return libraryTemplates.map((t: any) => ({ id: t.id, text: t.message, name: t.name }));
  }

  // Fallback legado: lê do campo jsonb antigo da campanha
  const legacy = campaign.message_templates || [];
  if (legacy.length > 0) {
    console.log(`[orchestrator] ⚠️ Biblioteca vazia — usando ${legacy.length} templates legados da campanha`);
    return legacy.map((t: any) => ({ id: null, text: t.text || t.message || '', name: null }));
  }

  return [];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { campaignId } = await req.json();
    console.log('[orchestrator] 🚀 Orchestrator iniciado para campanha:', campaignId);

    if (!campaignId) {
      return new Response(JSON.stringify({ error: 'Campaign ID required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: campaign, error: campaignError } = await supabaseClient.from('ia_campaigns').select('*').eq('id', campaignId).single();
    if (campaignError || !campaign) {
      return new Response(JSON.stringify({ error: 'Campaign not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('[orchestrator] ✅ Campanha:', campaign.name);

    const messageTemplates = await loadTemplates(supabaseClient, campaign);
    console.log('[orchestrator] 💬 Variações disponíveis:', messageTemplates.length);

    if (messageTemplates.length === 0) {
      return new Response(JSON.stringify({ error: 'No active templates available (library empty and no legacy fallback)' }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Determine bot pool: priority -> prospect_instance_ids (explicit list) -> bot_instance_id (single) -> pool is_prospecting
    let bots: any[] = [];
    if (campaign.prospect_instance_ids && Array.isArray(campaign.prospect_instance_ids) && campaign.prospect_instance_ids.length > 0) {
      const { data: listedBots } = await supabaseClient.from('bot_instances').select('*').in('id', campaign.prospect_instance_ids).in('status', ['active', 'open']).gte('health_score', 50);
      bots = listedBots || [];
      if (!bots || bots.length === 0) {
        return new Response(JSON.stringify({ error: 'No specified prospecting bots available' }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    } else if (campaign.bot_instance_id) {
      const { data: singleBot, error: singleErr } = await supabaseClient.from('bot_instances').select('*').eq('id', campaign.bot_instance_id).single();
      if (singleErr || !singleBot) {
        return new Response(JSON.stringify({ error: 'Specified bot instance not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      bots = [singleBot];
    } else {
      const { data: poolBots } = await supabaseClient.from('bot_instances').select('*').in('status', ['active', 'open']).gte('health_score', 50).eq('is_prospecting', true);
      bots = poolBots || [];
      if (!bots || bots.length === 0) {
        return new Response(JSON.stringify({ error: 'No prospecting bots available' }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const minDelaySec = (campaign.delay_between_messages_min && Number(campaign.delay_between_messages_min)) || 120;
    const maxDelaySec = (campaign.delay_between_messages_max && Number(campaign.delay_between_messages_max)) || 480;
    const minDelayMs = Math.max(0, Math.floor(minDelaySec) * 1000);
    const maxDelayMs = Math.max(minDelayMs, Math.floor(maxDelaySec) * 1000);

    console.log(`[orchestrator] ⏱️ Delay entre envios: ${minDelaySec}s - ${maxDelaySec}s`);

    let leads: any[] = [];
    const source = campaign.target_audience?.source || 'crm';

    if (source === 'upload') {
      const { data: uploadedLeads } = await supabaseClient.from('campaign_leads').select('*').eq('campaign_id', campaignId).eq('status', 'pending').limit(campaign.max_leads || 1000);
      leads = (uploadedLeads || []).map(l => ({ id: l.id, name: l.name, phone: l.phone, source: 'upload' }));
    } else {
      const targetAudience = campaign.target_audience || {};
      const daysWithoutContact = targetAudience.days_without_contact || 3;
      const leadStatus = targetAudience.lead_status || [];
      const NEVER_CONTACT = ['CONCLUDED', 'EXCLUDED', 'ABANDONED', 'VISIT_SCHEDULED'];
      let leadsQuery = supabaseClient.from('leads').select('id, name, phone, broker_id, status');
      if (leadStatus.length > 0) {
        const safeStatuses = leadStatus.filter((s: string) => !NEVER_CONTACT.includes(s));
        if (safeStatuses.length > 0) leadsQuery = leadsQuery.in('status', safeStatuses);
        else leadsQuery = leadsQuery.in('status', ['NEW', 'IN_PROGRESS', 'DOCS_REQUESTED']);
      } else {
        leadsQuery = leadsQuery.in('status', ['NEW', 'IN_PROGRESS', 'DOCS_REQUESTED']);
      }
      const cutoffDate = new Date(); cutoffDate.setDate(cutoffDate.getDate() - daysWithoutContact);
      leadsQuery = leadsQuery.or(`last_interaction_at.is.null,last_interaction_at.lt.${cutoffDate.toISOString()}`);
      if (campaign.max_leads) leadsQuery = leadsQuery.limit(campaign.max_leads);
      const { data: crmLeads } = await leadsQuery;
      leads = (crmLeads || []).map(l => ({ ...l, source: 'crm' }));
    }

    if (leads.length === 0) {
      return new Response(JSON.stringify({ message: 'No leads found', processed: 0, botsUsed: 0 }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const assignments: any[] = [];
    let botIndex = 0;
    let templateIndex = 0; // Round-robin entre templates da biblioteca

    for (const [i, lead] of leads.entries()) {
      let bot = bots[botIndex % bots.length];
      botIndex++;

      if (campaign.use_broker_chip && lead.broker_id) {
        const { data: brokerProfile } = await supabaseClient
          .from('profiles')
          .select('bot_instance_id')
          .eq('id', lead.broker_id)
          .maybeSingle();

        if (brokerProfile?.bot_instance_id) {
          const { data: brokerBot } = await supabaseClient
            .from('bot_instances')
            .select('*')
            .eq('id', brokerProfile.bot_instance_id)
            .in('status', ['active', 'open'])
            .maybeSingle();

          if (brokerBot) {
            bot = brokerBot;
            console.log(`[orchestrator] 🔑 use_broker_chip: lead ${lead.name} → chip do corretor ${brokerBot.name}`);
          }
        }
      }

      console.log(`[orchestrator] 🧾 Processando lead ${i + 1}/${leads.length} -> ${lead.name || lead.phone} via bot ${bot.name}`);

      // Round-robin nos templates (não random) — distribuição justa pra A/B test
      const selectedTemplate = messageTemplates[templateIndex % messageTemplates.length];
      templateIndex++;

      if (!selectedTemplate?.text) {
        console.warn(`[orchestrator] ⚠️ Template selecionado sem texto, pulando lead ${lead.name}`);
        continue;
      }

      const { data: conversation } = await supabaseClient.from('ia_conversations').insert({
        campaign_id: campaignId,
        bot_instance_id: bot.id,
        lead_id: lead.source === 'crm' ? lead.id : null,
        lead_name: lead.name,
        lead_phone: lead.phone,
        status: 'active',
        sentiment: 'unknown',
        template_id: selectedTemplate.id,  // pode ser null em modo legado
      }).select().single();
      if (!conversation) continue;

      const message = selectedTemplate.text
        .replace(/\{nome\}/gi, lead.name || 'amigo')
        .replace(/\{name\}/gi, lead.name || 'amigo');
      console.log(`[orchestrator] 📨 Enviando (template "${selectedTemplate.name || 'legacy'}"):`, message.substring(0, 80));

      await supabaseClient.functions.invoke('send_whatsapp_message', {
        body: { botId: bot.id, phone: lead.phone, message, conversationId: conversation.id, instanceName: bot.instance_name, send_source: 'campaign' }
      });

      // Incrementa métricas do template (só se vier da biblioteca)
      if (selectedTemplate.id) {
        await supabaseClient.rpc('increment_template_sent', { p_template_id: selectedTemplate.id })
          .then(() => {}, (err: any) => console.warn('[orchestrator] increment_template_sent falhou:', err?.message));
      }

      assignments.push({ lead, bot, templateId: selectedTemplate.id });

      if (i < leads.length - 1) {
        const delayMs = minDelayMs === maxDelayMs ? minDelayMs : randomBetween(minDelayMs, maxDelayMs);
        console.log(`[orchestrator] ⏳ Aguardando ${Math.round(delayMs / 1000)}s antes do próximo envio`);
        await sleep(delayMs);
      }

      if (lead.source === 'upload') {
        await supabaseClient.from('campaign_leads').update({ status: 'contacted', contacted_at: new Date().toISOString() }).eq('id', lead.id);
      }
    }

    await supabaseClient.from('ia_campaigns').update({ leads_contacted: campaign.leads_contacted + assignments.length }).eq('id', campaignId);
    console.log('[orchestrator] ✅ Finalizado. Processados:', assignments.length, 'botsUsed:', bots.length);
    return new Response(JSON.stringify({ success: true, processed: assignments.length, botsUsed: bots.length }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('[orchestrator] ❌ Erro:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
