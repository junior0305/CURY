// auto-template-tuner — roda diariamente e:
// 1) Detecta vencedores (response_rate >= baseline*1.2 + volume mínimo)
// 2) Detecta perdedores (response_rate < baseline*0.5 OU opt_out > 5%) → auto-pausa
// 3) Gera 1-2 variações dos top 3 vencedores via Claude → insere como is_draft=true
// 4) Salvaguardas: cap diário de drafts, blacklist de frases, volume mínimo

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';

// Frases que NUNCA podem aparecer em variação (causaram ban no passado)
const BLACKLIST = [
  'construtora cury',
  'me chamo ully',
  'sou a ully',
  'sou ully',
  'você está na missão de encontrar',
  'corretora da construtora',
];

// Salvaguardas configuráveis
const CAP_DRAFTS_PER_DAY = 2;            // máximo de variações novas por dia (cada tipo)
const MIN_SENT_FOR_WINNER = 50;          // mínimo de envios pra qualificar como vencedor
const MIN_RESPONSES_FOR_WINNER = 10;     // mínimo de respostas pra confirmar
const WINNER_MULTIPLIER = 1.2;           // 20% acima do baseline = vencedor
const LOSER_MULTIPLIER = 0.5;            // 50% abaixo = perdedor
const MAX_OPT_OUT_RATE = 0.05;           // 5% opt-out = pausa imediata

interface TemplateRow {
  id: string;
  name: string;
  message: string;
  sent_count: number;
  responded_count: number;
  qualified_count: number;
  opted_out_count: number;
  is_active: boolean;
}

async function generateVariation(winnerMessage: string): Promise<string | null> {
  if (!ANTHROPIC_API_KEY) {
    console.warn('[auto-template-tuner] ANTHROPIC_API_KEY ausente, pulando geração');
    return null;
  }

  const systemPrompt = `Você é especialista em copywriting persuasivo pra venda de imóveis MCMV (Minha Casa Minha Vida).
Recebe um template VENCEDOR e gera 1 variação NOVA que:
- Mantenha a essência da técnica psicológica (curiosity, escassez, prova social, loss aversion, etc)
- VARIE COMPLETAMENTE a estrutura, palavras e abertura
- Máximo 3 linhas (separadas por \\n)
- Use 1 ou 2 emojis no máximo
- Inclua o placeholder {nome} pra interpolação do nome do lead
- Tom direto, humano, brasileiro casual
- PROIBIDO: mencionar nome de corretor, mencionar região específica
- PERMITIDO: mencionar parcela em reais como atrativo
- PROIBIDO: usar as frases "construtora Cury", "me chamo Ully", "sou Ully", "Você está na missão de encontrar"

Responda APENAS com o texto da variação, sem aspas, sem markdown, sem explicação, sem "Variação:" ou prefixos.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 250,
        temperature: 0.9,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Template VENCEDOR:\n${winnerMessage}\n\nGere 1 variação NOVA mantendo a essência da técnica mas com palavras e estrutura totalmente diferentes:` }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[auto-template-tuner] Claude error:', res.status, err.substring(0, 200));
      return null;
    }
    const json = await res.json();
    const text = json.content?.[0]?.text?.trim() || '';
    if (!text) return null;

    // Anti-blacklist
    const lower = text.toLowerCase();
    if (BLACKLIST.some(phrase => lower.includes(phrase))) {
      console.warn(`[auto-template-tuner] Variação BLOQUEADA por blacklist: ${text.substring(0, 80)}`);
      return null;
    }
    // Garante que tem {nome}
    if (!text.includes('{nome}')) {
      console.warn(`[auto-template-tuner] Variação sem placeholder {nome}: ${text.substring(0, 80)}`);
      return null;
    }
    return text;
  } catch (e: any) {
    console.error('[auto-template-tuner] generateVariation error:', e.message);
    return null;
  }
}

