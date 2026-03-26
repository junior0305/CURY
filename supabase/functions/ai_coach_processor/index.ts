import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function callGeminiAPI(prompt: string, model: string, maxTokens: number) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens }
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${text}`);
  }

  const json = await response.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callAnthropicAPI(prompt: string, model: string, maxTokens: number) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${text}`);
  }

  const json = await response.json();
  return json.content?.[0]?.text || '';
}

async function callOpenAIAPI(prompt: string, model: string, maxTokens: number) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${text}`);
  }

  const json = await response.json();
  return json.choices?.[0]?.message?.content || '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Buscar LLM ativo
    const { data: llmConfigs } = await supabaseClient
      .from('ai_coach_llm_config')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: true })
      .limit(1);

    if (!llmConfigs || llmConfigs.length === 0) {
      throw new Error('No active LLM configured');
    }

    const llmConfig = llmConfigs[0];
    console.log(`[AI Coach] Using ${llmConfig.provider} (${llmConfig.model_name})`);

    // Verificar API key
    if (llmConfig.provider === 'anthropic' && !ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
    if (llmConfig.provider === 'openai' && !OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');
    if (llmConfig.provider === 'gemini' && !GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');

    // Buscar brokers pendentes de análise
    const { data: queue } = await supabaseClient
      .from('ai_coach_queue')
      .select('*')
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .limit(10);

    if (!queue || queue.length === 0) {
      return new Response(JSON.stringify({ message: 'No brokers to analyze', processed: 0 }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    let processed = 0;
    let errors = 0;

    for (const item of queue) {
      try {
        await supabaseClient.from('ai_coach_queue').update({ status: 'processing' }).eq('id', item.id);

        const { data: broker } = await supabaseClient.from('profiles').select('first_name, full_name, email').eq('id', item.broker_id).single();
        const brokerName = broker?.first_name || broker?.full_name || 'Corretor';

        // Buscar leads do CRM (is_crm_lead = true) recentes
        const { data: conversations } = await supabaseClient
          .from('ia_conversations')
          .select('*')
          .eq('is_crm_lead', true)
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // últimos 30 dias
          .order('created_at', { ascending: false })
          .limit(item.sample_size || 5);

        if (!conversations || conversations.length === 0) {
          await supabaseClient.from('ai_coach_queue').update({ 
            status: 'skipped', 
            error_message: 'No CRM leads found in last 7 days',
            processed_at: new Date().toISOString() 
          }).eq('id', item.id);
          continue;
        }

        // Buscar mensagens de cada conversa
        const convIds = conversations.map(c => c.id);
        const { data: messages } = await supabaseClient
          .from('ia_messages')
          .select('*')
          .in('conversation_id', convIds)
          .order('created_at', { ascending: true });

        const messagesByConv: Record<string, any[]> = {};
        (messages || []).forEach(m => {
          if (!messagesByConv[m.conversation_id]) messagesByConv[m.conversation_id] = [];
          messagesByConv[m.conversation_id].push(m);
        });

        // Calcular métricas
        let totalFirstResponseTime = 0;
        let totalLeadResponseTime = 0;
        let leadsAbandoned = 0;
        let leadsConverted = 0;
        let validConversations = 0;

        const sampleData: any[] = [];

        for (const conv of conversations) {
          const convMessages = messagesByConv[conv.id] || [];
          if (convMessages.length === 0) {
            leadsAbandoned++;
            continue;
          }

          const firstIAMessage = convMessages.find(m => ['ia', 'bot', 'agent'].includes(m.sender_type?.toLowerCase()));
          const firstLeadMessage = convMessages.find(m => m.sender_type?.toLowerCase() === 'lead');

          // Tempo até primeiro contato
          if (firstIAMessage && conv.created_at) {
            const responseTime = (new Date(firstIAMessage.created_at).getTime() - new Date(conv.created_at).getTime()) / 1000;
            totalFirstResponseTime += responseTime;
          }

          // Tempo de resposta após interação do lead
          if (firstLeadMessage) {
            const nextIAMessage = convMessages.find(m => 
              ['ia', 'bot', 'agent'].includes(m.sender_type?.toLowerCase()) && 
              new Date(m.created_at) > new Date(firstLeadMessage.created_at)
            );
            if (nextIAMessage) {
              const responseTime = (new Date(nextIAMessage.created_at).getTime() - new Date(firstLeadMessage.created_at).getTime()) / 1000;
              totalLeadResponseTime += responseTime;
            }
          }

          // Lead abandonado ou convertido?
          if (!firstLeadMessage) {
            leadsAbandoned++;
          } else if (conv.status === 'escalated' || conv.escalated_to) {
            leadsConverted++;
          }

          validConversations++;

          // Amostra para análise qualitativa
          sampleData.push({
            lead_name: conv.lead_name,
            messages_count: convMessages.length,
            has_lead_response: !!firstLeadMessage,
            first_response_time: firstIAMessage ? Math.round((new Date(firstIAMessage.created_at).getTime() - new Date(conv.created_at).getTime()) / 1000) : null,
            transcript: convMessages.slice(0, 10).map(m => `${m.sender_type}: ${m.message_text.substring(0, 100)}`).join('\n')
          });
        }

        // Criar prompt para análise qualitativa
        const prompt = `Você é um coach de vendas. Analise estas ${conversations.length} tentativas de contato com leads do CRM:

${sampleData.map((s, i) => `
LEAD ${i + 1}: ${s.lead_name}
- Mensagens: ${s.messages_count}
- Lead respondeu: ${s.has_lead_response ? 'SIM' : 'NÃO'}
- Tempo 1º contato: ${s.first_response_time ? `${s.first_response_time}s` : 'N/A'}
Transcrição (primeiras mensagens):
${s.transcript}
---
`).join('\n')}

MÉTRICAS CALCULADAS:
- Tempo médio 1º contato: ${validConversations > 0 ? Math.round(totalFirstResponseTime / validConversations) : 0}s
- Tempo médio resposta ao lead: ${validConversations > 0 ? Math.round(totalLeadResponseTime / validConversations) : 0}s
- Leads abandonados: ${leadsAbandoned}/${conversations.length}
- Leads convertidos: ${leadsConverted}/${conversations.length}

Retorne JSON com: 
{
  "quality_score": 0-100,
  "severity": "low|medium|high",
  "errors": [{type, description}],
  "positives": ["texto"],
  "summary": "análise geral de performance"
}`;

        // Chamar LLM
        let responseText = '';
        if (llmConfig.provider === 'anthropic') {
          responseText = await callAnthropicAPI(prompt, llmConfig.model_name, llmConfig.max_tokens);
        } else if (llmConfig.provider === 'openai') {
          responseText = await callOpenAIAPI(prompt, llmConfig.model_name, llmConfig.max_tokens);
        } else if (llmConfig.provider === 'gemini') {
          responseText = await callGeminiAPI(prompt, llmConfig.model_name, llmConfig.max_tokens);
        }

        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in LLM response');
        const analysis = JSON.parse(jsonMatch[0]);

        // Salvar análise
        await supabaseClient.from('ai_coach_analysis').insert({
          broker_id: item.broker_id,
          analysis_period: item.analysis_period,
          total_leads_analyzed: conversations.length,
          avg_first_response_time: validConversations > 0 ? Math.round(totalFirstResponseTime / validConversations) : null,
          avg_lead_response_time: validConversations > 0 ? Math.round(totalLeadResponseTime / validConversations) : null,
          leads_abandoned: leadsAbandoned,
          leads_converted: leadsConverted,
          quality_score: analysis.quality_score || null,
          severity: analysis.severity || null,
          errors: analysis.errors || [],
          positives: analysis.positives || [],
          summary: analysis.summary || '',
          sample_conversations: convIds,
        });

        await supabaseClient.from('ai_coach_queue').update({ 
          status: 'completed', 
          processed_at: new Date().toISOString() 
        }).eq('id', item.id);

        processed++;
      } catch (error: any) {
        console.error('[ai_coach_processor] error for broker', item.broker_id, error.message);
        await supabaseClient.from('ai_coach_queue').update({ 
          status: 'failed', 
          error_message: error.message, 
          processed_at: new Date().toISOString() 
        }).eq('id', item.id);
        errors++;
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return new Response(JSON.stringify({ success: true, processed, errors }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  } catch (error: any) {
    console.error('[ai_coach_processor] fatal', error.message);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
