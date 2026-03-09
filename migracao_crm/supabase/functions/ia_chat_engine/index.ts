import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('🤖 ia_chat_engine iniciado');
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { conversationId, incomingMessage } = await req.json();
    console.log('💬 Conversa:', conversationId);
    console.log('📥 Mensagem:', incomingMessage);

    const { data: conversation } = await supabaseClient
      .from('ia_conversations')
      .select('*, ia_campaigns(*, ai_profiles(*)), bot_instances(*)')
      .eq('id', conversationId)
      .single();

    if (!conversation) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log('✅ Lead:', conversation.lead_name);

    const { data: history } = await supabaseClient
      .from('ia_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(15);

    const messages = (history || []).map(m => 
      `${m.sender_type === 'ia' ? 'Assistente' : 'Cliente'}: ${m.message_text}`
    ).join('\n');

    let systemPrompt = '';
    
    if (conversation.ia_campaigns?.ai_profiles?.system_prompt) {
      console.log('✅ Usando perfil:', conversation.ia_campaigns.ai_profiles.name);
      systemPrompt = conversation.ia_campaigns.ai_profiles.system_prompt;
    } else if (conversation.ia_campaigns?.ai_instructions) {
      console.log('⚠️ Usando instruções customizadas');
      systemPrompt = conversation.ia_campaigns.ai_instructions;
    } else {
      systemPrompt = 'Você é um assistente prestativo e profissional.';
    }

    const leadName = conversation.lead_name || 'Cliente';
    const fullSystemPrompt = `${systemPrompt}\n\nVocê está conversando com ${leadName}.`;
    
    const userPrompt = `Histórico:\n${messages}\n\nCliente: ${incomingMessage}\n\nResponda naturalmente:`;

    console.log('🧠 Chamando Claude...');
    
    let modelToUse = 'claude-sonnet-4-20250514';
    
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') || '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',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelToUse,
        max_tokens: 300,
        system: fullSystemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!anthropicResponse.ok) {
      console.error('❌ Claude 4 falhou, tentando Claude 3...');
      modelToUse = 'claude-3-sonnet-20240229';
      
      const fallbackResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') || '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',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: modelToUse,
          max_tokens: 300,
          system: fullSystemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
      
      if (!fallbackResponse.ok) {
        const fallbackError = await fallbackResponse.text();
        throw new Error(`API error: ${fallbackError}`);
      }
      
      const aiResult = await fallbackResponse.json();
      const aiResponse = aiResult.content?.[0]?.text || 'Desculpe, pode repetir?';
      
      console.log('💬 Resposta:', aiResponse);

      // CLASSIFICAR SENTIMENTO E STATUS
      const lowerMsg = incomingMessage.toLowerCase();
      const lowerResp = aiResponse.toLowerCase();
      
      let newStatus = conversation.status;
      let sentiment = conversation.sentiment || 'neutral';
      
      // Detectar interesse positivo
      if (lowerMsg.match(/sim|quero|interesse|agendar|visita|quando|como|preço|valor/)) {
        newStatus = 'qualified';
        sentiment = 'positive';
      }
      // Detectar pedido de transferência
      else if (lowerResp.match(/transfer|corretor|humano|atendente/)) {
        newStatus = 'escalated';
        sentiment = 'positive';
      }
      // Detectar rejeição
      else if (lowerMsg.match(/não|nunca|pare|desinteress|remov|sai|chato/)) {
        newStatus = 'no_interest';
        sentiment = 'negative';
      }
      // Aguardando resposta
      else if (lowerMsg.match(/depois|pensar|ver|talvez|mais tarde/)) {
        newStatus = 'waiting_response';
        sentiment = 'neutral';
      }
      
      console.log('🎯 Status:', newStatus, '| Sentimento:', sentiment);

      await supabaseClient.functions.invoke('send_whatsapp_message', {
        body: { botId: conversation.bot_instance_id, phone: conversation.lead_phone, message: aiResponse, conversationId },
      });

      await supabaseClient.from('ia_conversations').update({ 
        last_ai_action: new Date().toISOString(), 
        messages_count: (history?.length || 0) + 2,
        status: newStatus,
        sentiment: sentiment,
      }).eq('id', conversationId);

      return new Response(JSON.stringify({ success: true, aiResponse, model: modelToUse, status: newStatus }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const aiResult = await anthropicResponse.json();
    const aiResponse = aiResult.content?.[0]?.text || 'Desculpe, pode repetir?';
    
    console.log('💬 Resposta:', aiResponse);

    // CLASSIFICAR SENTIMENTO E STATUS
    const lowerMsg = incomingMessage.toLowerCase();
    const lowerResp = aiResponse.toLowerCase();
    
    let newStatus = conversation.status;
    let sentiment = conversation.sentiment || 'neutral';
    
    if (lowerMsg.match(/sim|quero|interesse|agendar|visita|quando|como|preço|valor/)) {
      newStatus = 'qualified';
      sentiment = 'positive';
    }
    else if (lowerResp.match(/transfer|corretor|humano|atendente/)) {
      newStatus = 'escalated';
      sentiment = 'positive';
    }
    else if (lowerMsg.match(/não|nunca|pare|desinteress|remov|sai|chato/)) {
      newStatus = 'no_interest';
      sentiment = 'negative';
    }
    else if (lowerMsg.match(/depois|pensar|ver|talvez|mais tarde/)) {
      newStatus = 'waiting_response';
      sentiment = 'neutral';
    }
    
    console.log('🎯 Status:', newStatus, '| Sentimento:', sentiment);

    await supabaseClient.functions.invoke('send_whatsapp_message', {
      body: { botId: conversation.bot_instance_id, phone: conversation.lead_phone, message: aiResponse, conversationId },
    });

    await supabaseClient.from('ia_conversations').update({ 
      last_ai_action: new Date().toISOString(), 
      messages_count: (history?.length || 0) + 2,
      status: newStatus,
      sentiment: sentiment,
    }).eq('id', conversationId);

    return new Response(JSON.stringify({ success: true, aiResponse, model: modelToUse, status: newStatus }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  } catch (error: any) {
    console.error('❌ Erro:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});