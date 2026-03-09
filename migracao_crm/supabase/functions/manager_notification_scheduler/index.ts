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

    console.log('🔍 Buscando leads sem resposta há 24h...');

    // Buscar leads com mensagens enviadas mas sem resposta há 24h
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

    if (convError) {
      console.error('❌ Erro ao buscar conversas:', convError);
      throw convError;
    }

    if (!conversations || conversations.length === 0) {
      console.log('✅ Nenhum lead sem resposta');
      return new Response(
        JSON.stringify({ message: 'No leads without response', notified: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 ${conversations.length} leads sem resposta encontrados`);

    // Buscar managers ativos
    const { data: managers, error: managerError } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('role', 'manager')
      .eq('is_active', true)
      .not('phone', 'is', null);

    if (managerError || !managers || managers.length === 0) {
      console.log('⚠️ Nenhum manager com telefone cadastrado');
      return new Response(
        JSON.stringify({ message: 'No managers found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`👤 ${managers.length} managers encontrados`);

    // Buscar bot de notificação
    const { data: systemSettings } = await supabaseClient
      .from('system_settings')
      .select('value')
      .eq('key', 'notification_bot_instance_id')
      .single();

    if (!systemSettings?.value) {
      console.log('❌ Nenhuma instância de notificação configurada');
      return new Response(
        JSON.stringify({ error: 'No notification bot configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const botId = systemSettings.value as string;

    let notified = 0;

    // Enviar resumo para cada manager
    for (const manager of managers) {
      try {
        const leadsText = conversations.slice(0, 10).map((conv, i) => 
          `${i + 1}. ${conv.lead_name} (${conv.lead_phone}) - Última mensagem: ${new Date(conv.last_message_at).toLocaleDateString('pt-BR')}`
        ).join('\n');

        const message = `⚠️ *Leads sem resposta há 24h*\n\nTotal: ${conversations.length}\n\n${leadsText}${conversations.length > 10 ? '\n\n...e mais ' + (conversations.length - 10) + ' leads' : ''}\n\nAcesse o CRM para mais detalhes.`;

        const { error: sendError } = await supabaseClient.functions.invoke('send_whatsapp_message', {
          body: {
            botId: botId,
            phone: manager.phone,
            message: message,
            conversationId: null,
          },
        });

        if (sendError) {
          console.error(`❌ Erro ao notificar manager ${manager.email}:`, sendError);
        } else {
          console.log(`✅ Manager ${manager.email} notificado`);
          notified++;
        }

        // Aguardar 2 segundos entre envios
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error: any) {
        console.error(`❌ Erro ao processar manager:`, error.message);
      }
    }

    console.log(`🎉 Notificações concluídas: ${notified} managers notificados`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        notified,
        leads_without_response: conversations.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Erro geral:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});