function classifyTemplate(t: TemplateRow, baselineRate: number): 'winner' | 'loser' | 'neutral' {
  if (t.sent_count < MIN_SENT_FOR_WINNER) return 'neutral';

  const responseRate = t.responded_count / t.sent_count;
  const optOutRate = t.opted_out_count / t.sent_count;

  // Perdedor: opt-out alto OU response muito baixo
  if (optOutRate > MAX_OPT_OUT_RATE) return 'loser';
  if (responseRate < baselineRate * LOSER_MULTIPLIER) return 'loser';

  // Vencedor: response acima do baseline E volume mínimo de respostas
  if (responseRate >= baselineRate * WINNER_MULTIPLIER
      && t.responded_count >= MIN_RESPONSES_FOR_WINNER) {
    return 'winner';
  }
  return 'neutral';
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function processTable(supabase: any, tableName: string, responseCol: string): Promise<any> {
  // 1. Pega TODOS templates ativos
  const { data: templates } = await supabase
    .from(tableName)
    .select(`id, name, message, sent_count, ${responseCol}, qualified_count, opted_out_count, is_active`)
    .eq('is_active', true)
    .eq('is_draft', false);

  if (!templates || templates.length === 0) {
    return { table: tableName, skipped: 'no_active_templates' };
  }

  // Normaliza nome da coluna de respostas (welcome usa response_count, prospecting usa responded_count)
  const rows: TemplateRow[] = templates.map((t: any) => ({
    id: t.id, name: t.name, message: t.message,
    sent_count: t.sent_count || 0,
    responded_count: t[responseCol] || 0,
    qualified_count: t.qualified_count || 0,
    opted_out_count: t.opted_out_count || 0,
    is_active: t.is_active,
  }));

  // 2. Baseline = mediana do response_rate dos que têm volume mínimo
  const eligibleForBaseline = rows.filter(t => t.sent_count >= MIN_SENT_FOR_WINNER);
  const rates = eligibleForBaseline.map(t => t.responded_count / t.sent_count);
  const baseline = median(rates);

  // 3. Classifica
  const winners: TemplateRow[] = [];
  const losers: TemplateRow[] = [];
  for (const t of rows) {
    const cls = classifyTemplate(t, baseline);
    if (cls === 'winner') winners.push(t);
    if (cls === 'loser') losers.push(t);
  }
  winners.sort((a, b) => (b.responded_count / b.sent_count) - (a.responded_count / a.sent_count));

  // 4. Pausa perdedores
  let paused = 0;
  for (const l of losers) {
    const reason = (l.opted_out_count / l.sent_count) > MAX_OPT_OUT_RATE
      ? `opt_out_${((l.opted_out_count / l.sent_count) * 100).toFixed(1)}pct`
      : `response_${((l.responded_count / l.sent_count) * 100).toFixed(1)}pct_vs_baseline_${(baseline * 100).toFixed(1)}pct`;
    await supabase.from(tableName).update({
      is_active: false,
      auto_paused_at: new Date().toISOString(),
      auto_paused_reason: reason,
    }).eq('id', l.id);
    paused++;
  }

  // 5. Cap diário de drafts (não cria mais que CAP_DRAFTS_PER_DAY hoje)
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const { count: draftsToday } = await supabase
    .from(tableName)
    .select('id', { count: 'exact', head: true })
    .eq('is_draft', true)
    .eq('ai_generated', true)
    .gte('created_at', todayStart.toISOString());

  const remainingSlots = Math.max(0, CAP_DRAFTS_PER_DAY - (draftsToday || 0));

  // 6. Gera variações dos top vencedores (até preencher slots)
  let generated = 0;
  const variationsCreated: any[] = [];
  const topWinners = winners.slice(0, remainingSlots);
  for (const winner of topWinners) {
    const newText = await generateVariation(winner.message);
    if (!newText) continue;

    const variationName = `🤖 Auto — derivado de "${winner.name.substring(0, 40)}"`;
    const insertBody: any = {
      name: variationName,
      message: newText,
      is_active: false,
      is_draft: true,
      ai_generated: true,
      parent_template_id: winner.id,
    };
    const { error: insErr } = await supabase.from(tableName).insert(insertBody);
    if (insErr) {
      console.error(`[auto-template-tuner] insert error em ${tableName}:`, insErr.message);
      continue;
    }
    generated++;
    variationsCreated.push({ parent: winner.name, preview: newText.substring(0, 60) });
  }

  return {
    table: tableName,
    baseline_response_rate: Math.round(baseline * 1000) / 10 + '%',
    winners: winners.length,
    losers_paused: paused,
    drafts_today_before: draftsToday || 0,
    slots_remaining: remainingSlots,
    variations_generated: generated,
    variations_preview: variationsCreated,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    // Welcome templates usam coluna 'response_count', prospecting usam 'responded_count'
    const welcomeReport = await processTable(supabase, 'welcome_templates', 'response_count');
    const prospectingReport = await processTable(supabase, 'prospecting_message_templates', 'responded_count');

    // Notificação interna pro admin (se houve mudanças)
    const totalActions =
      (welcomeReport.losers_paused || 0) + (welcomeReport.variations_generated || 0) +
      (prospectingReport.losers_paused || 0) + (prospectingReport.variations_generated || 0);

    if (totalActions > 0) {
      const { data: admins } = await supabase
        .from('profiles').select('id').in('role', ['ADMIN', 'SUPERINTENDENT']);
      for (const a of admins || []) {
        await supabase.from('internal_notifications').insert({
          to_id: a.id,
          type: 'AB_LAB_AUTO_TUNER',
          title: '🤖 Auto-tuner agiu',
          message: `Welcome: pausou ${welcomeReport.losers_paused}, criou ${welcomeReport.variations_generated} variações. Prospecting: pausou ${prospectingReport.losers_paused}, criou ${prospectingReport.variations_generated}. Revise em Admin > A/B Lab.`,
        }).then(() => {}, () => {});
      }
    }

    return new Response(JSON.stringify({
      success: true,
      welcome: welcomeReport,
      prospecting: prospectingReport,
      ran_at: new Date().toISOString(),
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('[auto-template-tuner] fatal:', err.message);
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
