import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─────────────────────────────────────────────────────────────────────────────
// agente-documentacao
//
// Monitora leads em DOCS_REQUESTED e age em 3 fases:
//
//  Fase 1 (24-48h)  → Lembrete gentil: "conseguiu reunir os documentos?"
//  Fase 2 (48-96h)  → Urgência: "sua vaga pode ser perdida" + alerta corretor
//  Fase 3 (96h+)    → Escalada ao gerente via WhatsApp + última chance ao lead
//
// Anti-spam: cada fase registrada em automation_logs — nunca repete a mesma fase.
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FASE1_APOS_H = 24;   // lembrete gentil após 24h
const FASE2_APOS_H = 48;   // urgência após 48h
const FASE3_APOS_H = 96;   // escalada ao gerente após 4 dias

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
    entity_type: `agente_docs_${phase}`,
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
    .eq('entity_type', `agente_docs_${phase}`)
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
    // ── Busca leads em DOCS_REQUESTED com pelo menos 24h sem interação ────────
    const since24h = new Date(Date.now() - FASE1_APOS_H * 3600000).toISOString();

    const { data: leads } = await supabase
      .from('leads')
      .select(`
        id, name, phone, broker_id, tag,
        last_interaction_at, last_lead_response_at, last_broker_whatsapp_at,
        broker:profiles!broker_id(id, first_name, phone, bot_instance_id, manager_id)
      `)
      .eq('status', 'DOCS_REQUESTED')
      .lt('last_interaction_at', since24h)
      .not('broker_id', 'is', null)
      .limit(30);

    if (!leads?.length) {
      return new Response(JSON.stringify({ processed: 0, reason: 'no_docs_leads' }), {
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

        // Se o lead respondeu recentemente (menos de 6h), pula — conversa ativa
        if (hoursAgo(lead.last_lead_response_at) < 6) continue;

        // ── FASE 3: 4+ dias → Escalada ao gerente ──────────────────────────
        if (hoursStale >= FASE3_APOS_H) {
          if (await alreadySentPhase(supabase, lead.id, 'fase3')) continue;

          const dias = Math.floor(hoursStale / 24);

          // Alerta interno ao corretor
          if (broker?.id) {
            await supabase.from('internal_notifications').insert({
              to_id: broker.id,
              type: 'DOCS_OVERDUE',
              title: `📄 Documentos atrasados ${dias}d — ${lead.name}`,
              message: `${lead.name} está em DOCS_REQUESTED há ${dias} dias sem enviar documentos. Ligue agora para salvar essa venda!`,
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
              const managerMsg = [
                `📄 *Documentação travada — ${lead.name}*`,
                ``,
                `Lead parado há *${dias} dias* sem enviar documentos.`,
                `Corretor: ${broker.first_name || '?'}`,
                ``,
                `Essa venda está em risco! Oriente o corretor a ligar agora para o cliente. ⚡`,
              ].join('\n');

              if (managerBotId && manager.phone) {
                await sendMsg(supabase, managerBotId, manager.phone, managerMsg);
              }
            }
          }

          // Última mensagem ao lead
          if (botId && lead.phone) {
            const msg = `${firstName}, sua proposta está praticamente pronta! 🏠\n\nSó precisamos dos documentos para confirmar sua vaga. Uma foto simples já basta para começar a análise gratuita.\n\nConsegue enviar hoje? Não quero que você perca essa oportunidade! 📄`;
            const ok = await sendMsg(supabase, botId, lead.phone, msg);
            if (ok) {
              await supabase.from('leads').update({
                last_interaction_at: new Date().toISOString(),
                last_broker_whatsapp_at: new Date().toISOString(),
              }).eq('id', lead.id);
              await logPhase(supabase, lead.id, 'fase3', msg);
            } else {
              await logPhase(supabase, lead.id, 'fase3', 'manager_alert_sent');
            }
          } else {
            await logPhase(supabase, lead.id, 'fase3', 'manager_alert_only');
          }

          console.log(`[agente-docs] 🚨 FASE 3 — ${lead.name} (${dias}d)`);
          fase3++;
          continue;
        }

        // ── FASE 2: 48-96h → Urgência ──────────────────────────────────────
        if (hoursStale >= FASE2_APOS_H) {
          if (await alreadySentPhase(supabase, lead.id, 'fase2')) continue;

          // Alerta interno ao corretor
          if (broker?.id) {
            await supabase.from('internal_notifications').insert({
              to_id: broker.id,
              type: 'DOCS_URGENT',
              title: `⚡ Urgente — documentos de ${lead.name}`,
              message: `${lead.name} está há ${Math.floor(hoursStale)}h sem enviar documentos. Entre em contato hoje para não perder a venda!`,
            }).catch(() => {});
          }

          // Mensagem urgente ao lead
          if (botId && lead.phone) {
            const msg = `${firstName}, preciso da sua ajuda! ⚡\n\nSua proposta está reservada, mas precisamos dos documentos para garantir sua vaga no programa Minha Casa Minha Vida.\n\nÉ rápido: uma foto do RG, CPF e comprovante de renda já resolve! 📄\n\nConsegue enviar hoje?`;
            const ok = await sendMsg(supabase, botId, lead.phone, msg);
            if (ok) {
              await supabase.from('leads').update({
                last_interaction_at: new Date().toISOString(),
                last_broker_whatsapp_at: new Date().toISOString(),
              }).eq('id', lead.id);
              await logPhase(supabase, lead.id, 'fase2', msg);
              console.log(`[agente-docs] ✅ FASE 2 — ${lead.name}`);
              fase2++;
            }
          }
          continue;
        }

        // ── FASE 1: 24-48h → Lembrete gentil ───────────────────────────────
        if (hoursStale >= FASE1_APOS_H) {
          if (await alreadySentPhase(supabase, lead.id, 'fase1')) continue;

          if (botId && lead.phone) {
            const msg = `Oi ${firstName}! 😊\n\nPassando para saber se conseguiu reunir os documentos. Qualquer dúvida sobre o que é necessário, é só perguntar!\n\nAssim que receber, já inicio a análise gratuita para você. 📄`;
            const ok = await sendMsg(supabase, botId, lead.phone, msg);
            if (ok) {
              await supabase.from('leads').update({
                last_interaction_at: new Date().toISOString(),
                last_broker_whatsapp_at: new Date().toISOString(),
              }).eq('id', lead.id);
              await logPhase(supabase, lead.id, 'fase1', msg);
              console.log(`[agente-docs] ✅ FASE 1 — ${lead.name}`);
              fase1++;
            }
          }
        }

      } catch (e: any) {
        console.error(`[agente-docs] erro ${lead.id}:`, e.message);
      }

      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`[agente-docs] done — fase1=${fase1} fase2=${fase2} fase3=${fase3}`);

    return new Response(
      JSON.stringify({ fase1, fase2, fase3, total: fase1 + fase2 + fase3 }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[agente-docs] fatal:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
