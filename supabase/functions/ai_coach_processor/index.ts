import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const OPENAI_API_KEY    = Deno.env.get('OPENAI_API_KEY') || '';
const GEMINI_API_KEY    = Deno.env.get('GEMINI_API_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Detecta erro de saldo/cota ────────────────────────────────────────────────

function isBalanceError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes('insufficient_quota') ||
    lower.includes('credit balance') ||
    lower.includes('billing') ||
    lower.includes('quota exceeded') ||
    lower.includes('rate limit') ||
    lower.includes('429') ||
    lower.includes('you exceeded') ||
    lower.includes('out of credits') ||
    lower.includes('no credits')
  );
}

// ── Chamadas de LLM ───────────────────────────────────────────────────────────

async function callGeminiAPI(prompt: string, model: string, maxTokens: number): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${text}`);
  }
  const json = await response.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callAnthropicAPI(prompt: string, model: string, maxTokens: number): Promise<string> {
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
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${text}`);
  }
  const json = await response.json();
  return json.content?.[0]?.text || '';
}

async function callOpenAIAPI(prompt: string, model: string, maxTokens: number): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${text}`);
  }
  const json = await response.json();
  return json.choices?.[0]?.message?.content || '';
}

// ── Tenta LLMs em ordem de prioridade (fallback automático) ───────────────────

async function callLLMWithFallback(
  supabase: any,
  configs: any[],
  prompt: string
): Promise<string> {
  const active = configs.filter(c => c.is_active).sort((a: any, b: any) => a.priority - b.priority);

  if (active.length === 0) throw new Error('No active LLM configured');

  let lastError = '';
  for (const cfg of active) {
    try {
      console.log(`[ai_coach] Tentando ${cfg.provider} / ${cfg.model_name}`);

      if (cfg.provider === 'anthropic' && !ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
      if (cfg.provider === 'openai' && !OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
      if (cfg.provider === 'gemini' && !GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');

      let text = '';
      if (cfg.provider === 'anthropic') text = await callAnthropicAPI(prompt, cfg.model_name, cfg.max_tokens);
      else if (cfg.provider === 'openai')    text = await callOpenAIAPI(prompt, cfg.model_name, cfg.max_tokens);
      else if (cfg.provider === 'gemini')    text = await callGeminiAPI(prompt, cfg.model_name, cfg.max_tokens);

      return text; // sucesso — retorna imediatamente
    } catch (err: any) {
      lastError = err.message;
      console.warn(`[ai_coach] ${cfg.provider} falhou: ${err.message}`);

      // Notifica admins se for erro de saldo/cota
      if (isBalanceError(err.message)) {
        try {
          // Busca admins para notificar
          const { data: admins } = await supabase
            .from('profiles')
            .select('id')
            .in('role', ['ADMIN', 'SUPERINTENDENT']);

          const notifications = (admins || []).map((a: any) => ({
            to_id: a.id,
            type: 'AI_COACH_LLM_ERROR',
            title: `⚠️ AI Coach: saldo insuficiente (${cfg.provider})`,
            message: `O provedor ${cfg.provider} (${cfg.model_name}) falhou por saldo/cota. ${active.indexOf(cfg) < active.length - 1 ? 'Usando fallback automaticamente.' : 'Nenhum fallback disponível — análise pausada.'}`,
          }));

          if (notifications.length > 0) {
            await supabase.from('internal_notifications').insert(notifications);
          }
        } catch (_) { /* não falha por causa da notificação */ }
      }

      // Continua para o próximo LLM
    }
  }

  throw new Error(`Todos os LLMs falharam. Último erro: ${lastError}`);
}

// ── Handler principal ─────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Carrega todos os LLMs ativos (em ordem de prioridade)
    const { data: llmConfigs } = await supabaseClient
      .from('ai_coach_llm_config')
      .select('*')
      .order('priority', { ascending: true });

    if (!llmConfigs || llmConfigs.length === 0 || !llmConfigs.some((c: any) => c.is_active)) {
      return new Response(
        JSON.stringify({ error: 'No active LLM configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[ai_coach] LLMs disponíveis: ${llmConfigs.filter((c:any)=>c.is_active).map((c:any)=>c.provider).join(' → ')}`);

    // Busca fila pendente
    const { data: queue } = await supabaseClient
      .from('ai_coach_queue')
      .select('*')
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .limit(10);

    if (!queue || queue.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No brokers to analyze', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let processed = 0;
    let errors = 0;

    for (const item of queue) {
      try {
        await supabaseClient.from('ai_coach_queue').update({ status: 'processing' }).eq('id', item.id);

        const { data: broker } = await supabaseClient
          .from('profiles')
          .select('first_name, full_name, email')
          .eq('id', item.broker_id)
          .single();
        const brokerName = broker?.first_name || broker?.full_name || 'Corretor';

        // Busca leads do broker nos últimos 30 dias
        const { data: brokerLeads } = await supabaseClient
          .from('leads')
          .select('id')
          .eq('broker_id', item.broker_id)
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

        const brokerLeadIds = (brokerLeads || []).map((l: any) => l.id);

        // Busca conversas
        let convQuery = supabaseClient
          .from('ia_conversations')
          .select('*')
          .eq('is_crm_lead', true)
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false })
          .limit(item.sample_size || 5);

        if (brokerLeadIds.length > 0) {
          convQuery = convQuery.in('lead_id', brokerLeadIds);
        }

        const { data: conversations } = await convQuery;

        if (!conversations || conversations.length === 0) {
          await supabaseClient.from('ai_coach_queue').update({
            status: 'skipped',
            error_message: 'No CRM conversations found in last 30 days',
            processed_at: new Date().toISOString(),
          }).eq('id', item.id);
          continue;
        }

        // Busca mensagens
        const convIds = conversations.map((c: any) => c.id);
        const { data: messages } = await supabaseClient
          .from('ia_messages')
          .select('*')
          .in('conversation_id', convIds)
          .order('created_at', { ascending: true });

        const messagesByConv: Record<string, any[]> = {};
        (messages || []).forEach((m: any) => {
          if (!messagesByConv[m.conversation_id]) messagesByConv[m.conversation_id] = [];
          messagesByConv[m.conversation_id].push(m);
        });

        // Calcula métricas
        let totalFirstResponseTime = 0;
        let totalLeadResponseTime = 0;
        let leadsAbandoned = 0;
        let leadsConverted = 0;
        let validConversations = 0;
        const sampleData: any[] = [];

        for (const conv of conversations) {
          const convMessages = messagesByConv[conv.id] || [];
          if (convMessages.length === 0) { leadsAbandoned++; continue; }

          const firstIAMessage = convMessages.find((m: any) => ['ia', 'bot', 'agent'].includes(m.sender_type?.toLowerCase()));
          const firstLeadMessage = convMessages.find((m: any) => m.sender_type?.toLowerCase() === 'lead');

          if (firstIAMessage && conv.created_at) {
            totalFirstResponseTime += (new Date(firstIAMessage.created_at).getTime() - new Date(conv.created_at).getTime()) / 1000;
          }

          if (firstLeadMessage) {
            const nextIA = convMessages.find((m: any) =>
              ['ia', 'bot', 'agent'].includes(m.sender_type?.toLowerCase()) &&
              new Date(m.created_at) > new Date(firstLeadMessage.created_at)
            );
            if (nextIA) {
              totalLeadResponseTime += (new Date(nextIA.created_at).getTime() - new Date(firstLeadMessage.created_at).getTime()) / 1000;
            }
          }

          if (!firstLeadMessage) leadsAbandoned++;
          else if (conv.status === 'escalated' || conv.escalated_to) leadsConverted++;

          validConversations++;

          sampleData.push({
            lead_name: conv.lead_name,
            messages_count: convMessages.length,
            has_lead_response: !!firstLeadMessage,
            first_response_time: firstIAMessage ? Math.round((new Date(firstIAMessage.created_at).getTime() - new Date(conv.created_at).getTime()) / 1000) : null,
            transcript: convMessages.slice(0, 10).map((m: any) => `${m.sender_type}: ${(m.message_text || '').substring(0, 100)}`).join('\n'),
          });
        }

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
  "errors": [{"type": "string", "description": "string"}],
  "positives": ["texto"],
  "summary": "análise geral de performance"
}`;

        // Chama LLM com fallback automático
        const responseText = await callLLMWithFallback(supabaseClient, llmConfigs, prompt);

        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in LLM response');
        const analysis = JSON.parse(jsonMatch[0]);

        // Salva análise
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
          processed_at: new Date().toISOString(),
        }).eq('id', item.id);

        processed++;
        console.log(`[ai_coach] Corretor ${brokerName} analisado. Score: ${analysis.quality_score}`);
      } catch (error: any) {
        console.error('[ai_coach] error for broker', item.broker_id, error.message);
        await supabaseClient.from('ai_coach_queue').update({
          status: 'failed',
          error_message: error.message,
          processed_at: new Date().toISOString(),
        }).eq('id', item.id);
        errors++;
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return new Response(
      JSON.stringify({ success: true, processed, errors }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[ai_coach_processor] fatal', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
