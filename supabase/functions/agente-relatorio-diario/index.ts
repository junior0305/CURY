import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function todayBRTStartUTC(): string {
  const brtNow = new Date(Date.now() - 3 * 3600000);
  const brtMidnight = new Date(Date.UTC(brtNow.getUTCFullYear(), brtNow.getUTCMonth(), brtNow.getUTCDate()));
  return new Date(brtMidnight.getTime() + 3 * 3600000).toISOString();
}

function yesterdayBRTStartUTC(): string {
  return new Date(new Date(todayBRTStartUTC()).getTime() - 24 * 3600000).toISOString();
}

function formatDateBRT(): string {
  const brtNow = new Date(Date.now() - 3 * 3600000);
  return [String(brtNow.getUTCDate()).padStart(2, '0'), String(brtNow.getUTCMonth() + 1).padStart(2, '0'), brtNow.getUTCFullYear()].join('/');
}

function isWithinReportWindow(configTime: string): boolean {
  const brtNow = new Date(Date.now() - 3 * 3600000);
  const currentMin = brtNow.getUTCHours() * 60 + brtNow.getUTCMinutes();
  const [h, m] = configTime.split(':').map(Number);
  return Math.abs(currentMin - ((h || 21) * 60 + (m || 0))) <= 45;
}

