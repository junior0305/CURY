import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { type, leadId, brokerId } = await req.json();

    const { data: lead } = await supabaseClient.from('leads').select('*, profiles!assigned_broker_id(*)').eq('id', leadId).single();
    if (!lead) return new Response(JSON.stringify({ error: 'Lead not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const broker = lead.profiles || (brokerId ? await supabaseClient.from('profiles').select('*').eq('id', brokerId).single().then((r: any) => r.data) : null);
    if (!broker) return new Response(JSON.stringify({ error: 'No broker assigned' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const settings = broker.automation_settings || {};
    if (type === 'welcome' && !settings.welcome_enabled) return new Response(JSON.stringify({ message: 'Welcome disabled' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (type === 'follow_up' && !settings.follow_up_enabled) return new Response(JSON.stringify({ message: 'Follow-up disabled' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    if (!broker.bot_instance_id) return new Response(JSON.stringify({ error: 'Broker has no bot instance' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: botInstance } = await supabaseClient.from('bot_instances').select('*').eq('id', broker.bot_instance_id).single();
    if (!botInstance) return new Response(JSON.stringify({ error: 'Bot instance not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: rule } = await supabaseClient.from('automation_rules').select('*').eq('type', type).eq('is_active', true).limit(1).single();
    if (!rule) return new Response(JSON.stringify({ message: 'No rule found' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    let message = (rule.message_template || '').replace(/{nome}/g, lead.name || 'Cliente').replace(/{lead_name}/g, lead.name || 'Cliente');

    const { error: sendError } = await supabaseClient.functions.invoke('send_whatsapp_message', { body: { botId: botInstance.id, phone: lead.phone, message, conversationId: null } });

    await supabaseClient.from('automation_logs').insert({ rule_id: rule.id, entity_type: 'lead', entity_id: leadId, status: sendError ? 'failed' : 'success', recipient_phone: lead.phone, message_sent: message, error_message: sendError?.message });

    if (sendError) return new Response(JSON.stringify({ error: sendError.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});