import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Calcula o score de um lead (0-100) com base em sinais de engajamento.
 *
 * Fatores positivos:
 *  +25  Lead respondeu à mensagem de boas-vindas
 *  +15  Status IN_PROGRESS (já tem conversa em andamento)
 *  +20  Status DOCS_REQUESTED (etapa mais avançada)
 *  +20  Última interação < 2h (lead quente)
 *  +12  Última interação entre 2-6h
 *  +8   Última interação entre 6-24h
 *  +3   Última interação entre 24-48h
 *
 * Fatores negativos:
 *  -15  Última interação > 48h (esfriando)
 *  -25  Última interação > 120h (muito frio)
 *  -10  Sem bot atribuído ao corretor (não consegue ser contatado)
 */
function computeScore(lead: any): number {
  let score = 50;

  // Engajamento inicial
  if (lead.welcome_responded_at) score += 25;

  // Status (profundidade no funil)
  if (lead.status === 'DOCS_REQUESTED') score += 20;
  else if (lead.status === 'IN_PROGRESS') score += 15;

  // Recência da última interação
  const lastTs = lead.last_interaction_at || lead.created_at;
  const hoursAgo = lastTs
    ? (Date.now() - new Date(lastTs).getTime()) / 3600000
    : 9999;

  if (hoursAgo < 2)        score += 20;
  else if (hoursAgo < 6)   score += 12;
  else if (hoursAgo < 24)  score += 8;
  else if (hoursAgo < 48)  score += 3;
  else if (hoursAgo < 120) score -= 15;
  else                     score -= 25;

  // Acessibilidade (bot disponível)
  if (!lead.broker?.bot_instance_id) score -= 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  );

  try {
    // ── Verificar se está ativo ────────────────────────────────────────────────
    const { data: enabledSetting } = await supabase
      .from('system_settings').select('value').eq('key', 'agente_scoring_enabled').maybeSingle();

    const enabled = String(enabledSetting?.value ?? 'false') === 'true';
    if (!enabled) {
      return new Response(JSON.stringify({ skipped: 'disabled', scored: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Buscar leads ativos para pontuar ──────────────────────────────────────
    const { data: leads } = await supabase
      .from('leads')
      .select('id, status, welcome_responded_at, last_interaction_at, created_at, broker:profiles!broker_id(bot_instance_id)')
      .in('status', ['NEW', 'IN_PROGRESS', 'DOCS_REQUESTED'])
      .limit(200);

    console.log(`[agente-scoring] ${leads?.length ?? 0} leads para pontuar`);

    if (!leads?.length) {
      return new Response(JSON.stringify({ scored: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Calcular e atualizar scores em batch ──────────────────────────────────
    // Agrupa por score para minimizar updates
    const byScore: Record<number, string[]> = {};
    for (const lead of leads) {
      const score = computeScore(lead);
      if (!byScore[score]) byScore[score] = [];
      byScore[score].push(lead.id);
    }

    const scoreEntries = Object.entries(byScore);
    for (const [score, ids] of scoreEntries) {
      await supabase.from('leads')
        .update({ ai_score: parseInt(score, 10) })
        .in('id', ids);
    }

    const scored = leads.length;
    console.log(`[agente-scoring] done — scored=${scored} grupos=${scoreEntries.length}`);

    return new Response(JSON.stringify({ scored }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[agente-scoring] fatal:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
