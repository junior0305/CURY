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

    // Busca todas as instâncias configuradas com Evolution API
    const { data: instances, error } = await supabase
      .from('bot_instances')
      .select('id, name, instance_name, evolution_api_url, evolution_api_key, status, health_score')
      .not('evolution_api_url', 'is', null)
      .not('instance_name', 'is', null)
      .neq('status', 'paused')
      .neq('status', 'blocked');

    if (error) throw error;

    let checked = 0, updated = 0, open = 0, offline = 0, connecting = 0, errors = 0;

    for (const inst of instances || []) {
      const base = (inst.evolution_api_url || '').replace(/\/+$/, '');
      const instanceName = encodeURIComponent((inst.instance_name || '').trim());
      const apiKey = inst.evolution_api_key || '';

      if (!base || !instanceName) continue;

      try {
        const res = await fetch(`${base}/instance/connectionState/${instanceName}`, {
          headers: { apikey: apiKey },
          signal: AbortSignal.timeout(8000),
        });

        if (!res.ok) {
          console.warn(`[check-bot-health] ${inst.name}: HTTP ${res.status}`);
          errors++;
          continue;
        }

        const json = await res.json();
        // Evolution API v2: { instance: { state: "open" } } ou { state: "open" }
        const state: string = json?.instance?.state || json?.state || 'unknown';

        // Mapeia estado Evolution → status DB
        let newStatus: string;
        let newHealthScore: number;

        if (state === 'open') {
          newStatus = 'open';
          newHealthScore = 100;
          open++;
        } else if (state === 'connecting') {
          newStatus = 'connecting';
          newHealthScore = 50;
          connecting++;
        } else {
          // close, closed, unknown, etc.
          newStatus = 'offline';
          newHealthScore = 0;
          offline++;
        }

        checked++;

        // Atualiza apenas se mudou
        if (inst.status !== newStatus || inst.health_score !== newHealthScore) {
          await supabase
            .from('bot_instances')
            .update({
              status: newStatus,
              health_score: newHealthScore,
              updated_at: new Date().toISOString(),
            })
            .eq('id', inst.id);

          console.log(`[check-bot-health] ${inst.name}: ${inst.status} → ${newStatus}`);
          updated++;
        }

      } catch (e: any) {
        console.warn(`[check-bot-health] ${inst.name}: ${e.message}`);
        errors++;
      }

      // Pequena pausa entre instâncias para não sobrecarregar a Evolution API
      await new Promise(r => setTimeout(r, 200));
    }

    console.log(`[check-bot-health] checked=${checked} updated=${updated} open=${open} offline=${offline} connecting=${connecting} errors=${errors}`);

    return new Response(
      JSON.stringify({ checked, updated, open, offline, connecting, errors }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err: any) {
    console.error('[check-bot-health] fatal:', err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
