import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('📨 send_whatsapp_message iniciado');
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { botId, phone, message, conversationId } = await req.json();
    console.log('📝 Parâmetros recebidos');
    console.log('Bot ID:', botId);
    console.log('Phone:', phone);
    console.log('Conversation ID:', conversationId);

    if (!botId || !phone || !message) {
      console.error('❌ Parâmetros faltando');
      return new Response(
        JSON.stringify({ error: 'Missing required fields: botId, phone, message' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🤖 Buscando bot no banco...');
    const { data: bot, error: botError } = await supabaseClient
      .from('bot_instances')
      .select('*')
      .eq('id', botId)
      .single();

    if (botError || !bot) {
      console.error('❌ Bot não encontrado:', botError);
      return new Response(
        JSON.stringify({ error: 'Bot not found', details: botError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Bot encontrado:', bot.name);
    console.log('🔗 Evolution URL:', bot.evolution_api_url);
    console.log('📛 Instance Name:', bot.instance_name);
    console.log('🔑 API Key presente:', !!bot.evolution_api_key);

    const cleanPhone = phone.replace(/\D/g, '');
    
    const payload = {
      number: cleanPhone,
      text: message
    };

    const url = `${bot.evolution_api_url}/message/sendText/${bot.instance_name}`;
    console.log('🚀 URL completa:', url);
    console.log('📦 Payload:', JSON.stringify(payload));

    console.log('📤 Enviando para Evolution API...');
    const evolutionResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': bot.evolution_api_key.trim(),
      },
      body: JSON.stringify(payload),
    });

    console.log('📊 Status da resposta:', evolutionResponse.status);

    let result;
    try {
      result = await evolutionResponse.json();
      console.log('📥 Resposta Evolution:', JSON.stringify(result));
    } catch (e) {
      console.log('⚠️ Resposta não é JSON');
      result = { error: 'Invalid JSON response' };
    }

    if (conversationId) {
      console.log('💾 Salvando mensagem no banco de dados...');
      const { error: msgError } = await supabaseClient.from('ia_messages').insert({
        conversation_id: conversationId,
        message_text: message,
        direction: 'outgoing',
        sender_type: 'ia',
        sent_at: evolutionResponse.ok ? new Date().toISOString() : null,
        failed_at: evolutionResponse.ok ? null : new Date().toISOString(),
        error_message: evolutionResponse.ok ? null : JSON.stringify(result),
      });

      if (msgError) {
        console.error('❌ Erro ao salvar mensagem no banco:', msgError);
      } else {
        console.log('✅ Mensagem salva com sucesso');
      }

      console.log('🔄 Atualizando contadores da conversa...');
      const { count } = await supabaseClient
        .from('ia_messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversationId);

      await supabaseClient
        .from('ia_conversations')
        .update({
          messages_count: count || 0,
          last_message_at: new Date().toISOString(),
        })
        .eq('id', conversationId);
    }

    console.log('📈 Atualizando estatísticas do bot...');
    await supabaseClient
      .from('bot_instances')
      .update({
        messages_today: bot.messages_today + 1,
        total_messages_sent: bot.total_messages_sent + 1,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', botId);

    console.log('✅ Processo concluído!');
    console.log('Sucesso:', evolutionResponse.ok);

    return new Response(
      JSON.stringify({ 
        success: evolutionResponse.ok, 
        result,
        status: evolutionResponse.status 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ ERRO GERAL:', error.message);
    console.error('Stack:', error.stack);
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});