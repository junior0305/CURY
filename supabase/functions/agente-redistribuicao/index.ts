import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Status que NÃO devem ser resetados para 'NEW' ao redistribuir.
 * Lead em NEGOTIATING/VISIT_SCHEDULED/DOCS_REQUESTED não pode perder o estágio.
 * Resetar para NEW faz o scheduler mandar mensagem de boas-vindas novamente,
 * constrangendo o lead que já está avançado no funil.
 */
const ADVANCED_STATUSES = ['NEGOTIATING', 'VISIT_SCHEDULED', 'VISITA_REALIZADA', 'DOCS_REQUESTED'];

function statusAfterRedistribution(currentStatus: string): string {
  return ADVANCED_STATUSES.includes(currentStatus) ? currentStatus : 'NEW';
}

function getSetting(settings: any[], key: string, fallback: number): number {
  const s = settings.find((s: any) => s.key === key);
  return Math.max(1, parseInt(String(s?.value ?? fallback), 10) || fallback);
}

/** Envia notificação WhatsApp ao corretor via bot do gerente */
async function notifyBrokerWhatsApp(
  supabase: any,
  brokerId: string,
  brokerPhone: string,
  managerId: string | null,
  message: string,
): Promise<void> {
  if (!brokerPhone) return;

  let botId: string | null = null;

  if (managerId) {
    const { data: mgr } = await supabase
      .from('profiles')
      .select('bot_instance_id')
      .eq('id', managerId)
      .maybeSingle();
    botId = mgr?.bot_instance_id ?? null;
  }

  if (!botId) {
    const { data: backup } = await supabase
      .from('system_settings').select('value').eq('key', 'notification_bot_instance_id').maybeSingle();
    botId = backup?.value ?? null;
  }

  if (!botId) return;

  await supabase.functions.invoke('send_whatsapp_message', {
    body: { botId, phone: brokerPhone, message },
  });
}

/** Avisa corretor de lead próprio que redistribuição está próxima */
function buildWarningMessage(brokerName: string, leadName: string, horasRestantes: number): string {
  return [
    `⚠️ *${brokerName}, atenção!*`,
    ``,
    `O lead *${leadName}* está há mais de 5 dias sem nenhuma interação sua.`,
    ``,
    `⏰ Você tem aproximadamente *${horasRestantes}h* antes deste lead ser redistribuído para outro corretor da sua equipe.`,
    ``,
    `👉 Entre no sistema agora e retome o contato:`,
    `https://comandra.com.br/dashboard`,
    ``,
    `_Gestão Comandra_`,
  ].join('\n');
}

