import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─────────────────────────────────────────────────────────────────────────────
// notify-disconnected-managers
//
// Detecta managers cujo chip WhatsApp esteja offline (status != open) há mais
// de 30 minutos e dispara alerta WhatsApp do bot global de notificação
// (notification_bot_instance_id). Cooldown de 4h por manager. Janela 8-21h BRT.
//
// Flag: system_settings.notify_disconnected_managers_enabled (default ON).
// Dedup: automation_logs entity_type='manager_offline_alert'.
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OFFLINE_THRESHOLD_MIN = 30;
const COOLDOWN_HOURS = 4;
const WINDOW_START_BRT_H = 8;
const WINDOW_END_BRT_H = 21;

function isWithinWindow(): boolean {
  const brtNow = new Date(Date.now() - 3 * 3600000);
  const h = brtNow.getUTCHours();
  return h >= WINDOW_START_BRT_H && h < WINDOW_END_BRT_H;
}

function buildMessage(managerName: string, instanceName: string): string {
  return [
    `Oi ${managerName}, aqui é o Junior 🚨`,
    ``,
    `Seu chip *"${instanceName}"* está *desconectado* da Comandra agora.`,
    ``,
    `Isso significa que sua equipe não está recebendo:`,
    `• Avisos de novos leads chegando`,
    `• Cobranças e notificações de tarefas`,
    `• Briefing matinal automático`,
    ``,
    `*Como reconectar (urgente):*`,
    `1. Abra a Comandra`,
    `2. No topo do painel, click em "Conectar"`,
    `3. Escaneie o QR Code com o celular do chip`,
    ``,
    `Faz isso assim que possível, beleza? Sem o chip ativo a galera da sua equipe fica no escuro.`,
    ``,
    `Qualquer dúvida me chama 👊`,
  ].join('\n');
}

