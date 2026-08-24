import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function hoursAgo(iso: string | null): number {
  if (!iso) return 9999;
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

function daysAgo(iso: string | null): number {
  if (!iso) return 9999;
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

async function sendAlert(supabase: any, botInstanceId: string, phone: string, message: string) {
  try {
    await supabase.functions.invoke('send_whatsapp_message', {
      body: { botId: botInstanceId, phone, message },
    });
  } catch { /* silencioso */ }
}

async function upsertAlert(
  supabase: any,
  type: string,
  severity: string,
  message: string,
  fixed: boolean,
  now: string,
): Promise<void> {
  const windowStart = new Date(Date.now() - 23 * 3600000).toISOString();
  const { data: existing } = await supabase
    .from('guardian_alerts')
    .select('id')
    .eq('check_type', type)
    .is('resolved_at', null)
    .gte('created_at', windowStart)
    .maybeSingle();

  if (existing) return;

  await supabase.from('guardian_alerts').insert({
    check_type: type,
    severity,
    message,
    auto_fixed: fixed,
    created_at: now,
  });
}

async function cleanupAlerts(supabase: any): Promise<number> {
  let deleted = 0;
  const { count: h } = await supabase
    .from('guardian_alerts')
    .delete({ count: 'exact' })
    .eq('check_type', 'heartbeat')
    .lt('created_at', new Date(Date.now() - 48 * 3600000).toISOString());
  deleted += h ?? 0;

  const { count: r } = await supabase
    .from('guardian_alerts')
    .delete({ count: 'exact' })
    .not('resolved_at', 'is', null)
    .lt('resolved_at', new Date(Date.now() - 7 * 86400000).toISOString());
  deleted += r ?? 0;

  const { count: old } = await supabase
    .from('guardian_alerts')
    .delete({ count: 'exact' })
    .lt('created_at', new Date(Date.now() - 30 * 86400000).toISOString());
  deleted += old ?? 0;

  return deleted;
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
  let checksRun = 0;

  try {
    const deletedAlerts = await cleanupAlerts(supabase);
    if (deletedAlerts > 0) {
      console.log(`[guardian] 🧹 Limpeza: ${deletedAlerts} alertas antigos removidos.`);
    }

    const [{ data: notifBotSetting }, { data: alertPhoneSetting }] = await Promise.all([
      supabase.from('system_settings').select('value').eq('key', 'notification_bot_instance_id').maybeSingle(),
      supabase.from('system_settings').select('value').eq('key', 'guardian_alert_phone').maybeSingle(),
    ]);

    const notifBotId: string | null = notifBotSetting?.value ?? null;
    const alertPhone: string | null = alertPhoneSetting?.value ?? null;
    const canAlert = !!(notifBotId && alertPhone);

    // CHECK 1: Bots offline > 2h
    checksRun++;
    const twoHAgo = new Date(Date.now() - 2 * 3600000).toISOString();
    const { data: offlineBots } = await supabase
      .from('bot_instances')
      .select('name, instance_name, status, updated_at')
      .eq('status', 'offline')
      .lt('updated_at', twoHAgo);

    for (const bot of offlineBots || []) {
      const h = hoursAgo(bot.updated_at);
      const msg = `🔴 Bot offline: *${bot.name}* (${bot.instance_name}) está OFFLINE há ${h.toFixed(0)}h. Reconecte no painel Evolution.`;
      alerts.push({ type: 'bot_offline', severity: 'high', message: msg, fixed: false });
      if (canAlert && Math.round(h) === 2) {
        await sendAlert(supabase, notifBotId!, alertPhone!, msg);
      }
    }

    if ((offlineBots?.length ?? 0) === 0) {
      await supabase.from('guardian_alerts').update({ resolved_at: now }).eq('check_type', 'bot_offline').is('resolved_at', null);
    }

    // CHECK 2: lead_activation_queue parado > 3h
    checksRun++;
    const threeHAgo = new Date(Date.now() - 3 * 3600000).toISOString();
    const { count: stuckCount } = await supabase
      .from('lead_activation_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lt('scheduled_for', threeHAgo);

    if ((stuckCount ?? 0) > 0) {
      const { data: stuckItems } = await supabase
        .from('lead_activation_queue')
        .select('id, lead_id')
        .eq('status', 'pending')
        .lt('scheduled_for', threeHAgo)
        .limit(50);

      let fixedCount = 0;
      for (const item of stuckItems || []) {
        const { data: lead } = await supabase.from('leads').select('status, broker_id').eq('id', item.lead_id).maybeSingle();
        if (!lead || ['CONCLUDED', 'ABANDONED', 'EXCLUDED'].includes((lead.status || '').toUpperCase())) {
          await supabase.from('lead_activation_queue').update({ status: 'cancelled', cancel_reason: 'guardian_orphan_cleanup' }).eq('id', item.id);
          fixedCount++;
        } else if (!lead.broker_id) {
          await supabase.from('lead_activation_queue').update({ status: 'cancelled', cancel_reason: 'guardian_no_broker' }).eq('id', item.id);
          fixedCount++;
        }
      }
      autoFixed += fixedCount;

      const remaining = (stuckCount ?? 0) - fixedCount;
      if (remaining > 0) {
        alerts.push({ type: 'queue_stuck', severity: 'medium', message: `⏰ Fila parada: ${remaining} item(ns) pendente(s) há 3h+ sem ser processado(s).`, fixed: false });
      }
      if (fixedCount > 0) {
        alerts.push({ type: 'queue_stuck', severity: 'info', message: `🔧 Auto-fix: ${fixedCount} item(ns) órfão(s) cancelado(s) da fila.`, fixed: true });
      }
    } else {
      await supabase.from('guardian_alerts').update({ resolved_at: now }).in('check_type', ['queue_stuck', 'zero_sends_streak']).is('resolved_at', null);
    }

    // CHECK 3: Streak de 0 envios pelo Cérebro
    checksRun++;
    const { data: recentCerebroRuns } = await supabase
      .from('cerebro_runs')
      .select('processed, rescheduled, ran_at')
      .order('ran_at', { ascending: false })
      .limit(6);

    if ((recentCerebroRuns?.length ?? 0) >= 5) {
      const allZeroSends = recentCerebroRuns!.slice(0, 5).every(r => (r.processed ?? 0) === 0);
      const hasQueueItems = (stuckCount ?? 0) > 0;
      if (allZeroSends && hasQueueItems) {
        const msg = `🚨 Streak de 0 envios: Cérebro rodou 5 vezes sem enviar nada com ${stuckCount} item(ns) na fila.`;
        alerts.push({ type: 'zero_sends_streak', severity: 'high', message: msg, fixed: false });
        if (canAlert) await sendAlert(supabase, notifBotId!, alertPhone!, msg);
      }
    }

    // CHECK 4: Acúmulo de falhas permanentes
    checksRun++;
    const { count: permanentFailCount } = await supabase
      .from('lead_activation_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('attempts', 5);

    if ((permanentFailCount ?? 0) > 10) {
      alerts.push({ type: 'failed_buildup', severity: 'medium', message: `📛 ${permanentFailCount} lead(s) falharam 5+ vezes. Verifique as credenciais dos bots no Evolution API.`, fixed: false });
    } else {
      await supabase.from('guardian_alerts').update({ resolved_at: now }).eq('check_type', 'failed_buildup').is('resolved_at', null);
    }

    // CHECK 5: Corretores sem bot
    checksRun++;
    const { data: brokersWithoutBot } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('role', 'BROKER')
      .eq('lead_assignment_enabled', true)
      .is('bot_instance_id', null);

    if ((brokersWithoutBot?.length ?? 0) > 0) {
      const names = (brokersWithoutBot || []).map(b => `${b.first_name || ''} ${b.last_name || ''}`.trim()).join(', ');
      alerts.push({ type: 'broker_no_bot', severity: 'medium', message: `👤 ${brokersWithoutBot!.length} corretor(es) ativo(s) sem bot WhatsApp: ${names}.`, fixed: false });
    } else {
      await supabase.from('guardian_alerts').update({ resolved_at: now }).eq('check_type', 'broker_no_bot').is('resolved_at', null);
    }

    // CHECK 6: ai_coach_queue preso > 15min — AUTO-FIX
    checksRun++;
    const fifteenMinAgo = new Date(Date.now() - 15 * 60000).toISOString();
    const { data: stuckCoach } = await supabase
      .from('ai_coach_queue')
      .select('id')
      .eq('status', 'processing')
      .lt('created_at', fifteenMinAgo);

    if ((stuckCoach?.length ?? 0) > 0) {
      await supabase.from('ai_coach_queue').update({ status: 'pending' }).eq('status', 'processing').lt('created_at', fifteenMinAgo);
      autoFixed += stuckCoach!.length;
      alerts.push({ type: 'ai_coach_stuck', severity: 'medium', message: `🔧 Auto-fix: ${stuckCoach!.length} item(ns) de AI Coach presos — resetados para pending.`, fixed: true });
    } else {
      await supabase.from('guardian_alerts').update({ resolved_at: now }).eq('check_type', 'ai_coach_stuck').is('resolved_at', null);
    }

    // CHECK 7: Leads NEW > 3h sem contato
    checksRun++;
    const { data: untouchedLeads } = await supabase
      .from('leads')
      .select('id, name, broker_id, created_at')
      .eq('status', 'NEW')
      .is('last_broker_whatsapp_at', null)
      .lt('created_at', threeHAgo)
      .not('broker_id', 'is', null)
      .limit(20);

    if ((untouchedLeads?.length ?? 0) > 0) {
      const oldest = untouchedLeads!.reduce((acc, l) => new Date(l.created_at) < new Date(acc.created_at) ? l : acc);
      const msg = `⚠️ ${untouchedLeads!.length} lead(s) NEW sem contato do bot há 3h+. Mais antigo: "${oldest.name}" (${hoursAgo(oldest.created_at).toFixed(0)}h).`;
      alerts.push({ type: 'leads_orphaned', severity: 'high', message: msg, fixed: false });
      if (canAlert) await sendAlert(supabase, notifBotId!, alertPhone!, msg);
    } else {
      await supabase.from('guardian_alerts').update({ resolved_at: now }).eq('check_type', 'leads_orphaned').is('resolved_at', null);
    }

    // CHECK 8: Leads NEGOTIATING > 15 dias
    checksRun++;
    const fifteenDaysAgo = new Date(Date.now() - 15 * 86400000).toISOString();
    const { data: staleNegoc } = await supabase
      .from('leads')
      .select('id, name, broker_id, negotiating_since')
      .eq('status', 'NEGOTIATING')
      .lt('negotiating_since', fifteenDaysAgo)
      .limit(20);

    if ((staleNegoc?.length ?? 0) > 0) {
      alerts.push({
        type: 'negotiating_stale', severity: 'medium',
        message: `🕒 ${staleNegoc!.length} lead(s) em NEGOCIAÇÃO há mais de 15 dias.`,
        fixed: false,
      });
    } else {
      await supabase.from('guardian_alerts').update({ resolved_at: now }).eq('check_type', 'negotiating_stale').is('resolved_at', null);
    }

    // CHECK 9: Agentes principais desativados
    checksRun++;
    const { data: agentSettings } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['cerebro_enabled', 'agente_redistribuicao_enabled', 'agente_recuperacao_enabled']);

    const allDisabled = (agentSettings || []).every(s => s.value === 'false' || s.value === false);
    if (allDisabled && (agentSettings?.length ?? 0) >= 3) {
      alerts.push({ type: 'heartbeat', severity: 'info', message: `🔕 Todos os agentes principais (Cérebro, Redistribuição, Recuperação) estão DESATIVADOS. Sistema em modo manual.`, fixed: false });
    }

    // ════════════════════════════════════════════════════════════════════════
    // CHECK 10 (NOVO): Cron com erro silencioso (succeeded mas return_message com ERROR)
    // ════════════════════════════════════════════════════════════════════════
    checksRun++;
    try {
      const { data: cronErrors } = await supabase.rpc('guardian_check_cron_errors_24h');
      if ((cronErrors?.length ?? 0) > 0) {
        const summary = cronErrors!.slice(0, 3).map((e: any) => `${e.jobname} (${e.error_count}x)`).join(', ');
        const msg = `⚠️ Cron com erro silencioso: ${cronErrors!.length} job(s) reportando ERROR mas marcados succeeded em 24h. Topo: ${summary}.`;
        alerts.push({ type: 'cron_silent_error', severity: 'high', message: msg, fixed: false });
        if (canAlert) await sendAlert(supabase, notifBotId!, alertPhone!, msg);
        console.log(`[guardian] ⚠️ ${msg}`);
      } else {
        await supabase.from('guardian_alerts').update({ resolved_at: now }).eq('check_type', 'cron_silent_error').is('resolved_at', null);
      }
    } catch (e: any) {
      console.warn('[guardian] CHECK 10 skip:', e.message);
    }

    // ════════════════════════════════════════════════════════════════════════
    // CHECK 11 (NOVO): Drift de envio — agentes rodando mas 0 outgoing em 24h
    // ════════════════════════════════════════════════════════════════════════
    checksRun++;
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 3600000).toISOString();
      const { count: outgoingCount } = await supabase
        .from('ia_messages')
        .select('id', { count: 'exact', head: true })
        .eq('direction', 'outgoing')
        .in('sender_type', ['ia', 'broker'])
        .gte('created_at', oneDayAgo);

      const { data: cronCount } = await supabase.rpc('guardian_active_cron_count_24h');
      const totalCronRuns = Number(cronCount) || 0;

      if ((outgoingCount ?? 0) === 0 && totalCronRuns > 50) {
        const msg = `🔇 Drift de envio: ${totalCronRuns} execuções de cron em 24h mas 0 mensagens outgoing geradas. Algum agente está silenciado ou todos os bots estão offline.`;
        alerts.push({ type: 'function_send_drift', severity: 'high', message: msg, fixed: false });
        if (canAlert) await sendAlert(supabase, notifBotId!, alertPhone!, msg);
        console.log(`[guardian] ⚠️ ${msg}`);
      } else {
        await supabase.from('guardian_alerts').update({ resolved_at: now }).eq('check_type', 'function_send_drift').is('resolved_at', null);
      }
    } catch (e: any) {
      console.warn('[guardian] CHECK 11 skip:', e.message);
    }

    // ════════════════════════════════════════════════════════════════════════
    // CHECK 12 (NOVO): Webhook direction ratio — bug de classificação fromMe
    // ════════════════════════════════════════════════════════════════════════
    checksRun++;
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 3600000).toISOString();
      const { count: webhookEvents } = await supabase
        .from('webhook_logs')
        .select('id', { count: 'exact', head: true })
        .eq('integration_key', 'evolution')
        .gte('created_at', oneDayAgo);

      const { count: incomingMsgs } = await supabase
        .from('ia_messages')
        .select('id', { count: 'exact', head: true })
        .eq('direction', 'incoming')
        .eq('sender_type', 'lead')
        .gte('created_at', oneDayAgo);

      const we = webhookEvents ?? 0;
      const im = incomingMsgs ?? 0;

      // Sintoma: muitos eventos da Evolution mas pouquíssimos incoming registrados
      // Threshold: webhook >500 e ratio webhook/incoming > 100 (ou incoming = 0)
      if (we > 500 && (im === 0 || we / Math.max(im, 1) > 100)) {
        const msg = `🔄 Direção possivelmente invertida: ${we} eventos da Evolution em 24h mas só ${im} ia_messages incoming. Ratio ${(we / Math.max(im, 1)).toFixed(0)}:1. Suspeita: webhook_receiver classificando fromMe errado.`;
        alerts.push({ type: 'webhook_direction_ratio', severity: 'high', message: msg, fixed: false });
        if (canAlert) await sendAlert(supabase, notifBotId!, alertPhone!, msg);
        console.log(`[guardian] ⚠️ ${msg}`);
      } else {
        await supabase.from('guardian_alerts').update({ resolved_at: now }).eq('check_type', 'webhook_direction_ratio').is('resolved_at', null);
      }
    } catch (e: any) {
      console.warn('[guardian] CHECK 12 skip:', e.message);
    }

    // ════════════════════════════════════════════════════════════════════════
    // CHECK 13 (NOVO): Profiles [INATIVO] com leads ativos atribuídos
    // ════════════════════════════════════════════════════════════════════════
    checksRun++;
    try {
      const { data: orphans } = await supabase.rpc('guardian_check_inactive_with_leads');
      if ((orphans?.length ?? 0) > 0) {
        const total = (orphans || []).reduce((sum: number, o: any) => sum + Number(o.active_leads || 0), 0);
        const top3 = (orphans || []).slice(0, 3).map((o: any) => `${o.profile_name}: ${o.active_leads}`).join(', ');
        const msg = `👻 ${total} lead(s) ativos atribuídos a ${orphans!.length} profile(s) INATIVOS: ${top3}${orphans!.length > 3 ? '…' : ''}`;
        alerts.push({ type: 'inactive_with_active_leads', severity: 'high', message: msg, fixed: false });
        if (canAlert) await sendAlert(supabase, notifBotId!, alertPhone!, msg);
        console.log(`[guardian] ⚠️ ${msg}`);
      } else {
        await supabase.from('guardian_alerts').update({ resolved_at: now }).eq('check_type', 'inactive_with_active_leads').is('resolved_at', null);
      }
    } catch (e: any) {
      console.warn('[guardian] CHECK 13 skip:', e.message);
    }

    // Registrar alertas com deduplicação
    for (const alert of alerts) {
      await upsertAlert(supabase, alert.type, alert.severity, alert.message, alert.fixed, now);
    }

    // Heartbeat
    const issuesFound = alerts.filter(a => !a.fixed).length;
    await upsertAlert(
      supabase,
      'heartbeat',
      issuesFound > 0 ? 'medium' : 'info',
      `Guardian OK — ${checksRun} checks | ${alerts.length} alerta(s) | ${autoFixed} auto-fix(es) | ${deletedAlerts} antigos removidos`,
      false,
      now,
    );

    await supabase.from('system_health_log').insert({
      run_at: now,
      checks_run: checksRun,
      issues_found: issuesFound,
      auto_fixed: autoFixed,
      summary_json: {
        checks: checksRun,
        alerts: alerts.map(a => ({ type: a.type, severity: a.severity, fixed: a.fixed })),
        cleaned: deletedAlerts,
      },
    }).then(() => {}).catch(() => {});

    console.log(`[guardian] done — checks=${checksRun} alerts=${alerts.length} auto_fixed=${autoFixed} cleaned=${deletedAlerts}`);

    return new Response(
      JSON.stringify({ checked_at: now, checks_run: checksRun, alerts: alerts.length, issues_found: issuesFound, auto_fixed: autoFixed, cleaned: deletedAlerts }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error: any) {
    console.error('[guardian] fatal:', error.message);
    try {
      await supabase.from('guardian_alerts').insert({
        check_type: 'heartbeat', severity: 'high',
        message: `Guardian ERRO FATAL: ${error.message}`,
        auto_fixed: false, created_at: now,
      });
    } catch { /* */ }
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
