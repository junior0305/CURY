import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('🔔 Webhook iniciado');
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload = await req.json();
    console.log('📥 Payload completo:', JSON.stringify(payload).substring(0, 500));

    const phoneNumber = payload.data?.key?.remoteJid?.replace('@s.whatsapp.net', '') || 
                        payload.key?.remoteJid?.replace('@s.whatsapp.net', '');
    
    const messageText = payload.data?.message?.conversation || 
                        payload.data?.message?.extendedTextMessage?.text ||
                        payload.message?.conversation || 
                        payload.message?.extendedTextMessage?.text;

    console.log('📞 Telefone extraído:', phoneNumber);
    console.log('💬 Mensagem extraída:', messageText);

    if (!phoneNumber || !messageText) {
      console.error('❌ Payload inválido - phone ou message faltando');
      return new Response(
        JSON.stringify({ error: 'Invalid webhook payload', phoneNumber, messageText }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔍 Buscando conversa ativa para:', phoneNumber);
    const { data: conversation, error: convError } = await supabaseClient
      .from('ia_conversations')
      .select('*')
      .eq('lead_phone', phoneNumber)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (convError) {
      console.error('❌ Erro ao buscar conversa:', convError);
    }

    if (!conversation) {
      console.log('⚠️ Nenhuma conversa ativa encontrada para:', phoneNumber);
      return new Response(
        JSON.stringify({ message: 'No active conversation', phoneNumber }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Conversa encontrada:', conversation.id);

    console.log('💾 Salvando mensagem incoming...');
    const { error: msgError } = await supabaseClient.from('ia_messages').insert({
      conversation_id: conversation.id,
      message_text: messageText,
      direction: 'incoming',
      sender_type: 'lead',
      created_at: new Date().toISOString(),
    });

    if (msgError) {
      console.error('❌ Erro ao salvar mensagem:', msgError);
      return new Response(
        JSON.stringify({ error: 'Failed to save message', details: msgError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Mensagem salva com sucesso');

    console.log('🔄 Atualizando conversa...');
    await supabaseClient
      .from('ia_conversations')
      .update({
        messages_count: conversation.messages_count + 1,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', conversation.id);

    console.log('🔍 Buscando campanha...');
    const { data: campaign } = await supabaseClient
      .from('ia_campaigns')
      .select('*')
      .eq('id', conversation.campaign_id)
      .single();

    if (campaign) {
      console.log('📈 Atualizando métricas da campanha...');
      await supabaseClient
        .from('ia_campaigns')
        .update({ leads_responded: campaign.leads_responded + 1 })
        .eq('id', campaign.id);
    }

    console.log('🤖 Chamando IA Chat Engine...');
    const { error: iaError } = await supabaseClient.functions.invoke('ia_chat_engine', {
      body: {
        conversationId: conversation.id,
        incomingMessage: messageText,
      },
    });

    if (iaError) {
      console.error('❌ Erro ao chamar IA:', iaError);
    } else {
      console.log('✅ IA acionada com sucesso');
    }

    return new Response(
      JSON.stringify({ success: true, conversationId: conversation.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Erro geral no webhook:', error.message);
    console.error('Stack:', error.stack);
    return new Response(
      JSON.stringify({ error: error.message, stack: error.stack }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});