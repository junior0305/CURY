import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const OPENAI_API_KEY    = Deno.env.get('OPENAI_API_KEY') || '';
const GEMINI_API_KEY    = Deno.env.get('GEMINI_API_KEY') || '';

const CACHE_HOURS = 1;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── LLM callers (mesmo pattern do ai_coach_processor) ────────────────────────

async function callAnthropicAPI(prompt: string, model: string, maxTokens: number): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.content?.[0]?.text || '';
}

async function callOpenAIAPI(prompt: string, model: string, maxTokens: number): Promise<string> {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.choices?.[0]?.message?.content || '';
}

async function callGeminiAPI(prompt: string, model: string, maxTokens: number): Promise<string> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens } }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callLLM(configs: any[], prompt: string): Promise<{ text: string; provider: string; model: string }> {
  const active = configs.filter(c => c.is_active).sort((a: any, b: any) => a.priority - b.priority);
  if (active.length === 0) throw new Error('No active LLM configured');
  let lastErr = '';
  for (const cfg of active) {
    try {
      if (cfg.provider === 'anthropic' && !ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
      if (cfg.provider === 'openai'    && !OPENAI_API_KEY)    throw new Error('OPENAI_API_KEY not set');
      if (cfg.provider === 'gemini'    && !GEMINI_API_KEY)    throw new Error('GEMINI_API_KEY not set');
      let text = '';
      if (cfg.provider === 'anthropic') text = await callAnthropicAPI(prompt, cfg.model_name, cfg.max_tokens);
      else if (cfg.provider === 'openai') text = await callOpenAIAPI(prompt, cfg.model_name, cfg.max_tokens);
      else if (cfg.provider === 'gemini') text = await callGeminiAPI(prompt, cfg.model_name, cfg.max_tokens);
      return { text, provider: cfg.provider, model: cfg.model_name };
    } catch (e: any) {
      lastErr = e.message;
      console.warn(`[ai-coach-conversation] ${cfg.provider} falhou: ${e.message}`);
    }
  }
  throw new Error(`All LLMs failed. Last: ${lastErr}`);
}

// ─── Prompt + parser ──────────────────────────────────────────────────────────

function buildPrompt(leadName: string, brokerName: string, transcript: string): string {
  return `Você é um analista sênior de qualidade em vendas imobiliárias MCMV.
Analise a conversa abaixo entre o corretor *${brokerName}* e o lead *${leadName}*.

Avalie:
1. Tempo de resposta e atenção
2. Qualificação MCMV (renda, FGTS, tipo trabalho, faixa)
3. Postura/empatia/clareza
4. Conduzir pra próximo passo (visita/docs)
5. Erros graves (atraso longo, ignorar pergunta, soar robótico, perder oportunidade)

Retorne APENAS JSON válido, sem markdown, neste formato exato:
{
  "quality_score": 0-10 (inteiro),
  "severity": "low" | "medium" | "high",
  "summary": "resumo executivo de 1-2 frases sobre como foi este atendimento específico",
  "positives": ["ponto positivo 1", "ponto positivo 2"],
  "errors": [{"description": "erro específico que aconteceu nesta conversa", "severity": "low|medium|high"}],
  "suggestion": "próximo passo concreto que o corretor deveria dar agora pra avançar este lead"
}

Regras:
- quality_score: inteiro 0-10
- positives: até 3 itens, frases curtas (máx 50 chars)
- errors: até 3 itens, descreva fato específico (não genérico)
- suggestion: ação concreta de 1 frase
- severity geral: high se score<5, medium se 5-7, low se >7

Conversa:
${transcript}`;
}

function parseAnalysis(raw: string): any {
  const cleaned = raw.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Tenta extrair primeiro objeto JSON do texto
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('LLM não retornou JSON válido');
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    const { conversationId, force } = await req.json();
    if (!conversationId) {
      return new Response(JSON.stringify({ error: 'conversationId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── Cache: se já existe análise <1h, retorna direto (a menos que force=true) ──
    if (!force) {
      const cutoff = new Date(Date.now() - CACHE_HOURS * 3600000).toISOString();
      const { data: cached } = await supabase
        .from('ai_coach_analysis')
        .select('quality_score, severity, summary, positives, errors, sample_conversations, created_at')
        .eq('conversation_id', conversationId)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cached) {
        return new Response(JSON.stringify({
          cached: true,
          analysis: {
            quality_score: cached.quality_score,
            severity: cached.severity,
            summary: cached.summary,
            positives: cached.positives,
            errors: cached.errors,
            suggestion: (cached.sample_conversations as any)?.suggestion ?? null,
            created_at: cached.created_at,
          },
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // ── Pega conversa + mensagens + lead + broker ──
    const { data: conv } = await supabase.from('ia_conversations')
      .select('id, lead_id, lead_name, lead_phone')
      .eq('id', conversationId).maybeSingle();
    if (!conv) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { data: msgs } = await supabase.from('ia_messages')
      .select('direction, sender_type, message_text, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(100);

    if (!msgs || msgs.length === 0) {
      return new Response(JSON.stringify({
        analysis: null,
        empty: true,
        reason: 'Sem mensagens nesta conversa',
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let brokerName = 'Corretor';
    let brokerId: string | null = null;
    if (conv.lead_id) {
      const { data: lead } = await supabase.from('leads')
        .select('broker_id, profiles:broker_id(first_name, last_name)')
        .eq('id', conv.lead_id).maybeSingle();
      if (lead?.broker_id) brokerId = lead.broker_id;
      const p = (lead as any)?.profiles;
      if (p) brokerName = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Corretor';
    }

    const transcript = msgs.map((m: any) => {
      const who = m.direction === 'incoming' ? 'LEAD' : (m.sender_type === 'ia' ? 'IA' : 'CORRETOR');
      return `[${who}] ${m.message_text}`;
    }).join('\n');

    // ── Carrega config LLM ──
    const { data: configs } = await supabase.from('ai_coach_llm_config').select('*');
    if (!configs || configs.length === 0) {
      return new Response(JSON.stringify({ error: 'No LLM config' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── Roda LLM ──
    const prompt = buildPrompt(conv.lead_name || 'Cliente', brokerName, transcript);
    const { text, provider, model } = await callLLM(configs, prompt);
    const parsed = parseAnalysis(text);

    // ── Persiste em ai_coach_analysis com conversation_id ──
    const analysisRow = {
      broker_id: brokerId,
      conversation_id: conversationId,
      quality_score: parsed.quality_score ?? null,
      severity: parsed.severity ?? 'medium',
      summary: parsed.summary ?? '',
      positives: parsed.positives ?? [],
      errors: parsed.errors ?? [],
      sample_conversations: { suggestion: parsed.suggestion ?? null, llm_provider: provider, llm_model: model, msgs_analyzed: msgs.length },
      conversation_origin: 'manual_request',
      analysis_period: new Date().toISOString(),
      total_leads_analyzed: 1,
    };
    await supabase.from('ai_coach_analysis').insert(analysisRow).then(() => {}, () => {});

    return new Response(JSON.stringify({
      cached: false,
      analysis: {
        quality_score: parsed.quality_score,
        severity: parsed.severity,
        summary: parsed.summary,
        positives: parsed.positives,
        errors: parsed.errors,
        suggestion: parsed.suggestion,
        created_at: new Date().toISOString(),
      },
      meta: { provider, model, msgs_analyzed: msgs.length },
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('[ai-coach-conversation] error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
