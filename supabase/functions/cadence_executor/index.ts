import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { leadId, cadenceId, brokerId } = await req.json();

    const { data: lead } = await supabaseClient.from('leads').select('*, profiles!assigned_broker_id(*)').eq('id', leadId).single();
    if (!lead) return new Response(JSON.stringify({ error: 'Lead not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const broker = lead.profiles || (brokerId ? await supabaseClient.from('profiles').select('*').eq('id', brokerId).single().then((r: any) => r.data) : null);
    if (!broker || !broker.bot_instance_id) return new Response(JSON.stringify({ error: 'Broker without bot instance' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: botInstance } = await supabaseClient.from('bot_instances').select('*').eq('id', broker.bot_instance_id).single();
    if (!botInstance) return new Response(JSON.stringify({ error: 'Bot not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    let { data: execution } = await supabaseClient.from('cadence_executions').select('*').eq('lead_id', leadId).eq('cadence_id', cadenceId).eq('status', 'active').single();

    if (!execution) {
      const { data: newExec } = await supabaseClient.from('cadence_executions').insert({ cadence_id: cadenceId, lead_id: leadId, current_step: 0, next_execution_at: new Date().toISOString(), status: 'active' }).select().single();
      execution = newExec;
    }
    if (!execution) return new Response(JSON.stringify({ error: 'Failed to create execution' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: nextStep } = await supabaseClient.from('cadence_steps').select('*').eq('cadence_id', cadenceId).eq('step_number', execution.current_step + 1).single();

    if (!nextStep) {
      await supabaseClient.from('cadence_executions').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', execution.id);
      return new Response(JSON.stringify({ message: 'Cadence completed' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const brokerName = broker.full_name || broker.email?.split('@')[0] || 'Corretor';
    const leadTag = lead.primary_tag || (lead.tags && lead.tags.length > 0 ? lead.tags[0] : 'sua região');
    const replace = (s: string) => (s || '').replace(/{nome}/g, lead.name || 'Cliente').replace(/{broker}/g, brokerName).replace(/{tag}/g, leadTag).replace(/{regiao}/g, leadTag);

    let sendResult: any;
    if (nextStep.media_type === 'text') {
      sendResult = await supabaseClient.functions.invoke('send_whatsapp_message', { body: { botId: botInstance.id, phone: lead.phone, message: replace(nextStep.content), conversationId: null } });
    } else {
      const url = `${botInstance.evolution_api_url}/message/sendMedia/${botInstance.instance_name}`;
      const payload: any = { number: lead.phone.replace(/\D/g, ''), mediatype: nextStep.media_type, media: nextStep.media_url, caption: replace(nextStep.caption) };
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': botInstance.evolution_api_key.trim() }, body: JSON.stringify(payload) });
      sendResult = { error: res.ok ? null : await res.text() };
    }

    if (sendResult?.error) return new Response(JSON.stringify({ error: sendResult.error }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + (nextStep.delay_days || 0));
    await supabaseClient.from('cadence_executions').update({ current_step: nextStep.step_number, next_execution_at: nextDate.toISOString() }).eq('id', execution.id);
    await supabaseClient.from('automation_logs').insert({ rule_id: null, entity_type: 'cadence', entity_id: execution.id, status: 'success', message_sent: nextStep.media_type === 'text' ? replace(nextStep.content) : `[${nextStep.media_type}]`, recipient_phone: lead.phone });

    return new Response(JSON.stringify({ success: true, step: nextStep.step_number, next_in_days: nextStep.delay_days }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});