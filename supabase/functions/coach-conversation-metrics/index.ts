import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_INVOCATION_MS = 100_000; // sai antes do platform timeout 150s

// Score determinístico baseado em métricas (sem LLM) ────────────────────────────

interface Msg { direction: 'incoming'|'outgoing'; sender_type: 'broker'|'lead'|'ia'; created_at: string; }
interface Lead { id: string; status: string; broker_id: string|null; created_at: string; negotiating_since: string|null; }

function analyzeMetrics(msgs: Msg[], lead: Lead | null): {
  quality_score: number;
  severity: 'low'|'medium'|'high';
  summary: string;
  positives: string[];
  errors: { description: string; severity: 'low'|'medium'|'high' }[];
  suggestion: string;
  metrics: any;
} {
  const now = Date.now();
  let score = 5; // baseline
  const positives: string[] = [];
  const errors: { description: string; severity: 'low'|'medium'|'high' }[] = [];

  const brokerMsgs = msgs.filter(m => m.sender_type === 'broker' || m.sender_type === 'ia');
  const leadMsgs   = msgs.filter(m => m.sender_type === 'lead');

  // ── 1ª resposta do corretor após mensagem do lead (ou após criação do lead) ──
  let firstResponseMin: number | null = null;
  if (brokerMsgs.length > 0) {
    const firstBroker = new Date(brokerMsgs[0].created_at).getTime();
    const baselineTs = lead ? new Date(lead.created_at).getTime() : firstBroker;
    firstResponseMin = Math.max(0, (firstBroker - baselineTs) / 60000);

    if (firstResponseMin < 5)        { score += 3; positives.push(`1ª resposta em ${Math.round(firstResponseMin)}min ⚡`); }
    else if (firstResponseMin < 30)  { score += 2; positives.push(`1ª resposta em ${Math.round(firstResponseMin)}min`); }
    else if (firstResponseMin < 120) { score += 1; }
    else if (firstResponseMin < 360) { /* neutro */ }
    else if (firstResponseMin < 1440){ score -= 2; errors.push({ description: `1ª resposta após ${Math.round(firstResponseMin/60)}h — atender mais rápido`, severity: 'medium' }); }
    else                             { score -= 3; errors.push({ description: `1ª resposta após ${Math.round(firstResponseMin/1440)} dia(s) — lead provavelmente esfriou`, severity: 'high' }); }
  }

  // ── Engajamento do lead ──
  if (leadMsgs.length === 0 && brokerMsgs.length >= 3) {
    score -= 2;
    errors.push({ description: `${brokerMsgs.length} envios do corretor sem nenhuma resposta do lead`, severity: 'medium' });
  } else if (leadMsgs.length >= 3) {
    score += 2;
    positives.push(`Lead engajado (${leadMsgs.length} respostas)`);
  } else if (leadMsgs.length >= 1) {
    score += 1;
  }

  // ── Última atividade ──
  const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
  const hoursSinceLast = lastMsg ? (now - new Date(lastMsg.created_at).getTime()) / 3600000 : 9999;
  const lastBrokerMsg = brokerMsgs[brokerMsgs.length - 1];
  const lastLeadMsg = leadMsgs[leadMsgs.length - 1];

  if (lastLeadMsg && lastBrokerMsg) {
    const leadTs = new Date(lastLeadMsg.created_at).getTime();
    const brokerTs = new Date(lastBrokerMsg.created_at).getTime();
    if (leadTs > brokerTs) {
      // Lead respondeu por último — corretor está devendo resposta
      const hoursDevendo = (now - leadTs) / 3600000;
      if (hoursDevendo > 24)      { score -= 3; errors.push({ description: `Lead esperando resposta há ${Math.round(hoursDevendo)}h`, severity: 'high' }); }
      else if (hoursDevendo > 4)  { score -= 2; errors.push({ description: `Lead esperando resposta há ${Math.round(hoursDevendo)}h`, severity: 'medium' }); }
      else if (hoursDevendo > 1)  { score -= 1; }
    } else {
      // Corretor mandou por último (esperando lead)
      if (hoursSinceLast < 4)     positives.push('Conversa ativa');
    }
  }

  // ── Status do lead ──
  if (lead) {
    const ABANDONED_OR_LOST = ['ABANDONED','EXCLUDED'].includes(lead.status);
    const ADVANCED = ['IN_PROGRESS','NEGOTIATING','VISIT_SCHEDULED','VISITA_REALIZADA','DOCS_REQUESTED','CONCLUDED'].includes(lead.status);
    if (ABANDONED_OR_LOST) {
      score -= 3;
      errors.push({ description: `Lead virou ${lead.status} — analisar motivo no histórico`, severity: 'high' });
    } else if (lead.status === 'CONCLUDED') {
      score += 3;
      positives.push('Venda concluída 🏆');
    } else if (ADVANCED) {
      score += 1;
      positives.push(`Status: ${lead.status}`);
    }

    // NEGOTIATING parado
    if (lead.status === 'NEGOTIATING' && lead.negotiating_since) {
      const daysNego = (now - new Date(lead.negotiating_since).getTime()) / 86400000;
      if (daysNego > 15)      { score -= 3; errors.push({ description: `Em NEGOCIAÇÃO há ${Math.round(daysNego)}d sem avançar`, severity: 'high' }); }
      else if (daysNego > 5)  { score -= 1; errors.push({ description: `Em NEGOCIAÇÃO há ${Math.round(daysNego)}d`, severity: 'medium' }); }
    }
  }

  // ── Conversa robusta ──
  if (brokerMsgs.length >= 3 && leadMsgs.length >= 3) {
    positives.push('Diálogo bem desenvolvido');
  }

  // ── Cap final ──
  score = Math.max(0, Math.min(10, score));
  const severity: 'low'|'medium'|'high' =
    score <= 4 ? 'high' : score <= 7 ? 'medium' : 'low';

  // ── Summary template ──
  const totalMsgs = msgs.length;
  const summaryParts: string[] = [];
  if (firstResponseMin !== null) summaryParts.push(`1ª resp: ${firstResponseMin < 60 ? Math.round(firstResponseMin)+'min' : Math.round(firstResponseMin/60)+'h'}`);
  summaryParts.push(`${totalMsgs} msg${totalMsgs!==1?'s':''}`);
  summaryParts.push(`corretor ${brokerMsgs.length} ↔ lead ${leadMsgs.length}`);
  if (lead) summaryParts.push(`status ${lead.status}`);
  const summary = summaryParts.join(' · ');

  // ── Sugestão de próximo passo ──
  let suggestion = 'Continuar acompanhamento normal';
  if (lastLeadMsg && lastBrokerMsg && new Date(lastLeadMsg.created_at).getTime() > new Date(lastBrokerMsg.created_at).getTime()) {
    suggestion = 'Lead respondeu — atenda agora';
  } else if (leadMsgs.length === 0 && brokerMsgs.length >= 2) {
    suggestion = 'Trocar abordagem — o atual não engaja o lead';
  } else if (lead?.status === 'NEGOTIATING' && lead.negotiating_since) {
    const dias = Math.round((now - new Date(lead.negotiating_since).getTime()) / 86400000);
    if (dias >= 5) suggestion = `Em negociação há ${dias}d — cobrar fechamento ou definir próxima ação`;
  } else if (hoursSinceLast > 48 && lead && !['CONCLUDED','ABANDONED','EXCLUDED'].includes(lead.status)) {
    suggestion = `Sem mensagem há ${Math.round(hoursSinceLast/24)}d — reaquecer com nova abordagem`;
  } else if (leadMsgs.length >= 3 && lead?.status === 'NEW') {
    suggestion = 'Lead engajado mas ainda em NEW — qualificar e avançar pra IN_PROGRESS';
  }

  return {
    quality_score: score,
    severity,
    summary,
    positives,
    errors,
    suggestion,
    metrics: {
      first_response_min: firstResponseMin,
      total_msgs: totalMsgs,
      broker_msgs: brokerMsgs.length,
      lead_msgs: leadMsgs.length,
      hours_since_last: hoursSinceLast,
    },
  };
}

