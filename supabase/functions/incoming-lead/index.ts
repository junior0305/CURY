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
    // 2. Tentar ler o corpo da requisição APENAS UMA VEZ
    // Usamos clone() apenas por segurança extrema, embora não deva ser necessário aqui
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

    // 3. Extração de dados (Suporte a estruturas aninhadas do Make/Facebook)
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

    // 5. Lógica de Distribuição (Round Robin simplificado)
    // Buscamos perfis que tenham o ID presente na tabela de usuários com role BROKER
    // Como a tabela profiles do Supabase Auth é gerenciada, vamos buscar todos os perfis
    // que tenham a flag lead_assignment_enabled ativa.
    const { data: brokers, error: brokerError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, automation_settings, bot_instance_id')
      .eq('lead_assignment_enabled', true);

    if (brokerError) {
      console.error("[incoming-lead] Erro ao buscar corretores:", brokerError.message);
      throw brokerError;
    }

    if (!brokers || brokers.length === 0) {
      console.warn("[incoming-lead] Nenhum corretor disponível para atribuição.");
      // Registrar log de falha de distribuição
      await supabase.from('distribution_logs').insert({
        lead_name: name,
        lead_phone: phone,
        status: 'NO_BROKER_AVAILABLE',
        error_message: 'Nenhum corretor com fila ativa.'
      });
      return new Response(JSON.stringify({ error: 'No brokers available' }), {
        status: 200, // Retornamos 200 para o Make não repetir, mas avisamos do erro interno
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Selecionar um corretor (Aqui você pode implementar o Round Robin real via banco)
    const chosenBroker = brokers[Math.floor(Math.random() * brokers.length)];

    const nowIso = new Date().toISOString();

    // 6. Inserir Lead
    const { data: newLead, error: insertError } = await supabase
      .from('leads')
      .insert({
        name,
        phone,
        email,
        tag: tag || message || origin, // Usamos 'tag' para guardar a mensagem, já que 'message' não existe no banco
        status: 'NEW',
        broker_id: chosenBroker.id,
        manager_id: chosenBroker.manager_id,
        last_interaction_at: nowIso,
        created_at: nowIso
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // 7. Registrar Log de Sucesso (USANDO NOMES DE COLUNAS REAIS)
    await supabase.from('distribution_logs').insert({
      lead_name: name,
      lead_phone: phone,
      assigned_to_name: `${chosenBroker.first_name || ''} ${chosenBroker.last_name || ''}`.trim() || 'Corretor',
      queue_name: origin || 'Make/Webhook',
      status: 'SUCCESS'
    });

    // 8. Enviar boa-vinda via templates do IA Builder (round-robin por corretor)
    try {
      const automationSettings = chosenBroker.automation_settings || {};
      if (automationSettings.welcome_enabled) {
        // Fetch active welcome templates for this broker, fallback to global (broker_id is null)
        let { data: templates } = await supabase
          .from('welcome_templates')
          .select('*')
          .eq('is_active', true)
          .in('broker_id', [chosenBroker.id, null]);

        templates = templates || [];
        if (templates.length > 0) {
          // Determine index using count of existing leads for this broker to distribute templates round-robin
          const { count } = await supabase.from('leads').select('id', { count: 'exact', head: true }).eq('broker_id', chosenBroker.id);
          const idx = (typeof count === 'number' ? count : 0) % templates.length;
          const chosenTemplate = templates[idx];

          // Replace placeholders
          const brokerName = `${chosenBroker.first_name || ''} ${chosenBroker.last_name || ''}`.trim() || 'Corretor';
          const text = (chosenTemplate.message || '').replace(/\{nome\}/gi, name).replace(/\{broker\}/gi, brokerName);

          // Send via send_whatsapp_message with explicit instanceName
          // First resolve bot of broker
          if (chosenBroker.bot_instance_id) {
            const { data: bot } = await supabase.from('bot_instances').select('*').eq('id', chosenBroker.bot_instance_id).maybeSingle();
            if (bot) {
              const { error: sendError } = await supabase.functions.invoke('send_whatsapp_message', {
                body: { botId: bot.id, phone: phone, message: text, conversationId: null, instanceName: bot.instance_name }
              });

              // Log send result in automation_logs for analytics (store template id)
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