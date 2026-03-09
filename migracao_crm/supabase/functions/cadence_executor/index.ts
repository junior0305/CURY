import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('🎯 Cadence Executor v2 (com tags)');
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { leadId, cadenceId, brokerId } = await req.json();
    console.log('📋 Lead:', leadId, '| Cadence:', cadenceId);

    const { data: lead } = await supabaseClient.from('leads').select('*, profiles!assigned_broker_id(*)').eq('id', leadId).single();
    if (!lead) {
      return new Response(JSON.stringify({ error: 'Lead not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const broker = lead.profiles || (brokerId ? await supabaseClient.from('profiles').select('*').eq('id', brokerId).single().then(r => r.data) : null);
    if (!broker || !broker.bot_instance_id) {
      return new Response(JSON.stringify({ error: 'Broker without bot instance' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: botInstance } = await supabaseClient.from('bot_instances').select('*').eq('id', broker.bot_instance_id).single();
    if (!botInstance) {
      return new Response(JSON.stringify({ error: 'Bot not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('✅ Bot:', botInstance.name);

    let { data: execution } = await supabaseClient.from('cadence_executions').select('*').eq('lead_id', leadId).eq('cadence_id', cadenceId).eq('status', 'active').single();

    if (!execution) {
      console.log('🆕 Criando nova execução');
      const { data: newExec } = await supabaseClient.from('cadence_executions').insert({
        cadence_id: cadenceId,
        lead_id: leadId,
        current_step: 0,
        next_execution_at: new Date().toISOString(),
        status: 'active',
      }).select().single();
      execution = newExec;
    }

    if (!execution) {
      return new Response(JSON.stringify({ error: 'Failed to create execution' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('📍 Step atual:', execution.current_step);

    const { data: nextStep } = await supabaseClient.from('cadence_steps').select('*').eq('cadence_id', cadenceId).eq('step_number', execution.current_step + 1).single();

    if (!nextStep) {
      console.log('✅ Cadência completa!');
      await supabaseClient.from('cadence_executions').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', execution.id);
      return new Response(JSON.stringify({ message: 'Cadence completed' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('📤 Enviando step:', nextStep.step_number, '| Tipo:', nextStep.media_type);

    // Substituir variáveis (INCLUINDO {tag} e {regiao})
    const brokerName = broker.full_name || broker.email.split('@')[0];
    const leadTag = lead.primary_tag || (lead.tags && lead.tags.length > 0 ? lead.tags[0] : 'sua região');
    
    let content = nextStep.content || '';
    let caption = nextStep.caption || '';
    
    content = content
      .replace(/{nome}/g, lead.name || 'Cliente')
      .replace(/{broker}/g, brokerName)
      .replace(/{tag}/g, leadTag)
      .replace(/{regiao}/g, leadTag);
    
    caption = caption
      .replace(/{nome}/g, lead.name || 'Cliente')
      .replace(/{broker}/g, brokerName)
      .replace(/{tag}/g, leadTag)
      .replace(/{regiao}/g, leadTag);

    console.log('🏷️ Variáveis: nome=' + (lead.name || 'Cliente') + ', broker=' + brokerName + ', tag=' + leadTag);

    let sendResult;
    
    if (nextStep.media_type === 'text') {
      sendResult = await supabaseClient.functions.invoke('send_whatsapp_message', {
        body: { botId: botInstance.id, phone: lead.phone, message: content, conversationId: null },
      });
    } else {
      const url = `${botInstance.evolution_api_url}/message/sendMedia/${botInstance.instance_name}`;
      const payload: any = { number: lead.phone.replace(/\D/g, '') };

      if (nextStep.media_type === 'audio') {
        payload.mediatype = 'audio';
        payload.media = nextStep.media_url;
      } else if (nextStep.media_type === 'video') {
        payload.mediatype = 'video';
        payload.media = nextStep.media_url;
        payload.caption = caption;
      } else if (nextStep.media_type === 'image') {
        payload.mediatype = 'image';
        payload.media = nextStep.media_url;
        payload.caption = caption;
      }

      console.log('🎬 Enviando mídia:', payload.mediatype);
      
      const evolutionResponse = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': botInstance.evolution_api_key.trim() },
        body: JSON.stringify(payload),
      });

      sendResult = { error: evolutionResponse.ok ? null : await evolutionResponse.text() };
    }

    if (sendResult?.error) {
      console.error('❌ Erro:', sendResult.error);
      return new Response(JSON.stringify({ error: sendResult.error }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('✅ Mensagem enviada!');

    const nextExecutionDate = new Date();
    nextExecutionDate.setDate(nextExecutionDate.getDate() + (nextStep.delay_days || 0));

    await supabaseClient.from('cadence_executions').update({
      current_step: nextStep.step_number,
      next_execution_at: nextExecutionDate.toISOString(),
    }).eq('id', execution.id);

    await supabaseClient.from('automation_logs').insert({
      rule_id: null,
      entity_type: 'cadence',
      entity_id: execution.id,
      status: 'success',
      message_sent: nextStep.media_type === 'text' ? content : `[${nextStep.media_type}] ${caption}`,
      recipient_phone: lead.phone,
    });

    console.log('🎉 Concluído! Próximo em', nextStep.delay_days, 'dias');

    return new Response(
      JSON.stringify({ success: true, step: nextStep.step_number, next_in_days: nextStep.delay_days, type: nextStep.media_type }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Erro:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});