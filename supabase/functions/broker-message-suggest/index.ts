// broker-message-suggest — gera 3 sugestões de mensagem para o broker
// Modos:
//   general    — sugere 3 mensagens novas baseadas no perfil/histórico do broker
//   contextual — sugere 3 respostas pra um lead específico (lead_id requerido)
//   optimize   — gera 3 variações de uma mensagem existente (source_template_id requerido)
//
// Rate limit: 5 chamadas/dia/broker (rate-limited no banco via broker_ai_suggest_log)
// LLM: Claude Haiku 4.5 primário; OpenAI GPT-4o-mini fallback se Claude falhar

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const OPENAI_API_KEY    = Deno.env.get('OPENAI_API_KEY')    || '';
const DAILY_LIMIT = 5;

// Frases proibidas (causaram ban no passado)
const BLACKLIST = [
  'construtora cury','me chamo ully','sou a ully','sou ully',
  'você está na missão de encontrar','corretora da construtora',
];

const SYSTEM = `Você é especialista em copywriting persuasivo pra venda de imóveis MCMV (Minha Casa Minha Vida).
Gera 3 mensagens DIFERENTES entre si, cada uma com técnica de persuasão própria (curiosidade, reciprocidade, escassez, prova social, loss aversion).

Regras OBRIGATÓRIAS:
- Máximo 3 linhas por mensagem (separadas por \\n)
- 1 ou 2 emojis no máximo
- Use {nome} pra interpolação do nome do lead
- Tom direto, humano, brasileiro casual
- PROIBIDO: mencionar nome de corretor, mencionar região específica
- PROIBIDO: usar "construtora Cury", "me chamo Ully", "sou Ully", "Você está na missão de encontrar"
- PERMITIDO: mencionar parcela em reais como atrativo

Retorne APENAS JSON válido (sem markdown, sem explicação):
{"suggestions":[{"title":"titulo curto","body":"texto da msg","reasoning":"tecnica usada"},...]}`;

async function callClaude(prompt: string): Promise<any> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001', max_tokens: 800, temperature: 0.9,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).substring(0,200)}`);
  const json = await res.json();
  return JSON.parse((json.content?.[0]?.text || '').replace(/```json|```/g, '').trim());
}

async function callOpenAI(prompt: string): Promise<any> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini', temperature: 0.9, max_tokens: 800,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).substring(0,200)}`);
  const json = await res.json();
  return JSON.parse(json.choices?.[0]?.message?.content || '{}');
}

function filterBlacklist(suggestions: any[]): any[] {
  return suggestions.filter(s => {
    const text = (s.body || '').toLowerCase();
    if (!text || !text.includes('{nome}')) return false;
    return !BLACKLIST.some(b => text.includes(b));
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    const { broker_id, mode = 'general', lead_id, source_template_id } = await req.json();
    if (!broker_id) {
      return new Response(JSON.stringify({ error: 'broker_id obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Rate limit
    const { data: countToday } = await supabase.rpc('broker_ai_suggest_count_today', { p_broker_id: broker_id });
    if ((countToday || 0) >= DAILY_LIMIT) {
      return new Response(JSON.stringify({
        error: 'limite_diario_atingido',
        message: `Limite de ${DAILY_LIMIT} sugestões por dia atingido. Tente amanhã.`
      }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Monta prompt baseado no modo
    let prompt = '';
    if (mode === 'general') {
      // Pega 2 últimas vendas do broker pra usar como contexto/tom
      const { data: vendas } = await supabase
        .from('leads')
        .select('name, tag, last_interaction_at')
        .eq('broker_id', broker_id).eq('status', 'CONCLUDED')
        .order('last_interaction_at', { ascending: false }).limit(2);
      prompt = `Gere 3 mensagens VARIADAS de primeiro contato com lead de imóvel MCMV.
Contexto do corretor: ${vendas?.length || 0} vendas recentes.
Use técnicas diferentes em cada uma.`;
    } else if (mode === 'contextual') {
      if (!lead_id) throw new Error('lead_id obrigatório no modo contextual');
      const { data: lead } = await supabase.from('leads')
        .select('name, status, tag, product, renda_declarada, tipo_trabalho, contact_attempts, last_lead_response_at')
        .eq('id', lead_id).maybeSingle();
      if (!lead) throw new Error('lead não encontrado');
      const { data: msgs } = await supabase.from('ia_messages')
        .select('direction, message_text, created_at')
        .eq('conversation_id', (await supabase.from('ia_conversations').select('id').eq('lead_id', lead_id).limit(1).maybeSingle()).data?.id || '00000000-0000-0000-0000-000000000000')
        .order('created_at', { ascending: false }).limit(5);
      prompt = `Lead: ${lead.name}, status ${lead.status}, ${lead.contact_attempts || 0} tentativas anteriores.
Renda: ${lead.renda_declarada || '—'}. Tipo: ${lead.tipo_trabalho || '—'}. Tag/região: ${lead.tag || '—'}.
${msgs?.length ? 'Últimas mensagens trocadas:\n' + msgs.reverse().map((m:any)=>`${m.direction}: ${m.message_text?.substring(0,100)}`).join('\n') : 'Nenhuma mensagem ainda.'}

Gere 3 mensagens DIFERENTES pra reabrir a conversa com esse lead. Use técnicas diferentes.`;
    } else if (mode === 'optimize') {
      if (!source_template_id) throw new Error('source_template_id obrigatório no modo optimize');
      const { data: src } = await supabase.from('broker_message_templates')
        .select('title, body').eq('id', source_template_id).maybeSingle();
      if (!src) throw new Error('template fonte não encontrado');
      prompt = `Template VENCEDOR: "${src.body}"

Gere 3 variações NOVAS mantendo a essência da técnica mas com palavras e estrutura totalmente diferentes.`;
    } else {
      throw new Error('mode inválido');
    }

    // Tenta Claude → fallback OpenAI
    let parsed: any;
    let provider = 'claude';
    try { parsed = await callClaude(prompt); }
    catch (claudeErr: any) {
      console.warn('[broker-message-suggest] Claude falhou:', claudeErr.message);
      if (!OPENAI_API_KEY) throw claudeErr;
      provider = 'openai';
      parsed = await callOpenAI(prompt);
    }

    const filtered = filterBlacklist(parsed.suggestions || []);
    if (filtered.length === 0) {
      return new Response(JSON.stringify({ error: 'sem_sugestoes_validas', provider }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Loga uso
    await supabase.from('broker_ai_suggest_log').insert({ broker_id, mode, lead_id: lead_id || null });

    return new Response(JSON.stringify({
      success: true, provider, suggestions: filtered,
      remaining_today: DAILY_LIMIT - (countToday || 0) - 1,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('[broker-message-suggest] fatal:', err.message);
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
