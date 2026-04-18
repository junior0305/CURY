import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─────────────────────────────────────────────────────────────────────────────
// agente-visitas
//
// Monitora leads em VISIT_SCHEDULED e age em 3 fases:
//
//  Fase 1 (24-72h)  → Confirma a visita com o lead + alerta interno ao corretor
//  Fase 2 (72-120h) → "Como foi a visita?" — reengaja lead para avançar proposta
//  Fase 3 (120h+)   → Escalada: alerta gerente + última tentativa ao lead
//
// Anti-spam: cada fase é registrada em automation_logs — nunca repete a mesma fase.
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Thresholds em horas
const FASE1_APOS_H  = 24;   // confirmar visita após 24h
const FASE2_APOS_H  = 72;   // reengajar após 3 dias
const FASE3_APOS_H  = 120;  // escalar após 5 dias

function hoursAgo(iso: string | null): number {
  if (!iso) return 9999;
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

async function sendMsg(supabase: any, botId: string, phone: string, message: string): Promise<boolean> {
  try {
    const { data } = await supabase.functions.invoke('send_whatsapp_message', {
      body: { botId, phone, message },
    });
    return data?.success === true;
  } catch {
    return false;
  }
}

async function logPhase(supabase: any, leadId: string, phase: string, msg: string) {
  await supabase.from('automation_logs').insert({
    entity_type: `agente_visitas_${phase}`,
    entity_id: leadId,
    status: 'success',
    message_sent: msg,
    executed_at: new Date().toISOString(),
  }).catch(() => {});
}

async function alreadySentPhase(supabase: any, leadId: string, phase: string): Promise<boolean> {
  const { data } = await supabase
    .from('automation_logs')
    .select('id')
    .eq('entity_type', `agente_visitas_${phase}`)
    .eq('entity_id', leadId)
    .maybeSingle();
  return !!data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  );

  try {
    // ── Busca leads em VISIT_SCHEDULED com pelo menos 24h ─────────────────────
    const since24h = new Date(Date.now() - FASE1_APOS_H * 3600000).toISOString();

    const { data: leads } = await supabase
      .from('leads')
      .select(`
        id, name, phone, broker_id, last_interaction_at, last_lead_response_at,
        broker:profiles!broker_id(id, first_name, phone, bot_instance_id, manager_id)
      `)
      .eq('status', 'VISIT_SCHEDULED')
      .lt('last_interaction_at', since24h)
      .not('broker_id', 'is', null)
      .limit(30);

    if (!leads?.length) {
      return new Response(JSON.stringify({ processed: 0, reason: 'no_visit_leads' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve bot fallback (superintendent)
    const { data: supBot } = await supabase
      .from('system_settings').select('value')
      .eq('key', 'superintendent_bot_instance_id').maybeSingle();
    const fallbackBotId: string | null = supBot?.value ?? null;

    let fase1 = 0, fase2 = 0, fase3 = 0;

    for (const lead of leads) {
      try {
        const broker     = (lead as any).broker;
        const botId: string | null = broker?.bot_instance_id ?? fallbackBotId;
        const firstName  = lead.name?.split(' ')[0] || 'você';
        const hoursStale = hoursAgo(lead.last_interaction_at);

        // ── FASE 3: 5+ dias → Escalada ao gerente ──────────────────────────
        if (hoursStale >= FASE3_APOS_H) {
          if (await alreadySentPhase(supabase, lead.id, 'fase3')) continue;

          // Alerta interno ao corretor
          if (broker?.id) {
            await supabase.from('internal_notifications').insert({
              to_id: broker.id,
              type: 'VISIT_NO_ADVANCE',
              title: `🏠 Visita sem avanço — ${lead.name}`,
              message: `${lead.name} está em VISIT_SCHEDULED há ${Math.floor(hoursStale)}h sem avançar. Ligue para confirmar o fechamento!`,
            }).catch(() => {});
          }

          // WhatsApp ao gerente
          if (broker?.manager_id) {
            const { data: manager } = await supabase
              .from('profiles')
              .select('id, first_name, phone, bot_instance_id')
              .eq('id', broker.manager_id)
              .maybeSingle();

            if (manager?.phone) {
              const managerBotId = manager.bot_instance_id ?? fallbackBotId;
              const dias = Math.floor(hoursStale / 24);
              const managerMsg = [
                `🏠 *Visita sem fechamento — ${lead.name}*`,
                ``,
                `Lead parado há *${dias} dias* em Visita Agendada.`,
                `Corretor: ${broker.first_name || '?'}`,
                ``,
                `Ação necessária: confirmar se a visita aconteceu e orientar o fechamento. 🎯`,
              ].join('\n');

              if (managerBotId && manager.phone) {
                await sendMsg(supabase, managerBotId, manager.phone, managerMsg);
              }
            }
          }

          // Última mensagem ao lead (se ainda não respondeu recentemente)
          const leadSilentH = hoursAgo(lead.last_lead_response_at);
          if (botId && lead.phone && leadSilentH > 48) {
            const msg = `${firstName}, espero que esteja bem! 🏠\n\nO que achou do imóvel que visitou? Se ficou com alguma dúvida ou quiser avançar com a proposta, estou aqui para ajudar!`;
            await sendMsg(supabase, botId, lead.phone, msg);
            await logPhase(supabase, lead.id, 'fase3', msg);
          } else {
            await logPhase(supabase, lead.id, 'fase3', 'manager_alert_only');
          }

          console.log(`[agente-visitas] 🚨 FASE 3 — ${lead.name} (${Math.floor(hoursStale)}h)`);
          fase3++;
          continue;
        }

        // ── FASE 2: 3-5 dias → "Como foi a visita?" ────────────────────────
        if (hoursStale >= FASE2_APOS_H) {
          if (await alreadySentPhase(supabase, lead.id, 'fase2')) continue;

          // Alerta interno ao corretor
          if (broker?.id) {
            await supabase.from('internal_notifications').insert({
              to_id: broker.id,
              type: 'VISIT_FOLLOWUP',
              title: `🏠 Follow-up pós-visita — ${lead.name}`,
              message: `Já faz ${Math.floor(hoursStale / 24)} dias desde a visita de ${lead.name}. Tente avançar para a proposta!`,
            }).catch(() => {});
          }

          // Mensagem ao lead
          if (botId && lead.phone) {
            const msg = `Oi ${firstName}! 😊\n\nJá faz alguns dias desde a visita. O que achou do imóvel? 🏠\n\nPodemos avançar com a análise de crédito gratuita para garantir sua vaga. Me responde uma coisinha?`;
            const ok = await sendMsg(supabase, botId, lead.phone, msg);
            if (ok) {
              await supabase.from('leads').update({
                last_interaction_at: new Date().toISOString(),
                last_broker_whatsapp_at: new Date().toISOString(),
              }).eq('id', lead.id);
              await logPhase(supabase, lead.id, 'fase2', msg);
              console.log(`[agente-visitas] ✅ FASE 2 — ${lead.name}`);
              fase2++;
            }
          }
          continue;
        }

        // ── FASE 1: 24-72h → Confirmar visita ──────────────────────────────
        if (hoursStale >= FASE1_APOS_H) {
          if (await alreadySentPhase(supabase, lead.id, 'fase1')) continue;

          // Alerta interno ao corretor
          if (broker?.id) {
            await supabase.from('internal_notifications').insert({
              to_id: broker.id,
              type: 'VISIT_CONFIRM_REMINDER',
              title: `🗓️ Confirmar visita — ${lead.name}`,
              message: `Não esqueça de confirmar a visita com ${lead.name}! Se a data mudou, atualize o status no painel.`,
            }).catch(() => {});
          }

          // Mensagem de confirmação ao lead
          if (botId && lead.phone) {
            const bn = broker?.first_name || 'nossa equipe';
            const msg = `Oi ${firstName}! 😊\n\n${bn} aqui. Passando para confirmar que está tudo certo para a sua visita!\n\nSe precisar ajustar algo ou tiver alguma dúvida, é só falar. Estamos animados para te mostrar o imóvel! 🏠`;
            const ok = await sendMsg(supabase, botId, lead.phone, msg);
            if (ok) {
              await supabase.from('leads').update({
                last_interaction_at: new Date().toISOString(),
                last_broker_whatsapp_at: new Date().toISOString(),
              }).eq('id', lead.id);
              await logPhase(supabase, lead.id, 'fase1', msg);
              console.log(`[agente-visitas] ✅ FASE 1 — ${lead.name}`);
              fase1++;
            }
          }
        }

      } catch (e: any) {
        console.error(`[agente-visitas] erro ${lead.id}:`, e.message);
      }

      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`[agente-visitas] done — fase1=${fase1} fase2=${fase2} fase3=${fase3}`);

    return new Response(
      JSON.stringify({ fase1, fase2, fase3, total: fase1 + fase2 + fase3 }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[agente-visitas] fatal:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
