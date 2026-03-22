import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const now = new Date().toISOString();
    console.log('[followup_scheduler] running at', now);

    // ── BLOCO 1: Leads Críticos ──────────────────────────────────────────────
    // Lead respondeu boas-vindas, corretor ignorou por mais de 2h
    const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString();

    const { data: criticalLeads } = await supabase
      .from('leads')
      .select('id, name, phone, broker_id, welcome_responded_at, last_broker_whatsapp_at, broker:profiles!broker_id(first_name, bot_instance_id)')
      .not('welcome_responded_at', 'is', null)
      .lt('welcome_responded_at', twoHoursAgo)
      .neq('status', 'ABANDONED')
      .neq('status', 'EXCLUDED')
      .neq('status', 'CONCLUDED')
      .limit(30);

    let criticalProcessed = 0;
    for (const lead of criticalLeads || []) {
      const broker = (lead as any).broker;

      // Ignorar se o corretor já respondeu depois que o lead mandou mensagem
      if (lead.last_broker_whatsapp_at && lead.welcome_responded_at &&
          new Date(lead.last_broker_whatsapp_at) > new Date(lead.welcome_responded_at)) {
        continue;
      }

      // Evitar spam: checar se já notificamos nas últimas 4h
      const fourHoursAgo = new Date(Date.now() - 4 * 3600000).toISOString();
      const { data: recentNotif } = await supabase
        .from('internal_notifications')
        .select('id')
        .eq('related_lead_id', lead.id)
        .eq('type', 'LEAD_CRITICAL_IGNORED')
        .gte('created_at', fourHoursAgo)
        .maybeSingle();

      if (recentNotif) continue;

      // Notifica corretor com urgência
      if (lead.broker_id) {
        await supabase.from('internal_notifications').insert({
          to_id: lead.broker_id,
          type: 'LEAD_CRITICAL_IGNORED',
          title: '🚨 Lead aguardando resposta urgente!',
          message: `${lead.name} respondeu sua mensagem e está aguardando há mais de 2 horas. Atenda agora antes de perder esse lead!`,
          related_lead_id: lead.id,
        });
      }

      // Envia mensagem de aquecimento para o lead via bot do corretor
      if (broker?.bot_instance_id && lead.phone) {
        const brokerName = broker.first_name || 'nosso corretor';
        await supabase.functions.invoke('send-whatsapp', {
          body: {
            instance_id: broker.bot_instance_id,
            phone: lead.phone,
            message: `Olá ${lead.name}! 😊\n\nNosso corretor ${brokerName} está verificando sua solicitação e vai entrar em contato em breve.\n\nAgradecemos sua paciência!`,
            lead_id: lead.id,
            type: 'followup',
          }
        });

        await supabase.from('leads')
          .update({ last_broker_whatsapp_at: new Date().toISOString() })
          .eq('id', lead.id);
      }

      criticalProcessed++;
      console.log(`[followup_scheduler] Crítico processado: ${lead.id} (${lead.name})`);
    }

    console.log(`[followup_scheduler] Críticos: ${criticalProcessed}`);

    // ── BLOCO 2: Leads Frios ─────────────────────────────────────────────────
    // Sem resposta à boas-vindas há mais de 48h — reativar com mensagem automática
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 3600000).toISOString();
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600000).toISOString();

    const { data: coldLeads } = await supabase
      .from('leads')
      .select('id, name, phone, broker_id, broker:profiles!broker_id(first_name, bot_instance_id)')
      .is('welcome_responded_at', null)
      .not('last_broker_whatsapp_at', 'is', null)
      .lt('last_broker_whatsapp_at', fortyEightHoursAgo)
      .neq('status', 'ABANDONED')
      .neq('status', 'EXCLUDED')
      .neq('status', 'CONCLUDED')
      .limit(30);

    let coldProcessed = 0;
    for (const lead of coldLeads || []) {
      const broker = (lead as any).broker;
      if (!broker?.bot_instance_id || !lead.phone) continue;

      // Máximo 1 reativação a cada 3 dias por lead
      const { data: recentFollowup } = await supabase
        .from('internal_notifications')
        .select('id')
        .eq('related_lead_id', lead.id)
        .eq('type', 'COLD_FOLLOWUP_SENT')
        .gte('created_at', threeDaysAgo)
        .maybeSingle();

      if (recentFollowup) continue;

      const { data: result } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          instance_id: broker.bot_instance_id,
          phone: lead.phone,
          message: `Olá ${lead.name}! 👋\n\nPassamos aqui para saber se você ainda tem interesse no imóvel.\n\nEstamos à disposição para tirar suas dúvidas! 😊`,
          lead_id: lead.id,
          type: 'followup',
        }
      });

      if (result?.success) {
        if (lead.broker_id) {
          await supabase.from('internal_notifications').insert({
            to_id: lead.broker_id,
            type: 'COLD_FOLLOWUP_SENT',
            title: 'Follow-up automático enviado',
            message: `Mensagem de reativação enviada para ${lead.name}.`,
            related_lead_id: lead.id,
          });
        }
        await supabase.from('leads')
          .update({ last_broker_whatsapp_at: new Date().toISOString() })
          .eq('id', lead.id);

        coldProcessed++;
        console.log(`[followup_scheduler] Cold follow-up: ${lead.id} (${lead.name})`);
      }
    }

    console.log(`[followup_scheduler] Frios: ${coldProcessed}`);

    // ── BLOCO 3: Cadências existentes ────────────────────────────────────────
    const { data: executions } = await supabase
      .from('cadence_executions')
      .select('*, leads(*)')
      .eq('status', 'active')
      .lte('next_execution_at', now)
      .limit(100);

    let cadenceProcessed = 0;
    for (const exec of executions || []) {
      try {
        const lead = exec.leads;
        if (!lead) continue;

        const { data: broker } = await supabase.from('profiles').select('*').eq('id', lead.broker_id).maybeSingle();
        if (!broker || !broker.bot_instance_id) continue;

        const { data: bot } = await supabase.from('bot_instances').select('*').eq('id', broker.bot_instance_id).maybeSingle();
        if (!bot) continue;

        const message = exec.message || `Olá ${lead.name || ''}, tudo bem? Só um lembrete.`;

        const { error: sendError } = await supabase.functions.invoke('send_whatsapp_message', {
          body: { botId: bot.id, phone: lead.phone, message, conversationId: null, instanceName: bot.instance_name }
        });

        if (sendError) {
          console.error('[followup_scheduler] send error', sendError.message);
          continue;
        }

        cadenceProcessed++;
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + 1);
        await supabase.from('cadence_executions')
          .update({ current_step: (exec.current_step || 0) + 1, next_execution_at: nextDate.toISOString() })
          .eq('id', exec.id);

        await new Promise(r => setTimeout(r, 500));
      } catch (e: any) {
        console.error('[followup_scheduler] cadence error', e.message);
      }
    }

    console.log(`[followup_scheduler] Cadências: ${cadenceProcessed}`);

    return new Response(JSON.stringify({
      critical: criticalProcessed,
      cold: coldProcessed,
      cadence: cadenceProcessed,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('[followup_scheduler] error', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
