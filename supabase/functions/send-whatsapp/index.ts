import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let integrationKey = 'WHATSAPP_N8N_URL';
  let requestBody = {};

  try {
    requestBody = await req.json()
    const { phone, message, overrideUrl } = requestBody

    if (!phone || !message) {
      throw new Error('Phone and message are required')
    }

    let WEBHOOK_URL = overrideUrl; // Priority to override

    // Only fetch from DB if no override provided
    if (!WEBHOOK_URL) {
      const { data: config, error: configError } = await supabase
        .from('system_integrations')
        .select('value')
        .eq('key', integrationKey)
        .single();
      
      if (configError || !config) {
         throw new Error('Configuration WHATSAPP_N8N_URL not found in system_integrations table.');
      }
      WEBHOOK_URL = config.value;
    }

    let cleanPhone = phone.replace(/\D/g, '')

    // VALIDATION: Ensure phone has content
    if (!cleanPhone || cleanPhone.length < 8) {
       throw new Error(`Phone number invalid after cleaning: ${phone} -> ${cleanPhone}`);
    }

    // INTELLIGENT FORMATTING: Add Brazil Country Code (55) if missing
    // Logic: If it doesn't start with 55 OR it starts with 55 but is too short (likely just local number starting with 55, rare but possible, usually local is 8-9 digits, with area 10-11)
    // Standard BR mobile with Area: 11 digits (11 99999 9999) -> Needs 55 -> 13 digits
    // Standard BR landline with Area: 10 digits (11 3333 3333) -> Needs 55 -> 12 digits
    
    // If length is 10 or 11 (Area + Number), add 55.
    if (cleanPhone.length === 10 || cleanPhone.length === 11) {
      cleanPhone = '55' + cleanPhone;
    } 
    // If length is 8 or 9 (No Area Code), we can't reliably guess, but usually systems expect area code. 
    // We will assume provided numbers have area code as per CRM best practices.
    
    console.log(`[WhatsApp] Sending to ${cleanPhone} via ${WEBHOOK_URL}`)

    const startTime = Date.now();
    let response;
    let responseText;
    let statusCode;
    let fetchError = null;

    try {
      // SWITCHOVER: Sending JSON instead of Form Data for better N8N compatibility
      response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Contato: cleanPhone,
          Mensagem: message
        }),
      })
      statusCode = response.status;
      responseText = await response.text();
    } catch (err) {
      fetchError = err.message;
      statusCode = 0;
    }

    // 2. Log Attempt
    await supabase.from('webhook_logs').insert({
      integration_key: integrationKey,
      payload: { phone: cleanPhone, message },
      status_code: statusCode,
      response_body: responseText ? responseText.substring(0, 1000) : null,
      error_message: fetchError || (statusCode >= 400 ? 'HTTP Error' : null)
    });

    if (fetchError || !response?.ok) {
      throw new Error(`Webhook error: ${statusCode} ${fetchError || responseText}`)
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('[WhatsApp] Error:', error.message)
    
    // Log fatal errors too
    await supabase.from('webhook_logs').insert({
      integration_key: integrationKey,
      payload: requestBody,
      status_code: 500,
      error_message: error.message
    });

    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})