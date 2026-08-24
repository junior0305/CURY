import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function classifySeverity(chipCount: number): string {
  if (chipCount >= 11) return 'critical';
  if (chipCount >= 6)  return 'high';
  return 'medium';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    const { data: groups, error: rpcErr } = await supabase
      .rpc('detect_template_repetition_24h');

    if (rpcErr) {
      console.error('[detector-template-repetido] RPC error:', rpcErr.message);
      return new Response(JSON.stringify({ error: rpcErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const alerts = (groups || []).map((g: any) => ({
      text_hash: g.text_hash,
      text_preview: (g.text_preview || '').substring(0, 200),
      chip_count: g.chip_count,
      chips: g.chips,
      message_count: g.message_count,
      first_seen: g.first_seen,
      last_seen: g.last_seen,
      severity: classifySeverity(g.chip_count),
    }));

    let inserted = 0, updated = 0;
    const newAlerts: any[] = [];
    const today = new Date().toISOString().split('T')[0];

    for (const a of alerts) {
      const { data: existing } = await supabase
        .from('template_repetition_alerts')
        .select('id, chip_count, severity, notified_at')
        .eq('text_hash', a.text_hash)
        .eq('alert_day', today)
        .maybeSingle();

      if (existing) {
        if (a.chip_count > existing.chip_count) {
          await supabase.from('template_repetition_alerts').update({
            chip_count: a.chip_count,
            chips: a.chips,
            message_count: a.message_count,
            last_seen: a.last_seen,
            severity: a.severity,
          }).eq('id', existing.id);
          updated++;
          if (a.severity !== existing.severity) {
            newAlerts.push({ ...a, escalated: true, oldSeverity: existing.severity });
          }
        }
      } else {
        await supabase.from('template_repetition_alerts').insert(a);
        inserted++;
        newAlerts.push({ ...a, escalated: false });
      }
    }

    if (newAlerts.length > 0) {
      const { data: admins } = await supabase
        .from('profiles').select('id').in('role', ['ADMIN', 'SUPERINTENDENT']);

      for (const a of newAlerts) {
        const emoji = a.severity === 'critical' ? '🚨' : a.severity === 'high' ? '⚠️' : '⚡';
        const title = `${emoji} Template repetido entre ${a.chip_count} chips`;
        const chipList = a.chips.slice(0, 5).join(', ') + (a.chips.length > 5 ? `, +${a.chips.length - 5}` : '');
        const message = `O mesmo texto saiu de ${a.chip_count} chips diferentes nas últimas 24h (${a.message_count} envios). Risco de banimento massivo pelo WhatsApp.\n\nChips: ${chipList}\n\nPreview: "${a.text_preview.substring(0, 100)}"\n\nAção: pare o uso desse template e use variações diferentes.`;

        for (const adm of admins || []) {
          await supabase.from('internal_notifications').insert({
            to_id: adm.id,
            type: 'TEMPLATE_REPETITION_ALERT',
            title, message,
          }).then(() => {}, () => {});
        }
      }

      await supabase
        .from('template_repetition_alerts')
        .update({ notified_at: new Date().toISOString() })
        .in('text_hash', newAlerts.map(a => a.text_hash))
        .eq('alert_day', today);
    }

    return new Response(JSON.stringify({
      success: true,
      alerts_with_3plus_chips: alerts.length,
      inserted, updated,
      new_or_escalated: newAlerts.length,
      top_alerts: alerts.slice(0, 5).map((a: any) => ({
        chips: a.chips, msgs: a.message_count, severity: a.severity,
        preview: a.text_preview.substring(0, 100),
      })),
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('[detector-template-repetido] fatal:', err.message);
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