async function processConversation(supabase: any, conversationId: string) {
  const { data: conv } = await supabase.from('ia_conversations')
    .select('id, lead_id, lead_name')
    .eq('id', conversationId).maybeSingle();
  if (!conv) return { error: 'Conversation not found' };

  const { data: msgs } = await supabase.from('ia_messages')
    .select('direction, sender_type, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(200);

  if (!msgs || msgs.length === 0) {
    return { empty: true, conversationId };
  }

  let lead: Lead | null = null;
  let brokerId: string | null = null;
  if (conv.lead_id) {
    const { data: leadRow } = await supabase.from('leads')
      .select('id, status, broker_id, created_at, negotiating_since')
      .eq('id', conv.lead_id).maybeSingle();
    if (leadRow) {
      lead = leadRow;
      brokerId = leadRow.broker_id;
    }
  }

  const result = analyzeMetrics(msgs as Msg[], lead);

  await supabase.from('ai_coach_analysis').insert({
    broker_id: brokerId,
    conversation_id: conversationId,
    quality_score: result.quality_score,
    severity: result.severity,
    summary: result.summary,
    positives: result.positives,
    errors: result.errors,
    sample_conversations: {
      suggestion: result.suggestion,
      metrics: result.metrics,
      source: 'auto_metrics',
    },
    conversation_origin: 'auto_metrics',
    analysis_period: new Date().toISOString(),
    total_leads_analyzed: 1,
  }).then(() => {}, () => {});

  return { conversationId, ...result };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    const body = await req.json().catch(() => ({}));
    const conversationId = body.conversationId;

    // Modo individual: processar 1 conversation específica
    if (conversationId) {
      const result = await processConversation(supabase, conversationId);
      return new Response(JSON.stringify({ mode: 'single', ...result }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Modo batch: processar conversations ativas SEM análise <12h ou sem análise
    const cutoff = new Date(Date.now() - 12 * 3600000).toISOString();
    const limit = Math.min(Number(body.limit) || 50, 100);

    // Pega conversations ativas com mensagens recentes
    const { data: convs } = await supabase
      .from('ia_conversations')
      .select('id, last_message_at, messages_count')
      .eq('status', 'active')
      .eq('is_crm_lead', true)
      .gte('messages_count', 1)
      .gte('last_message_at', new Date(Date.now() - 7 * 86400000).toISOString())
      .order('last_message_at', { ascending: false })
      .limit(limit * 3); // pega mais pra filtrar depois

    if (!convs || convs.length === 0) {
      return new Response(JSON.stringify({ mode: 'batch', processed: 0, message: 'No active conversations' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Filtra: só processa quem não tem análise recente
    const { data: recentAnalyses } = await supabase
      .from('ai_coach_analysis')
      .select('conversation_id')
      .in('conversation_id', convs.map((c: any) => c.id))
      .gte('created_at', cutoff);

    const recentSet = new Set((recentAnalyses || []).map((a: any) => a.conversation_id));
    const toProcess = convs.filter((c: any) => !recentSet.has(c.id)).slice(0, limit);

    let processed = 0;
    let timedOut = false;
    const results: any[] = [];
    for (const c of toProcess) {
      if (Date.now() - startTime > MAX_INVOCATION_MS) { timedOut = true; break; }
      const r = await processConversation(supabase, c.id);
      if (!(r as any).error && !(r as any).empty) { processed++; results.push({ id: c.id, score: (r as any).quality_score, sev: (r as any).severity }); }
    }

    return new Response(JSON.stringify({
      mode: 'batch',
      processed,
      candidatos: toProcess.length,
      timedOut,
      sample: results.slice(0, 5),
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('[coach-conversation-metrics] error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
