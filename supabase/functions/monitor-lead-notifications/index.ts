// monitor-lead-notifications
// Cron de vigilância: verifica leads das últimas 2h e detecta os que não
// receberam notificação WhatsApp via chip do gerente. Se ≥3 leads ficaram
// sem aviso, dispara alerta no internal_notifications + WhatsApp pro admin
// (guardian_alert_phone).
//
// Critério de "sem aviso":
//   - Lead criado há >15min e <2h
//   - broker_id atribuído + corretor ativo
//   - chip do manager existe e está online
//   - last_broker_whatsapp_at IS NULL
//
// Para evitar spam: só dispara alerta se >= threshold E não disparou nas
// últimas 2h.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALERT_THRESHOLD = 3;        // # de leads sem aviso pra alertar
const ALERT_COOLDOWN_HOURS = 2;   // não duplicar alerta dentro disso

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    // Leads dos últimos 15min~2h sem aviso WhatsApp
    const { data: leads } = await supabase
      .from('leads')
      .select('id, name, phone, broker_id, created_at, contact_attempts, last_broker_whatsapp_at')
      .gte('created_at', new Date(Date.now() - 2 * 3600 * 1000).toISOString())
      .lt('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString())
      .not('broker_id', 'is', null)
      .is('last_broker_whatsapp_at', null);

    const filtered = (leads || []).filter((l: any) =>
      l.contact_attempts === null || l.contact_attempts === 0
    );

    // Brokers + managers
    const brokerIds = Array.from(new Set(filtered.map((l: any) => l.broker_id))) as string[];
    const { data: brokers } = brokerIds.length > 0
      ? await supabase.from('profiles').select('id, first_name, lead_assignment_enabled, manager_id').in('id', brokerIds)
      : { data: [] as any[] };
    const brokerMap = new Map((brokers || []).map((b: any) => [b.id, b]));

    const managerIds = Array.from(new Set(
      (brokers || []).map((b: any) => b.manager_id).filter(Boolean)
    )) as string[];
    const { data: managers } = managerIds.length > 0
      ? await supabase.from('profiles').select('id, first_name, bot_instance_id').in('id', managerIds)
      : { data: [] as any[] };
    const managerMap = new Map((managers || []).map((m: any) => [m.id, m]));

    const botIds = Array.from(new Set(
      (managers || []).map((m: any) => m.bot_instance_id).filter(Boolean)
    )) as string[];
    const { data: bots } = botIds.length > 0
      ? await supabase.from('bot_instances').select('id, name, status').in('id', botIds)
      : { data: [] as any[] };
    const botMap = new Map((bots || []).map((b: any) => [b.id, b]));

    // Filtrar leads "esquecidos": broker ativo + chip manager online
    const orphans: any[] = [];
    for (const l of filtered as any[]) {
      const b = brokerMap.get(l.broker_id);
      if (!b || !b.lead_assignment_enabled) continue;
      if ((b.first_name || '').includes('[INATIVO]')) continue;
      const m = b.manager_id ? managerMap.get(b.manager_id) : null;
      if (!m?.bot_instance_id) continue;
      const bot = botMap.get(m.bot_instance_id);
      if (!bot || !['open', 'active', 'connected'].includes(bot.status)) continue;
      orphans.push({
        lead_id: l.id, lead_name: l.name, lead_age_min: Math.round((Date.now() - new Date(l.created_at).getTime()) / 60000),
        broker_name: b.first_name, manager_name: m.first_name, manager_bot: bot.name,
      });
    }

    if (orphans.length < ALERT_THRESHOLD) {
      return new Response(JSON.stringify({
        success: true, orphans: orphans.length, threshold: ALERT_THRESHOLD, alerted: false,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Cooldown — não disparar de novo em <2h
    const cooldownAgo = new Date(Date.now() - ALERT_COOLDOWN_HOURS * 3600 * 1000).toISOString();
    const { data: recent } = await supabase
      .from('internal_notifications')
      .select('id').eq('type', 'NOTIFICATION_FAILURE_DETECTED')
      .gte('created_at', cooldownAgo).limit(1);
    if (recent && recent.length > 0) {
      return new Response(JSON.stringify({
        success: true, orphans: orphans.length, alerted: false, reason: 'cooldown',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Buscar admin/superintendents pra notificar
    const { data: admins } = await supabase
      .from('profiles').select('id').in('role', ['ADMIN', 'SUPERINTENDENT']);

    const summary = orphans.slice(0, 10).map(o =>
      `• ${o.lead_name} (${o.lead_age_min}min) → ${o.broker_name}/${o.manager_name}`
    ).join('\n');

    const message = `${orphans.length} lead(s) chegaram nas últimas 2h e ainda não receberam aviso WhatsApp via chip do gerente. Verificar incoming-lead e send_whatsapp_message.\n\n${summary}`;

    if (admins && admins.length > 0) {
      await supabase.from('internal_notifications').insert(
        admins.map((a: any) => ({
          to_id: a.id,
          type: 'NOTIFICATION_FAILURE_DETECTED',
          message,
        }))
      );
    }

    // Alerta WhatsApp pra guardian_alert_phone (se configurado)
    const { data: guardianSetting } = await supabase
      .from('system_settings').select('value').eq('key', 'guardian_alert_phone').maybeSingle();
    const { data: notifBotSetting } = await supabase
      .from('system_settings').select('value').eq('key', 'notification_bot_instance_id').maybeSingle();
    const phone = guardianSetting?.value;
    const botId = notifBotSetting?.value;

    let whatsappSent = false;
    if (phone && botId && phone !== 'null' && botId !== 'null') {
      const { data: r } = await supabase.functions.invoke('send_whatsapp_message', {
        body: {
          botId, phone: String(phone).replace(/['"]/g, ''),
          message: `🚨 *Alerta CRM*\n\n${message}`,
          send_source: 'broker_manual',
        },
      });
      whatsappSent = r?.success === true;
    }

    return new Response(JSON.stringify({
      success: true, orphans: orphans.length, alerted: true,
      admins_notified: admins?.length || 0, whatsapp_sent: whatsappSent,
      sample: orphans.slice(0, 5),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[monitor-lead-notifications] erro:', e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
