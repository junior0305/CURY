import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('🤖 Automation Engine v2 (com chip do corretor)');
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { type, leadId, brokerId } = await req.json();
    console.log('📋 Tipo:', type, '| Lead:', leadId, '| Broker:', brokerId);

    // Buscar lead
    const { data: lead } = await supabaseClient
      .from('leads')
      .select('*, profiles!assigned_broker_id(*)')
      .eq('id', leadId)
      .single();

    if (!lead) {
      return new Response(JSON.stringify({ error: 'Lead not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('✅ Lead:', lead.name);

    // Buscar corretor
    const broker = lead.profiles || (brokerId ? await supabaseClient.from('profiles').select('*').eq('id', brokerId).single().then(r => r.data) : null);

    if (!broker) {
      console.log('⚠️ Nenhum corretor atribuído');
      return new Response(JSON.stringify({ error: 'No broker assigned' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('👤 Corretor:', broker.full_name || broker.email);

    // Verificar configurações do corretor
    const settings = broker.automation_settings || {};
    
    if (type === 'welcome' && !settings.welcome_enabled) {
      console.log('⏸️ Boas-vindas desabilitadas para este corretor');
      return new Response(JSON.stringify({ message: 'Welcome disabled by broker' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (type === 'follow_up' && !settings.follow_up_enabled) {
      console.log('⏸️ Follow-up desabilitado para este corretor');
      return new Response(JSON.stringify({ message: 'Follow-up disabled by broker' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Buscar bot instance do corretor
    if (!broker.bot_instance_id) {
      console.log('❌ Corretor não tem instância configurada');
      return new Response(JSON.stringify({ error: 'Broker has no bot instance configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: botInstance } = await supabaseClient
      .from('bot_instances')
      .select('*')
      .eq('id', broker.bot_instance_id)
      .single();

    if (!botInstance) {
      console.log('❌ Bot instance não encontrada');
      return new Response(JSON.stringify({ error: 'Bot instance not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('📱 Usando bot:', botInstance.name);

    // ANÁLISE DE CONTEXTO PARA FOLLOW-UP
    if (type === 'follow_up') {
      console.log('🧠 Analisando contexto da conversa...');
      
      // Buscar últimas mensagens
      const { data: conversation } = await supabaseClient
        .from('ia_conversations')
        .select('*')
        .eq('lead_phone', lead.phone)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (conversation) {
        const { data: messages } = await supabaseClient
          .from('ia_messages')
          .select('*')
          .eq('conversation_id', conversation.id)
          .order('created_at', { ascending: false })
          .limit(10);

        const messagesText = (messages || []).map(m => 
          `${m.sender_type === 'lead' ? 'Cliente' : 'Corretor'}: ${m.message_text}`
        ).reverse().join('\n');

        console.log('💬 Últimas mensagens:', messagesText.substring(0, 200));

        // Chamar IA para analisar
        const analysisPrompt = `Analise esta conversa e determine se é seguro enviar um follow-up agora.

Últimas mensagens:
${messagesText}

Verifique:
1. Há algum agendamento futuro mencionado?
2. Cliente pediu para aguardar?
3. Há algum compromisso pendente?

Responda em JSON:
{
  "safe_to_followup": true/false,
  "reasoning": "explicação curta",
  "scheduled_date": "YYYY-MM-DD" ou null
}`;

        const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') || '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',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-3-sonnet-20240229',
            max_tokens: 200,
            messages: [{ role: 'user', content: analysisPrompt }],
          }),
        });

        if (anthropicResponse.ok) {
          const aiResult = await anthropicResponse.json();
          const analysisText = aiResult.content?.[0]?.text || '{}';
          console.log('🤖 Análise da IA:', analysisText);

          let analysis;
          try {
            analysis = JSON.parse(analysisText.match(/\{[\s\S]*\}/)?.[0] || '{}');
          } catch (e) {
            analysis = { safe_to_followup: true, reasoning: 'Erro ao parsear' };
          }

          // Salvar análise
          await supabaseClient.from('ai_context_analysis').insert({
            conversation_id: conversation.id,
            lead_id: leadId,
            analysis_type: 'follow_up_check',
            last_messages: messages,
            ai_decision: analysis.safe_to_followup ? 'approved' : 'rejected',
            ai_reasoning: analysis.reasoning,
            scheduled_action: analysis.scheduled_date ? new Date(analysis.scheduled_date).toISOString() : null,
          });

          if (!analysis.safe_to_followup) {
            console.log('🚫 IA rejeitou follow-up:', analysis.reasoning);
            return new Response(JSON.stringify({ 
              message: 'Follow-up rejected by AI', 
              reasoning: analysis.reasoning 
            }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          console.log('✅ IA aprovou follow-up:', analysis.reasoning);
        }
      }
    }

    // Buscar regra
    const { data: rule } = await supabaseClient
      .from('automation_rules')
      .select('*')
      .eq('type', type)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!rule) {
      console.log('⚠️ Nenhuma regra encontrada para:', type);
      return new Response(JSON.stringify({ message: 'No rule found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Preparar mensagem
    let message = rule.message_template || '';
    message = message.replace(/{nome}/g, lead.name || 'Cliente');
    message = message.replace(/{lead_name}/g, lead.name || 'Cliente');

    console.log('📤 Enviando mensagem via bot do corretor');

    // Enviar usando bot do corretor
    const { error: sendError } = await supabaseClient.functions.invoke('send_whatsapp_message', {
      body: {
        botId: botInstance.id,
        phone: lead.phone,
        message: message,
        conversationId: null,
      },
    });

    if (sendError) {
      console.error('❌ Erro ao enviar:', sendError);
      await supabaseClient.from('automation_logs').insert({
        rule_id: rule.id,
        entity_type: 'lead',
        entity_id: leadId,
        status: 'failed',
        recipient_phone: lead.phone,
        error_message: sendError.message,
      });
      
      return new Response(JSON.stringify({ error: sendError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('✅ Mensagem enviada com sucesso');

    await supabaseClient.from('automation_logs').insert({
      rule_id: rule.id,
      entity_type: 'lead',
      entity_id: leadId,
      status: 'success',
      recipient_phone: lead.phone,
      message_sent: message,
    });

    return new Response(
      JSON.stringify({ success: true, message: 'Sent via broker bot' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('❌ Erro:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});