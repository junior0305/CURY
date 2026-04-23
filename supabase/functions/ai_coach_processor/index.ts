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

// ── Tenta LLMs em ordem de prioridade (fallback automático) ──────────────────

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
      if (cfg.provider === 'openai'    && !OPENAI_API_KEY)    throw new Error('OPENAI_API_KEY not set');
      if (cfg.provider === 'gemini'    && !GEMINI_API_KEY)    throw new Error('GEMINI_API_KEY not set');

      let text = '';
      if (cfg.provider === 'anthropic') text = await callAnthropicAPI(prompt, cfg.model_name, cfg.max_tokens);
      else if (cfg.provider === 'openai') text = await callOpenAIAPI(prompt, cfg.model_name, cfg.max_tokens);
      else if (cfg.provider === 'gemini') text = await callGeminiAPI(prompt, cfg.model_name, cfg.max_tokens);
      return text;
    } catch (err: any) {
      lastError = err.message;
      console.warn(`[ai_coach] ${cfg.provider} falhou: ${err.message}`);
      if (isBalanceError(err.message)) {
        try {
          const { data: admins } = await supabase.from('profiles').select('id').in('role', ['ADMIN', 'SUPERINTENDENT']);
          const notifications = (admins || []).map((a: any) => ({
            to_id: a.id,
            type: 'AI_COACH_LLM_ERROR',
            title: `⚠️ AI Coach: saldo insuficiente (${cfg.provider})`,
            message: `O provedor ${cfg.provider} (${cfg.model_name}) falhou por saldo/cota.`,
          }));
          if (notifications.length > 0) await supabase.from('internal_notifications').insert(notifications);
        } catch (_) { /* não falha por causa da notificação */ }
      }
    }
  }
  throw new Error(`Todos os LLMs falharam. Último erro: ${lastError}`);
}

// ── Formata transcrição de conversa para o prompt ─────────────────────────────

function formatConversation(
  leadName: string,
  leadStatus: string,
  messages: { direction: string; sender_type: string; message_text: string; sent_at: string | null }[]
): string {
  if (messages.length === 0) return `  Lead: ${leadName} (${leadStatus}) — sem mensagens registradas`;

  const lines = messages
    .filter(m => m.message_text && m.message_text.trim().length > 0)
    .slice(0, 20) // limita a 20 mensagens por conversa para não explodir o prompt
    .map(m => {
      const quem = m.sender_type === 'lead' ? `  LEAD` : `  BOT `;
      const texto = m.message_text.replace(/\n/g, ' ').slice(0, 200);
      return `${quem}: ${texto}`;
    });

  return `  Lead: ${leadName} (status: ${leadStatus})\n${lines.join('\n')}`;
}