function minsToLabel(mins: number): string {
  return mins < 60 ? `${Math.round(mins)}min` : `${(mins / 60).toFixed(1)}h`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');

  try {
    const [{ data: enabledSetting }, { data: horaSetting }] = await Promise.all([
      supabase.from('system_settings').select('value').eq('key', 'agente_relatorio_enabled').maybeSingle(),
      supabase.from('system_settings').select('value').eq('key', 'agente_relatorio_hora_brt').maybeSingle(),
    ]);

    if (String(enabledSetting?.value ?? 'false') !== 'true') {
      return new Response(JSON.stringify({ skipped: 'disabled' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const configTime = String(horaSetting?.value ?? '21:00').replace(/"/g, '');
    if (!isWithinReportWindow(configTime)) {
      return new Response(JSON.stringify({ skipped: 'outside_window' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const todayStart = todayBRTStartUTC();
    const dateStr = formatDateBRT();

    const { data: alreadySent } = await supabase.from('automation_logs').select('id')
      .eq('entity_type', 'relatorio_diario').eq('status', 'success').gte('executed_at', todayStart).maybeSingle();
    if (alreadySent) return new Response(JSON.stringify({ skipped: 'already_sent' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: todayLeads } = await supabase.from('leads')
      .select('id, name, status, broker_id, created_at, last_lead_response_at, last_broker_whatsapp_at')
      .gte('created_at', todayStart);

    const total = todayLeads?.length ?? 0;
    const concluded = todayLeads?.filter(l => l.status === 'CONCLUDED').length ?? 0;
    const abandoned = todayLeads?.filter(l => l.status === 'ABANDONED').length ?? 0;
    const responded = todayLeads?.filter(l => l.last_lead_response_at).length ?? 0;
    const notResponded = total - responded;
    const contactTimes = (todayLeads || []).filter(l => l.last_broker_whatsapp_at && l.created_at)
      .map(l => (new Date(l.last_broker_whatsapp_at).getTime() - new Date(l.created_at).getTime()) / 60000);
    const avgContactMin = contactTimes.length ? contactTimes.reduce((a, b) => a + b, 0) / contactTimes.length : null;
    const staleLeads = (todayLeads || []).filter(l => !l.last_broker_whatsapp_at && ['NEW', 'IN_PROGRESS'].includes(l.status)).length;

    const { count: activePipeline } = await supabase.from('leads').select('id', { count: 'exact', head: true }).in('status', ['NEW', 'IN_PROGRESS', 'DOCS_REQUESTED']);
    const { count: hotStale } = await supabase.from('lead_state').select('id', { count: 'exact', head: true })
      .eq('intencao', 'quente').in('lead_id', (todayLeads || []).filter(l => !l.last_broker_whatsapp_at).map(l => l.id));

    const brokerMap: Record<string, { name: string; leads: number; responded: number }> = {};
    for (const l of todayLeads || []) {
      if (!l.broker_id) continue;
      if (!brokerMap[l.broker_id]) brokerMap[l.broker_id] = { name: l.broker_id, leads: 0, responded: 0 };
      brokerMap[l.broker_id].leads++;
      if (l.last_broker_whatsapp_at) brokerMap[l.broker_id].responded++;
    }
    const brokerIds = Object.keys(brokerMap);
    if (brokerIds.length) {
      const { data: bp } = await supabase.from('profiles').select('id, first_name').in('id', brokerIds);
      for (const p of bp || []) { if (brokerMap[p.id]) brokerMap[p.id].name = p.first_name || p.id; }
    }
    const brokerRanking = Object.values(brokerMap).sort((a, b) => b.responded - a.responded || b.leads - a.leads);
    const topBroker = brokerRanking[0] ?? null;
    const bottomBroker = brokerRanking.length > 1 ? brokerRanking[brokerRanking.length - 1] : null;

    const { data: botsData } = await supabase.from('bot_instances').select('name, status');
    const botsTotal = botsData?.length ?? 0;
    const botsOffline = botsData?.filter(b => b.status === 'offline').length ?? 0;

    const lines: string[] = [
      `📊 *Diagnóstico do Dia — ${dateStr}*`, ``,
      `📥 *Leads recebidos:* ${total}`,
      `💬 Responderam: ${responded} | Silêncio: ${notResponded}`,
      concluded ? `✅ Vendas fechadas: *${concluded}*` : `✅ Vendas fechadas: 0`,
      abandoned ? `❌ Abandonados: ${abandoned}` : '', ``,
    ];
    if (avgContactMin !== null) {
      const label = avgContactMin <= 5 ? '🟢 Excelente' : avgContactMin <= 15 ? '🟡 Aceitável' : '🔴 Lento';
      lines.push(`⏱ *Tempo médio de contato:* ${minsToLabel(avgContactMin)} ${label}`);
    }
    if (staleLeads > 0) lines.push(`⚠️ *Leads sem contato do corretor hoje:* ${staleLeads}`);
    if ((hotStale ?? 0) > 0) lines.push(`🔥 *Leads QUENTES sem resposta:* ${hotStale} — URGENTE`);
    lines.push(`📋 Pipeline total ativo: ${activePipeline ?? 0} leads`, ``);
    if (topBroker) lines.push(`🏆 *Melhor do dia:* ${topBroker.name} — ${topBroker.responded}/${topBroker.leads} respondidos`);
    if (bottomBroker && bottomBroker.responded === 0 && bottomBroker.leads > 0) lines.push(`⚠️ *Atenção:* ${bottomBroker.name} recebeu ${bottomBroker.leads} lead(s) e não respondeu nenhum`);
    lines.push(``);
    if (botsOffline > 0) lines.push(`🔴 *${botsOffline} bot(s) offline* — verifique conexão WhatsApp`);
    else lines.push(`🟢 Todos os ${botsTotal} bots conectados`);
    const convRate = total > 0 ? ((concluded / total) * 100).toFixed(1) : '0';
    lines.push(``, `📈 *Taxa de conversão do dia:* ${convRate}%`);
    if (Number(convRate) === 0 && total > 0) lines.push(`💡 Nenhuma venda hoje. Foco: corretores com leads quentes parados.`);
    else if (Number(convRate) > 5) lines.push(`💡 Boa taxa hoje! Continue o ritmo de atendimento rápido.`);

    const message = lines.filter(Boolean).join('\n').trim();

    const { data: globalBotSetting } = await supabase.from('system_settings').select('value').eq('key', 'notification_bot_instance_id').maybeSingle();
    const { data: anyConnectedBot } = await supabase.from('bot_instances').select('id').in('status', ['open', 'connected']).limit(1).maybeSingle();
    const fallbackBotId: string | null = globalBotSetting?.value ?? anyConnectedBot?.id ?? null;

    const { data: recipients } = await supabase.from('profiles').select('id, first_name, phone, role, bot_instance_id')
      .in('role', ['ADMIN', 'SUPERINTENDENT', 'MANAGER']).not('phone', 'is', null).neq('phone', '');

    let sent = 0;
    for (const recipient of recipients || []) {
      const botId = recipient.bot_instance_id ?? fallbackBotId;
      if (!botId) continue;

      let msgToSend = message;
      if (recipient.role === 'MANAGER') {
        const { data: teamBrokers } = await supabase.from('profiles').select('id, first_name').eq('manager_id', recipient.id).eq('role', 'BROKER');
        const teamIds = (teamBrokers || []).map(b => b.id);
        if (teamIds.length === 0) {
          msgToSend = `📊 *Seu Diagnóstico — ${dateStr}*\n\nNenhum corretor na equipe ainda.`;
        } else {
          const { data: teamLeads } = await supabase.from('leads')
            .select('id, status, broker_id, created_at, last_lead_response_at, last_broker_whatsapp_at')
            .in('broker_id', teamIds).gte('created_at', todayStart);
          const tTotal = teamLeads?.length ?? 0;
          const tConcluded = teamLeads?.filter(l => l.status === 'CONCLUDED').length ?? 0;
          const tResponded = teamLeads?.filter(l => l.last_lead_response_at).length ?? 0;
          const tStale = teamLeads?.filter(l => !l.last_broker_whatsapp_at && ['NEW','IN_PROGRESS'].includes(l.status)).length ?? 0;
          const tTimes = (teamLeads || []).filter(l => l.last_broker_whatsapp_at && l.created_at)
            .map(l => (new Date(l.last_broker_whatsapp_at).getTime() - new Date(l.created_at).getTime()) / 60000);
          const tAvgMin = tTimes.length ? tTimes.reduce((a,b) => a+b, 0) / tTimes.length : null;
          const { count: tHotStale } = await supabase.from('lead_state').select('id', { count: 'exact', head: true })
            .eq('intencao', 'quente').in('lead_id', (teamLeads || []).filter(l => !l.last_broker_whatsapp_at).map(l => l.id));
          const brokerPerf: Record<string, { name: string; responded: number; leads: number }> = {};
          for (const l of teamLeads || []) {
            if (!l.broker_id) continue;
            if (!brokerPerf[l.broker_id]) { const b = teamBrokers?.find(b => b.id === l.broker_id); brokerPerf[l.broker_id] = { name: b?.first_name || '?', responded: 0, leads: 0 }; }
            brokerPerf[l.broker_id].leads++;
            if (l.last_broker_whatsapp_at) brokerPerf[l.broker_id].responded++;
          }
          const ranked = Object.values(brokerPerf).sort((a,b) => b.responded - a.responded);
          const top = ranked[0];
          const worst = ranked.length > 1 ? ranked[ranked.length - 1] : null;
          const speedLabel = tAvgMin !== null ? (tAvgMin <= 5 ? `${minsToLabel(tAvgMin)} 🟢` : tAvgMin <= 15 ? `${minsToLabel(tAvgMin)} 🟡` : `${minsToLabel(tAvgMin)} 🔴`) : 'N/A';
          msgToSend = [
            `📊 *Diagnóstico da Equipe — ${dateStr}*`, ``,
            `📥 Leads hoje: *${tTotal}* · Responderam: ${tResponded}`,
            tConcluded > 0 ? `✅ Vendas: *${tConcluded}*` : `✅ Vendas: 0`,
            tStale > 0 ? `⚠️ Sem contato do corretor: *${tStale}*` : '',
            (tHotStale ?? 0) > 0 ? `🔥 Leads QUENTES parados: *${tHotStale}* — URGENTE` : '',
            ``, `⏱ Tempo médio de contato: ${speedLabel}`, ``,
            top ? `🏆 Destaque: ${top.name} — ${top.responded}/${top.leads} respondidos` : '',
            worst && worst.responded === 0 && worst.leads > 0 ? `⚠️ Atenção: ${worst.name} — ${worst.leads} lead(s) sem resposta` : '',
          ].filter(Boolean).join('\n');
        }
      }

      try {
        const { data: result } = await supabase.functions.invoke('send_whatsapp_message', { body: { botId, phone: recipient.phone, message: msgToSend } });
        if (result?.success) { sent++; console.log(`[relatorio-diario] ✅ ${recipient.first_name} (${recipient.role})`); }
      } catch (e: any) { console.error(`[relatorio-diario] erro ${recipient.first_name}:`, e.message); }
      await new Promise(r => setTimeout(r, 300));
    }

    if (sent > 0) {
      await supabase.from('automation_logs').insert({ entity_type: 'relatorio_diario', entity_id: dateStr, status: 'success', message_sent: `Diagnóstico ${dateStr} — ${sent} destinatário(s)`, executed_at: new Date().toISOString() });
    }

    return new Response(JSON.stringify({ sent, date: dateStr, total, concluded, staleLeads }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('[relatorio-diario] fatal:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
