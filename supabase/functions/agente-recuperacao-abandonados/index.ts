import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Mensagens de reativação por contexto */
function buildMessage(name: string, tag: string): string {
  const firstName = name?.split(' ')[0] || 'você';
  const product = tag || 'nosso imóvel';
  const messages = [
    `Olá ${firstName}! 😊 Faz um tempo que não conversamos sobre ${product}. Estamos com condições especiais disponíveis agora — ainda faz sentido eu te mostrar? Responde aqui que te conto mais! 👋`,
    `${firstName}, lembrei de você! 🏠 Aquele interesse em ${product} — ainda está no seu radar? Tenho uma atualização que pode te interessar. É só me dizer!`,
    `Oi ${firstName}! Passando para saber se o momento para ${product} ficou melhor para você. Sem compromisso, só quero te ajudar se ainda fizer sentido. 😊`,
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  );

  const now = new Date().toISOString();
  let reactivated = 0;

  try {
    // ── Configurações ──────────────────────────────────────────────────────────
    const [{ data: enabledSetting }, { data: diasSetting }, { data: tentativasSetting }] = await Promise.all([
      supabase.from('system_settings').select('value').eq('key', 'agente_recuperacao_enabled').maybeSingle(),
      supabase.from('system_settings').select('value').eq('key', 'agente_recuperacao_dias').maybeSingle(),
      supabase.from('system_settings').select('value').eq('key', 'agente_recuperacao_max_tentativas').maybeSingle(),
    ]);

    const enabled = String(enabledSetting?.value ?? 'false') === 'true';
    if (!enabled) {
      return new Response(JSON.stringify({ skipped: 'disabled', reactivated: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const diasEspera = Math.max(1, parseInt(String(diasSetting?.value ?? '15'), 10) || 15);
    const maxTentativas = Math.max(1, parseInt(String(tentativasSetting?.value ?? '2'), 10) || 2);
    const abandonadosApartirDe = new Date(Date.now() - diasEspera * 86400000).toISOString();

    console.log(`[agente-recuperacao] dias=${diasEspera} maxTentativas=${maxTentativas}`);

    // ── Buscar leads abandonados elegíveis ────────────────────────────────────
    // Abandonados há pelo menos X dias, com corretor e bot atribuídos
    const { data: abandonados } = await supabase
      .from('leads')
      .select('id, name, phone, tag, broker_id, broker:profiles!broker_id(first_name, bot_instance_id)')
      .eq('status', 'ABANDONED')
      .not('broker_id', 'is', null)
      .not('phone', 'is', null)
      .lt('updated_at', abandonadosApartirDe)
      .eq('pause_auto_messages', false)
      .limit(15);

    console.log(`[agente-recuperacao] ${abandonados?.length ?? 0} leads abandonados elegíveis`);

    if (!abandonados?.length) {
      return new Response(JSON.stringify({ reactivated: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Processar cada lead ────────────────────────────────────────────────────
    for (const lead of abandonados) {
      const broker = (lead as any).broker;
      if (!broker?.bot_instance_id) continue;

      // Verificar quantas tentativas já foram feitas
      const { count: tentativas } = await supabase
        .from('automation_logs')
        .select('id', { count: 'exact', head: true })
        .eq('entity_id', lead.id)
        .eq('entity_type', 'recuperacao_abandonado');

      if ((tentativas ?? 0) >= maxTentativas) {
        console.log(`[agente-recuperacao] SKIP ${lead.id} — máx tentativas atingido (${tentativas}/${maxTentativas})`);
        continue;
      }

      // Anti-spam: não tentar o mesmo lead mais de uma vez por semana
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: recentAttempt } = await supabase
        .from('automation_logs')
        .select('id')
        .eq('entity_id', lead.id)
        .eq('entity_type', 'recuperacao_abandonado')
        .gte('executed_at', sevenDaysAgo)
        .maybeSingle();

      if (recentAttempt) {
        console.log(`[agente-recuperacao] SKIP ${lead.id} — tentativa recente`);
        continue;
      }

      const message = buildMessage(lead.name, lead.tag);

      const { data: result } = await supabase.functions.invoke('send_whatsapp_message', {
        body: { botId: broker.bot_instance_id, phone: lead.phone, message, send_source: 'campaign' },
      });

      // Log da tentativa (sucesso ou falha)
      await supabase.from('automation_logs').insert({
        entity_type: 'recuperacao_abandonado',
        entity_id: lead.id,
        status: result?.success ? 'success' : 'failed',
        message_sent: message,
        recipient_phone: lead.phone,
        error_message: result?.success ? null : JSON.stringify(result),
        executed_at: now,
      });

      if (result?.success) {
        // Reativar lead: voltar para NEW e resetar interação
        await supabase.from('leads').update({
          status: 'NEW',
          last_interaction_at: now,
          last_broker_whatsapp_at: now,
        }).eq('id', lead.id);

        // Notificar corretor
        await supabase.from('internal_notifications').insert({
          to_id: lead.broker_id,
          type: 'LEAD_REACTIVATED',
          title: '🔄 Lead reativado automaticamente',
          message: `${lead.name} foi recontactado após ${diasEspera} dias abandonado. Fique atento à resposta!`,
          related_lead_id: lead.id,
        });

        reactivated++;
        console.log(`[agente-recuperacao] ✅ ${lead.name} reativado (tentativa ${(tentativas ?? 0) + 1}/${maxTentativas})`);
      }

      await new Promise(r => setTimeout(r, 400));
    }

    console.log(`[agente-recuperacao] done — reactivated=${reactivated}`);

    return new Response(JSON.stringify({ reactivated }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[agente-recuperacao] fatal:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
