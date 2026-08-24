import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('📢 Manager Notification Scheduler iniciado');
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const { data: conversations, error: convError } = await supabaseClient
      .from('ia_conversations')
      .select('*, leads(*), bot_instances(*)')
      .gte('messages_count', 1)
      .lte('last_message_at', twentyFourHoursAgo.toISOString())
      .neq('status', 'no_interest')
      .neq('status', 'converted')
      .limit(50);

    if (convError) throw convError;

    if (!conversations || conversations.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No leads without response', notified: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: managers } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('role', 'MANAGER')
      .not('phone', 'is', null);

    if (!managers || managers.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No managers found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: systemSettings } = await supabaseClient
      .from('system_settings')
      .select('value')
      .eq('key', 'notification_bot_instance_id')
      .single();

    if (!systemSettings?.value) {
      return new Response(
        JSON.stringify({ error: 'No notification bot configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const botId = systemSettings.value as string;
    let notified = 0;

    for (const manager of managers) {
      try {
        const leadsText = conversations.slice(0, 10).map((conv: any, i: number) => 
          `${i + 1}. ${conv.lead_name} (${conv.lead_phone}) - Última mensagem: ${new Date(conv.last_message_at).toLocaleDateString('pt-BR')}`
        ).join('\n');

        const message = `⚠️ *Leads sem resposta há 24h*\n\nTotal: ${conversations.length}\n\n${leadsText}${conversations.length > 10 ? '\n\n...e mais ' + (conversations.length - 10) + ' leads' : ''}\n\nAcesse o CRM para mais detalhes.`;

        const { error: sendError } = await supabaseClient.functions.invoke('send_whatsapp_message', {
          body: { botId, phone: manager.phone, message, conversationId: null },
        });

        if (!sendError) notified++;
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error: any) {
        console.error(`Erro ao processar manager:`, error.message);
      }
    }

    return new Response(
      JSON.stringify({ success: true, notified, leads_without_response: conversations.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});