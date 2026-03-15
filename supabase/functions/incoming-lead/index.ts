import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. Lidar com preflight CORS (OPTIONS)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // 2. Ler o body
    const clonedReq = req.clone();
    const payload = await clonedReq.json().catch(() => null);

    if (!payload) {
      console.error("[incoming-lead] Falha ao ler JSON do corpo.");
      return new Response(JSON.stringify({ error: 'Invalid or empty JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log("[incoming-lead] Payload recebido:", JSON.stringify(payload));

    // 3. Extração de dados
    const sourceData = payload.data?.attributes || payload.attributes || payload;
    const name = sourceData.name || sourceData.nome || sourceData.fullName || 'Lead Sem Nome';
    const phone = sourceData.phone || sourceData.telefone || sourceData.cellphone || sourceData.whatsapp || sourceData.contact;
    const email = sourceData.email || sourceData.mail || '';
    const origin = sourceData.source || sourceData.origin || sourceData.origem || 'Make/Webhook';
    const message = sourceData.message || sourceData.mensagem || sourceData.Interesse || '';
    const tag = sourceData.tag || sourceData.interest || sourceData.interest || '';

    if (!phone) {
      return new Response(JSON.stringify({ error: 'Phone is required', received: payload }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 4. Inicializar Supabase Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 5. Lógica de Distribuição usando distribution_queues (round-robin)
    // Determinar valor de match baseado no campo configurado
    const leadValues: Record<string, string> = {
      tag: (tag || '').toString(),
      source: (origin || '').toString(),
      product: (sourceData.product || '').toString(),
      campaign: (sourceData.campaign || '').toString(),
    };

    // Buscar filas ativas
    const { data: queues } = await supabase.from('distribution_queues').select('*').eq('is_active', true).order('created_at', { ascending: true });

    let chosenBroker: any = null;
    let chosenQueue: any = null;

    if (queues && queues.length > 0) {
      // Encontrar a primeira fila que combine
      for (const q of queues) {
        try {
          if (!q.match_field || q.match_field === '*') {
            // fallback match '*' - but only choose if not finding a specific match earlier
            if (!chosenQueue) {
              chosenQueue = q;
            }
            continue;
          }

          const field = q.match_field;
          const expected = (q.match_value || '').toString().trim().toUpperCase();
          const leadVal = (leadValues[field] || '').toString().trim().toUpperCase();
          if (expected && leadVal && expected === leadVal) {
            chosenQueue = q;
            break;
          }
        } catch (e) {
          console.warn('[incoming-lead] error checking queue match', e.message);
        }
      }
    }

    // If queue found, select broker by round-robin with optimistic locking (retry)
    if (chosenQueue) {
      const maxAttempts = 5;
      let attempts = 0;
      let selectedBrokerId: string | null = null;

      while (attempts < maxAttempts) {
        attempts++;
        const { data: freshQ, error: freshErr } = await supabase.from('distribution_queues').select('*').eq('id', chosenQueue.id).maybeSingle();
        if (freshErr || !freshQ) {
          console.warn('[incoming-lead] failed to refetch queue', freshErr?.message);
          break;
        }

        const brokersInQueue: string[] = freshQ.broker_ids || [];
        if (!brokersInQueue || brokersInQueue.length === 0) {
          console.warn('[incoming-lead] queue has no brokers', chosenQueue.id);
          break;
        }

        const oldIndex = typeof freshQ.last_assigned_index === 'number' ? freshQ.last_assigned_index : 0;
        const idx = oldIndex % brokersInQueue.length;
        selectedBrokerId = brokersInQueue[idx];

        // Try to increment last_assigned_index only if unchanged (optimistic)
        const { data: updated, error: updateErr } = await supabase.from('distribution_queues').update({ last_assigned_index: oldIndex + 1 }).eq('id', chosenQueue.id).eq('last_assigned_index', oldIndex).select().maybeSingle();
        if (updateErr) {
          console.warn('[incoming-lead] update last_assigned_index failed, retrying', updateErr.message);
          continue; // retry
        }

        if (updated) {
          // success
          const { data: brokerProfile } = await supabase.from('profiles').select('*').eq('id', selectedBrokerId).maybeSingle();
          chosenBroker = brokerProfile;
          break;
        }

        // If update returned no rows (race), retry
      }

      // If attempts failed to update, fallback: pick deterministic broker from chosenQueue without updating index
      if (!chosenBroker && chosenQueue.broker_ids && chosenQueue.broker_ids.length > 0) {
        const idx = (chosenQueue.last_assigned_index || 0) % chosenQueue.broker_ids.length;
        const fallbackBrokerId = chosenQueue.broker_ids[idx];
        const { data: brokerProfile } = await supabase.from('profiles').select('*').eq('id', fallbackBrokerId).maybeSingle();
        chosenBroker = brokerProfile;
      }
    }

    // If no queue matched, fallback: choose among enabled brokers
    if (!chosenBroker) {
      const { data: brokers, error: brokerError } = await supabase.from('profiles').select('*').eq('lead_assignment_enabled', true).order('first_name');
      if (brokerError || !brokers || brokers.length === 0) {
        console.warn('[incoming-lead] no brokers available for fallback', brokerError?.message);
      } else {
        // simple selection: pick broker with least assigned leads in last 30 days
        const brokerIds = brokers.map((b: any) => b.id);
        const { data: counts } = await supabase.rpc('count_leads_by_brokers', { broker_ids: brokerIds }).catch(() => ({ data: null }));
        // If RPC not available or failed, fallback to random
        let pick: any = null;
        if (counts && Array.isArray(counts) && counts.length > 0) {
          // counts expected as [{broker_id, cnt}]
          counts.sort((a: any, b: any) => (a.cnt || 0) - (b.cnt || 0));
          pick = counts[0];
          const { data: brokerProfile } = await supabase.from('profiles').select('*').eq('id', pick.broker_id).maybeSingle();
          chosenBroker = brokerProfile;
        } else {
          // random
          const b = brokers[Math.floor(Math.random() * brokers.length)];
          chosenBroker = b;
        }
      }
    }

    // 6. Inserir Lead com assigned_broker_id
    const nowIso = new Date().toISOString();

    const insertPayload: any = {
      name,
      phone,
      email,
      tag: tag || message || origin,
      status: 'NEW',
      last_interaction_at: nowIso,
      created_at: nowIso,
      received_at: nowIso,
    };

    if (chosenBroker && chosenBroker.id) {
      insertPayload.assigned_broker_id = chosenBroker.id;
    }

    const { data: newLead, error: insertError } = await supabase
      .from('leads')
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) {
      console.error('[incoming-lead] failed to insert lead', insertError.message);
      throw insertError;
    }

    // 7. Registrar Log de Sucesso
    await supabase.from('distribution_logs').insert({
      lead_name: name,
      lead_phone: phone,
      assigned_to_name: chosenBroker ? `${chosenBroker.first_name || ''} ${chosenBroker.last_name || ''}`.trim() : null,
      queue_name: chosenQueue ? chosenQueue.name : 'FALLBACK',
      status: 'SUCCESS'
    });

    // 8. Enviar boa-vinda via templates do IA Builder (se aplicável)
    try {
      if (chosenBroker) {
        const automationSettings = chosenBroker.automation_settings || {};
        if (automationSettings.welcome_enabled) {
          // Fetch active welcome templates for this broker, fallback to global
          let { data: templates } = await supabase
            .from('welcome_templates')
            .select('*')
            .eq('is_active', true);

          templates = templates || [];
          if (templates.length > 0) {
            const { count } = await supabase.from('leads').select('id', { count: 'exact', head: true }).eq('assigned_broker_id', chosenBroker.id);
            const idx = (typeof count === 'number' ? count : 0) % templates.length;
            const chosenTemplate = templates[idx];

            const brokerName = `${chosenBroker.first_name || ''} ${chosenBroker.last_name || ''}`.trim() || 'Corretor';
            const text = (chosenTemplate.message || '').replace(/\{nome\}/gi, name).replace(/\{broker\}/gi, brokerName);

            // Send via send_whatsapp_message with explicit instanceName
            if (chosenBroker.bot_instance_id) {
              const { data: bot } = await supabase.from('bot_instances').select('*').eq('id', chosenBroker.bot_instance_id).maybeSingle();
              if (bot) {
                const { error: sendError } = await supabase.functions.invoke('send_whatsapp_message', {
                  body: { botId: bot.id, phone: phone, message: text, conversationId: null, instanceName: bot.instance_name }
                });

                await supabase.from('automation_logs').insert({
                  rule_id: null,
                  entity_type: 'welcome',
                  entity_id: newLead.id,
                  status: sendError ? 'failed' : 'success',
                  message_sent: `[template:${chosenTemplate.id}] ${text}`,
                  recipient_phone: phone
                });
              } else {
                console.warn('[incoming-lead] broker bot not found for welcome');
              }
            } else {
              console.warn('[incoming-lead] broker has no bot_instance_id, skipping welcome');
            }
          }
        }
      }
    } catch (e: any) {
      console.error('[incoming-lead] error sending welcome', e.message);
    }

    return new Response(JSON.stringify({ success: true, lead: newLead }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error("[incoming-lead] Erro crítico:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})