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
    const rawPhone = sourceData.phone || sourceData.telefone || sourceData.cellphone || sourceData.whatsapp || sourceData.contact;
    // Remove prefixes like "p:" sent by some integrations (e.g. Facebook via Make)
    const phone = rawPhone ? String(rawPhone).replace(/^[a-z]+:/i, '').replace(/[^0-9+]/g, '') : null;
    const email = sourceData.email || sourceData.mail || '';
    const origin = sourceData.source || sourceData.origin || sourceData.origem ||
                   sourceData.campaign || sourceData.campaign_name || sourceData.ad_name ||
                   sourceData.channel || sourceData.platform || '';
    const message = sourceData.message || sourceData.mensagem || sourceData.Interesse || '';
    const tag = sourceData.tag || sourceData.primary_tag || (Array.isArray(sourceData.tags) ? sourceData.tags[0] : null) || sourceData.interest || sourceData.source || sourceData.origin || sourceData.origem || '';

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
      console.log('[DISTRIBUTION] Fallback final: distribuindo pelo corretor com menos leads hoje');
      const today = new Date().toISOString().split('T')[0];
      const { data: brokers } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, phone, team_id, bot_instance_id, manager_id, automation_settings, evolution_instance')
        .eq('lead_assignment_enabled', true)
        .eq('role', 'BROKER');

      if (brokers?.length > 0) {
        const counts = await Promise.all(brokers.map(async (b) => {
          const { count } = await supabase
            .from('leads')
            .select('id', { count: 'exact', head: true })
            .eq('broker_id', b.id)
            .gte('created_at', today + 'T00:00:00Z');
          return { broker: b, count: count || 0 };
        }));
        counts.sort((a, b) => a.count - b.count);
        chosenBroker = counts[0].broker;
        console.log(`[DISTRIBUTION] Fallback escolheu ${chosenBroker.first_name} (${counts[0].count} leads hoje)`);
      }
    }

    const nowIso = new Date().toISOString();
    const insertPayload: any = {
      name, phone, email,
      tag: tag || message || origin,
      status: 'NEW',
      last_interaction_at: nowIso,
      created_at: nowIso,
      received_at: nowIso,
      // Travar redistribuição se a fila tiver lock_after_assignment = true
      no_redistribute: chosenQueue?.lock_after_assignment === true,
    };

    if (chosenBroker) insertPayload.broker_id = chosenBroker.id;

    const { data: newLead, error: insertError } = await supabase.from('leads').insert(insertPayload).select().single();
    if (insertError) throw insertError;

    await supabase.from('distribution_logs').insert({
      lead_name: name,
      lead_phone: phone,
      assigned_to_name: chosenBroker ? `${chosenBroker.first_name || ''} ${chosenBroker.last_name || ''}`.trim() : null,
      queue_name: chosenQueue ? chosenQueue.name : 'FALLBACK',
      status: 'SUCCESS'
    });

    // ALERTA: lead sem corretor atribuído
    if (!chosenBroker) {
      const { data: admins } = await supabase
        .from('profiles')
        .select('id')
        .in('role', ['ADMIN', 'SUPERINTENDENT']);
      if (admins?.length > 0) {
        await supabase.from('internal_notifications').insert(
          admins.map((a: any) => ({
            to_id: a.id,
            type: 'LEAD_NO_BROKER',
            title: '⚠️ Lead sem corretor atribuído',
            message: `${name} (${phone}) chegou mas não foi atribuído a nenhum corretor. Verifique as filas de distribuição.`,
            related_lead_id: newLead.id,
          }))
        );
      }
    }

    // NOTIFICAR CORRETOR via bot do manager
    let notificationSent = false;
    if (chosenBroker?.phone) {
      const { data: setting } = await supabase.from('system_settings').select('value').eq('key', 'notify_brokers_enabled').maybeSingle();

      if (setting?.value === true || setting?.value === "true" || setting?.value === 1) {
        // Prioridade: bot do manager do corretor → fallback: bot global
        let notifBotId: string | null = null;

        if (chosenBroker.manager_id) {
          const { data: managerData } = await supabase
            .from('profiles').select('bot_instance_id').eq('id', chosenBroker.manager_id).maybeSingle();
          notifBotId = managerData?.bot_instance_id ?? null;
        }

        if (!notifBotId) {
          const { data: botSetting } = await supabase.from('system_settings').select('value').eq('key', 'notification_bot_instance_id').maybeSingle();
          notifBotId = botSetting?.value ?? null;
        }

        if (notifBotId) {
          const originLabel = origin || tag || 'Sem origem';
          const notifMsg = `🎯 *Novo Lead*\n\n👤 ${name}\n📞 ${phone}\n🏷️ ${tag || 'Sem tag'}\n📍 ${originLabel}`;

          const { data: result } = await supabase.functions.invoke('send_whatsapp_message', {
            body: {
              botId: notifBotId,
              phone: chosenBroker.phone,
              message: notifMsg,
            }
          });

          notificationSent = result?.success || false;
          console.log(`[incoming-lead] Notificação corretor ${chosenBroker.first_name} via bot ${notifBotId}: ${notificationSent}`);

          // ── FALLBACK: se falhou, tenta qualquer instância conectada diferente da atual ──
          if (!notificationSent) {
            console.log(`[incoming-lead] Falhou, buscando bot de fallback conectado...`);
            const { data: fallbackBots } = await supabase
              .from('bot_instances')
              .select('id, name')
              .eq('status', 'connected')
              .neq('id', notifBotId)
              .limit(3);

            for (const fallback of (fallbackBots || [])) {
              console.log(`[incoming-lead] Tentando fallback: ${fallback.name} (${fallback.id})`);
              const { data: fbResult } = await supabase.functions.invoke('send_whatsapp_message', {
                body: {
                  botId: fallback.id,
                  phone: chosenBroker.phone,
                  message: notifMsg,
                }
              });
              if (fbResult?.success) {
                notificationSent = true;
                console.log(`[incoming-lead] Notificação enviada via fallback ${fallback.name}`);
                break;
              }
            }

            if (!notificationSent) {
              console.warn(`[incoming-lead] Todos os bots falharam. Corretor ${chosenBroker.first_name} não foi notificado.`);
            }
          }
        }
      }
    }

    // BOAS-VINDAS PARA LEAD
    let welcomeSent = false;
    if (chosenBroker?.automation_settings?.welcome_enabled && chosenBroker.bot_instance_id) {
      let text = `Olá ${name}! 👋\n\nObrigado pelo interesse!`;
      let usedTemplateId: string | null = null;

      const { data: templates } = await supabase.from('welcome_templates').select('*').eq('is_active', true);
      if (templates?.length > 0) {
        const { count } = await supabase.from('leads').select('id', { count: 'exact', head: true }).eq('broker_id', chosenBroker.id);
        const idx = (count || 0) % templates.length;
        const brokerName = `${chosenBroker.first_name || ''} ${chosenBroker.last_name || ''}`.trim() || 'Corretor';
        text = (templates[idx].message || '')
          .replace(/\\n/g, '\n')
          .replace(/\{nome\}/gi, name)
          .replace(/\{broker\}/gi, brokerName);
        usedTemplateId = templates[idx].id;
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

      // Registra qual template foi usado e atualiza stats
      if (welcomeSent && usedTemplateId) {
        await supabase
          .from('leads')
          .update({ welcome_template_id: usedTemplateId })
          .eq('id', newLead.id);
        await supabase.rpc('record_welcome_template_sent', { p_template_id: usedTemplateId });
      }

      // ── CÉREBRO: cria fila de ativação se habilitado ──────────────────────
      if (welcomeSent) {
        const { data: cerebroCfg } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'cerebro_enabled')
          .maybeSingle();

        if (cerebroCfg?.value === true || cerebroCfg?.value === 'true') {
          const t = Date.now();
          await supabase.from('lead_activation_queue').insert([
            { lead_id: newLead.id, action_type: 'toque_1',    scheduled_for: new Date(t +  3 * 3600000).toISOString() },
            { lead_id: newLead.id, action_type: 'toque_2',    scheduled_for: new Date(t +  5 * 3600000).toISOString() },
            { lead_id: newLead.id, action_type: 'sentinela',  scheduled_for: new Date(t +  8 * 3600000).toISOString() },
            { lead_id: newLead.id, action_type: 'last_chance', scheduled_for: new Date(t + 24 * 3600000).toISOString() },
          ]);
          console.log(`[incoming-lead] Fila Cérebro criada para lead ${newLead.id}`);
        }
      }
    }

    // Log do webhook recebido (visível em Admin/Pipeline/Logs/Webhooks)
    await supabase.from('webhook_logs').insert({
      integration_key: 'make',
      payload: { name, phone, email, tag, origin },
      status_code: 200,
      response_body: JSON.stringify({ lead_id: newLead.id, broker: chosenBroker?.first_name || null, queue: chosenQueue?.name || 'FALLBACK' }),
    }).then(() => {}).catch(() => {}); // fire-and-forget, nunca bloqueia

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
