import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  );

  const now = new Date().toISOString();
  let redistributed = 0;

  try {
    // ── Configurações ──────────────────────────────────────────────────────────
    const [{ data: enabledSetting }, { data: thresholdSetting }] = await Promise.all([
      supabase.from('system_settings').select('value').eq('key', 'agente_redistribuicao_enabled').maybeSingle(),
      supabase.from('system_settings').select('value').eq('key', 'agente_redistribuicao_threshold_h').maybeSingle(),
    ]);

    const enabled = String(enabledSetting?.value ?? 'false') === 'true';
    if (!enabled) {
      return new Response(JSON.stringify({ skipped: 'disabled', redistributed: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const thresholdH = Math.max(1, parseInt(String(thresholdSetting?.value ?? '4'), 10) || 4);
    const thresholdAgo = new Date(Date.now() - thresholdH * 3600000).toISOString();

    console.log(`[agente-redistribuicao] threshold=${thresholdH}h threshold_ago=${thresholdAgo}`);

    // ── Buscar leads elegíveis para redistribuição ─────────────────────────────
    // NOVO CRITÉRIO: só redistribui quando o lead RESPONDEU mas o corretor ignorou.
    // Leads que ainda não responderam estão sendo tratados pela automação (cérebro/sentinela)
    // e NÃO devem ser redistribuídos — o bot está agindo por eles.
    const { data: staleLeads } = await supabase
      .from('leads')
      .select('id, name, broker_id, status, last_lead_response_at, last_broker_whatsapp_at, broker:profiles!broker_id(id, first_name, protect_own_leads, bot_instance_id, manager_id)')
      .in('status', ['NEW', 'IN_PROGRESS', 'DOCS_REQUESTED'])
      .not('broker_id', 'is', null)
      .eq('no_redistribute', false)          // respeita campanhas exclusivas
      .not('last_lead_response_at', 'is', null) // lead deve ter respondido (está quente)
      .lt('last_lead_response_at', thresholdAgo) // resposta foi há mais de X horas
      .limit(20);

    console.log(`[agente-redistribuicao] ${staleLeads?.length ?? 0} leads elegíveis`);

    if (!staleLeads?.length) {
      return new Response(JSON.stringify({ redistributed: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Corretores disponíveis para receber leads ──────────────────────────────
    const { data: availableBrokers } = await supabase
      .from('profiles')
      .select('id, first_name, bot_instance_id, manager_id')
      .eq('role', 'BROKER')
      .eq('lead_assignment_enabled', true)
      .not('bot_instance_id', 'is', null);

    if (!availableBrokers?.length) {
      console.log('[agente-redistribuicao] nenhum corretor disponível');
      return new Response(JSON.stringify({ redistributed: 0, reason: 'no_brokers' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Contagem atual de leads ativos por corretor (para load balancing)
    const { data: activeLeads } = await supabase
      .from('leads')
      .select('broker_id')
      .in('status', ['NEW', 'IN_PROGRESS', 'DOCS_REQUESTED'])
      .not('broker_id', 'is', null);

    const loadMap: Record<string, number> = {};
    for (const l of activeLeads || []) {
      if (l.broker_id) loadMap[l.broker_id] = (loadMap[l.broker_id] || 0) + 1;
    }

    // ── Redistribuir ───────────────────────────────────────────────────────────
    for (const lead of staleLeads) {
      const broker = (lead as any).broker;
      if (!broker) continue;

      // Respeitar protect_own_leads
      if (broker.protect_own_leads) {
        console.log(`[agente-redistribuicao] SKIP ${lead.id} (${lead.name}) — corretor protegido`);
        continue;
      }

      // ── PROTEÇÃO 1: Corretor já respondeu após a última mensagem do lead ──────
      // Se last_broker_whatsapp_at > last_lead_response_at, o corretor está no controle
      const leadResponseAt = (lead as any).last_lead_response_at;
      const brokerReplyAt  = (lead as any).last_broker_whatsapp_at;
      if (brokerReplyAt && leadResponseAt && new Date(brokerReplyAt) > new Date(leadResponseAt)) {
        console.log(`[agente-redistribuicao] SKIP ${lead.id} (${lead.name}) — corretor respondeu após o lead`);
        continue;
      }

      // ── PROTEÇÃO 2: Automação (cérebro) já tocou o lead ─────────────────────
      // Se existe toque completado, o sistema está cuidando — não redistribuir
      const { count: cerebroTouches } = await supabase
        .from('lead_activation_queue')
        .select('id', { count: 'exact', head: true })
        .eq('lead_id', lead.id)
        .eq('status', 'completed')
        .in('action_type', ['toque_1', 'toque_2', 'sentinela', 'last_chance']);
      if ((cerebroTouches ?? 0) > 0) {
        console.log(`[agente-redistribuicao] SKIP ${lead.id} (${lead.name}) — automação já tocou o lead (${cerebroTouches} toques)`);
        continue;
      }

      // ── PROTEÇÃO 3: Sentinela ativa (IA em conversa com o lead) ─────────────
      const { data: activeSentinela } = await supabase
        .from('ai_sentinela_sessions')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('status', 'active')
        .maybeSingle();
      if (activeSentinela) {
        console.log(`[agente-redistribuicao] SKIP ${lead.id} (${lead.name}) — sentinela ativa, IA em conversa`);
        continue;
      }

      // ── Anti-spam: não redistribuir o mesmo lead mais de uma vez por threshold ──
      const { data: recentLog } = await supabase
        .from('automation_logs')
        .select('id')
        .eq('entity_id', lead.id)
        .eq('entity_type', 'redistribuicao')
        .gte('executed_at', thresholdAgo)
        .maybeSingle();
      if (recentLog) {
        console.log(`[agente-redistribuicao] SKIP ${lead.id} — já redistribuído neste período`);
        continue;
      }

      // Escolher novo corretor: mesma equipe (manager_id), menor carga, diferente do atual
      const brokerManagerId = broker.manager_id ?? null;
      const candidates = availableBrokers.filter(b =>
        b.id !== lead.broker_id &&
        (brokerManagerId ? b.manager_id === brokerManagerId : true)
      );
      if (!candidates.length) {
        console.log(`[agente-redistribuicao] SKIP ${lead.id} — sem outro corretor disponível na mesma equipe (manager_id=${brokerManagerId})`);
        continue;
      }
      candidates.sort((a, b) => (loadMap[a.id] || 0) - (loadMap[b.id] || 0));
      const newBroker = candidates[0];
      const oldBrokerId = lead.broker_id as string;

      // Transferir lead — reseta campos para que o novo corretor comece do zero
      await supabase.from('leads')
        .update({
          broker_id: newBroker.id,
          status: 'NEW',                              // aparece como novo lead para o destinatário
          last_interaction_at: now,                   // zera contador de horas parado
          last_broker_whatsapp_at: null,              // zera countdown de redistribuição
        })
        .eq('id', lead.id);

      // Cancelar toques pendentes na fila de automação — o novo corretor não deve receber
      // disparos automáticos de uma cadência iniciada pelo corretor anterior
      await supabase.from('lead_activation_queue')
        .update({ status: 'cancelled', cancel_reason: 'lead_redistributed' })
        .eq('lead_id', lead.id)
        .eq('status', 'pending');

      // Atualizar contagem local
      if (oldBrokerId) loadMap[oldBrokerId] = Math.max(0, (loadMap[oldBrokerId] || 1) - 1);
      loadMap[newBroker.id] = (loadMap[newBroker.id] || 0) + 1;

      // Log de auditoria
      await supabase.from('automation_logs').insert({
        entity_type: 'redistribuicao',
        entity_id: lead.id,
        status: 'success',
        message_sent: `Lead redistribuído de ${broker.first_name ?? 'corretor anterior'} para ${newBroker.first_name} — lead respondeu há ${thresholdH}h+ e corretor não retornou`,
        executed_at: now,
      });

      // Notificar novo corretor
      await supabase.from('internal_notifications').insert({
        to_id: newBroker.id,
        type: 'LEAD_REDISTRIBUTED',
        title: '📥 Lead redistribuído para você',
        message: `${lead.name} respondeu mas o corretor anterior não retornou em ${thresholdH}h. Lead está esperando atendimento!`,
        related_lead_id: lead.id,
      });

      // Notificar corretor anterior com motivo claro
      await supabase.from('internal_notifications').insert({
        to_id: oldBrokerId,
        type: 'LEAD_REDISTRIBUTED',
        title: '⚠️ Lead redistribuído por falta de retorno',
        message: `${lead.name} respondeu sua mensagem mas você não retornou em ${thresholdH}h. O lead foi repassado para outro corretor.`,
        related_lead_id: lead.id,
      });

      redistributed++;
      console.log(`[agente-redistribuicao] ✅ ${lead.name}: ${broker.first_name ?? '?'} → ${newBroker.first_name}`);
    }

    console.log(`[agente-redistribuicao] done — redistributed=${redistributed}`);

    return new Response(JSON.stringify({ redistributed }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[agente-redistribuicao] fatal:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
