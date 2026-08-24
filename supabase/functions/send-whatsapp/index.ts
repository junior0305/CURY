import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SendWhatsAppRequest {
  instance_id: string;
  phone: string;
  message: string;
  lead_id?: string;
  type: 'notification' | 'welcome' | 'followup' | 'response';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { instance_id, phone, message, lead_id, type }: SendWhatsAppRequest = await req.json();

    console.log(`[send-whatsapp] Type: ${type}, Phone: ${phone}, Lead: ${lead_id || 'N/A'}`);

    if (!instance_id || !phone || !message) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    const { data: bot, error: botError } = await supabase
      .from('bot_instances')
      .select('*')
      .eq('id', instance_id)
      .maybeSingle();

    if (botError || !bot) {
      console.error('[send-whatsapp] Bot not found:', instance_id);
      if (lead_id) {
        await supabase.from('automation_logs').insert({
          entity_type: type, entity_id: lead_id,
          status: 'failed', message_sent: message, recipient_phone: phone,
          error_message: `Bot instance not found: ${instance_id}`,
        });
      }
      return new Response(JSON.stringify({ error: 'Bot instance not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[send-whatsapp] Bot: ${bot.instance_name}`);

    const response = await fetch(
      `${bot.evolution_api_url}/message/sendText/${bot.instance_name}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': bot.evolution_api_key
        },
        body: JSON.stringify({ number: phone, text: message })
      }
    );

    const responseText = await response.text();
    console.log(`[send-whatsapp] Status: ${response.status}`);
    console.log(`[send-whatsapp] Response: ${responseText}`);

    const success = response.ok;

    if (lead_id) {
      await supabase.from('automation_logs').insert({
        entity_type: type,
        entity_id: lead_id,
        status: success ? 'success' : 'failed',
        message_sent: message,
        recipient_phone: phone,
        error_message: success ? null : `HTTP ${response.status}: ${responseText.substring(0, 480)}`,
      });
    }

    return new Response(JSON.stringify({
      success,
      status: response.status,
      response: responseText
    }), {
      status: success ? 200 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[send-whatsapp] Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})
