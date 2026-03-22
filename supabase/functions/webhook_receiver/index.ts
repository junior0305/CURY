import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const payload = await req.json().catch(() => null);
    console.log('[webhook_receiver] payload:', JSON.stringify(payload).substring(0, 1000));

    const phoneNumber = payload?.data?.key?.remoteJid?.replace('@s.whatsapp.net', '') ||
                        payload?.key?.remoteJid?.replace('@s.whatsapp.net', '');
    const fromMe = payload?.data?.key?.fromMe === true || payload?.key?.fromMe === true;
    const messageText = payload?.data?.message?.conversation || payload?.data?.message?.extendedTextMessage?.text || payload?.message?.conversation || payload?.message?.extendedTextMessage?.text;

    // Corretor enviou mensagem → atualiza last_broker_whatsapp_at no lead (sem custo de IA)
    if (fromMe && phoneNumber) {
      await supabase
        .from('leads')
        .update({ last_broker_whatsapp_at: new Date().toISOString() })
        .eq('phone', phoneNumber)
        .not('status', 'in', '("ABANDONED","EXCLUDED")');
      console.log(`[webhook_receiver] last_broker_whatsapp_at atualizado para ${phoneNumber}`);
    }

    if (!phoneNumber || !messageText) {
      console.warn('[webhook_receiver] missing phone or message');
      return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Find active conversation for this lead
    const { data: conversation } = await supabase
      .from('ia_conversations')
      .select('*')
      .eq('lead_phone', phoneNumber)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conversation) {
      console.log('[webhook_receiver] no active conversation found for', phoneNumber);
      // Try to find lead to determine broker
      const { data: lead } = await supabase.from('leads').select('*, profiles!broker_id(*)').eq('phone', phoneNumber).maybeSingle();

      if (lead && lead.profiles) {
        const broker = lead.profiles;
        // Get broker's bot_instance_id
        if (broker.bot_instance_id) {
          const { data: botInstance } = await supabase.from('bot_instances').select('*').eq('id', broker.bot_instance_id).maybeSingle();
          // create a new conversation assigned to broker's bot
          const { data: newConv } = await supabase.from('ia_conversations').insert({
            campaign_id: null,
            bot_instance_id: botInstance?.id || null,
            lead_id: lead.id,
            lead_name: lead.name,
            lead_phone: phoneNumber,
            status: 'active',
            sentiment: 'unknown'
          }).select().single();

          console.log('[webhook_receiver] created conversation', newConv?.id);
        }
      }

      // If still no conversation, ignore (or log)
      return new Response(JSON.stringify({ message: 'No active conversation' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('[webhook_receiver] conversation found', conversation.id);

    // Save incoming message
    await supabase.from('ia_messages').insert({
      conversation_id: conversation.id,
      message_text: messageText,
      direction: 'incoming',
      sender_type: 'lead',
      created_at: new Date().toISOString(),
    });

    // Update conversation metadata
    await supabase.from('ia_conversations').update({
      messages_count: (conversation.messages_count || 0) + 1,
      last_message_at: new Date().toISOString(),
    }).eq('id', conversation.id);

    // Trigger IA engine to generate a reply (it will use conversation.bot_instance_id)
    const { error: iaError } = await supabase.functions.invoke('ia_chat_engine', {
      body: {
        conversationId: conversation.id,
        incomingMessage: messageText,
      }
    });

    if (iaError) console.error('[webhook_receiver] ia_chat_engine error', iaError.message);

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('[webhook_receiver] error', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
