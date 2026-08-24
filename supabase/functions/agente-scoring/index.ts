import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function computeScore(lead: any, state?: { intencao?: string; momento?: string } | null): number {
  let score = 50;

  if (lead.welcome_responded_at) score += 25;

  if (lead.status === 'DOCS_REQUESTED') score += 20;
  else if (lead.status === 'IN_PROGRESS') score += 15;

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

  if (state) {
    switch (state.intencao) {
      case 'quente':         score += 20; break;
      case 'morno':          score += 5;  break;
      case 'frio':           score -= 15; break;
      case 'desqualificado': score -= 30; break;
    }
    switch (state.momento) {
      case 'decidido':    score += 15; break;
      case 'comparando':  score += 5;  break;
      case 'sumiu':       score -= 20; break;
    }
  }

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
    const { data: enabledSetting } = await supabase
      .from('system_settings').select('value').eq('key', 'agente_scoring_enabled').maybeSingle();

    const enabled = String(enabledSetting?.value ?? 'false') === 'true';
    if (!enabled) {
      return new Response(JSON.stringify({ skipped: 'disabled', scored: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: leads } = await supabase
      .from('leads')
      .select('id, status, welcome_responded_at, last_interaction_at, created_at, broker:profiles!broker_id(bot_instance_id)')
      .in('status', ['NEW', 'IN_PROGRESS', 'DOCS_REQUESTED'])
      .limit(200);

    if (!leads?.length) {
      return new Response(JSON.stringify({ scored: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const leadIds = leads.map(l => l.id);
    const { data: statesData } = await supabase
      .from('lead_state')
      .select('lead_id, intencao, momento')
      .in('lead_id', leadIds);

    const stateMap = new Map((statesData || []).map(s => [s.lead_id, s]));

    const byScore: Record<number, string[]> = {};
    for (const lead of leads) {
      const score = computeScore(lead, stateMap.get(lead.id) ?? null);
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
    console.log(`[agente-scoring] done — scored=${scored}`);

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
