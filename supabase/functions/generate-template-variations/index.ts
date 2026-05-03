// generate-template-variations
// Recebe: template_id, kind, count (default 3)
// Pega top + bottom performers do mesmo kind, manda pro LLM (Anthropic →
// OpenAI → Gemini fallback via ai_coach_llm_config), salva variações como
// rascunho com parent_template_id, ai_generated=true, is_draft=true.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TABLE_BY_KIND: Record<string, string> = {
  prospecting: 'prospecting_message_templates',
  welcome: 'welcome_templates',
  cadence_step: 'cadence_steps',
};

const PARENT_FK_BY_KIND: Record<string, string> = {
  prospecting: 'parent_template_id',
  welcome: 'parent_template_id',
  cadence_step: 'parent_step_id',
};

function buildPrompt(args: {
  kind: string;
  original: { name: string; message: string; score: number; sent: number; qualified_rate: number };
  champions: Array<{ name: string; message: string; score: number; qualified_rate: number }>;
  losers: Array<{ name: string; message: string; score: number; opt_out_rate: number }>;
  count: number;
}): string {
  const kindLabel = args.kind === 'prospecting' ? 'prospecção (cold outreach)' :
                    args.kind === 'welcome' ? 'boas-vindas (primeiro contato após lead chegar)' :
                    'cadência (follow-up programado)';
  return `Você é um copy especialista em WhatsApp pra prospecção imobiliária no Brasil (Minha Casa Minha Vida — Cury). Tom direto, brasileiro, casual mas profissional. Use ponto-e-vírgula com moderação. Aceita emojis com parcimônia.

Tipo da mensagem: ${kindLabel}

═══════════════════════════════════════════════════════
TEMPLATE ORIGINAL (que queremos melhorar):
Nome: ${args.original.name}
Score atual: ${args.original.score} · ${args.original.sent} envios · qualified_rate ${args.original.qualified_rate}%

${args.original.message}
═══════════════════════════════════════════════════════

🏆 CAMPEÕES (mesmo tipo, alto score) — APRENDA com o que funciona:
${args.champions.map((c, i) => `${i + 1}. (score ${c.score}, qualified ${c.qualified_rate}%)\n${c.message}`).join('\n\n')}

⚠️ PIORES (mesmo tipo, baixo score) — EVITE esses padrões:
${args.losers.map((l, i) => `${i + 1}. (score ${l.score}, opt-out ${l.opt_out_rate}%)\n${l.message}`).join('\n\n')}

═══════════════════════════════════════════════════════

Gere ${args.count} VARIAÇÕES do template ORIGINAL. Cada variação deve:

✅ Manter as variáveis {nome} e {broker} (NÃO INVENTE outras)
✅ Ter tamanho similar ao original (±20%)
✅ Manter o tom (casual mas profissional)
✅ Aplicar lições dos campeões (gancho, CTA, estrutura)
✅ Evitar padrões dos piores (verbosidade, jargão, agressividade)

🎯 Varie ENTRE as variações:
- Gancho de abertura (curiosidade, urgência, benefício direto, pergunta)
- CTA final (resposta numérica, pergunta aberta, call-to-action específico)
- Ordem (informação primeiro vs CTA primeiro)

Responda APENAS um JSON válido com este formato exato (sem markdown, sem explicação):
{"variations": [{"name": "Variação A — [tema curto]", "message": "..."}, {"name": "Variação B — ...", "message": "..."}]}`;
}

async function callAnthropic(apiKey: string, model: string, prompt: string, maxTokens: number) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-6',
      max_tokens: maxTokens || 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j?.content?.[0]?.text || '';
}

async function callOpenAI(apiKey: string, model: string, prompt: string, maxTokens: number) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      max_tokens: maxTokens || 2000,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j?.choices?.[0]?.message?.content || '';
}

async function callGemini(apiKey: string, model: string, prompt: string, maxTokens: number) {
  const m = model || 'gemini-1.5-flash';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens || 2000, responseMimeType: 'application/json' },
    }),
  });
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callLLM(supabase: any, prompt: string): Promise<string> {
  const { data: configs } = await supabase
    .from('ai_coach_llm_config')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: true });

  if (!configs || configs.length === 0) {
    throw new Error('Nenhum LLM ativo em ai_coach_llm_config. Configure ao menos um provider (anthropic/openai/gemini).');
  }

  let lastErr: any = null;
  for (const cfg of configs) {
    try {
      const apiKey = Deno.env.get(
        cfg.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' :
        cfg.provider === 'openai'    ? 'OPENAI_API_KEY' :
        'GEMINI_API_KEY'
      );
      if (!apiKey) { lastErr = new Error(`API key ausente para ${cfg.provider}`); continue; }
      const maxTokens = cfg.max_tokens || 2000;
      console.log(`[gen-variations] tentando ${cfg.provider} (${cfg.model_name})`);
      if (cfg.provider === 'anthropic') return await callAnthropic(apiKey, cfg.model_name, prompt, maxTokens);
      if (cfg.provider === 'openai')    return await callOpenAI(apiKey, cfg.model_name, prompt, maxTokens);
      if (cfg.provider === 'gemini')    return await callGemini(apiKey, cfg.model_name, prompt, maxTokens);
    } catch (e: any) {
      console.error(`[gen-variations] ${cfg.provider} falhou:`, e.message);
      lastErr = e;
      continue;
    }
  }
  throw lastErr || new Error('Todos os providers LLM falharam');
}

