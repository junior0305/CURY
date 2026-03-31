import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function hoursAgo(iso: string | null): number {
  if (!iso) return 9999;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
}

async function sendAlert(supabase: any, botInstanceId: string, phone: string, message: string) {
  try {
    await supabase.functions.invoke('send_whatsapp_message', {
      body: { botId: botInstanceId, phone, message },
    });
  } catch { /* silencioso — não interrompe o guardian */ }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  );

  const now = new Date().toISOString();
  const alerts: Array<{ type: string; severity: string; message: string; fixed: boolean }> = [];
  let autoFixed = 0;

  try {
    // ── Carregar configurações ─────────────────────────────────────────────
    const [{ data: notifBotSetting }, { data: alertPhoneSetting }] = await Promise.all([
      supabase.from('system_settings').select('value').eq('key', 'notification_bot_instance_id').maybeSingle(),
      supabase.from('system_settings').select('value').eq('key', 'guardian_alert_phone').maybeSingle(),
    ]);

    const notifBotId: string | null = notifBotSetting?.value ?? null;
    const alertPhone: string | null = alertPhoneSetting?.value ?? null;
    const canAlert = !!(notifBotId && alertPhone);

    // ── CHECK 1: Bots offline > 2h ─────────────────────────────────────────
    const twoHAgo = new Date(Date.now() - 2 * 3600000).toISOString();
    const { data: offlineBots } = await supabase
      .from('bot_instances')
      .select('name, instance_name, status, updated_at')
      .eq('status', 'offline')
      .lt('updated_at', twoHAgo);

    for (const bot of offlineBots || []) {
      const h = hoursAgo(bot.updated_at);
      const msg = `🔴 Bot offline: *${bot.name}* (${bot.instance_name}) está OFFLINE há ${h}h. Reconecte no painel Evolution.`;
      alerts.push({ type: 'bot_offline', severity: 'high', message: msg, fixed: false });
      if (canAlert && h === 2) { // alerta só quando atingir exatamente 2h (não repetir toda hora)
        await sendAlert(supabase, notifBotId!, alertPhone!, msg);
      }
      console.log(`[guardian] ⚠️ ${msg}`);
    }

    // ── CHECK 2: Itens pendentes parados há mais de 3h ──────────────────────
    const threeHAgo = new Date(Date.now() - 3 * 3600000).toISOString();
    const { count: stuckCount } = await supabase
      .from('lead_activation_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lt('scheduled_for', threeHAgo);

    if ((stuckCount ?? 0) > 0) {
      // Auto-fix: verificar se são leads com status terminal (que o cerebro não cancelou)
      const { data: stuckItems } = await supabase
        .from('lead_activation_queue')
        .select('id, lead_id')
        .eq('status', 'pending')
        .lt('scheduled_for', threeHAgo)
        .limit(50);

      let fixedCount = 0;
      for (const item of stuckItems || []) {
        const { data: lead } = await supabase
          .from('leads')
          .select('status, broker_id')
          .eq('id', item.lead_id)
          .maybeSingle();

        if (!lead || ['CONCLUDED', 'ABANDONED', 'EXCLUDED'].includes((lead.status || '').toUpperCase())) {
          await supabase.from('lead_activation_queue')
            .update({ status: 'cancelled', cancel_reason: 'guardian_orphan_cleanup' })
            .eq('id', item.id);
          fixedCount++;
        } else if (!lead.broker_id) {
          await supabase.from('lead_activation_queue')
            .update({ status: 'cancelled', cancel_reason: 'guardian_no_broker' })
            .eq('id', item.id);
          fixedCount++;
        }
      }
      autoFixed += fixedCount;

      const remaining = (stuckCount ?? 0) - fixedCount;
      if (remaining > 0) {
        const msg = `⏰ Fila parada: ${remaining} item(ns) pendente(s) há 3h+ sem ser processado(s). Verifique se o Cérebro está ativo e os bots conectados.`;
        alerts.push({ type: 'queue_stuck', severity: 'medium', message: msg, fixed: false });
        console.log(`[guardian] ⚠️ ${msg}`);
      }
      if (fixedCount > 0) {
        const msg = `🔧 Auto-fix: ${fixedCount} item(ns) órfão(s) cancelado(s) da fila.`;
        alerts.push({ type: 'queue_stuck', severity: 'info', message: msg, fixed: true });
        console.log(`[guardian] ✅ ${msg}`);
      }
    }

    // ── CHECK 3: 5 execuções consecutivas do Cérebro com 0 enviados ──────────
    const { data: recentCerebroRuns } = await supabase
      .from('cerebro_runs')
      .select('processed, rescheduled, ran_at')
      .order('ran_at', { ascending: false })
      .limit(6);

    if ((recentCerebroRuns?.length ?? 0) >= 5) {
      const runs = recentCerebroRuns!;
      const allZeroSends = runs.slice(0, 5).every(r => (r.processed ?? 0) === 0);
      const hasQueueItems = (stuckCount ?? 0) > 0;

      if (allZeroSends && hasQueueItems) {
        const msg = `🚨 Streak de 0 envios: Cérebro rodou 5 vezes seguidas sem enviar nada, mas há ${stuckCount} item(ns) na fila. Verifique os bots e a conexão com Evolution API.`;
        alerts.push({ type: 'zero_sends_streak', severity: 'high', message: msg, fixed: false });
        if (canAlert) await sendAlert(supabase, notifBotId!, alertPhone!, msg);
        console.log(`[guardian] 🚨 ${msg}`);
      }
    }

    // ── CHECK 4: Acúmulo de falhas permanentes (attempts >= 5) ───────────────
    const { count: permanentFailCount } = await supabase
      .from('lead_activation_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('attempts', 5);

    if ((permanentFailCount ?? 0) > 10) {
      const msg = `📛 ${permanentFailCount} lead(s) falharam 5+ vezes e não serão retentados. Verifique as credenciais dos bots no Evolution API (Canuto, Polonia, etc).`;
      alerts.push({ type: 'failed_buildup', severity: 'medium', message: msg, fixed: false });
      console.log(`[guardian] ⚠️ ${msg}`);
    }

    // ── CHECK 5: Corretores sem bot atribuído ─────────────────────────────────
    const { count: brokerWithoutBot } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'BROKER')
      .is('bot_instance_id', null);

    if ((brokerWithoutBot ?? 0) > 0) {
      const msg = `👤 ${brokerWithoutBot} corretor(es) sem bot WhatsApp atribuído. Esses leads não receberão follow-up automático.`;
      alerts.push({ type: 'broker_no_bot', severity: 'medium', message: msg, fixed: false });
      console.log(`[guardian] ⚠️ ${msg}`);
    }

    // ── Resolver alertas antigos que agora estão OK ───────────────────────────
    // Se não há mais bots offline, resolver alertas bot_offline anteriores
    if ((offlineBots?.length ?? 0) === 0) {
      await supabase.from('guardian_alerts')
        .update({ resolved_at: now })
        .eq('check_type', 'bot_offline')
        .is('resolved_at', null);
    }
    if ((stuckCount ?? 0) === 0) {
      await supabase.from('guardian_alerts')
        .update({ resolved_at: now })
        .in('check_type', ['queue_stuck', 'zero_sends_streak'])
        .is('resolved_at', null);
    }

    // ── Registrar alertas novos ───────────────────────────────────────────────
    for (const alert of alerts) {
      await supabase.from('guardian_alerts').insert({
        check_type: alert.type,
        severity: alert.severity,
        message: alert.message,
        auto_fixed: alert.fixed,
        created_at: now,
      });
    }

    // ── Heartbeat ─────────────────────────────────────────────────────────────
    await supabase.from('guardian_alerts').insert({
      check_type: 'heartbeat',
      severity: 'info',
      message: `Guardian OK — ${alerts.length} alerta(s) | ${autoFixed} auto-fix(es)`,
      auto_fixed: false,
      created_at: now,
    });

    const result = {
      checked_at: now,
      alerts: alerts.length,
      auto_fixed: autoFixed,
      details: alerts.map(a => ({ type: a.type, severity: a.severity })),
    };

    console.log(`[guardian] done — alerts=${alerts.length} auto_fixed=${autoFixed}`);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[guardian] fatal:', error.message);
    try {
      await supabase.from('guardian_alerts').insert({
        check_type: 'heartbeat',
        severity: 'high',
        message: `Guardian ERRO: ${error.message}`,
        auto_fixed: false,
        created_at: now,
      });
    } catch { /* */ }
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
