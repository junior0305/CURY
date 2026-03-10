import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getRandomInt(max: number): number {
  return Math.floor(Math.random() * max);
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
    console.log('🚀 Orchestrator iniciado para campanha:', campaignId);

    if (!campaignId) {
      return new Response(JSON.stringify({ error: 'Campaign ID required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: campaign, error: campaignError } = await supabaseClient.from('ia_campaigns').select('*').eq('id', campaignId).single();
    if (campaignError || !campaign) {
      return new Response(JSON.stringify({ error: 'Campaign not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('✅ Campanha:', campaign.name);
    const messageTemplates = campaign.message_templates || [];
    console.log('💬 Variações disponíveis:', messageTemplates.length);

    // Determine bot pool: if campaign specifies a bot_instance_id, use it exclusively; otherwise use prospecting pool
    let bots: any[] = [];
    if (campaign.bot_instance_id) {
      const { data: singleBot, error: singleErr } = await supabaseClient.from('bot_instances').select('*').eq('id', campaign.bot_instance_id).single();
      if (singleErr || !singleBot) {
        return new Response(JSON.stringify({ error: 'Specified bot instance not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      bots = [singleBot];
    } else {
      const { data: poolBots } = await supabaseClient.from('bot_instances').select('*').eq('status', 'active').gte('health_score', 50).eq('is_prospecting', true);
      bots = poolBots || [];
      if (!bots || bots.length === 0) {
        return new Response(JSON.stringify({ error: 'No prospecting bots available' }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    let leads: any[] = [];
    const source = campaign.target_audience?.source || 'crm';

    if (source === 'upload') {
      const { data: uploadedLeads } = await supabaseClient.from('campaign_leads').select('*').eq('campaign_id', campaignId).eq('status', 'pending').limit(campaign.max_leads || 1000);
      leads = (uploadedLeads || []).map(l => ({ id: l.id, name: l.name, phone: l.phone, source: 'upload' }));
    } else {
      const targetAudience = campaign.target_audience || {};
      const daysWithoutContact = targetAudience.days_without_contact || 3;
      const leadStatus = targetAudience.lead_status || [];
      let leadsQuery = supabaseClient.from('leads').select('id, name, phone').is('deleted_at', null);
      if (leadStatus.length > 0) leadsQuery = leadsQuery.in('status', leadStatus);
      const cutoffDate = new Date(); cutoffDate.setDate(cutoffDate.getDate() - daysWithoutContact);
      leadsQuery = leadsQuery.or(`last_contact_at.is.null,last_contact_at.lt.${cutoffDate.toISOString()}`);
      if (campaign.max_leads) leadsQuery = leadsQuery.limit(campaign.max_leads);
      const { data: crmLeads } = await leadsQuery;
      leads = (crmLeads || []).map(l => ({ ...l, source: 'crm' }));
    }

    if (leads.length === 0) {
      return new Response(JSON.stringify({ message: 'No leads found', processed: 0, botsUsed: 0 }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const assignments: any[] = [];
    let botIndex = 0;

    for (const lead of leads) {
      const bot = bots[botIndex % bots.length];
      botIndex++;

      const { data: conversation } = await supabaseClient.from('ia_conversations').insert({ campaign_id: campaignId, bot_instance_id: bot.id, lead_id: lead.source === 'crm' ? lead.id : null, lead_name: lead.name, lead_phone: lead.phone, status: 'active', sentiment: 'unknown' }).select().single();
      if (!conversation) continue;

      const randomIndex = getRandomInt(messageTemplates.length);
      const selectedTemplate = messageTemplates[randomIndex];
      console.log('🎲 Lead:', lead.name, '| Mensagem:', randomIndex + 1, 'de', messageTemplates.length);
      
      if (selectedTemplate?.text) {
        let message = selectedTemplate.text.replace(/\{nome\}/gi, lead.name || 'amigo').replace(/\{name\}/gi, lead.name || 'amigo');
        console.log('📨 Enviando:', message.substring(0, 60));

        await supabaseClient.functions.invoke('send_whatsapp_message', { body: { botId: bot.id, phone: lead.phone, message, conversationId: conversation.id } });
        assignments.push({ lead, bot });
      }

      if (lead.source === 'upload') {
        await supabaseClient.from('campaign_leads').update({ status: 'contacted', contacted_at: new Date().toISOString() }).eq('id', lead.id);
      }
    }

    await supabaseClient.from('ia_campaigns').update({ leads_contacted: campaign.leads_contacted + assignments.length }).eq('id', campaignId);
    return new Response(JSON.stringify({ success: true, processed: assignments.length, botsUsed: bots.length }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('❌ Erro:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});