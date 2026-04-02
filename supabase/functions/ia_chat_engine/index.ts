import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';

// ── Fechamento do ciclo após qualificação (Melhoria B) ────────────────────────
async function handleLeadQualification(supabase: any, conversation: any, newStatus: string) {
  try {
    let brokerId: string | null = null;

    // 1. Tentar achar o broker pelo chip (bot_instance_id é do corretor?)
    const { data: brokerByChip } = await supabase
      .from('profiles')
      .select('id')
      .eq('bot_instance_id', conversation.bot_instance_id)
      .maybeSingle();

    if (brokerByChip?.id) {
      brokerId = brokerByChip.id;
      console.log(`[ia_chat_engine] Broker encontrado pelo chip: ${brokerId}`);
    } else {
      // Chip é de prospecção (não é chip pessoal de corretor) → usar broker do lead
      const { data: leadData } = await supabase
        .from('leads')
        .select('broker_id')
        .eq('id', conversation.lead_id)
        .maybeSingle();
      brokerId = leadData?.broker_id || null;
      console.log(`[ia_chat_engine] Broker via lead: ${brokerId}`);
    }

    if (!brokerId) {
      console.warn('[ia_chat_engine] Nenhum broker encontrado para lead qualificado');
      return;
    }

    // 2. Atualizar lead no CRM
    await supabase.from('leads').update({
      broker_id: brokerId,
      status: 'IN_PROGRESS',
      last_interaction_at: new Date().toISOString(),
    }).eq('id', conversation.lead_id);

    // 3. Notificar corretor
    const title = newStatus === 'qualified'
      ? '🎯 Lead qualificado! Atenda agora'
      : '🔥 Lead quer falar com corretor!';
    const msg = `${conversation.lead_name} demonstrou interesse e está esperando você. Lead pronto para atendimento!`;

    await supabase.from('internal_notifications').insert({
      to_id: brokerId,
      type: 'LEAD_QUALIFIED',
      title,
      message: msg,
      related_lead_id: conversation.lead_id,
    });

    // 4. Registrar escalação na conversa
    await supabase.from('ia_conversations').update({
      escalated_to: brokerId,
      escalated_at: new Date().toISOString(),
      escalation_reason: newStatus === 'qualified' ? 'lead_qualified' : 'lead_requested_human',
    }).eq('id', conversation.id);

    console.log(`[ia_chat_engine] ✅ Lead ${conversation.lead_id} → broker ${brokerId} notificado`);
  } catch (err: any) {
    console.error('[ia_chat_engine] Erro ao fechar ciclo de qualificação:', err.message);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { conversationId, incomingMessage } = await req.json();
    console.log(`[ia_chat_engine] conversa=${conversationId}`);

    const { data: conversation } = await supabase
      .from('ia_conversations')
      .select('*, ia_campaigns(*, ai_profiles(*)), bot_instances(*)')
      .eq('id', conversationId)
      .single();

    if (!conversation) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Não responder se conversa já foi encerrada ────────────────────────
    if (['no_interest', 'qualified', 'escalated'].includes(conversation.status)) {
      console.log(`[ia_chat_engine] Conversa ${conversationId} encerrada (${conversation.status}), ignorando`);
      return new Response(JSON.stringify({ success: true, skipped: 'conversation_closed' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Melhoria C: Limite de mensagens ──────────────────────────────────
    const maxMessages = conversation.ia_campaigns?.max_messages_per_lead ?? 10;
    const currentCount = conversation.messages_count ?? 0;

    if (currentCount >= maxMessages) {
      await supabase.from('ia_conversations').update({
        status: 'waiting_response',
        last_ai_action: new Date().toISOString(),
      }).eq('id', conversationId);
      console.log(`[ia_chat_engine] Limite de ${maxMessages} msgs atingido para ${conversationId}`);
      return new Response(JSON.stringify({ success: true, skipped: 'max_messages_reached' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Carregar histórico ────────────────────────────────────────────────
    const { data: history } = await supabase
      .from('ia_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(15);

    const historyText = (history || []).map(m =>
      `${m.sender_type === 'ia' ? 'Assistente' : 'Cliente'}: ${m.message_text}`
    ).join('\n');

    // ── System prompt ─────────────────────────────────────────────────────
    let systemPrompt = 'Você é um assistente de vendas de imóveis. Seja prestativo, cordial e objetivo. Fale em português do Brasil, tom casual. Máximo 3 frases por resposta.';
    if (conversation.ia_campaigns?.ai_profiles?.system_prompt) {
      systemPrompt = conversation.ia_campaigns.ai_profiles.system_prompt;
    } else if (conversation.ia_campaigns?.ai_instructions) {
      systemPrompt = conversation.ia_campaigns.ai_instructions;
    } else {
      // Sem campanha → tentar usar o perfil padrão da Sentinela como fallback
      const { data: sentConfig } = await supabase
        .from('ai_sentinela_config')
        .select('default_profile_id')
        .maybeSingle();
      if (sentConfig?.default_profile_id) {
        const { data: defaultProfile } = await supabase
          .from('ai_profiles')
          .select('system_prompt')
          .eq('id', sentConfig.default_profile_id)
          .maybeSingle();
        if (defaultProfile?.system_prompt) {
          systemPrompt = defaultProfile.system_prompt;
          console.log(`[ia_chat_engine] Usando perfil padrão da Sentinela como fallback`);
        }
      }
    }
    const fullSystemPrompt = `${systemPrompt}\n\nVocê está conversando com ${conversation.lead_name || 'Cliente'}.`;
    const userPrompt = `Histórico:\n${historyText}\n\nCliente: ${incomingMessage}\n\nResponda naturalmente:`;

    // ── Chamar Anthropic ──────────────────────────────────────────────────
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: fullSystemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      throw new Error(`Anthropic API error: ${anthropicRes.status} ${errText}`);
    }

    const aiResult = await anthropicRes.json();
    const aiResponse = aiResult.content?.[0]?.text || 'Desculpe, pode repetir?';
    console.log(`[ia_chat_engine] Resposta gerada: ${aiResponse.substring(0, 80)}`);

    // ── Classificação de status ───────────────────────────────────────────
    const lowerMsg = incomingMessage.toLowerCase();
    const lowerResp = aiResponse.toLowerCase();

    let newStatus = conversation.status;
    let sentiment = conversation.sentiment || 'neutral';

    if (lowerMsg.match(/sim|quero|interesse|agendar|visita|quando|como|preço|valor|documento|subsidio/)) {
      newStatus = 'qualified';
      sentiment = 'positive';
    } else if (lowerResp.match(/transfer|corretor|humano|atendente/)) {
      newStatus = 'escalated';
      sentiment = 'positive';
    } else if (lowerMsg.match(/não|nunca|pare|desinteress|remov|sai|chato/)) {
      newStatus = 'no_interest';
      sentiment = 'negative';
    } else if (lowerMsg.match(/depois|pensar|ver|talvez|mais tarde/)) {
      newStatus = 'waiting_response';
      sentiment = 'neutral';
    }

    console.log(`[ia_chat_engine] Status: ${newStatus} | Sentimento: ${sentiment}`);

    // ── Enviar mensagem WhatsApp ──────────────────────────────────────────
    await supabase.functions.invoke('send_whatsapp_message', {
      body: { botId: conversation.bot_instance_id, phone: conversation.lead_phone, message: aiResponse, conversationId },
    });

    // ── Atualizar conversa ────────────────────────────────────────────────
    await supabase.from('ia_conversations').update({
      last_ai_action: new Date().toISOString(),
      messages_count: (history?.length ?? 0) + 2,
      status: newStatus,
      sentiment,
    }).eq('id', conversationId);

    // ── Melhoria B: fechar ciclo se qualificado/escalado ─────────────────
    if (['qualified', 'escalated'].includes(newStatus) && conversation.lead_id) {
      await handleLeadQualification(supabase, conversation, newStatus);
    }

    return new Response(JSON.stringify({ success: true, aiResponse, status: newStatus }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[ia_chat_engine] Erro fatal:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
