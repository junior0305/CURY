import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─────────────────────────────────────────────────────────────────────────────
// agente-briefing-corretor
//
// Roda toda manhã (07:50-08:10 BRT, via cron diário).
// Envia para cada corretor ativo um WhatsApp de briefing matinal com:
//   • Leads quentes aguardando resposta (urgência máxima)
//   • Total de leads ativos e composição por status
//   • Posição no ranking do mês + pontuação
//   • Tarefas pendentes hoje
//   • Mensagem motivacional dinâmica
//
// Deduplicação: não reenviar se já enviou hoje para o mesmo corretor.
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const XP_BY_STATUS: Record<string, number> = {
  IN_PROGRESS: 10, VISIT_SCHEDULED: 30, DOCS_REQUESTED: 50, CONCLUDED: 200,
};

function todayBRTStartUTC(): string {
  const brtNow = new Date(Date.now() - 3 * 3600000);
  const brtMidnight = new Date(Date.UTC(brtNow.getUTCFullYear(), brtNow.getUTCMonth(), brtNow.getUTCDate()));
  return new Date(brtMidnight.getTime() + 3 * 3600000).toISOString();
}

function isWithinWindow(): boolean {
  const brtNow = new Date(Date.now() - 3 * 3600000);
  const h = brtNow.getUTCHours();
  const m = brtNow.getUTCMinutes();
  const total = h * 60 + m;
  return total >= 7 * 60 + 45 && total <= 8 * 60 + 15;
}

