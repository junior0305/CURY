import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─────────────────────────────────────────────────────────────────────────────
// agente-sentinela-quentes
//
// Roda a cada 5 minutos (via cron).
// Detecta leads classificados como QUENTES que:
//   - Lead respondeu recentemente (last_lead_response_at < 30min atrás)
//   - Corretor NÃO respondeu desde a última mensagem do lead
//   - Modo = automatico (não foi pausado pelo corretor)
//
// Ação:
//   1. Alerta o gerente via WhatsApp E notificação interna
//   2. Registra o alerta para não repetir por 20min
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function isWithinWindow(): boolean {
  const brtH = (new Date().getUTCHours() - 3 + 24) % 24;
  const brtM = new Date().getUTCMinutes();
  const total = brtH * 60 + brtM;
  return total >= 7 * 60 && total <= 22 * 60;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  );

  // Só opera dentro do horário comercial
  if (!isWithinWindow()) {
    return new Response(JSON.stringify({ skipped: 'outside_window' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const now      = new Date();
    const ago30min = new Date(now.getTime() - 30 * 60000).toISOString();
    const ago20min = new Date(now.getTime() - 20 * 60000).toISOString();

    // 1. Busca leads quentes onde o lead respondeu nos últimos 30min
    //    mas o corretor ainda não respondeu depois disso
    const { data: hotLeads } = await supabase
      .from('leads')
      .select(`
        id, name, phone, broker_id, status,
        last_lead_response_at, last_broker_whatsapp_at,
        broker:profiles!broker_id(id, first_name, manager_id, bot_instance_id, phone)
      `)
      .in('status', ['NEW', 'IN_PROGRESS'])
      .not('broker_id', 'is', null)
      .gte('last_lead_response_at', ago30min)  // lead respondeu recentemente
      .limit(50);

    if (!hotLeads?.length) {
      return new Response(JSON.stringify({ alerted: 0, reason: 'no_hot_leads' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Filtra: corretor não respondeu depois da última resposta do lead
    const stalled = hotLeads.filter(l => {
      const leadRespondedAt  = l.last_lead_response_at ? new Date(l.last_lead_response_at) : null;
      const brokerRespondedAt = l.last_broker_whatsapp_at ? new Date(l.last_broker_whatsapp_at) : null;
      if (!leadRespondedAt) return false;
      if (brokerRespondedAt && brokerRespondedAt > leadRespondedAt) return false; // corretor já respondeu
      return true;
    });

    if (!stalled.length) {
      return new Response(JSON.stringify({ alerted: 0, reason: 'brokers_responded' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Verifica se cada lead tem intencao=quente E modo=automatico no lead_state
    const stalledIds = stalled.map(l => l.id);
    const { data: states } = await supabase
      .from('lead_state')
      .select('lead_id, intencao, modo, bloqueado')
      .in('lead_id', stalledIds);

    const stateMap = new Map((states || []).map(s => [s.lead_id, s]));

    const toAlert = stalled.filter(l => {
      const s = stateMap.get(l.id);
      if (!s) return false;                           // sem estado = ainda não classificado
      if (s.intencao !== 'quente') return false;      // só quentes
      if (s.modo === 'humano_ativo' || s.bloqueado) return false; // corretor assumiu
      return true;
    });

    if (!toAlert.length) {
      return new Response(JSON.stringify({ alerted: 0, reason: 'no_hot_or_blocked' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Deduplicação: não alertar o mesmo lead mais de 1x a cada 20min
    //    Usa lead_activation_queue como registro de alerta recente
    const { data: recentAlerts } = await supabase
      .from('lead_activation_queue')
      .select('lead_id')
      .in('lead_id', toAlert.map(l => l.id))
      .eq('action_type', 'sentinela_quente_alerta')
      .gte('created_at', ago20min);

    const recentlyAlerted = new Set((recentAlerts || []).map(a => a.lead_id));
    const finalToAlert = toAlert.filter(l => !recentlyAlerted.has(l.id));

    if (!finalToAlert.length) {
      return new Response(JSON.stringify({ alerted: 0, reason: 'all_recently_alerted' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Agrupa por gerente para enviar um alerta consolidado por equipe
    const byManager: Record<string, { managerId: string; leads: typeof finalToAlert }> = {};
    for (const l of finalToAlert) {
      const broker = (l as any).broker;
      const managerId = broker?.manager_id;
      if (!managerId) continue;
      if (!byManager[managerId]) byManager[managerId] = { managerId, leads: [] };
      byManager[managerId].leads.push(l);
    }

    let alerted = 0;

    for (const { managerId, leads } of Object.values(byManager)) {
      // Resolve bot do gerente
      const { data: manager } = await supabase
        .from('profiles')
        .select('id, first_name, phone, bot_instance_id')
        .eq('id', managerId)
        .maybeSingle();

      if (!manager) continue;

      let botId: string | null = manager.bot_instance_id ?? null;
      if (!botId) {
        const { data: anyBot } = await supabase
          .from('bot_instances').select('id')
          .in('status', ['open', 'connected']).limit(1).maybeSingle();
        botId = anyBot?.id ?? null;
      }

      // Monta mensagem consolidada
      const leadLines = leads.map(l => {
        const broker = (l as any).broker;
        const mins   = l.last_lead_response_at
          ? Math.round((now.getTime() - new Date(l.last_lead_response_at).getTime()) / 60000)
          : '?';
        return `  • *${l.name?.split(' ')[0]}* — ${broker?.first_name || '?'} | ${mins}min sem resposta`;
      }).join('\n');

      const msg = [
        `🔥 *Leads QUENTES sem resposta!*`,
        ``,
        `${leads.length} lead(s) quente(s) aguardando há mais de 5min:`,
        ``,
        leadLines,
        ``,
        `Atue agora antes de perder essas oportunidades! ⚡`,
      ].join('\n');

      // Envia WhatsApp ao gerente
      if (botId && manager.phone) {
        await supabase.functions.invoke('send_whatsapp_message', {
          body: { botId, phone: manager.phone, message: msg },
        }).catch(() => {});
      }

      // Notificação interna
      await supabase.from('internal_notifications').insert({
        to_id:   managerId,
        type:    'SENTINELA_QUENTES',
        title:   `🔥 ${leads.length} lead(s) quente(s) sem resposta`,
        message: leads.map(l => l.name?.split(' ')[0]).join(', ') + ' — sem resposta do corretor',
      }).catch(() => {});

      // Registra alertas para deduplicação
      await supabase.from('lead_activation_queue').insert(
        leads.map(l => ({
          lead_id:      l.id,
          action_type:  'sentinela_quente_alerta',
          scheduled_for: now.toISOString(),
          status:        'sent',
        }))
      ).catch(() => {});

      alerted += leads.length;
      console.log(`[sentinela-quentes] ✅ Gerente ${manager.first_name}: ${leads.length} lead(s) alertado(s)`);
    }

    return new Response(
      JSON.stringify({ alerted, managers: Object.keys(byManager).length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[sentinela-quentes] fatal:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
