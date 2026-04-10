import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
    );

    const { botInstanceId } = await req.json();
    if (!botInstanceId) {
      return new Response(JSON.stringify({ error: 'botInstanceId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: bot, error } = await supabase
      .from('bot_instances')
      .select('evolution_api_url, evolution_api_key, instance_name, name, status')
      .eq('id', botInstanceId)
      .maybeSingle();

    if (error || !bot) {
      return new Response(JSON.stringify({ error: 'Bot instance not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const base = (bot.evolution_api_url || '').replace(/\/+$/, '');
    const instance = encodeURIComponent((bot.instance_name || bot.name || '').trim());
    const apiKey = bot.evolution_api_key || '';

    if (!base || !instance) {
      return new Response(JSON.stringify({ error: 'Bot instance not configured' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verifica status atual da instância
    const stateResp = await fetch(`${base}/instance/connectionState/${instance}`, {
      headers: { apikey: apiKey },
    });
    const stateJson = await stateResp.json().catch(() => ({}));
    // Normalizar para lowercase para comparação case-insensitive
    const rawState = stateJson?.instance?.state || stateJson?.state || 'unknown';
    const state = String(rawState).toLowerCase();

    console.log(`[get-whatsapp-qr] instance=${instance} state=${state}`);

    if (state === 'open') {
      return new Response(JSON.stringify({ connected: true, state: rawState }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Estado transitório após scan — não gerar novo QR, aguardar
    if (state === 'connecting') {
      return new Response(JSON.stringify({ connected: false, state: rawState, connecting: true, base64: null }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Busca QR code
    const qrResp = await fetch(`${base}/instance/connect/${instance}`, {
      headers: { apikey: apiKey },
    });

    if (!qrResp.ok) {
      const txt = await qrResp.text();
      console.error('[get-whatsapp-qr] Evolution error:', qrResp.status, txt);
      return new Response(JSON.stringify({ error: `Evolution API error: ${qrResp.status}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const qrJson = await qrResp.json();
    // Evolution API v2 retorna { base64: "data:image/png;base64,..." } ou { code: "2@..." }
    const base64 = qrJson?.base64 || qrJson?.qrcode?.base64 || null;
    const code   = qrJson?.code   || qrJson?.qrcode?.code   || null;

    return new Response(JSON.stringify({ connected: false, state: rawState, base64, code }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[get-whatsapp-qr] error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
