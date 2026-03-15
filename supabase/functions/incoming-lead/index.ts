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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    const leadValues: Record<string, string> = {
      tag: (tag || '').toString(),
      source: (origin || '').toString(),
      product: (sourceData.product || '').toString(),
      campaign: (sourceData.campaign || '').toString(),
    };

    const { data: queues } = await supabase.from('distribution_queues').select('*').eq('is_active', true).order('created_at', { ascending: true });

    let chosenBroker: any = null;
    let chosenQueue: any = null;

    console.log('[MATCHING] Lead values:', leadValues);
    console.log('[MATCHING] Verificando filas...');
    
    if (queues && queues.length > 0) {
      console.log(`[MATCHING] Total de filas: ${queues.length}`);
      
      for (const q of queues) {
        console.log(`[MATCHING] Fila: ${q.name}, match_field: ${q.match_field}, match_value: ${q.match_value}`);
        
        if (!q.match_field || q.match_field === '*') {
          if (!chosenQueue) {
            console.log(`[MATCHING] Fila ${q.name} marcada como fallback`);
            chosenQueue = q;
          }
          continue;
        }
        
        const expected = (q.match_value || '').toString().trim().toUpperCase();
        const leadVal = (leadValues[q.match_field] || '').toString().trim().toUpperCase();
        
        console.log(`[MATCHING] Comparando campo "${q.match_field}": "${leadVal}" === "${expected}"`);
        
        if (expected && leadVal && expected === leadVal) {
          console.log(`[MATCHING] ✅ MATCH! Fila escolhida: ${q.name}`);
          chosenQueue = q;
          break;
        }
      }
    }

    console.log(`[MATCHING] Fila final: ${chosenQueue?.name || 'NENHUMA'}`);

    // Round-robin otimista
    if (chosenQueue && chosenQueue.broker_ids?.length > 0) {
      const maxAttempts = 3;
      for (let i = 0; i < maxAttempts; i++) {
        const { data: freshQ } = await supabase.from('distribution_queues').select('*').eq('id', chosenQueue.id).maybeSingle();
        if (freshQ?.broker_ids?.length > 0) {
          const oldIndex = freshQ.last_assigned_index || 0;
          const idx = oldIndex % freshQ.broker_ids.length;
          
          const { data: updated } = await supabase.from('distribution_queues')
            .update({ last_assigned_index: oldIndex + 1 })
            .eq('id', chosenQueue.id)
            .eq('last_assigned_index', oldIndex)
            .select()
            .maybeSingle();
          
          if (updated) {
            const { data: broker } = await supabase.from('profiles').select('*').eq('id', freshQ.broker_ids[idx]).maybeSingle();
            chosenBroker = broker;
            console.log(`[DISTRIBUTION] Corretor escolhido via round-robin: ${broker?.first_name}`);
            break;
          }
        }
      }
    }

    if (!chosenBroker) {
      console.log('[DISTRIBUTION] Fallback: escolhendo primeiro corretor habilitado');
      const { data: brokers } = await supabase.from('profiles').select('*').eq('lead_assignment_enabled', true).limit(1);
      if (brokers?.length > 0) chosenBroker = brokers[0];
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

    // NOTIFICAR CORRETOR
    let notificationSent = false;
    if (chosenBroker?.phone) {
      const { data: setting } = await supabase.from('system_settings').select('value').eq('key', 'notify_brokers_enabled').maybeSingle();
      
      if (setting?.value === true) {
        const { data: notificationBot } = await supabase.from('bot_instances').select('id').eq('phone', '11988628222').maybeSingle();
        
        if (notificationBot) {
          const notifMsg = `🎯 *Novo Lead*\n\n👤 ${name}\n📞 ${phone}\n🏷️ ${tag || 'Sem tag'}\n📍 ${origin}`;
          
          const { data: result } = await supabase.functions.invoke('send-whatsapp', {
            body: {
              instance_id: notificationBot.id,
              phone: chosenBroker.phone,
              message: notifMsg,
              type: 'notification'
            }
          });
          
          notificationSent = result?.success || false;
        }
      }
    }

    // BOAS-VINDAS PARA LEAD
    let welcomeSent = false;
    if (chosenBroker?.automation_settings?.welcome_enabled && chosenBroker.bot_instance_id) {
      let text = `Olá ${name}! 👋\n\nObrigado pelo interesse!`;
      
      const { data: templates } = await supabase.from('welcome_templates').select('*').eq('is_active', true);
      if (templates?.length > 0) {
        const { count } = await supabase.from('leads').select('id', { count: 'exact', head: true }).eq('assigned_broker_id', chosenBroker.id);
        const idx = (count || 0) % templates.length;
        const brokerName = `${chosenBroker.first_name || ''} ${chosenBroker.last_name || ''}`.trim() || 'Corretor';
        text = (templates[idx].message || '').replace(/\{nome\}/gi, name).replace(/\{broker\}/gi, brokerName);
      }

      const { data: result } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          instance_id: chosenBroker.bot_instance_id,
          phone: phone,
          message: text,
          lead_id: newLead.id,
          type: 'welcome'
        }
      });
      
      welcomeSent = result?.success || false;
    }

    return new Response(JSON.stringify({ 
      success: true, 
      lead: newLead, 
      notification_sent: notificationSent,
      welcome_sent: welcomeSent 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[incoming-lead] Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})
