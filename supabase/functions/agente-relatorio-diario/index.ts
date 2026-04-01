import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Calcula início do dia atual em BRT (UTC-3) retornado como ISO UTC */
function todayBRTStartUTC(): string {
  const nowMs = Date.now();
  const brtNow = new Date(nowMs - 3 * 3600000);
  const brtMidnight = new Date(Date.UTC(brtNow.getUTCFullYear(), brtNow.getUTCMonth(), brtNow.getUTCDate()));
  return new Date(brtMidnight.getTime() + 3 * 3600000).toISOString();
}

/** Formata data BRT para exibição DD/MM/YYYY */
function formatDateBRT(): string {
  const brtNow = new Date(Date.now() - 3 * 3600000);
  return [
    String(brtNow.getUTCDate()).padStart(2, '0'),
    String(brtNow.getUTCMonth() + 1).padStart(2, '0'),
    brtNow.getUTCFullYear(),
  ].join('/');
}

/** Verifica se o horário BRT atual está dentro da janela de envio (±45 min) */
function isWithinReportWindow(configTime: string): boolean {
  const brtNow = new Date(Date.now() - 3 * 3600000);
  const currentMin = brtNow.getUTCHours() * 60 + brtNow.getUTCMinutes();
  const [h, m] = configTime.split(':').map(Number);
  const configMin = (h || 21) * 60 + (m || 0);
  return Math.abs(currentMin - configMin) <= 45;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  );

  try {
    // ── Configurações ──────────────────────────────────────────────────────────
    const [{ data: enabledSetting }, { data: horaSetting }, { data: botSetting }] = await Promise.all([
      supabase.from('system_settings').select('value').eq('key', 'agente_relatorio_enabled').maybeSingle(),
      supabase.from('system_settings').select('value').eq('key', 'agente_relatorio_hora_brt').maybeSingle(),
      supabase.from('system_settings').select('value').eq('key', 'notification_bot_instance_id').maybeSingle(),
    ]);

    const enabled = String(enabledSetting?.value ?? 'false') === 'true';
    if (!enabled) {
      return new Response(JSON.stringify({ skipped: 'disabled', sent: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const configTime = String(horaSetting?.value ?? '21:00').replace(/"/g, '');
    const notifBotId: string | null = botSetting?.value ? String(botSetting.value).replace(/"/g, '') : null;

    if (!notifBotId) {
      console.log('[agente-relatorio-diario] notification_bot_instance_id não configurado');
      return new Response(JSON.stringify({ skipped: 'no_bot', sent: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Verificar janela de horário ────────────────────────────────────────────
    if (!isWithinReportWindow(configTime)) {
      return new Response(JSON.stringify({ skipped: 'outside_window', sent: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Verificar se já enviou hoje ────────────────────────────────────────────
    const todayStart = todayBRTStartUTC();
    const { data: alreadySent } = await supabase
      .from('automation_logs')
      .select('id')
      .eq('entity_type', 'relatorio_diario')
      .eq('status', 'success')
      .gte('executed_at', todayStart)
      .maybeSingle();

    if (alreadySent) {
      console.log('[agente-relatorio-diario] já enviado hoje');
      return new Response(JSON.stringify({ skipped: 'already_sent', sent: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Coletar estatísticas do dia ────────────────────────────────────────────
    const [
      { count: newLeads },
      { count: concluded },
      { count: abandoned },
      { count: activePipeline },
      { count: followupsSent },
      { count: redistribuicoes },
      { data: botsData },
      { count: queuePending },
    ] = await Promise.all([
      supabase.from('leads').select('id', { count: 'exact', head: true })
        .gte('created_at', todayStart),
      supabase.from('leads').select('id', { count: 'exact', head: true })
        .eq('status', 'CONCLUDED').gte('updated_at', todayStart),
      supabase.from('leads').select('id', { count: 'exact', head: true })
        .eq('status', 'ABANDONED').gte('updated_at', todayStart),
      supabase.from('leads').select('id', { count: 'exact', head: true })
        .in('status', ['NEW', 'IN_PROGRESS', 'DOCS_REQUESTED']),
      supabase.from('automation_logs').select('id', { count: 'exact', head: true })
        .eq('entity_type', 'followup').eq('status', 'success').gte('executed_at', todayStart),
      supabase.from('automation_logs').select('id', { count: 'exact', head: true })
        .eq('entity_type', 'redistribuicao').eq('status', 'success').gte('executed_at', todayStart),
      supabase.from('bot_instances').select('status'),
      supabase.from('lead_activation_queue').select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
    ]);

    const botsTotal = botsData?.length ?? 0;
    const botsOnline = (botsData as any[])?.filter(b => b.status === 'open').length ?? 0;
    const dateStr = formatDateBRT();

    // ── Montar mensagem ────────────────────────────────────────────────────────
    const message = [
      `📊 *Relatório Diário — ${dateStr}*`,
      '',
      `📥 Leads novos: *${newLeads ?? 0}*`,
      `✅ Conversões: *${concluded ?? 0}*`,
      `❌ Abandonados: *${abandoned ?? 0}*`,
      `📋 Pipeline ativo: *${activePipeline ?? 0}* leads`,
      '',
      `🤖 Automações do dia:`,
      `• Follow-ups enviados: ${followupsSent ?? 0}`,
      `• Redistribuições: ${redistribuicoes ?? 0}`,
      '',
      `⚡ Sistema:`,
      `• Bots online: ${botsOnline}/${botsTotal}`,
      `• Fila pendente: ${queuePending ?? 0} itens`,
    ].join('\n');

    // ── Buscar destinatários (ADMIN + SUPERINTENDENT + MANAGER com telefone) ──
    const { data: recipients } = await supabase
      .from('profiles')
      .select('id, first_name, phone')
      .in('role', ['ADMIN', 'SUPERINTENDENT', 'MANAGER'])
      .not('phone', 'is', null)
      .neq('phone', '');

    console.log(`[agente-relatorio-diario] ${recipients?.length ?? 0} destinatários | data=${dateStr}`);

    // ── Enviar ─────────────────────────────────────────────────────────────────
    let sent = 0;
    for (const recipient of recipients || []) {
      try {
        const { data: result } = await supabase.functions.invoke('send_whatsapp_message', {
          body: { botId: notifBotId, phone: recipient.phone, message },
        });
        if (result?.success) {
          sent++;
          console.log(`[agente-relatorio-diario] ✅ ${recipient.first_name} (${recipient.phone})`);
        } else {
          console.log(`[agente-relatorio-diario] ⚠️ falha ${recipient.first_name}: ${JSON.stringify(result)}`);
        }
      } catch (e: any) {
        console.error(`[agente-relatorio-diario] erro ${recipient.first_name}:`, e.message);
      }
      await new Promise(r => setTimeout(r, 300));
    }

    // ── Registrar para evitar duplicata ───────────────────────────────────────
    if (sent > 0) {
      await supabase.from('automation_logs').insert({
        entity_type: 'relatorio_diario',
        entity_id: dateStr,
        status: 'success',
        message_sent: `Relatório ${dateStr} — ${sent} destinatário(s)`,
        executed_at: new Date().toISOString(),
      });
    }

    console.log(`[agente-relatorio-diario] done — sent=${sent}`);

    return new Response(JSON.stringify({ sent, date: dateStr }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[agente-relatorio-diario] fatal:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