function parseLLMJson(raw: string): any {
  // Remove markdown fences se houver
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  // Se vier prefixo/sufixo, extrai apenas o objeto JSON
  const m = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : cleaned);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const { template_id, kind, count = 3 } = body || {};
    if (!template_id || !kind || !TABLE_BY_KIND[kind]) {
      return new Response(JSON.stringify({ error: 'template_id e kind válido são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Rate-limit: máx 1 geração por template por dia
    const oneDayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const parentFk = PARENT_FK_BY_KIND[kind];
    const { count: recentCount } = await supabase
      .from(TABLE_BY_KIND[kind])
      .select('id', { count: 'exact', head: true })
      .eq(parentFk, template_id)
      .eq('ai_generated', true)
      .gte('created_at', oneDayAgo);
    if ((recentCount || 0) > 0) {
      return new Response(JSON.stringify({ error: 'Variações já geradas pra esse template nas últimas 24h. Tente amanhã.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Busca o template original
    const { data: original } = await supabase.from('v_template_stats')
      .select('*').eq('id', template_id).eq('kind', kind).maybeSingle();
    if (!original) {
      return new Response(JSON.stringify({ error: 'Template não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Top 3 e bottom 3 do mesmo kind, com pelo menos 30 envios
    const { data: ranked } = await supabase.from('v_template_stats')
      .select('*').eq('kind', kind).gte('sent', 30).neq('id', template_id)
      .order('score', { ascending: false });
    const champions = (ranked || []).slice(0, 3);
    const losers = (ranked || []).slice(-3).reverse();

    const prompt = buildPrompt({
      kind,
      original: { name: original.name, message: original.message, score: original.score, sent: original.sent, qualified_rate: original.qualified_rate_raw },
      champions: champions.map((c: any) => ({ name: c.name, message: c.message, score: c.score, qualified_rate: c.qualified_rate_raw })),
      losers: losers.map((l: any) => ({ name: l.name, message: l.message, score: l.score, opt_out_rate: l.opt_out_rate })),
      count: Math.min(Math.max(count, 1), 5),
    });

    const raw = await callLLM(supabase, prompt);
    let parsed: any;
    try { parsed = parseLLMJson(raw); }
    catch (e: any) {
      console.error('[gen-variations] parse falhou:', e.message, 'raw:', raw);
      throw new Error('Resposta do LLM não é JSON válido. ' + e.message);
    }

    const variations: Array<{ name: string; message: string }> = parsed?.variations || [];
    if (!Array.isArray(variations) || variations.length === 0) {
      throw new Error('LLM retornou JSON sem array "variations" válido');
    }

    // Insere como rascunhos (estrutura varia por kind)
    let created = 0;
    for (const v of variations.slice(0, count)) {
      if (!v?.message) continue;
      const baseRow: any = {
        is_active: false,
        is_draft: true,
        ai_generated: true,
      };
      baseRow[parentFk] = template_id;

      if (kind === 'prospecting') {
        baseRow.name = v.name || `IA · derivado de ${original.name}`;
        baseRow.message = v.message;
        baseRow.category = original.segment;
      } else if (kind === 'welcome') {
        baseRow.name = v.name || `IA · derivado de ${original.name}`;
        baseRow.message = v.message;
      } else if (kind === 'cadence_step') {
        // Pra cadence_step precisamos cadence_id e step_number — herda do pai
        const { data: parentStep } = await supabase.from('cadence_steps').select('cadence_id, step_number, media_type, delay_days').eq('id', template_id).maybeSingle();
        if (!parentStep) continue;
        baseRow.cadence_id = parentStep.cadence_id;
        baseRow.step_number = parentStep.step_number;
        baseRow.media_type = parentStep.media_type;
        baseRow.delay_days = parentStep.delay_days;
        baseRow.content = v.message;
      }

      const { error } = await supabase.from(TABLE_BY_KIND[kind]).insert(baseRow);
      if (error) console.error('[gen-variations] insert falhou:', error.message);
      else created++;
    }

    return new Response(JSON.stringify({ success: true, created, requested: variations.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[gen-variations] erro:', e.message);
    return new Response(JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
