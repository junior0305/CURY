import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const clonedReq = req.clone();
    const payload = await clonedReq.json().catch(() => null);

    if (!payload) {
      return new Response(JSON.stringify({ error: 'Invalid or empty JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const sourceData = payload.data?.attributes || payload.attributes || payload;
    const name = sourceData.name || sourceData.nome || sourceData.fullName || 'Lead Sem Nome';
    const phone = sourceData.phone || sourceData.telefone || sourceData.cellphone || sourceData.whatsapp || sourceData.contact;
    const email = sourceData.email || sourceData.mail || '';
    const origin = sourceData.source || sourceData.origin || sourceData.origem || 'Make/Webhook';
    const message = sourceData.message || sourceData.mensagem || sourceData.Interesse || '';
    const tag = sourceData.tag || sourceData.interest || '';

    if (!phone) {
      return new Response(JSON.stringify({ error: 'Phone is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const leadValues: Record<string, string> = {
      tag: (tag || '').toString(),
      source: (origin || '').toString(),
      product: (sourceData.product || '').toString(),
      campaign: (sourceData.campaign || '').toString(),
    };

    const { data: queues } = await supabase.from('distribution_queues').select('*').eq('is_active', true).order('created_at', { ascending: true });

    let chosenBroker: any = null;
    let chosenQueue: any = null;

    if (queues && queues.length > 0) {
      for (const q of queues) {
        if (!q.match_field || q.match_field === '*') {
          if (!chosenQueue) chosenQueue = q;
          continue;
        }
        const field = q.match_field;
        const expected = (q.match_value || '').toString().trim().toUpperCase();
        const leadVal = (leadValues[field] || '').toString().trim().toUpperCase();
        if (expected && leadVal && expected === leadVal) {
          chosenQueue = q;
          break;
        }
      }
    }

    if (chosenQueue) {
      const { data: freshQ } = await supabase.from('distribution_queues').select('*').eq('id', chosenQueue.id).maybeSingle();
      if (freshQ && freshQ.broker_ids?.length > 0) {
        const idx = (freshQ.last_assigned_index || 0) % freshQ.broker_ids.length;
        const selectedBrokerId = freshQ.broker_ids[idx];
        await supabase.from('distribution_queues').update({ last_assigned_index: (freshQ.last_assigned_index || 0) + 1 }).eq('id', chosenQueue.id);
        const { data: brokerProfile } = await supabase.from('profiles').select('*').eq('id', selectedBrokerId).maybeSingle();
        chosenBroker = brokerProfile;
      }
    }

    if (!chosenBroker) {
      const { data: brokers } = await supabase.from('profiles').select('*').eq('lead_assignment_enabled', true).limit(1);
      if (brokers && brokers.length > 0) chosenBroker = brokers[0];
    }

    const nowIso = new Date().toISOString();
    const insertPayload: any = {
      name, phone, email,
      tag: tag || message || origin,
      status: 'NEW',
      last_interaction_at: nowIso,
      created_at: nowIso,
      received_at: nowIso,
    };

    if (chosenBroker) insertPayload.assigned_broker_id = chosenBroker.id;

    const { data: newLead, error: insertError } = await supabase.from('leads').insert(insertPayload).select().single();
    if (insertError) throw insertError;

    await supabase.from('distribution_logs').insert({
      lead_name: name,
      lead_phone: phone,
      assigned_to_name: chosenBroker ? `${chosenBroker.first_name || ''} ${chosenBroker.last_name || ''}`.trim() : null,
      queue_name: chosenQueue ? chosenQueue.name : 'FALLBACK',
      status: 'SUCCESS'
    });

    let welcomeSent = false;
    if (chosenBroker && chosenBroker.automation_settings?.welcome_enabled && chosenBroker.bot_instance_id) {
      const { data: brokerBot } = await supabase.from('bot_instances').select('*').eq('id', chosenBroker.bot_instance_id).maybeSingle();
      if (brokerBot) {
        let text = `Olá ${name}! 👋\n\nObrigado pelo interesse!`;
        const { response } = await fetch(`${brokerBot.evolution_api_url}/message/sendText/${brokerBot.instance_name}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': brokerBot.evolution_api_key },
          body: JSON.stringify({ number: phone, text: text }),
        }).catch(() => ({ response: { ok: false } }));

        welcomeSent = true; 
      }
    }

    return new Response(JSON.stringify({ success: true, lead: newLead, welcome_sent: welcomeSent }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})
