import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';

const BLACKLIST = ['construtora cury','me chamo ully','sou a ully','sou ully','você está na missão de encontrar','corretora da construtora'];

const CAP_DRAFTS_PER_DAY = 2;
const MIN_SENT_FOR_WINNER = 50;
const MIN_RESPONSES_FOR_WINNER = 10;
const WINNER_MULTIPLIER = 1.2;
const LOSER_MULTIPLIER = 0.5;
const MAX_OPT_OUT_RATE = 0.05;

interface TemplateRow { id: string; name: string; message: string; sent_count: number; responded_count: number; qualified_count: number; opted_out_count: number; is_active: boolean; }

async function generateVariation(winnerMessage: string): Promise<string | null> {
  if (!ANTHROPIC_API_KEY) return null;
  const systemPrompt = `Você é especialista em copywriting persuasivo pra venda de imóveis MCMV.\nRecebe um template VENCEDOR e gera 1 variação NOVA que:\n- Mantenha a essência da técnica psicológica\n- VARIE COMPLETAMENTE estrutura, palavras e abertura\n- Máximo 3 linhas separadas por \\n\n- Use 1 ou 2 emojis no máximo\n- Inclua {nome} pra interpolação\n- Tom direto, humano, brasileiro casual\n- PROIBIDO: mencionar nome de corretor ou região específica\n- PERMITIDO: mencionar parcela em reais como atrativo\n- PROIBIDO: "construtora Cury", "me chamo Ully", "sou Ully", "Você está na missão de encontrar"\n\nResponda APENAS com o texto da variação, sem aspas, sem markdown, sem explicação, sem prefixos.`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 250, temperature: 0.9,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Template VENCEDOR:\n${winnerMessage}\n\nGere 1 variação NOVA mantendo a essência mas com palavras e estrutura totalmente diferentes:` }],
      }),
    });
    if (!res.ok) { console.error('[auto-template-tuner] Claude error:', res.status); return null; }
    const json = await res.json();
    const text = json.content?.[0]?.text?.trim() || '';
    if (!text) return null;
    const lower = text.toLowerCase();
    if (BLACKLIST.some(p => lower.includes(p))) { console.warn('[auto-template-tuner] blacklist bloqueou'); return null; }
    if (!text.includes('{nome}')) { console.warn('[auto-template-tuner] sem {nome}'); return null; }
    return text;
  } catch (e: any) { console.error('[auto-template-tuner] generateVariation:', e.message); return null; }
}

function classifyTemplate(t: TemplateRow, baseline: number): 'winner' | 'loser' | 'neutral' {
  if (t.sent_count < MIN_SENT_FOR_WINNER) return 'neutral';
  const r = t.responded_count / t.sent_count;
  const o = t.opted_out_count / t.sent_count;
  if (o > MAX_OPT_OUT_RATE) return 'loser';
  if (r < baseline * LOSER_MULTIPLIER) return 'loser';
  if (r >= baseline * WINNER_MULTIPLIER && t.responded_count >= MIN_RESPONSES_FOR_WINNER) return 'winner';
  return 'neutral';
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2;
}

async function processTable(supabase: any, tableName: string, responseCol: string): Promise<any> {
  const { data: templates } = await supabase.from(tableName)
    .select(`id, name, message, sent_count, ${responseCol}, qualified_count, opted_out_count, is_active`)
    .eq('is_active', true).eq('is_draft', false);
  if (!templates || templates.length === 0) return { table: tableName, skipped: 'no_active_templates' };
  const rows: TemplateRow[] = templates.map((t: any) => ({
    id: t.id, name: t.name, message: t.message,
    sent_count: t.sent_count || 0, responded_count: t[responseCol] || 0,
    qualified_count: t.qualified_count || 0, opted_out_count: t.opted_out_count || 0,
    is_active: t.is_active,
  }));
  const eligible = rows.filter(t => t.sent_count >= MIN_SENT_FOR_WINNER);
  const baseline = median(eligible.map(t => t.responded_count / t.sent_count));
  const winners: TemplateRow[] = []; const losers: TemplateRow[] = [];
  for (const t of rows) {
    const c = classifyTemplate(t, baseline);
    if (c === 'winner') winners.push(t);
    if (c === 'loser') losers.push(t);
  }
  winners.sort((a, b) => (b.responded_count / b.sent_count) - (a.responded_count / a.sent_count));
  let paused = 0;
  for (const l of losers) {
    const reason = (l.opted_out_count / l.sent_count) > MAX_OPT_OUT_RATE
      ? `opt_out_${((l.opted_out_count / l.sent_count) * 100).toFixed(1)}pct`
      : `low_response_${((l.responded_count / l.sent_count) * 100).toFixed(1)}pct`;
    await supabase.from(tableName).update({
      is_active: false, auto_paused_at: new Date().toISOString(), auto_paused_reason: reason,
    }).eq('id', l.id);
    paused++;
  }
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const { count: draftsToday } = await supabase.from(tableName).select('id', { count: 'exact', head: true })
    .eq('is_draft', true).eq('ai_generated', true).gte('created_at', todayStart.toISOString());
  const remaining = Math.max(0, CAP_DRAFTS_PER_DAY - (draftsToday || 0));
  let generated = 0; const preview: any[] = [];
  for (const winner of winners.slice(0, remaining)) {
    const newText = await generateVariation(winner.message);
    if (!newText) continue;
    const { error } = await supabase.from(tableName).insert({
      name: `🤖 Auto — derivado de "${winner.name.substring(0, 40)}"`,
      message: newText, is_active: false, is_draft: true, ai_generated: true,
      parent_template_id: winner.id,
    });
    if (error) { console.error('[auto-template-tuner] insert:', error.message); continue; }
    generated++; preview.push({ parent: winner.name, preview: newText.substring(0, 60) });
  }
  return {
    table: tableName,
    baseline_response_rate: Math.round(baseline * 1000) / 10 + '%',
    winners: winners.length, losers_paused: paused,
    drafts_today_before: draftsToday || 0, slots_remaining: remaining,
    variations_generated: generated, variations_preview: preview,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const welcome = await processTable(supabase, 'welcome_templates', 'response_count');
    const prospecting = await processTable(supabase, 'prospecting_message_templates', 'responded_count');
    const total = (welcome.losers_paused || 0) + (welcome.variations_generated || 0)
                + (prospecting.losers_paused || 0) + (prospecting.variations_generated || 0);
    if (total > 0) {
      const { data: admins } = await supabase.from('profiles').select('id').in('role', ['ADMIN', 'SUPERINTENDENT']);
      for (const a of admins || []) {
        await supabase.from('internal_notifications').insert({
          to_id: a.id, type: 'AB_LAB_AUTO_TUNER',
          title: '🤖 Auto-tuner agiu',
          message: `Welcome: pausou ${welcome.losers_paused}, criou ${welcome.variations_generated} variações. Prospecting: pausou ${prospecting.losers_paused}, criou ${prospecting.variations_generated}. Revise em Admin > A/B Lab.`,
        }).then(() => {}, () => {});
      }
    }
    return new Response(JSON.stringify({ success: true, welcome, prospecting, ran_at: new Date().toISOString() }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('[auto-template-tuner] fatal:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