// ── Handler principal ─────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Carrega LLMs ativos
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
    let errors    = 0;

    for (const item of queue) {
      try {
        await supabaseClient.from('ai_coach_queue').update({ status: 'processing' }).eq('id', item.id);

        const { data: broker } = await supabaseClient
          .from('profiles')
          .select('first_name, full_name, email')
          .eq('id', item.broker_id)
          .single();
        const brokerName = broker?.first_name || broker?.full_name || 'Corretor';

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const sevenDaysAgo  = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000).toISOString();

        // ── 1. Métricas CRM ───────────────────────────────────────────────────
        const { data: brokerLeads } = await supabaseClient
          .from('leads')
          .select('id, name, status, contact_attempts, last_broker_whatsapp_at, last_lead_response_at, created_at, last_interaction_at')
          .eq('broker_id', item.broker_id)
          .gte('created_at', thirtyDaysAgo);

        const leads = brokerLeads || [];

        if (leads.length === 0) {
          await supabaseClient.from('ai_coach_queue').update({
            status: 'skipped',
            error_message: 'No leads in last 30 days',
            processed_at: new Date().toISOString(),
          }).eq('id', item.id);
          continue;
        }

        const totalLeads     = leads.length;
        const contacted      = leads.filter((l: any) => l.last_broker_whatsapp_at !== null).length;
        const responded      = leads.filter((l: any) => l.last_lead_response_at !== null).length;
        const neverContacted = leads.filter((l: any) => (l.contact_attempts || 0) === 0).length;
        const highAttempts   = leads.filter((l: any) => (l.contact_attempts || 0) >= 5).length;
        const recentActivity = leads.filter((l: any) => l.last_broker_whatsapp_at && l.last_broker_whatsapp_at > sevenDaysAgo).length;
        const responseRate   = contacted > 0 ? Math.round((responded / contacted) * 100) : 0;

        const byStatus: Record<string, number> = {};
        leads.forEach((l: any) => { byStatus[l.status] = (byStatus[l.status] || 0) + 1; });

        const advanced = leads.filter((l: any) =>
          !['NEW', 'IN_PROGRESS', 'ABANDONED', 'EXCLUDED'].includes(l.status)
        ).length;
        const conversionRate = totalLeads > 0 ? Math.round((advanced / totalLeads) * 100) : 0;
        const avgAttempts    = totalLeads > 0
          ? Math.round(leads.reduce((s: number, l: any) => s + (l.contact_attempts || 0), 0) / totalLeads * 10) / 10
          : 0;

        // ── 2. Conversas reais (ia_messages) ─────────────────────────────────
        // Busca os lead_ids deste corretor que têm conversa no bot
        const leadIds = leads.map((l: any) => l.id);

        const { data: conversations } = await supabaseClient
          .from('ia_conversations')
          .select('id, lead_id, created_at')
          .in('lead_id', leadIds)
          .gte('created_at', thirtyDaysAgo)
          .order('created_at', { ascending: false })
          .limit(8); // máx 8 conversas para não explodir o prompt

        const convs = conversations || [];
        let transcripts = '';
        let totalMsgs   = 0;
        let repeticoesDetectadas = 0;
        let sinaisCompraIgnorados = 0;

        if (convs.length > 0) {
          const convIds = convs.map((c: any) => c.id);

          const { data: messages } = await supabaseClient
            .from('ia_messages')
            .select('conversation_id, direction, sender_type, message_text, sent_at, created_at')
            .in('conversation_id', convIds)
            .not('message_text', 'is', null)
            .order('created_at', { ascending: true })
            .limit(200);

          const msgs = messages || [];
          totalMsgs  = msgs.length;

          // Agrupa mensagens por conversa
          const msgsByConv: Record<string, any[]> = {};
          msgs.forEach((m: any) => {
            if (!msgsByConv[m.conversation_id]) msgsByConv[m.conversation_id] = [];
            msgsByConv[m.conversation_id].push(m);
          });

          // Detecta padrões problemáticos
          for (const conv of convs) {
            const convMsgs = msgsByConv[conv.id] || [];
            const botMsgs  = convMsgs.filter((m: any) => m.sender_type !== 'lead').map((m: any) => m.message_text);
            const leadMsgs = convMsgs.filter((m: any) => m.sender_type === 'lead').map((m: any) => m.message_text);

            // Detecta mensagens repetidas do bot (mesmo texto 2+ vezes na conversa)
            const botMsgCount: Record<string, number> = {};
            botMsgs.forEach(t => {
              const key = (t || '').slice(0, 60);
              botMsgCount[key] = (botMsgCount[key] || 0) + 1;
            });
            if (Object.values(botMsgCount).some(n => n >= 2)) repeticoesDetectadas++;

            // Detecta sinais de compra do lead que o bot não avançou
            const sinaisCompra = ['quero', 'tenho interesse', 'me interessa', 'quero comprar',
              'quanto custa', 'qual o valor', 'como faço', 'vamos', 'bora', 'topo',
              'pode ser', 'sim', 'adorei', 'gostei'];
            const leadMostrouInteresse = leadMsgs.some(t =>
              sinaisCompra.some(s => (t || '').toLowerCase().includes(s))
            );
            const leadId = conv.lead_id;
            const leadData = leads.find((l: any) => l.id === leadId);
            const naoAvancou = leadData && ['NEW', 'IN_PROGRESS', 'ABANDONED', 'EXCLUDED'].includes(leadData.status);
            if (leadMostrouInteresse && naoAvancou) sinaisCompraIgnorados++;
          }

          // Formata transcrições (até 5 conversas)
          const transList: string[] = [];
          let convCount = 0;
          for (const conv of convs) {
            if (convCount >= 5) break;
            const convMsgs = msgsByConv[conv.id] || [];
            if (convMsgs.length === 0) continue;
            const leadData = leads.find((l: any) => l.id === conv.lead_id);
            const leadName = leadData?.name || 'Lead';
            const leadStatus = leadData?.status || '?';
            transList.push(formatConversation(leadName, leadStatus, convMsgs));
            convCount++;
          }

          if (transList.length > 0) {
            transcripts = `\nCONVERSAS REAIS (bot WhatsApp ↔ lead):\nNota: BOT = resposta automática do chip; LEAD = mensagem real do cliente.\n\n` +
              transList.map((t, i) => `--- Conversa ${i + 1} ---\n${t}`).join('\n\n');
          }
        }

        // ── 3. Monta prompt com métricas + transcrições ───────────────────────
        const prompt = `Você é um coach de vendas especialista em imóveis MCMV no Brasil. Analise a performance do chip de WhatsApp do corretor ${brokerName} nos últimos 30 dias.

IMPORTANTE: As conversas abaixo são entre o BOT AUTOMÁTICO do chip e os leads — não são mensagens manuais do corretor. O corretor é responsável por configurar o bot e garantir que os leads avancem no funil após a qualificação automática.

MÉTRICAS DO CRM (30 dias):
- Total de leads: ${totalLeads}
- Leads que o bot contactou: ${contacted} (${Math.round(contacted/totalLeads*100)}%)
- Leads que responderam: ${responded} — taxa de resposta: ${responseRate}%
- Leads sem nenhum contato: ${neverContacted}
- Leads com 5+ tentativas sem sucesso: ${highAttempts}
- Leads com atividade nos últimos 7 dias: ${recentActivity}
- Leads que avançaram no funil: ${advanced} — taxa de conversão: ${conversionRate}%
- Média de tentativas por lead: ${avgAttempts}

DISTRIBUIÇÃO DE STATUS:
${Object.entries(byStatus).map(([s, n]) => `- ${s}: ${n} leads`).join('\n')}

PADRÕES DETECTADOS NAS CONVERSAS:
- Conversas com mensagem repetida do bot (2+ vezes igual): ${repeticoesDetectadas}
- Leads que mostraram interesse mas não avançaram no funil: ${sinaisCompraIgnorados}
- Total de mensagens analisadas: ${totalMsgs}
${transcripts}

CRITÉRIOS DE AVALIAÇÃO:
1. Qualidade do fluxo do bot: perguntas repetidas, travamentos, respostas que ignoram o que o lead disse
2. Conversão: leads que mostraram interesse e não avançaram
3. Volume: leads sem contato nenhum
4. Engajamento: taxa de resposta e profundidade da qualificação
5. Continuidade: após qualificação pelo bot, o corretor deve assumir e avançar o lead

ERROS TÍPICOS A IDENTIFICAR:
- Bot repete a mesma pergunta sem ouvir a resposta do lead
- Lead diz "sim", "quero", "bora" e o bot reinicia o roteiro
- Lead qualificado (respondeu perguntas de renda/FGTS) mas ficou em NEW
- Bot não personalizou a resposta com base no que o lead informou
- Conversas longas sem progresso (lead responde mas não avança de etapa)

Retorne JSON (somente JSON, sem markdown):
{
  "quality_score": 0-100,
  "severity": "low|medium|high",
  "errors": [
    {"type": "codigo_do_problema", "description": "descrição detalhada com exemplo real da conversa se possível"}
  ],
  "positives": ["ponto positivo concreto com dado ou exemplo"],
  "summary": "análise em 3-5 frases: o que está funcionando, o que está travando, e qual a ação mais urgente para melhorar"
}`;

        const responseText = await callLLMWithFallback(supabaseClient, llmConfigs, prompt);

        // Extrai JSON da resposta
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in LLM response');
        const analysis = JSON.parse(jsonMatch[0]);

        // Salva análise enriquecida
        await supabaseClient.from('ai_coach_analysis').insert({
          broker_id: item.broker_id,
          analysis_period: item.analysis_period,
          total_leads_analyzed: totalLeads,
          avg_first_response_time: null,
          avg_lead_response_time: null,
          leads_abandoned: neverContacted,
          leads_converted: advanced,
          quality_score: analysis.quality_score || null,
          severity: analysis.severity || null,
          errors: analysis.errors || [],
          positives: analysis.positives || [],
          summary: analysis.summary || '',
          sample_conversations: convs.map((c: any) => c.id).slice(0, 5),
        });

        await supabaseClient.from('ai_coach_queue').update({
          status: 'completed',
          processed_at: new Date().toISOString(),
        }).eq('id', item.id);

        processed++;
        console.log(`[ai_coach] ${brokerName} analisado. Score: ${analysis.quality_score} | Convs: ${convs.length} | Msgs: ${totalMsgs}`);
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
