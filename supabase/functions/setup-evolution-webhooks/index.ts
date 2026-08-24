import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Eventos que devem ser enviados ao webhook_receiver
const WEBHOOK_EVENTS = [
  'QRCODE_UPDATED',
  'CONNECTION_UPDATE',
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
  'SEND_MESSAGE',
];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  );

  // URL do webhook_receiver deste projeto Supabase
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const webhookUrl = `${supabaseUrl}/functions/v1/webhook_receiver`;

  console.log(`[setup-webhooks] Configurando webhooks → ${webhookUrl}`);

  // Buscar todas as instâncias com configuração da Evolution
  const { data: bots, error: botsErr } = await supabase
    .from('bot_instances')
    .select('id, name, instance_name, evolution_api_url, evolution_api_key')
    .not('evolution_api_url', 'is', null)
    .not('instance_name', 'is', null);

  if (botsErr) {
    return json({ error: 'Erro ao buscar bot_instances', detail: botsErr.message }, 500);
  }

  const results: any[] = [];
  const seen = new Set<string>(); // evita duplicatas (mesmo instance_name + url)

  for (const bot of (bots || [])) {
    const base = (bot.evolution_api_url || '').replace(/\/+$/, '');
    const instanceRaw = (bot.instance_name || bot.name || '').trim();
    const instance = encodeURIComponent(instanceRaw);
    const apiKey = bot.evolution_api_key || '';

    if (!base || !instanceRaw || !apiKey) {
      results.push({ name: bot.name, status: 'skipped', reason: 'missing config' });
      continue;
    }

    // Evitar configurar a mesma instância duas vezes
    const key = `${base}::${instanceRaw}`;
    if (seen.has(key)) {
      results.push({ name: bot.name, instance: instanceRaw, status: 'skipped', reason: 'duplicate' });
      continue;
    }
    seen.add(key);

    try {
      const resp = await fetch(`${base}/webhook/set/${instance}`, {
        method: 'POST',
        headers: { apikey: apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: true,
          url: webhookUrl,
          webhook_by_events: false,
          events: WEBHOOK_EVENTS,
        }),
        signal: AbortSignal.timeout(12000),
      });

      const respText = await resp.text().catch(() => '');

      if (resp.ok) {
        console.log(`[setup-webhooks] ✅ ${instanceRaw}`);
        results.push({ name: bot.name, instance: instanceRaw, status: 'ok', webhookUrl });
      } else {
        console.warn(`[setup-webhooks] ❌ ${instanceRaw} — HTTP ${resp.status}: ${respText.substring(0, 200)}`);
        results.push({
          name: bot.name,
          instance: instanceRaw,
          status: 'error',
          code: resp.status,
          detail: respText.substring(0, 200),
        });
      }
    } catch (e: any) {
      console.warn(`[setup-webhooks] ⏰ ${instanceRaw} — ${e.message}`);
      results.push({ name: bot.name, instance: instanceRaw, status: 'timeout', error: e.message });
    }
  }

  const ok = results.filter(r => r.status === 'ok').length;
  const failed = results.filter(r => r.status === 'error').length;
  const timeout = results.filter(r => r.status === 'timeout').length;
  const skipped = results.filter(r => r.status === 'skipped').length;

  console.log(`[setup-webhooks] Concluído: ${ok} ok | ${failed} erro | ${timeout} timeout | ${skipped} pulados`);

  return json({
    webhookUrl,
    summary: { ok, failed, timeout, skipped, total: results.length },
    results,
  });
});
