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

    const { data: executions } = await supabase.from('cadence_executions').select('*, leads(*)').eq('status', 'active').lte('next_execution_at', now).limit(100);
    if (!executions || executions.length === 0) {
      console.log('[followup_scheduler] no executions');
      return new Response(JSON.stringify({ processed: 0 }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let processed = 0;

    for (const exec of executions) {
      try {
        const lead = exec.leads;
        if (!lead) continue;

        // Load broker profile (assigned broker)
        const { data: broker } = await supabase.from('profiles').select('*').eq('id', lead.assigned_broker_id).maybeSingle();
        if (!broker || !broker.bot_instance_id) {
          console.warn('[followup_scheduler] broker or bot_instance_id missing for lead', lead.id);
          continue;
        }

        const { data: bot } = await supabase.from('bot_instances').select('*').eq('id', broker.bot_instance_id).maybeSingle();
        if (!bot) {
          console.warn('[followup_scheduler] bot instance not found for broker', broker.id);
          continue;
        }

        // Build message (simplified: use a template from cadence_steps or automation rule)
        const message = exec.message || `Olá ${lead.name || ''}, tudo bem? Só um lembrete.`;

        // Invoke send_whatsapp_message with explicit instanceName
        const { error: sendError } = await supabase.functions.invoke('send_whatsapp_message', {
          body: { botId: bot.id, phone: lead.phone, message, conversationId: null, instanceName: bot.instance_name }
        });

        if (sendError) {
          console.error('[followup_scheduler] send error', sendError.message);
          continue;
        }

        processed++;

        // Advance execution (simple: increment current_step and schedule next)
        const nextDate = new Date(); nextDate.setDate(nextDate.getDate() + 1);
        await supabase.from('cadence_executions').update({ current_step: (exec.current_step || 0) + 1, next_execution_at: nextDate.toISOString() }).eq('id', exec.id);

        await new Promise(r => setTimeout(r, 500));
      } catch (e: any) {
        console.error('[followup_scheduler] error processing exec', e.message);
      }
    }

    return new Response(JSON.stringify({ processed }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('[followup_scheduler] error', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
