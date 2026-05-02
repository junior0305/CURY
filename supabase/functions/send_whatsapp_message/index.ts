import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// send_source ∈ campaign | ai_qualification | ai_followup | broker_manual | reply
// Apenas campaign + ai_qualification contam no cap e disparam blocklist em opt-out.
const COUNTS_FOR_CAP = new Set(['campaign', 'ai_qualification']);

function nowBrtHour(): number {
  const now = new Date();
  return Number(now.toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).replace(/[^0-9]/g, ''));
}

function ageDaysFromIso(iso: string | null | undefined): number {
  if (!iso) return 999;
  const created = new Date(iso).getTime();
  return Math.floor((Date.now() - created) / (1000 * 60 * 60 * 24));
}

async function getSettings(supabase: any): Promise<Record<string, any>> {
  const { data } = await supabase.from('system_settings').select('key, value')
    .in('key', [
      'chip_health_enabled',
      'chip_cap_warmup_d1_7', 'chip_cap_warmup_d8_30', 'chip_cap_mature',
      'chip_send_window_start', 'chip_send_window_end',
    ]);
  const out: Record<string, any> = {};
  for (const r of data || []) out[r.key] = r.value;
  return out;
}

function capForBot(bot: any, settings: Record<string, any>): number {
  if (typeof bot.daily_limit === 'number' && bot.daily_limit > 0) return bot.daily_limit;
  const age = ageDaysFromIso(bot.created_at);
  if (bot.warmup_until && new Date(bot.warmup_until) > new Date()) {
    return Number(settings.chip_cap_warmup_d1_7 ?? 30);
  }
  if (age <= 7)  return Number(settings.chip_cap_warmup_d1_7 ?? 30);
  if (age <= 30) return Number(settings.chip_cap_warmup_d8_30 ?? 80);
  return Number(settings.chip_cap_mature ?? 150);
}

async function todaysCampaignSends(supabase: any, botId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { count } = await supabase
    .from('ia_messages')
    .select('id, ia_conversations!inner(bot_instance_id)', { count: 'exact', head: true })
    .eq('direction', 'outgoing')
    .in('send_source', ['campaign', 'ai_qualification'])
    .gte('sent_at', startOfDay.toISOString())
    .eq('ia_conversations.bot_instance_id', botId);
  return count || 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const {
      botId, phone, message, conversationId,
      instanceName: overrideInstanceName,
      send_source = 'broker_manual',
    } = body || {};

    console.log('📨 send_whatsapp_message', { botId, phone, conversationId, send_source });

    if (!botId || !phone || !message) {
      return new Response(JSON.stringify({ error: 'Missing required fields: botId, phone, message' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const cleanPhone = phone.replace(/\D/g, '');

    // ── Health checks (apenas envios cold; orgânicos passam livre) ──────────
    const settings = await getSettings(supabaseClient);
    const healthEnabled = settings.chip_health_enabled === true;
    const isColdSend = COUNTS_FOR_CAP.has(send_source);

    const { data: bot, error: botError } = await supabaseClient
      .from('bot_instances').select('*').eq('id', botId).single();

    if (botError || !bot) {
      return new Response(JSON.stringify({ error: 'Bot not found', details: botError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (healthEnabled && isColdSend) {
      // 1) Bot pausado por segurança
      if (bot.paused_safety_at) {
        console.log('🛑 skip: bot pausado por segurança', bot.paused_safety_reason);
        return new Response(JSON.stringify({ success: false, skipped: 'bot_paused_safety', reason: bot.paused_safety_reason }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 2) Telefone na blocklist
      const { data: blocked } = await supabaseClient
        .from('phone_blocklist').select('phone, reason').eq('phone', cleanPhone).maybeSingle();
      if (blocked) {
        console.log('🛑 skip: telefone bloqueado', blocked.reason);
        return new Response(JSON.stringify({ success: false, skipped: 'phone_blocked', reason: blocked.reason }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 3) Fora do horário humano (BRT 07-22h)
      const hour = nowBrtHour();
      const winStart = Number(settings.chip_send_window_start ?? 7);
      const winEnd = Number(settings.chip_send_window_end ?? 22);
      if (hour < winStart || hour >= winEnd) {
        console.log('🛑 skip: fora do horário', { hour, winStart, winEnd });
        return new Response(JSON.stringify({ success: false, skipped: 'outside_send_window', hour }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // 4) Cap diário atingido
      const sendsToday = await todaysCampaignSends(supabaseClient, botId);
      const cap = capForBot(bot, settings);
      if (sendsToday >= cap) {
        console.log('🛑 skip: cap atingido', { sendsToday, cap });
        return new Response(JSON.stringify({ success: false, skipped: 'daily_cap_reached', sendsToday, cap }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // ── Resolve instance + envia via Evolution ──────────────────────────────
    const rawInstance = (overrideInstanceName || bot.instance_name || bot.name || '').toString();
    const instance = encodeURIComponent(rawInstance.trim());
    const base = (bot.evolution_api_url || '').toString().replace(/\/+$/g, '');

    if (!base || !instance) {
      return new Response(JSON.stringify({ error: 'Bot evolution_api_url or instance missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const url = `${base}/message/sendText/${instance}`;
    console.log('🚀 sendText', url);

    const evolutionResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': (bot.evolution_api_key || '').toString().trim() },
      body: JSON.stringify({ number: cleanPhone, text: message }),
    });

    let result: any;
    try { result = await evolutionResponse.json(); } catch { result = { error: 'Invalid JSON' }; }

    if (conversationId) {
      const { error: msgError } = await supabaseClient.from('ia_messages').insert({
        conversation_id: conversationId,
        message_text: message,
        direction: 'outgoing',
        sender_type: send_source === 'broker_manual' ? 'broker' : 'ia',
        send_source,
        sent_at: evolutionResponse.ok ? new Date().toISOString() : null,
        failed_at: evolutionResponse.ok ? null : new Date().toISOString(),
        error_message: evolutionResponse.ok ? null : JSON.stringify(result),
      });
      if (msgError) console.error('❌ ia_messages insert:', msgError);

      const { count } = await supabaseClient
        .from('ia_messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversationId);

      await supabaseClient.from('ia_conversations').update({
        messages_count: count || 0,
        last_message_at: new Date().toISOString(),
      }).eq('id', conversationId);
    }

    await supabaseClient.from('bot_instances').update({
      messages_today: (bot.messages_today || 0) + 1,
      total_messages_sent: (bot.total_messages_sent || 0) + 1,
      last_message_at: new Date().toISOString(),
    }).eq('id', botId);

    return new Response(JSON.stringify({
      success: evolutionResponse.ok,
      result,
      status: evolutionResponse.status,
      used_instance: rawInstance.trim(),
      send_source,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('❌ ERRO GERAL:', error.message, error.stack);
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
