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
  let requestBody: any = {};

  try {
    requestBody = await req.json()
    const { phone, message, overrideUrl, instance_id, instance_name } = requestBody

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

    // INTELLIGENT FORMATTING: Add Brazil Country Code (55) if missing for typical 10/11-digit local numbers
    if (cleanPhone.length === 10 || cleanPhone.length === 11) {
      cleanPhone = '55' + cleanPhone;
    }

    // Resolve evolution instance: prefer instance_id -> instance_name -> undefined
    let resolvedInstanceName: string | null = null;
    if (instance_id) {
      const { data: inst, error: instErr } = await supabase
        .from('prospect_instances')
        .select('evolution_instance')
        .eq('id', instance_id)
        .single();
      if (instErr) {
        console.warn('[WhatsApp] Could not fetch prospect_instances for instance_id', instance_id, instErr.message);
      }
      resolvedInstanceName = inst?.evolution_instance || null;
    }
    if (!resolvedInstanceName && instance_name) resolvedInstanceName = instance_name;

    console.log(`[WhatsApp] Sending to ${cleanPhone} via ${WEBHOOK_URL} (instance: ${resolvedInstanceName || 'none'})`)

    const startTime = Date.now();
    let response;
    let responseText;
    let statusCode;
    let fetchError = null;

    try {
      // Sending JSON payload so n8n can easily read fields like Contato and Instance
      const payloadToN8n: any = {
        Contato: cleanPhone,
        Mensagem: message,
      };
      if (resolvedInstanceName) payloadToN8n.Instance = resolvedInstanceName;
      if (instance_id) payloadToN8n.InstanceId = instance_id;

      response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payloadToN8n),
      })
      statusCode = response.status;
      responseText = await response.text();
    } catch (err) {
      fetchError = err.message;
      statusCode = 0;
    }

    // 2. Log Attempt (include instance data)
    await supabase.from('webhook_logs').insert({
      integration_key: integrationKey,
      payload: { phone: cleanPhone, message, instance_id: instance_id || null, instance_name: resolvedInstanceName },
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
  } catch (error: any) {
    console.error('[WhatsApp] Error:', error.message)
    
    // Log fatal errors too (attempt to include raw request body)
    try {
      await supabase.from('webhook_logs').insert({
        integration_key: integrationKey,
        payload: requestBody || {},
        status_code: 500,
        error_message: error.message
      });
    } catch (e) {
      console.error('[WhatsApp] Failed to log error to webhook_logs:', e.message);
    }

    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})