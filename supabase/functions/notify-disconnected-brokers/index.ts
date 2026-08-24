import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const appUrl = Deno.env.get('APP_URL') || 'https://comandra.com.br/dashboard';

    const { data: disconnectedBrokers } = await supabase
      .from('profiles')
      .select(`
        id,
        first_name,
        last_name,
        full_name,
        phone,
        bot_instance_id,
        manager_id,
        bot_instances!profiles_bot_instance_id_fkey (
          id, status, instance_name, name
        )
      `)
      .eq('role', 'BROKER')
      .eq('is_active', true)
      .not('bot_instance_id', 'is', null)
      .not('phone', 'is', null);

    if (!disconnectedBrokers || disconnectedBrokers.length === 0) {
      return new Response(JSON.stringify({ message: 'No brokers found', sent: 0, skipped: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const offline = disconnectedBrokers.filter((b: any) => {
      const chipStatus = (b.bot_instances?.status || '').toLowerCase();
      return chipStatus !== 'open';
    });

    console.log(`[notify-disconnected] ${offline.length} corretores offline de ${disconnectedBrokers.length} total`);

    if (offline.length === 0) {
      return new Response(JSON.stringify({ message: 'All brokers connected', sent: 0, skipped: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cutoff = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
    const { data: recentNotifs } = await supabase
      .from('internal_notifications')
      .select('to_id')
      .eq('type', 'WHATSAPP_RECONNECT_ALERT')
      .gte('created_at', cutoff);

    const alreadyNotified = new Set((recentNotifs || []).map((n: any) => n.to_id));

    const managerIds = [...new Set(offline.map((b: any) => b.manager_id).filter(Boolean))];
    const { data: managers } = await supabase
      .from('profiles')
      .select(`
        id,
        first_name,
        full_name,
        bot_instance_id,
        bot_instances!profiles_bot_instance_id_fkey (
          id, status, instance_name, name, evolution_api_url, evolution_api_key
        )
      `)
      .in('id', managerIds);

    const managerMap = new Map<string, any>();
    for (const m of managers || []) {
      const chipStatus = (m.bot_instances?.status || '').toLowerCase();
      if (chipStatus === 'open' && m.bot_instance_id) {
        managerMap.set(m.id, m);
      }
    }

    let sent = 0;
    let skipped = 0;
    const results: any[] = [];

    for (const broker of offline) {
      const brokerName = broker.first_name || broker.full_name?.split(' ')[0] || broker.bot_instances?.name || 'Corretor';
      const chipName = broker.bot_instances?.instance_name || broker.bot_instances?.name || '?';

      if (alreadyNotified.has(broker.id)) {
        skipped++;
        results.push({ broker: brokerName, status: 'already_notified' });
        continue;
      }

      if (!broker.phone) {
        skipped++;
        results.push({ broker: brokerName, status: 'no_phone' });
        continue;
      }

      const manager = broker.manager_id ? managerMap.get(broker.manager_id) : null;
      if (!manager) {
        skipped++;
        results.push({ broker: brokerName, status: 'no_manager_chip_available' });
        continue;
      }

      const managerName = manager.first_name || manager.full_name?.split(' ')[0] || 'Ger\u00eancia';

      const message = [
        `\ud83d\udea8 *ATEN\u00c7\u00c3O, ${brokerName}!*`,
        ``,
        `Seu chip WhatsApp *"${chipName}"* est\u00e1 DESCONECTADO do CRM.`,
        ``,
        `\u274c Seus leads *n\u00e3o recebem* follow-up autom\u00e1tico`,
        `\u274c Mensagens autom\u00e1ticas est\u00e3o *paralisadas*`,
        `\u274c Voc\u00ea pode estar *perdendo vendas agora*`,
        ``,
        `\ud83d\udc49 *Acesse o sistema AGORA e reconecte:*`,
        `${appUrl}`,
        ``,
        `Entre no app \u2192 toque em "Conectar" \u2192 escaneie o QR Code. Leva menos de 30 segundos.`,
        ``,
        `_${managerName} - Gest\u00e3o Comandra_`,
      ].join('\n');

      try {
        const { error: sendError } = await supabase.functions.invoke('send_whatsapp_message', {
          body: {
            botId: manager.bot_instance_id,
            phone: broker.phone,
            message,
          },
        });

        if (sendError) throw new Error(sendError.message);

        await supabase.from('internal_notifications').insert({
          to_id: broker.id,
          type: 'WHATSAPP_RECONNECT_ALERT',
          title: '\ud83d\udcf2 Alerta de reconex\u00e3o enviado',
          message: `Mensagem de reconex\u00e3o enviada ao corretor ${brokerName} (chip ${chipName}) via gerente ${managerName}`,
          related_lead_id: null,
        });

        sent++;
        results.push({ broker: brokerName, chip: chipName, status: 'sent', via: managerName });
        console.log(`[notify-disconnected] \u2705 ${brokerName} notificado via ${managerName}`);

        await new Promise(r => setTimeout(r, 1500));

      } catch (err: any) {
        skipped++;
        results.push({ broker: brokerName, status: 'send_failed', error: err.message });
        console.error(`[notify-disconnected] \u274c Falha ao notificar ${brokerName}:`, err.message);
      }
    }

    console.log(`[notify-disconnected] Resultado: ${sent} enviados, ${skipped} pulados`);

    return new Response(JSON.stringify({ success: true, sent, skipped, results }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[notify-disconnected] Erro fatal:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