/** Notificação de lead novo (igual ao incoming-lead — corretor não sabe que é reciclado) */
function buildNewLeadMessage(leadName: string, tag: string, appUrl: string): string {
  return [
    `🎯 *Novo lead para você!*`,
    ``,
    `👤 *${leadName}*`,
    tag ? `🏷️ ${tag}` : '',
    ``,
    `📲 *Entre no sistema para ver o contato e enviar mensagem:*`,
    appUrl,
    ``,
    `⏰ Atenda rápido — leads que esperam mais de 5 min convertem muito menos.`,
  ].filter(l => l !== '').join('\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  );

  const appUrl = Deno.env.get('APP_URL') || 'https://comandra.com.br/dashboard';
  const now = new Date().toISOString();
  let redistributed = 0;
  let warned = 0;

  try {
    // ── Configurações ────────────────────────────────────────────────────────
    const { data: allSettings } = await supabase
      .from('system_settings')
      .select('key, value')
      .in('key', [
        'agente_redistribuicao_enabled',
        'agente_redistribuicao_threshold_h',       // lead do gerente → mesma equipe
        'agente_redistribuicao_proprio_threshold_h', // lead próprio → 7 dias
        'agente_redistribuicao_stage2_threshold_h',  // cross-team após stage 1
        'agente_redistribuicao_aviso_proprio_h',     // aviso 5 dias
      ]);

    const settings = allSettings || [];
    const enabledSetting = settings.find((s: any) => s.key === 'agente_redistribuicao_enabled');
    const enabled = String(enabledSetting?.value ?? 'false') === 'true';

    if (!enabled) {
      return new Response(JSON.stringify({ skipped: 'disabled', redistributed: 0, warned: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const thresholdGerenteH  = getSetting(settings, 'agente_redistribuicao_threshold_h', 48);
    const thresholdProprioH  = getSetting(settings, 'agente_redistribuicao_proprio_threshold_h', 168);
    const thresholdStage2H   = getSetting(settings, 'agente_redistribuicao_stage2_threshold_h', 48);
    const avisoProprioH      = getSetting(settings, 'agente_redistribuicao_aviso_proprio_h', 120);

    const gerenteThresholdAgo = new Date(Date.now() - thresholdGerenteH  * 3600000).toISOString();
    const proprioThresholdAgo = new Date(Date.now() - thresholdProprioH  * 3600000).toISOString();
    const stage2ThresholdAgo  = new Date(Date.now() - thresholdStage2H   * 3600000).toISOString();
    const avisoThresholdAgo   = new Date(Date.now() - avisoProprioH      * 3600000).toISOString();

    // ── Corretores disponíveis ───────────────────────────────────────────────
    const { data: availableBrokers } = await supabase
      .from('profiles')
      .select('id, first_name, phone, bot_instance_id, manager_id')
      .eq('role', 'BROKER')
      .eq('lead_assignment_enabled', true)
      .not('bot_instance_id', 'is', null);

    const brokers = availableBrokers || [];

    // Load balancing: contagem de leads ativos por corretor
    const { data: activeLeads } = await supabase
      .from('leads')
      .select('broker_id')
      .in('status', ['NEW', 'IN_PROGRESS', 'DOCS_REQUESTED'])
      .not('broker_id', 'is', null);

    const loadMap: Record<string, number> = {};
    for (const l of activeLeads || []) {
      if (l.broker_id) loadMap[l.broker_id] = (loadMap[l.broker_id] || 0) + 1;
    }

    // ── PASSO A: Avisos de lead próprio prestes a ser redistribuído ──────────
    // Lead próprio (no_redistribute=true) parado há 5+ dias mas menos de 7 dias
    const { data: leadsParaAviso } = await supabase
      .from('leads')
      .select('id, name, tag, broker_id, last_interaction_at, broker:profiles!broker_id(first_name, phone, manager_id)')
      .in('status', ['NEW', 'IN_PROGRESS', 'DOCS_REQUESTED'])
      .eq('no_redistribute', true)
      .eq('redistribution_stage', 0)
      .not('broker_id', 'is', null)
      .lt('last_interaction_at', avisoThresholdAgo)
      .gt('last_interaction_at', proprioThresholdAgo); // ainda não passou dos 7 dias

    for (const lead of leadsParaAviso || []) {
      const broker = (lead as any).broker;
      if (!broker?.phone) continue;

      // Anti-spam: aviso máximo 1x por lead nas últimas 24h
      const oneDayAgo = new Date(Date.now() - 24 * 3600000).toISOString();
      const { data: recentWarn } = await supabase
        .from('automation_logs')
        .select('id')
        .eq('entity_id', lead.id)
        .eq('entity_type', 'aviso_redistribuicao_proprio')
        .gte('executed_at', oneDayAgo)
        .maybeSingle();

      if (recentWarn) continue;

      const horasPassadas = (Date.now() - new Date(lead.last_interaction_at).getTime()) / 3600000;
      const horasRestantes = Math.max(1, Math.round(thresholdProprioH - horasPassadas));
      const msg = buildWarningMessage(broker.first_name || 'Corretor', lead.name, horasRestantes);

      await notifyBrokerWhatsApp(supabase, lead.broker_id, broker.phone, broker.manager_id, msg);

      await supabase.from('automation_logs').insert({
        entity_type: 'aviso_redistribuicao_proprio',
        entity_id: lead.id,
        status: 'success',
        message_sent: msg,
        recipient_phone: broker.phone,
        executed_at: now,
      });

      warned++;
      console.log(`[agente-redistribuicao] ⚠️ Aviso enviado: ${lead.name} → ${broker.first_name} (${horasRestantes}h restantes)`);
    }

    // ── PASSO B: Stage 2 — Cross-team ───────────────────────────────────────
    // Leads que já foram redistribuídos dentro da equipe (stage=1)
    // e o novo corretor também ficou sem responder por 48h
    const { data: stage2Leads } = await supabase
      .from('leads')
      .select('id, name, tag, status, broker_id, manager_id, redistribution_stage, original_broker_id, broker:profiles!broker_id(id, first_name, protect_own_leads, manager_id)')
      .in('status', ['NEW', 'IN_PROGRESS', 'DOCS_REQUESTED'])
      .eq('redistribution_stage', 1)
      .lt('redistributed_at', stage2ThresholdAgo)
      .not('broker_id', 'is', null);

    for (const lead of stage2Leads || []) {
      const broker = (lead as any).broker;
      if (!broker) continue;
      if (broker.protect_own_leads) continue;

      // Anti-spam
      const { data: recentLog } = await supabase
        .from('automation_logs').select('id')
        .eq('entity_id', lead.id).eq('entity_type', 'redistribuicao_same_team_stage2')
        .gte('executed_at', stage2ThresholdAgo).maybeSingle();
      if (recentLog) continue;

      // Stage 2 — Mantém SEMPRE dentro da equipe (manager_id do lead).
      // Mesmo se o broker original está bloqueado/ausente, lead nunca cruza
      // pra outra equipe. Manager dono dos leads continua dono.
      const leadMgr = (lead as any).broker?.manager_id ?? lead.manager_id ?? null;
      const candidates = brokers.filter(b =>
        b.id !== lead.broker_id &&
        b.id !== (lead as any).original_broker_id &&
        (leadMgr ? b.manager_id === leadMgr : true)
      );
      if (!candidates.length) continue;

      candidates.sort((a, b) => (loadMap[a.id] || 0) - (loadMap[b.id] || 0));
      const newBroker = candidates[0];
      const oldBrokerId = lead.broker_id as string;

      await supabase.from('leads').update({
        broker_id:             newBroker.id,
        status:                statusAfterRedistribution(lead.status),
        redistribution_stage:  2,
        redistributed_at:      now,
        no_redistribute:       false, // perde proteção de lead próprio
        last_interaction_at:   now,
        last_broker_whatsapp_at: null,
      }).eq('id', lead.id);

      await supabase.from('lead_activation_queue')
        .update({ status: 'cancelled', cancel_reason: 'lead_redistributed_stage2_same_team' })
        .eq('lead_id', lead.id).eq('status', 'pending');

      loadMap[oldBrokerId] = Math.max(0, (loadMap[oldBrokerId] || 1) - 1);
      loadMap[newBroker.id] = (loadMap[newBroker.id] || 0) + 1;

      // Notificação ao novo corretor — parece lead novo
      const mgr = newBroker.manager_id;
      const notifMsg = buildNewLeadMessage(lead.name, lead.tag || '', appUrl);
      if (newBroker.phone) {
        await notifyBrokerWhatsApp(supabase, newBroker.id, newBroker.phone, mgr, notifMsg);
      }

      await supabase.from('internal_notifications').insert({
        to_id: newBroker.id,
        type: 'LEAD_REDISTRIBUTED',
        title: '📥 Novo lead atribuído para você',
        message: `${lead.name} está aguardando atendimento.`,
        related_lead_id: lead.id,
      });

      await supabase.from('automation_logs').insert({
        entity_type: 'redistribuicao_same_team_stage2',
        entity_id: lead.id,
        status: 'success',
        message_sent: `Stage 2 mesma equipe: ${broker.first_name ?? '?'} → ${newBroker.first_name}`,
        executed_at: now,
      });

      redistributed++;
      console.log(`[agente-redistribuicao] 🌐 Cross-team: ${lead.name} → ${newBroker.first_name}`);
      await new Promise(r => setTimeout(r, 500));
    }

    // ── PASSO C: Stage 1 — Lead do gerente (no_redistribute=false) ───────────
    const { data: gerenteLeads } = await supabase
      .from('leads')
      .select('id, name, tag, status, broker_id, last_lead_response_at, last_broker_whatsapp_at, broker:profiles!broker_id(id, first_name, protect_own_leads, bot_instance_id, manager_id, phone)')
      .in('status', ['NEW', 'IN_PROGRESS', 'DOCS_REQUESTED'])
      .eq('no_redistribute', false)
      .eq('redistribution_stage', 0)
      .not('broker_id', 'is', null)
      .not('last_lead_response_at', 'is', null)
      .lt('last_lead_response_at', gerenteThresholdAgo)
      .limit(20);

    for (const lead of gerenteLeads || []) {
      const broker = (lead as any).broker;
      if (!broker) continue;
      if (broker.protect_own_leads) continue;

      // Corretor respondeu após o lead?
      const leadResponseAt = (lead as any).last_lead_response_at;
      const brokerReplyAt  = (lead as any).last_broker_whatsapp_at;
      if (brokerReplyAt && leadResponseAt && new Date(brokerReplyAt) > new Date(leadResponseAt)) continue;

      // Sentinela ativa?
      const { data: sentinela } = await supabase
        .from('ai_sentinela_sessions').select('id')
        .eq('lead_id', lead.id).eq('status', 'active').maybeSingle();
      if (sentinela) continue;

      // Anti-spam
      const { data: recentLog } = await supabase
        .from('automation_logs').select('id')
        .eq('entity_id', lead.id).eq('entity_type', 'redistribuicao')
        .gte('executed_at', gerenteThresholdAgo).maybeSingle();
      if (recentLog) continue;

      // Mesma equipe, corretor diferente
      const managerIdBroker = broker.manager_id ?? null;
      const candidates = brokers.filter(b =>
        b.id !== lead.broker_id &&
        (managerIdBroker ? b.manager_id === managerIdBroker : true)
      );
      if (!candidates.length) continue;

      candidates.sort((a, b) => (loadMap[a.id] || 0) - (loadMap[b.id] || 0));
      const newBroker = candidates[0];
      const oldBrokerId = lead.broker_id as string;

      await supabase.from('leads').update({
        broker_id:             newBroker.id,
        status:                statusAfterRedistribution(lead.status),
        redistribution_stage:  1,
        redistributed_at:      now,
        original_broker_id:    oldBrokerId,
        last_interaction_at:   now,
        last_broker_whatsapp_at: null,
      }).eq('id', lead.id);

      await supabase.from('lead_activation_queue')
        .update({ status: 'cancelled', cancel_reason: 'lead_redistributed' })
        .eq('lead_id', lead.id).eq('status', 'pending');

      loadMap[oldBrokerId] = Math.max(0, (loadMap[oldBrokerId] || 1) - 1);
      loadMap[newBroker.id] = (loadMap[newBroker.id] || 0) + 1;

      // Notificação ao novo corretor — parece lead novo
      const notifMsg = buildNewLeadMessage(lead.name, lead.tag || '', appUrl);
      if (newBroker.phone) {
        await notifyBrokerWhatsApp(supabase, newBroker.id, newBroker.phone, newBroker.manager_id, notifMsg);
      }

      await supabase.from('internal_notifications').insert([
        {
          to_id: newBroker.id,
          type: 'LEAD_REDISTRIBUTED',
          title: '📥 Novo lead atribuído para você',
          message: `${lead.name} está aguardando atendimento.`,
          related_lead_id: lead.id,
        },
        {
          to_id: oldBrokerId,
          type: 'LEAD_REDISTRIBUTED',
          title: '⚠️ Lead redistribuído por falta de retorno',
          message: `${lead.name} respondeu mas você não retornou em ${thresholdGerenteH}h. Lead repassado para outro corretor da equipe.`,
          related_lead_id: lead.id,
        },
      ]);

      await supabase.from('automation_logs').insert({
        entity_type: 'redistribuicao',
        entity_id: lead.id,
        status: 'success',
        message_sent: `Stage 1 (mesma equipe): ${broker.first_name ?? '?'} → ${newBroker.first_name}`,
        executed_at: now,
      });

      redistributed++;
      console.log(`[agente-redistribuicao] ✅ Stage 1: ${lead.name} → ${newBroker.first_name}`);
      await new Promise(r => setTimeout(r, 500));
    }

    // ── PASSO D: Stage 1 — Lead próprio (no_redistribute=true, 7 dias) ───────
    const { data: proprioLeads } = await supabase
      .from('leads')
      .select('id, name, tag, status, broker_id, last_interaction_at, broker:profiles!broker_id(id, first_name, protect_own_leads, manager_id, phone)')
      .in('status', ['NEW', 'IN_PROGRESS', 'DOCS_REQUESTED'])
      .eq('no_redistribute', true)
      .eq('redistribution_stage', 0)
      .not('broker_id', 'is', null)
      .lt('last_interaction_at', proprioThresholdAgo)
      .limit(10);

    for (const lead of proprioLeads || []) {
      const broker = (lead as any).broker;
      if (!broker) continue;
      if (broker.protect_own_leads) continue;

      // Mesma equipe
      const managerIdBroker = broker.manager_id ?? null;
      const candidates = brokers.filter(b =>
        b.id !== lead.broker_id &&
        (managerIdBroker ? b.manager_id === managerIdBroker : true)
      );
      if (!candidates.length) continue;

      candidates.sort((a, b) => (loadMap[a.id] || 0) - (loadMap[b.id] || 0));
      const newBroker = candidates[0];
      const oldBrokerId = lead.broker_id as string;

      await supabase.from('leads').update({
        broker_id:             newBroker.id,
        status:                statusAfterRedistribution(lead.status),
        redistribution_stage:  1,
        redistributed_at:      now,
        original_broker_id:    oldBrokerId,
        no_redistribute:       false, // perde proteção — agora é lead da equipe
        last_interaction_at:   now,
        last_broker_whatsapp_at: null,
      }).eq('id', lead.id);

      await supabase.from('lead_activation_queue')
        .update({ status: 'cancelled', cancel_reason: 'lead_proprio_redistribuido' })
        .eq('lead_id', lead.id).eq('status', 'pending');

      loadMap[oldBrokerId] = Math.max(0, (loadMap[oldBrokerId] || 1) - 1);
      loadMap[newBroker.id] = (loadMap[newBroker.id] || 0) + 1;

      const notifMsg = buildNewLeadMessage(lead.name, lead.tag || '', appUrl);
      if (newBroker.phone) {
        await notifyBrokerWhatsApp(supabase, newBroker.id, newBroker.phone, newBroker.manager_id, notifMsg);
      }

      await supabase.from('internal_notifications').insert([
        {
          to_id: newBroker.id,
          type: 'LEAD_REDISTRIBUTED',
          title: '📥 Novo lead atribuído para você',
          message: `${lead.name} está aguardando atendimento.`,
          related_lead_id: lead.id,
        },
        {
          to_id: oldBrokerId,
          type: 'LEAD_PROPRIO_EXPIRADO',
          title: '❌ Lead próprio redistribuído',
          message: `${lead.name} ficou 7 dias sem contato e foi repassado para outro corretor da equipe.`,
          related_lead_id: lead.id,
        },
      ]);

      await supabase.from('automation_logs').insert({
        entity_type: 'redistribuicao_proprio',
        entity_id: lead.id,
        status: 'success',
        message_sent: `Lead próprio 7 dias: ${broker.first_name ?? '?'} → ${newBroker.first_name}`,
        executed_at: now,
      });

      redistributed++;
      console.log(`[agente-redistribuicao] 🔒→✅ Lead próprio expirado: ${lead.name} → ${newBroker.first_name}`);
      await new Promise(r => setTimeout(r, 500));
    }

    // ── PASSO E: Leads silenciosos — bot tentou 3+ vezes, 7+ dias sem resposta ─
    // Lead nunca respondeu ao bot. Dá uma segunda chance com novo corretor.
    const bot7DaysAgo = new Date(Date.now() - 7 * 24 * 3600000).toISOString();
    const { data: silentLeads } = await supabase
      .from('leads')
      .select('id, name, tag, broker_id, contact_attempts, last_broker_whatsapp_at, broker:profiles!broker_id(id, first_name, protect_own_leads, manager_id, phone)')
      .in('status', ['NEW', 'IN_PROGRESS'])
      .eq('no_redistribute', false)
      .eq('redistribution_stage', 0)
      .not('broker_id', 'is', null)
      .is('last_lead_response_at', null)
      .gte('contact_attempts', 3)
      .not('last_broker_whatsapp_at', 'is', null)
      .lt('last_broker_whatsapp_at', bot7DaysAgo)
      .limit(10);

    for (const lead of silentLeads || []) {
      const broker = (lead as any).broker;
      if (!broker) continue;
      if (broker.protect_own_leads) continue;

      // Anti-spam: só redistribui 1x por lead
      const { data: recentSilent } = await supabase
        .from('automation_logs').select('id')
        .eq('entity_id', lead.id).eq('entity_type', 'redistribuicao_silencioso')
        .gte('executed_at', bot7DaysAgo).maybeSingle();
      if (recentSilent) continue;

      const managerIdBroker = broker.manager_id ?? null;
      const candidates = brokers.filter(b =>
        b.id !== lead.broker_id &&
        (managerIdBroker ? b.manager_id === managerIdBroker : true)
      );
      if (!candidates.length) continue;

      candidates.sort((a, b) => (loadMap[a.id] || 0) - (loadMap[b.id] || 0));
      const newBroker = candidates[0];
      const oldBrokerId = lead.broker_id as string;

      await supabase.from('leads').update({
        broker_id:               newBroker.id,
        status:                  'IN_PROGRESS', // silencioso: nunca respondeu, vai para IN_PROGRESS (não NEW para não disparar welcome)
        redistribution_stage:    1,
        redistributed_at:        now,
        original_broker_id:      oldBrokerId,
        last_interaction_at:     now,
        last_broker_whatsapp_at: null,
        contact_attempts:        0,
      }).eq('id', lead.id);

      await supabase.from('lead_activation_queue')
        .update({ status: 'cancelled', cancel_reason: 'lead_silencioso_redistribuido' })
        .eq('lead_id', lead.id).eq('status', 'pending');

      loadMap[oldBrokerId] = Math.max(0, (loadMap[oldBrokerId] || 1) - 1);
      loadMap[newBroker.id] = (loadMap[newBroker.id] || 0) + 1;

      const notifMsg = buildNewLeadMessage(lead.name, lead.tag || '', appUrl);
      if (newBroker.phone) {
        await notifyBrokerWhatsApp(supabase, newBroker.id, newBroker.phone, newBroker.manager_id, notifMsg);
      }

      await supabase.from('internal_notifications').insert({
        to_id: newBroker.id,
        type: 'LEAD_REDISTRIBUTED',
        title: '📥 Novo lead atribuído para você',
        message: `${lead.name} está aguardando atendimento.`,
        related_lead_id: lead.id,
      });

      await supabase.from('automation_logs').insert({
        entity_type: 'redistribuicao_silencioso',
        entity_id: lead.id,
        status: 'success',
        message_sent: `Silencioso (${lead.contact_attempts}x sem resposta): ${broker.first_name ?? '?'} → ${newBroker.first_name}`,
        executed_at: now,
      });

      redistributed++;
      console.log(`[agente-redistribuicao] 🔇 Silencioso: ${lead.name} (${lead.contact_attempts}x) → ${newBroker.first_name}`);
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`[agente-redistribuicao] done — redistributed=${redistributed} warned=${warned}`);

    return new Response(JSON.stringify({ redistributed, warned }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[agente-redistribuicao] fatal:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