async function safeInsertLog(supabase: any, payload: any): Promise<void> {
  try {
    await supabase.from('automation_logs').insert(payload);
  } catch (_e) {}
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  );

  const body = await req.json().catch(() => ({}));
  const forceRun = body.force === true;
  const dryRun = body.dryRun === true;
  const onlyManagerId: string | null = body.onlyManagerId ?? null;

  // ── Flag enabled ─────────────────────────────────────────────────────────
  const { data: enabledSetting } = await supabase
    .from('system_settings').select('value')
    .eq('key', 'notify_disconnected_managers_enabled').maybeSingle();

  // Default ON: se a chave não existe ou o valor é qualquer coisa exceto 'false', roda
  const enabledRaw = enabledSetting?.value;
  if (enabledRaw !== undefined && String(enabledRaw) === 'false') {
    return new Response(JSON.stringify({ skipped: 'disabled' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Janela horária ───────────────────────────────────────────────────────
  if (!forceRun && !isWithinWindow()) {
    return new Response(JSON.stringify({ skipped: 'outside_window' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // ── Bot de notificação global (Junior) ─────────────────────────────────
    const { data: notifBotSetting } = await supabase
      .from('system_settings').select('value')
      .eq('key', 'notification_bot_instance_id').maybeSingle();
    const notificationBotId: string | null = notifBotSetting?.value ?? null;

    if (!notificationBotId) {
      return new Response(JSON.stringify({ skipped: 'no_notification_bot' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verifica se o bot de notificação está online
    const { data: notifBot } = await supabase
      .from('bot_instances').select('id, status, instance_name')
      .eq('id', notificationBotId).maybeSingle();

    if (!notifBot || (notifBot.status !== 'open' && notifBot.status !== 'connected')) {
      // Não pode mandar alerta se o próprio chip de alerta está offline
      await safeInsertLog(supabase, {
        entity_type: 'manager_offline_alert',
        entity_id: notificationBotId,
        status: 'failed',
        message_sent: null,
        error_message: 'notification_bot_itself_offline',
        executed_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ skipped: 'notification_bot_offline', botStatus: notifBot?.status ?? null }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Busca managers com bot atribuído ──────────────────────────────────
    let mgrQuery = supabase
      .from('profiles')
      .select(`
        id, first_name, phone, bot_instance_id,
        bot_instances!profiles_bot_instance_id_fkey ( id, status, instance_name, name, updated_at )
      `)
      .eq('role', 'MANAGER')
      .not('phone', 'is', null)
      .neq('phone', '')
      .not('bot_instance_id', 'is', null)
      .not('first_name', 'ilike', '%[INATIVO]%');
    if (onlyManagerId) mgrQuery = mgrQuery.eq('id', onlyManagerId);

    const { data: managers } = await mgrQuery;

    if (!managers?.length) {
      return new Response(JSON.stringify({ alerted: 0, reason: 'no_managers' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Filtra os offline >= 30min ────────────────────────────────────────
    const thresholdAt = new Date(Date.now() - OFFLINE_THRESHOLD_MIN * 60 * 1000);
    const offlineManagers = managers.filter((m: any) => {
      const bot = m.bot_instances;
      if (!bot) return false;
      const status = String(bot.status || '').toLowerCase();
      if (status === 'open' || status === 'connected') return false;
      const updatedAt = bot.updated_at ? new Date(bot.updated_at) : null;
      if (!updatedAt) return true; // sem timestamp confiável → considerar offline
      return updatedAt <= thresholdAt;
    });

    if (!offlineManagers.length) {
      return new Response(JSON.stringify({ alerted: 0, reason: 'all_online_or_recent', total: managers.length }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Cooldown 4h: quem foi alertado nas últimas 4h ────────────────────
    const cooldownCutoff = new Date(Date.now() - COOLDOWN_HOURS * 3600000).toISOString();
    const offlineIds = offlineManagers.map((m: any) => m.id);
    const { data: recentAlerts } = await supabase
      .from('automation_logs')
      .select('entity_id, executed_at')
      .eq('entity_type', 'manager_offline_alert')
      .eq('status', 'success')
      .in('entity_id', offlineIds)
      .gte('executed_at', cooldownCutoff);

    const onCooldown = new Set((recentAlerts || []).map((r: any) => r.entity_id));

    let alerted = 0;
    let onCooldownCount = 0;
    let failed = 0;
    const samplePreview: any[] = [];

    for (const mgr of offlineManagers) {
      if (onCooldown.has(mgr.id)) { onCooldownCount++; continue; }

      const firstName = mgr.first_name || 'Manager';
      const instanceName = mgr.bot_instances?.instance_name || mgr.bot_instances?.name || 'principal';
      const message = buildMessage(firstName, instanceName);

      if (dryRun) {
        samplePreview.push({ manager: firstName, phone: mgr.phone, instanceName, message });
        alerted++;
        continue;
      }

      let sendOk = false;
      let sendErr: string | null = null;
      try {
        const { data: result, error } = await supabase.functions.invoke('send_whatsapp_message', {
          body: { botId: notificationBotId, phone: mgr.phone, message },
        });
        if (error) sendErr = error.message || 'invoke_error';
        else if (result?.success) sendOk = true;
        else sendErr = result?.error || 'send_failed';
      } catch (e: any) {
        sendErr = e?.message || 'invoke_exception';
      }

      await safeInsertLog(supabase, {
        entity_type: 'manager_offline_alert',
        entity_id: mgr.id,
        status: sendOk ? 'success' : 'failed',
        message_sent: message,
        recipient_phone: mgr.phone,
        executed_at: new Date().toISOString(),
        error_message: sendOk ? null : sendErr,
      });

      if (sendOk) {
        alerted++;
        console.log(`[notify-disconnected-mgr] OK ${firstName} chip=${instanceName}`);
      } else {
        failed++;
        console.warn(`[notify-disconnected-mgr] FAIL ${firstName} - ${sendErr}`);
      }
    }

    return new Response(
      JSON.stringify({
        alerted,
        onCooldown: onCooldownCount,
        failed,
        offline_total: offlineManagers.length,
        managers_total: managers.length,
        dryRun,
        samplePreview: dryRun ? samplePreview.slice(0, 3) : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[notify-disconnected-mgr] fatal:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
