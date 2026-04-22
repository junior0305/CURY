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
  let checksRun = 0;

  try {
    // ── Carregar configurações ─────────────────────────────────────────────
    const [{ data: notifBotSetting }, { data: alertPhoneSetting }] = await Promise.all([
      supabase.from('system_settings').select('value').eq('key', 'notification_bot_instance_id').maybeSingle(),
      supabase.from('system_settings').select('value').eq('key', 'guardian_alert_phone').maybeSingle(),
    ]);

    const notifBotId: string | null = notifBotSetting?.value ?? null;
    const alertPhone: string | null = alertPhoneSetting?.value ?? null;
    const canAlert = !!(notifBotId && alertPhone);

    // ════════════════════════════════════════════════════════════════════════
    // CHECK 1: Bots offline > 2h
    // ════════════════════════════════════════════════════════════════════════
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
      console.log(`[guardian] ⚠️ ${msg}`);
    }

    if ((offlineBots?.length ?? 0) === 0) {
      await supabase.from('guardian_alerts')
        .update({ resolved_at: now })
        .eq('check_type', 'bot_offline')
        .is('resolved_at', null);
    }

    // ════════════════════════════════════════════════════════════════════════
    // CHECK 2: lead_activation_queue itens parados há > 3h
    // ════════════════════════════════════════════════════════════════════════
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
    } else {
      await supabase.from('guardian_alerts')
        .update({ resolved_at: now })
        .in('check_type', ['queue_stuck', 'zero_sends_streak'])
        .is('resolved_at', null);
    }

    // ════════════════════════════════════════════════════════════════════════
    // CHECK 3: Streak de 0 envios pelo Cérebro
    // ════════════════════════════════════════════════════════════════════════
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
        const msg = `🚨 Streak de 0 envios: Cérebro rodou 5 vezes seguidas sem enviar nada, mas há ${stuckCount} item(ns) na fila. Verifique os bots e a conexão com Evolution API.`;
        alerts.push({ type: 'zero_sends_streak', severity: 'high', message: msg, fixed: false });
        if (canAlert) await sendAlert(supabase, notifBotId!, alertPhone!, msg);
        console.log(`[guardian] 🚨 ${msg}`);
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // CHECK 4: Acúmulo de falhas permanentes (attempts >= 5)
    // ════════════════════════════════════════════════════════════════════════
    checksRun++;
    const { count: permanentFailCount } = await supabase
      .from('lead_activation_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('attempts', 5);

    if ((permanentFailCount ?? 0) > 10) {
      const msg = `📛 ${permanentFailCount} lead(s) falharam 5+ vezes e não serão retentados. Verifique as credenciais dos bots no Evolution API.`;
      alerts.push({ type: 'failed_buildup', severity: 'medium', message: msg, fixed: false });
      console.log(`[guardian] ⚠️ ${msg}`);
    }

    // ════════════════════════════════════════════════════════════════════════
    // CHECK 5: Corretores sem bot atribuído
    // ════════════════════════════════════════════════════════════════════════
    checksRun++;
    const { data: brokersWithoutBot } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('role', 'BROKER')
      .eq('lead_assignment_enabled', true)
      .is('bot_instance_id', null);

    if ((brokersWithoutBot?.length ?? 0) > 0) {
      const names = (brokersWithoutBot || []).map(b => `${b.first_name || ''} ${b.last_name || ''}`.trim()).join(', ');
      const msg = `👤 ${brokersWithoutBot!.length} corretor(es) ativo(s) sem bot WhatsApp: ${names}. Leads desses corretores não receberão follow-up automático.`;
      alerts.push({ type: 'broker_no_bot', severity: 'medium', message: msg, fixed: false });
      console.log(`[guardian] ⚠️ ${msg}`);
    }

    // ════════════════════════════════════════════════════════════════════════
    // CHECK 6: ai_coach_queue preso em 'processing' > 15min — AUTO-FIX
    // ════════════════════════════════════════════════════════════════════════
    checksRun++;
    const fifteenMinAgo = new Date(Date.now() - 15 * 60000).toISOString();
    const { data: stuckCoach } = await supabase
      .from('ai_coach_queue')
      .select('id, broker_id')
      .eq('status', 'processing')
      .lt('created_at', fifteenMinAgo);

    if ((stuckCoach?.length ?? 0) > 0) {
      await supabase
        .from('ai_coach_queue')
        .update({ status: 'pending' })
        .eq('status', 'processing')
        .lt('created_at', fifteenMinAgo);

      autoFixed += stuckCoach!.length;
      const msg = `🔧 Auto-fix: ${stuckCoach!.length} item(ns) da fila de AI Coach presos em 'processing' há >15min — resetados para 'pending'.`;
      alerts.push({ type: 'ai_coach_stuck', severity: 'medium', message: msg, fixed: true });
      console.log(`[guardian] ✅ ${msg}`);
    } else {
      await supabase.from('guardian_alerts')
        .update({ resolved_at: now })
        .eq('check_type', 'ai_coach_stuck')
        .is('resolved_at', null);
    }

    // ════════════════════════════════════════════════════════════════════════
    // CHECK 7: Leads NEW > 3h sem nenhum envio real (bot nunca mandou nada)
    // Critério correto: last_broker_whatsapp_at IS NULL
    // contact_attempts=0 NÃO detecta boas-vindas (que não incrementa o campo),
    // gerando falsos positivos — corretores recebiam avisos mesmo com bot ativo.
    // ════════════════════════════════════════════════════════════════════════
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
      const oldest = untouchedLeads!.reduce((acc, l) =>
        new Date(l.created_at) < new Date(acc.created_at) ? l : acc
      );
      const oldestHours = hoursAgo(oldest.created_at).toFixed(0);
      const msg = `⚠️ ${untouchedLeads!.length} lead(s) NEW com corretor atribuído sem nenhum envio do bot há 3h+. Mais antigo: "${oldest.name}" (${oldestHours}h). Verifique se os bots estão conectados.`;
      alerts.push({ type: 'leads_orphaned', severity: 'high', message: msg, fixed: false });
      if (canAlert) await sendAlert(supabase, notifBotId!, alertPhone!, msg);
      console.log(`[guardian] ⚠️ ${msg}`);
    } else {
      await supabase.from('guardian_alerts')
        .update({ resolved_at: now })
        .eq('check_type', 'leads_orphaned')
        .is('resolved_at', null);
    }

    // ════════════════════════════════════════════════════════════════════════
    // CHECK 8: Leads NEGOTIATING > 15 dias sem atualização — alerta gerente
    // ════════════════════════════════════════════════════════════════════════
    checksRun++;
    const fifteenDaysAgo = new Date(Date.now() - 15 * 86400000).toISOString();
    const { data: staleNegoc } = await supabase
      .from('leads')
      .select('id, name, broker_id, negotiating_since')
      .eq('status', 'NEGOTIATING')
      .lt('negotiating_since', fifteenDaysAgo)
      .limit(20);

    if ((staleNegoc?.length ?? 0) > 0) {
      const msg = `🕒 ${staleNegoc!.length} lead(s) em NEGOCIAÇÃO há mais de 15 dias sem avançar: ${staleNegoc!.map(l => `"${l.name}" (${daysAgo(l.negotiating_since).toFixed(0)}d)`).join(', ')}. Considere redistribuição ou intervenção do gerente.`;
      alerts.push({ type: 'negotiating_stale', severity: 'medium', message: msg, fixed: false });
      console.log(`[guardian] ⚠️ ${msg}`);

      // Notificar gerentes dos corretores afetados
      if (canAlert) {
        const brokerIds = [...new Set(staleNegoc!.map(l => l.broker_id).filter(Boolean))];
        for (const brokerId of brokerIds) {
          const { data: broker } = await supabase
            .from('profiles')
            .select('first_name, manager_id')
            .eq('id', brokerId)
            .maybeSingle();
          if (broker?.manager_id) {
            const { data: manager } = await supabase
              .from('profiles')
              .select('whatsapp_number, bot_instance_id')
              .eq('id', broker.manager_id)
              .maybeSingle();
            if (manager?.whatsapp_number && manager?.bot_instance_id) {
              const brokerLeads = staleNegoc!.filter(l => l.broker_id === brokerId);
              await sendAlert(
                supabase,
                manager.bot_instance_id,
                manager.whatsapp_number,
                `⚠️ *Atenção Gerente!* O corretor *${broker.first_name}* tem ${brokerLeads.length} lead(s) em negociação há mais de 15 dias sem avançar. Verifique no sistema.`
              );
            }
          }
        }
      }
    } else {
      await supabase.from('guardian_alerts')
        .update({ resolved_at: now })
        .eq('check_type', 'negotiating_stale')
        .is('resolved_at', null);
    }

    // ════════════════════════════════════════════════════════════════════════
    // CHECK 9: Agentes principais desativados (risco sistêmico)
    // ════════════════════════════════════════════════════════════════════════
    checksRun++;
    const { data: agentSettings } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', ['cerebro_enabled', 'agente_redistribuicao_enabled', 'agente_recuperacao_enabled']);

    const allDisabled = (agentSettings || []).every(s => s.value === 'false' || s.value === false);
    if (allDisabled && (agentSettings?.length ?? 0) >= 3) {
      const msg = `🔕 Atenção: Todos os agentes principais (Cérebro, Redistribuição, Recuperação) estão DESATIVADOS. O sistema está operando em modo manual.`;
      alerts.push({ type: 'heartbeat', severity: 'info', message: msg, fixed: false });
      console.log(`[guardian] ℹ️ ${msg}`);
    }

    // ════════════════════════════════════════════════════════════════════════
    // Registrar alertas novos
    // ════════════════════════════════════════════════════════════════════════
    for (const alert of alerts) {
      await supabase.from('guardian_alerts').insert({
        check_type: alert.type,
        severity: alert.severity,
        message: alert.message,
        auto_fixed: alert.fixed,
        created_at: now,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // Heartbeat + system_health_log
    // ════════════════════════════════════════════════════════════════════════
    const issuesFound = alerts.filter(a => !a.fixed).length;
    const summaryJson = {
      checks: checksRun,
      alerts: alerts.map(a => ({ type: a.type, severity: a.severity, fixed: a.fixed })),
    };

    await supabase.from('guardian_alerts').insert({
      check_type: 'heartbeat',
      severity: issuesFound > 0 ? 'medium' : 'info',
      message: `Guardian OK — ${checksRun} checks | ${alerts.length} alerta(s) | ${autoFixed} auto-fix(es)`,
      auto_fixed: false,
      created_at: now,
    });

    // Log no system_health_log (ignora erro se tabela não existir ainda)
    await supabase.from('system_health_log').insert({
      run_at: now,
      checks_run: checksRun,
      issues_found: issuesFound,
      auto_fixed: autoFixed,
      summary_json: summaryJson,
    }).then(() => {}).catch(() => {});

    const result = {
      checked_at: now,
      checks_run: checksRun,
      alerts: alerts.length,
      issues_found: issuesFound,
      auto_fixed: autoFixed,
      details: alerts.map(a => ({ type: a.type, severity: a.severity, fixed: a.fixed })),
    };

    console.log(`[guardian] done — checks=${checksRun} alerts=${alerts.length} auto_fixed=${autoFixed}`);

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
        message: `Guardian ERRO FATAL: ${error.message}`,
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
