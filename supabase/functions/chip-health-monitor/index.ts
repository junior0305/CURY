// chip-health-monitor
// Roda a cada 30min via pg_cron. Conta APENAS envios frios (campaign/ai_qualification) — NAO conta msg pessoal.
// v8: persiste messages_today = cold_sends_today (metrica REAL de risco de ban), pra o painel nao dar falso alarme.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getSettings(supabase) {
  const { data } = await supabase.from('system_settings').select('key, value').like('key', 'chip_%');
  const out = {};
  for (const r of data || []) {
    const v = typeof r.value === 'string' ? r.value.replace(/^"|"$/g, '') : r.value;
    out[r.key] = v;
  }
  return out;
}

function ageDaysFromIso(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

function capForBot(bot, settings) {
  if (typeof bot.daily_limit === 'number' && bot.daily_limit > 0) return bot.daily_limit;
  const age = ageDaysFromIso(bot.created_at);
  if (bot.warmup_until && new Date(bot.warmup_until) > new Date()) return Number(settings.chip_cap_warmup_d1_7 ?? 30);
  if (age <= 7) return Number(settings.chip_cap_warmup_d1_7 ?? 30);
  if (age <= 30) return Number(settings.chip_cap_warmup_d8_30 ?? 80);
  return Number(settings.chip_cap_mature ?? 150);
}

function computeScore(m) {
  let s = 100;
  const capPct = m.cap > 0 ? m.sends_today / m.cap : 0;
  if (capPct > 0.95) s -= 20;
  else if (capPct > 0.8) s -= 10;
  s -= Math.min(50, m.optouts_24h * 8);
  if (m.responses_7d_pct < 5) s -= 15;
  else if (m.responses_7d_pct < 10) s -= 5;
  return Math.max(0, Math.min(100, s));
}

function shouldAutoPause(m, settings) {
  const abs = Number(settings.chip_optout_abs_threshold_24h ?? 3);
  const pct = Number(settings.chip_optout_pct_threshold_24h ?? 5);
  const minCount = Number(settings.chip_optout_pct_min_count ?? 2);
  if (m.optouts_24h >= abs) return { pause: true, reason: `${m.optouts_24h} opt-outs em 24h (≥${abs})` };
  if (m.optout_pct >= pct && m.optouts_24h >= minCount) return { pause: true, reason: `${m.optout_pct.toFixed(1)}% das conversas com opt-out (≥${pct}% E ≥${minCount})` };
  return { pause: false, reason: '' };
}

async function notifyAdmin(supabase, bot, reason) {
  const { data: settings } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', ['guardian_alert_phone', 'notification_bot_instance_id']);
  let phone = null;
  let notifBotId = null;
  for (const s of settings || []) {
    const v = typeof s.value === 'string' ? s.value.replace(/^"|"$/g, '') : s.value;
    if (s.key === 'guardian_alert_phone') phone = v;
    if (s.key === 'notification_bot_instance_id') notifBotId = v;
  }
  if (!phone || !notifBotId || phone === 'null' || notifBotId === 'null') return;

  const msg = [
    `🛑 *Chip pausado por seguranca*`,
    ``,
    `📱 *${bot.bot_name}*`,
    `⚠️ ${reason}`,
    ``,
    `📊 ${bot.sends_today}/${bot.cap} disparos frios hoje · score=${bot.score}`,
    `📉 Resp 7d: ${bot.responses_7d_pct}%`,
    ``,
    `O chip foi pausado automaticamente. Verifique em /admin/central-de-ia/prospeccao/saude`,
  ].join('\n');

  try {
    await supabase.functions.invoke('send_whatsapp_message', {
      body: { botId: notifBotId, phone, message: msg, send_source: 'broker_manual' },
    });
  } catch (e) {
    console.error('[chip-health-monitor] notify falhou:', e.message);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const settings = await getSettings(supabase);
    const featureEnabled = settings.chip_health_enabled === true || settings.chip_health_enabled === 'true';

    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const last24h = new Date(Date.now() - 24 * 3600 * 1000);
    const last7d = new Date(Date.now() - 7 * 24 * 3600 * 1000);

    const { data: bots } = await supabase
      .from('bot_instances')
      .select('id, name, created_at, daily_limit, messages_today, warmup_until, paused_safety_at, status, total_messages_sent');

    const results = [];
    let pausedCount = 0;
    let warmupCompleted = 0;

    for (const bot of bots || []) {
      const ageDays = ageDaysFromIso(bot.created_at);
      if (ageDays >= 30) {
        const { data: prevEvent } = await supabase
          .from('bot_health_events')
          .select('id')
          .eq('bot_instance_id', bot.id)
          .eq('event', 'warmup_completed')
          .limit(1)
          .maybeSingle();
        if (!prevEvent) {
          await supabase.from('bot_health_events').insert({
            bot_instance_id: bot.id,
            event: 'warmup_completed',
            reason: `Chip atingiu maturidade (${ageDays} dias)`,
            metrics_snapshot: { age_days: ageDays },
          });
          warmupCompleted++;
        }
      }
      const cap = capForBot(bot, settings);

      const { count: sendsToday } = await supabase
        .from('ia_messages')
        .select('id, ia_conversations!inner(bot_instance_id)', { count: 'exact', head: true })
        .eq('direction', 'outgoing')
        .in('send_source', ['campaign', 'ai_qualification'])
        .gte('sent_at', startOfDay.toISOString())
        .eq('ia_conversations.bot_instance_id', bot.id);

      const { count: sends24h } = await supabase
        .from('ia_messages')
        .select('id, ia_conversations!inner(bot_instance_id)', { count: 'exact', head: true })
        .eq('direction', 'outgoing')
        .in('send_source', ['campaign', 'ai_qualification'])
        .gte('sent_at', last24h.toISOString())
        .eq('ia_conversations.bot_instance_id', bot.id);

      const { data: convsRaw } = await supabase
        .from('ia_messages')
        .select('conversation_id, ia_conversations!inner(bot_instance_id)')
        .eq('direction', 'outgoing')
        .in('send_source', ['campaign', 'ai_qualification'])
        .gte('sent_at', last24h.toISOString())
        .eq('ia_conversations.bot_instance_id', bot.id);
      const uniqueConvs24h = new Set((convsRaw || []).map((r) => r.conversation_id));

      let optouts24h = 0;
      if (uniqueConvs24h.size > 0) {
        const { data: incoming } = await supabase
          .from('ia_messages')
          .select('message_text')
          .eq('direction', 'incoming')
          .in('conversation_id', Array.from(uniqueConvs24h))
          .gte('created_at', last24h.toISOString());
        const optOutRegex = /(nao quero|não quero|sem interesse|para de|pare de|descadastr|remov|stop|unsubscribe|numero errado|número errado|nao sou|não me incomod|nao me incomod|deixa de|perdi o interesse|ja comprei|já comprei)/i;
        optouts24h = (incoming || []).filter((m) => optOutRegex.test(m.message_text || '')).length;
      }
      const optoutPct = uniqueConvs24h.size > 0 ? (optouts24h / uniqueConvs24h.size) * 100 : 0;

      const { count: out7d } = await supabase
        .from('ia_messages')
        .select('id, ia_conversations!inner(bot_instance_id)', { count: 'exact', head: true })
        .eq('direction', 'outgoing')
        .gte('created_at', last7d.toISOString())
        .eq('ia_conversations.bot_instance_id', bot.id);
      const { count: in7d } = await supabase
        .from('ia_messages')
        .select('id, ia_conversations!inner(bot_instance_id)', { count: 'exact', head: true })
        .eq('direction', 'incoming')
        .gte('created_at', last7d.toISOString())
        .eq('ia_conversations.bot_instance_id', bot.id);
      const responsesPct = (out7d || 0) > 0 ? Math.round(((in7d || 0) / (out7d || 1)) * 100) : 0;

      const baseMetrics = {
        bot_id: bot.id,
        bot_name: bot.name,
        age_days: ageDaysFromIso(bot.created_at),
        cap,
        sends_today: sendsToday || 0,
        sends_24h: sends24h || 0,
        optouts_24h: optouts24h,
        optout_pct: optoutPct,
        conversations_24h: uniqueConvs24h.size,
        responses_7d_pct: responsesPct,
      };
      const score = computeScore(baseMetrics);
      const coldToday = sendsToday || 0; // metrica REAL (so envio frio) que vai pro messages_today

      const m = { ...baseMetrics, score, paused_by_safety_now: false };

      if (featureEnabled && !bot.paused_safety_at) {
        const decision = shouldAutoPause(m, settings);
        if (decision.pause) {
          await supabase.from('bot_instances').update({
            paused_safety_at: new Date().toISOString(),
            paused_safety_reason: decision.reason,
            health_score: score,
            messages_today: coldToday,
            last_health_check: new Date().toISOString(),
          }).eq('id', bot.id);

          await supabase.from('bot_health_events').insert({
            bot_instance_id: bot.id,
            event: 'paused_auto',
            reason: decision.reason,
            metrics_snapshot: m,
          });

          await notifyAdmin(supabase, m, decision.reason);

          m.paused_by_safety_now = true;
          m.pause_reason = decision.reason;
          pausedCount++;
          console.log(`[chip-health-monitor] 🛑 ${bot.name} pausado: ${decision.reason}`);
        } else {
          await supabase.from('bot_instances').update({
            health_score: score,
            messages_today: coldToday,
            last_health_check: new Date().toISOString(),
          }).eq('id', bot.id);
        }
      } else {
        await supabase.from('bot_instances').update({
          health_score: score,
          messages_today: coldToday,
          last_health_check: new Date().toISOString(),
        }).eq('id', bot.id);
      }

      results.push(m);
    }

    return new Response(JSON.stringify({
      success: true,
      feature_enabled: featureEnabled,
      bots_checked: results.length,
      auto_paused: pausedCount,
      warmup_completed: warmupCompleted,
      metric_note: 'messages_today agora = cold sends (campaign/ai_qualification) do dia',
      results,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('[chip-health-monitor] erro:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