function motivationalMessage(hotCount: number, rank: number | null, pts: number): string {
  if (hotCount > 2) return `🔥 Você tem ${hotCount} leads QUENTES esperando. Cada minuto conta — atenda agora e feche mais!`;
  if (hotCount === 1) return `🎯 Um lead quente na fila. É hora de agir — leads quentes fecham em média 3x mais!`;
  if (rank === 1) return `👑 Você está liderando o ranking! Mantenha o ritmo e solidifique sua posição.`;
  if (rank && rank <= 3) return `🏆 Top ${rank} do ranking! Um bom dia hoje pode te levar ao topo.`;
  if (pts > 100) return `🚀 Boa pontuação acumulada! Cada lead respondido te aproxima do prêmio mensal.`;
  return `💪 Novo dia, novas oportunidades. Atender rápido é seu maior diferencial!`;
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

  // ── Verificar se o agente está habilitado ─────────────────────────────────
  const { data: enabledSetting } = await supabase
    .from('system_settings').select('value')
    .eq('key', 'agente_briefing_corretor_enabled').maybeSingle();

  if (String(enabledSetting?.value ?? 'false') !== 'true') {
    return new Response(JSON.stringify({ skipped: 'disabled' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Janela de tempo: 07:45-08:15 BRT ─────────────────────────────────────
  const body = await req.json().catch(() => ({}));
  const forceRun = body.force === true;
  const dryRun = body.dryRun === true;
  const onlyBrokerId: string | null = body.onlyBrokerId ?? null;

  if (!forceRun && !isWithinWindow()) {
    return new Response(JSON.stringify({ skipped: 'outside_window' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const todayStart = todayBRTStartUTC();
    const now = new Date();

    // ── Bot de fallback global ────────────────────────────────────────────
    const { data: globalBotSetting } = await supabase
      .from('system_settings').select('value')
      .eq('key', 'notification_bot_instance_id').maybeSingle();
    const { data: anyBot } = await supabase
      .from('bot_instances').select('id')
      .in('status', ['open', 'connected']).limit(1).maybeSingle();
    const fallbackBotId: string | null = globalBotSetting?.value ?? anyBot?.id ?? null;

    // ── Busca todos os corretores ativos com telefone ─────────────────────
    let brokersQuery = supabase
      .from('profiles')
      .select('id, first_name, phone, bot_instance_id, manager_id, lead_assignment_enabled')
      .eq('role', 'BROKER')
      .not('phone', 'is', null)
      .neq('phone', '')
      .not('first_name', 'ilike', '%[INATIVO]%');
    if (onlyBrokerId) brokersQuery = brokersQuery.eq('id', onlyBrokerId);
    const { data: brokers } = await brokersQuery;

    if (!brokers?.length) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no_brokers' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Mapeia bot do manager de cada corretor (apenas se conectado) ──────
    const managerIds = Array.from(new Set((brokers || []).map((b: any) => b.manager_id).filter(Boolean)));
    const managerBotByMgr = new Map<string, string>();
    if (managerIds.length) {
      const { data: managers } = await supabase
        .from('profiles')
        .select('id, bot_instance_id')
        .in('id', managerIds);
      const mgrBotIds = (managers || []).map((m: any) => m.bot_instance_id).filter(Boolean);
      const onlineSet = new Set<string>();
      if (mgrBotIds.length) {
        const { data: bots } = await supabase
          .from('bot_instances')
          .select('id, status')
          .in('id', mgrBotIds);
        for (const b of bots || []) {
          if (b.status === 'open' || b.status === 'connected') onlineSet.add(b.id);
        }
      }
      for (const m of managers || []) {
        if (m.bot_instance_id && onlineSet.has(m.bot_instance_id)) {
          managerBotByMgr.set(m.id, m.bot_instance_id);
        }
      }
    }

    // ── Deduplica: corretores que já receberam hoje ───────────────────────
    const { data: alreadySentToday } = await supabase
      .from('automation_logs')
      .select('entity_id')
      .eq('entity_type', 'briefing_corretor')
      .eq('status', 'success')
      .gte('executed_at', todayStart);

    const alreadySentSet = new Set((alreadySentToday || []).map(r => r.entity_id));

    // ── Busca leads ativos de todos os corretores ─────────────────────────
    const brokerIds = brokers.map(b => b.id);
    const { data: allLeads } = await supabase
      .from('leads')
      .select('id, name, broker_id, status, last_interaction_at, last_broker_whatsapp_at, last_lead_response_at')
      .in('broker_id', brokerIds)
      .not('status', 'in', '("CONCLUDED","ABANDONED","EXCLUDED")');

    // Lead states para identificar intenção
    const leadIds = (allLeads || []).map(l => l.id);
    const { data: leadStates } = leadIds.length
      ? await supabase.from('lead_state').select('lead_id, intencao, tema').in('lead_id', leadIds)
      : { data: [] };

    const stateByLead = new Map((leadStates || []).map(s => [s.lead_id, s]));

    // Tarefas abertas de hoje
    const todayEndBRT = new Date(todayStart);
    todayEndBRT.setUTCHours(todayEndBRT.getUTCHours() + 24);
    const { data: tasksDue } = await supabase
      .from('tasks')
      .select('user_id, title')
      .eq('status', 'OPEN')
      .gte('due_at', todayStart)
      .lt('due_at', todayEndBRT.toISOString());

    const tasksByBroker: Record<string, string[]> = {};
    for (const t of tasksDue || []) {
      if (!tasksByBroker[t.user_id]) tasksByBroker[t.user_id] = [];
      tasksByBroker[t.user_id].push(t.title);
    }

    // Ranking do mês (pontuação por status)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { data: monthLeads } = await supabase
      .from('leads')
      .select('broker_id, status')
      .in('broker_id', brokerIds)
      .gte('created_at', monthStart);

    const ptsMap: Record<string, number> = {};
    for (const l of monthLeads || []) {
      if (!ptsMap[l.broker_id]) ptsMap[l.broker_id] = 0;
      ptsMap[l.broker_id] += XP_BY_STATUS[l.status] ?? 0;
    }
    // Ordena para descobrir posição de cada corretor
    const rankOrder = Object.entries(ptsMap)
      .sort((a, b) => b[1] - a[1])
      .map(([id], idx) => [id, idx + 1] as [string, number]);
    const rankMap = new Map(rankOrder);

    let sent = 0;
    let failed = 0;
    let skippedNoBot = 0;
    const samplePreview: any[] = [];

    for (const broker of brokers) {
      if (alreadySentSet.has(broker.id)) continue;

      // Bot do manager → fallback global → bot do próprio corretor
      const managerBot = broker.manager_id ? managerBotByMgr.get(broker.manager_id) : null;
      const botId = managerBot ?? fallbackBotId ?? broker.bot_instance_id;
      if (!botId || !broker.phone) { skippedNoBot++; continue; }

      const myLeads = (allLeads || []).filter(l => l.broker_id === broker.id);

      // Leads quentes sem resposta do corretor
      const hotPending = myLeads.filter(l => {
        const s = stateByLead.get(l.id);
        if (s?.intencao !== 'quente') return false;
        // Corretor ainda não respondeu após a última mensagem do lead
        if (l.last_broker_whatsapp_at && l.last_lead_response_at &&
          new Date(l.last_broker_whatsapp_at) > new Date(l.last_lead_response_at)) return false;
        return true;
      });

      // Contagens
      const totalActive = myLeads.length;
      const newCount    = myLeads.filter(l => l.status === 'NEW').length;
      const inProgress  = myLeads.filter(l => l.status === 'IN_PROGRESS').length;
      const docs        = myLeads.filter(l => l.status === 'DOCS_REQUESTED').length;

      const rank = rankMap.get(broker.id) ?? null;
      const pts  = ptsMap[broker.id] ?? 0;

      const myTasks = tasksByBroker[broker.id] ?? [];
      const firstName = broker.first_name || 'Corretor';

      // ── Monta mensagem ─────────────────────────────────────────────────
      const lines: string[] = [
        `☀️ *Bom dia, ${firstName}!* Seu briefing matinal:`,
        ``,
      ];

      if (hotPending.length > 0) {
        lines.push(`🔥 *${hotPending.length} lead(s) QUENTE(S) aguardando sua resposta:*`);
        for (const l of hotPending.slice(0, 3)) {
          const minsWait = l.last_lead_response_at
            ? Math.round((now.getTime() - new Date(l.last_lead_response_at).getTime()) / 60000)
            : null;
          const s = stateByLead.get(l.id);
          const tema = s?.tema && s.tema !== 'sem_info' ? ` (${s.tema})` : '';
          lines.push(`  🔴 *${l.name?.split(' ')[0]}*${tema}${minsWait ? ` — ${minsWait}min sem resposta` : ''}`);
        }
        if (hotPending.length > 3) lines.push(`  ...e mais ${hotPending.length - 3} lead(s)`);
        lines.push(``);
      }

      if (totalActive > 0) {
        const composition = [
          newCount > 0     ? `${newCount} novo(s)` : '',
          inProgress > 0   ? `${inProgress} em atend.` : '',
          docs > 0         ? `${docs} em docs` : '',
        ].filter(Boolean).join(' · ');
        lines.push(`📋 *Fila ativa:* ${totalActive} leads${composition ? ` — ${composition}` : ''}`);
      } else {
        lines.push(`📋 Fila limpa — fique atento a novos leads!`);
      }

      if (rank) {
        const medal = rank === 1 ? '👑' : rank <= 3 ? '🏆' : rank <= 10 ? '🎯' : '📊';
        lines.push(`${medal} *Ranking:* #${rank} do mês — ${pts} pts`);
      }

      if (myTasks.length > 0) {
        lines.push(``, `📌 *Tarefas para hoje:*`);
        for (const t of myTasks.slice(0, 3)) {
          lines.push(`  • ${t}`);
        }
      }

      lines.push(``, motivationalMessage(hotPending.length, rank, pts));

      const message = lines.join('\n');

      if (dryRun) {
        samplePreview.push({ broker: firstName, phone: broker.phone, botId, message });
        sent++;
        continue;
      }

      // ── Envia via WhatsApp ──────────────────────────────────────────────
      let sendOk = false;
      let sendErr: string | null = null;
      try {
        const { data: result, error } = await supabase.functions.invoke('send_whatsapp_message', {
          body: { botId, phone: broker.phone, message },
        });
        if (error) {
          sendErr = error.message || 'invoke_error';
        } else {
          sendOk = result?.success === true;
          if (!sendOk) sendErr = result?.error || 'send_failed';
        }
      } catch (e: any) {
        sendErr = e?.message || 'invoke_exception';
      }

      // ── Registra para deduplicação ──────────────────────────────────────
      await safeInsertLog(supabase, {
        entity_type:    'briefing_corretor',
        entity_id:      broker.id,
        status:         sendOk ? 'success' : 'failed',
        message_sent:   message,
        recipient_phone: broker.phone,
        executed_at:    now.toISOString(),
        error_message:  sendOk ? null : sendErr,
      });

      if (sendOk) {
        sent++;
        console.log(`[briefing-corretor] OK ${firstName} bot=${botId.substring(0,8)} hot=${hotPending.length} rank=#${rank ?? '?'}`);
      } else {
        failed++;
        console.warn(`[briefing-corretor] FAIL ${firstName} (${broker.id}) - ${sendErr}`);
      }
    }

    console.log(`[briefing-corretor] done sent=${sent} failed=${failed} skippedNoBot=${skippedNoBot} total=${brokers.length}`);

    return new Response(
      JSON.stringify({ sent, failed, skippedNoBot, total: brokers.length, dryRun, samplePreview: dryRun ? samplePreview.slice(0, 3) : undefined }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[briefing-corretor] fatal:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
