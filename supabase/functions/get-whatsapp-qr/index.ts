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

    const { botInstanceId, forceQR } = await req.json();
    if (!botInstanceId) {
      return new Response(JSON.stringify({ error: 'botInstanceId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: bot, error } = await supabase
      .from('bot_instances')
      .select('evolution_api_url, evolution_api_key, instance_name, name, status, last_qr_base64, last_qr_at')
      .eq('id', botInstanceId)
      .maybeSingle();

    if (error || !bot) {
      return new Response(JSON.stringify({ error: 'Bot instance not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Fast path: QR em cache recebido via webhook (< 25s) ─────────────────
    // Evita chamada lenta à Evolution API quando o webhook já entregou o QR.
    if (bot.status === 'connecting' && bot.last_qr_base64 && bot.last_qr_at) {
      const qrAgeMs = Date.now() - new Date(bot.last_qr_at).getTime();
      if (qrAgeMs < 25000) {
        console.log(`[get-whatsapp-qr] QR servido do cache do banco (${Math.round(qrAgeMs / 1000)}s atrás)`);
        return new Response(
          JSON.stringify({ connected: false, base64: bot.last_qr_base64, fromCache: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ── Fast path: já conectado conforme DB ──────────────────────────────────
    if (bot.status === 'open') {
      console.log(`[get-whatsapp-qr] status=open no DB — retornando connected sem chamar Evolution`);
      return new Response(
        JSON.stringify({ connected: true, fromCache: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const base = (bot.evolution_api_url || '').replace(/\/+$/, '');
    const instance = encodeURIComponent((bot.instance_name || bot.name || '').trim());
    const apiKey = bot.evolution_api_key || '';

    if (!base || !instance) {
      return new Response(JSON.stringify({
        error: 'Bot instance not configured',
        error_detail: 'A instância não tem URL da Evolution API ou nome configurado. Verifique as configurações do chip.',
      }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 1. Verificar estado atual da instância ───────────────────────────────
    let rawState = 'unknown';
    let state = 'unknown';

    try {
      const stateResp = await fetch(`${base}/instance/connectionState/${instance}`, {
        headers: { apikey: apiKey },
        signal: AbortSignal.timeout(8000),
      });

      if (stateResp.ok) {
        const stateJson = await stateResp.json().catch(() => ({}));
        rawState = stateJson?.instance?.state || stateJson?.state || 'unknown';
        state = String(rawState).toLowerCase();
      } else {
        // Evolution API não respondeu ao estado — tratar como desconectado e tentar QR
        console.warn(`[get-whatsapp-qr] connectionState retornou ${stateResp.status} para ${instance}`);
        state = 'unknown';
      }
    } catch (fetchErr: any) {
      console.error(`[get-whatsapp-qr] Timeout ou erro ao checar estado: ${fetchErr.message}`);
      return new Response(JSON.stringify({
        error: 'evolution_api_unreachable',
        error_detail: 'Não foi possível contatar a Evolution API. Verifique se o servidor está online.',
        connected: false,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[get-whatsapp-qr] instance=${instance} state=${state}`);

    // ── 2. Conectado ─────────────────────────────────────────────────────────
    if (state === 'open') {
      return new Response(JSON.stringify({ connected: true, state: rawState }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 3. Transitório pós-scan — aguardar, a menos que forceQR esteja ativo ──
    if (state === 'connecting' && !forceQR) {
      return new Response(JSON.stringify({
        connected: false,
        connecting: true,
        state: rawState,
        base64: null,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 4. Buscar QR Code ────────────────────────────────────────────────────
    let qrResp: Response;
    try {
      qrResp = await fetch(`${base}/instance/connect/${instance}`, {
        headers: { apikey: apiKey },
        signal: AbortSignal.timeout(10000),
      });
    } catch (fetchErr: any) {
      console.error(`[get-whatsapp-qr] Timeout ao buscar QR: ${fetchErr.message}`);
      return new Response(JSON.stringify({
        connected: false,
        error: 'qr_fetch_timeout',
        error_detail: 'A Evolution API demorou demais para responder ao gerar o QR Code.',
        base64: null,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!qrResp.ok) {
      const txt = await qrResp.text().catch(() => '');
      console.error('[get-whatsapp-qr] Evolution error:', qrResp.status, txt);

      let errorDetail = `A Evolution API retornou erro ${qrResp.status} ao tentar gerar o QR Code.`;
      if (qrResp.status === 404) {
        errorDetail = `A instância "${bot.instance_name || bot.name}" não foi encontrada na Evolution API. Ela pode ter sido deletada ou o nome está incorreto.`;
      } else if (qrResp.status === 401 || qrResp.status === 403) {
        errorDetail = 'Chave de API da Evolution inválida ou sem permissão.';
      } else if (qrResp.status >= 500) {
        errorDetail = 'A Evolution API está com problemas internos. Tente novamente em alguns instantes.';
      }

      return new Response(JSON.stringify({
        connected: false,
        error: `evolution_error_${qrResp.status}`,
        error_detail: errorDetail,
        base64: null,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const qrJson = await qrResp.json().catch(() => ({}));

    // Evolution API v2: { base64: "data:image/png;base64,..." } ou { qrcode: { base64: ... } }
    const base64 = qrJson?.base64 || qrJson?.qrcode?.base64 || null;
    const code   = qrJson?.code   || qrJson?.qrcode?.code   || null;

    if (!base64 && !code) {
      console.warn('[get-whatsapp-qr] QR gerado mas sem base64/code:', JSON.stringify(qrJson).slice(0, 200));
      return new Response(JSON.stringify({
        connected: false,
        error: 'qr_empty_response',
        error_detail: 'A Evolution API respondeu mas não retornou o QR Code. A instância pode precisar ser reiniciada.',
        base64: null,
        raw: qrJson,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ connected: false, state: rawState, base64, code }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[get-whatsapp-qr] error:', err.message);
    return new Response(JSON.stringify({
      error: err.message,
      error_detail: 'Erro interno ao processar a requisição.',
      connected: false,
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
