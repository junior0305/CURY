import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const OPENAI_API_KEY    = Deno.env.get('OPENAI_API_KEY') || '';
const GEMINI_API_KEY    = Deno.env.get('GEMINI_API_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Tabela de custo por token (USD) ──────────────────────────────────────────
const COST_TABLE: Record<string, { input: number; output: number }> = {
  'gemini-2.0-flash':  { input: 0.075 / 1e6, output: 0.30 / 1e6  },
  'claude-haiku-4-5':  { input: 0.80  / 1e6, output: 4.00 / 1e6  },
  'claude-sonnet-4-6': { input: 3.00  / 1e6, output: 15.00 / 1e6 },
  'gpt-4o-mini':       { input: 0.15  / 1e6, output: 0.60 / 1e6  },
  'gpt-4o':            { input: 2.50  / 1e6, output: 10.00 / 1e6 },
};

// ── LLM wrappers (retornam { text, inputTokens, outputTokens }) ───────────────

async function callGeminiAPI(prompt: string, model: string, maxTokens: number) {
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
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const inputTokens  = json.usageMetadata?.promptTokenCount     || 0;
  const outputTokens = json.usageMetadata?.candidatesTokenCount || 0;
  return { text, inputTokens, outputTokens };
}

async function callAnthropicAPI(prompt: string, model: string, maxTokens: number) {
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
  const text = json.content?.[0]?.text || '';
  const inputTokens  = json.usage?.input_tokens  || 0;
  const outputTokens = json.usage?.output_tokens || 0;
  return { text, inputTokens, outputTokens };
}

async function callOpenAIAPI(prompt: string, model: string, maxTokens: number) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
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
  const text = json.choices?.[0]?.message?.content || '';
  const inputTokens  = json.usage?.prompt_tokens     || 0;
  const outputTokens = json.usage?.completion_tokens || 0;
  return { text, inputTokens, outputTokens };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Verifica se agora (UTC) está dentro da janela operacional BRT (UTC-3). */
function isWithinOperatingWindow(startBrt: string, endBrt: string): boolean {
  const now = new Date();
  // BRT = UTC-3
  const brtMs = now.getTime() - 3 * 3600 * 1000;
  const brtDate = new Date(brtMs);
  const hhmm = brtDate.getUTCHours() * 60 + brtDate.getUTCMinutes();

  const [sh, sm] = startBrt.split(':').map(Number);
  const [eh, em] = endBrt.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin   = eh * 60 + em;

  return hhmm >= startMin && hhmm <= endMin;
}

/** Calcula custo USD baseado no modelo e tokens. */
function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = COST_TABLE[model];
  if (!rates) return 0;
  return rates.input * inputTokens + rates.output * outputTokens;
}

/** Verifica se o corretor enviou mensagem após o início da sessão. */
async function brokerTookOver(supabase: any, lead: any, sessionStartedAt: string): Promise<boolean> {
  if (!lead.last_broker_whatsapp_at) return false;
  return new Date(lead.last_broker_whatsapp_at) > new Date(sessionStartedAt);
}

/** Escolhe o perfil de IA para o lead (tag → source → default). */
function pickProfile(
  lead: any,
  profileMap: Array<{ match_field: string; match_value: string; profile_id: string; priority: number; profile: any }>,
  defaultProfile: any
): any {
  // Ordenar por prioridade decrescente
  const sorted = [...profileMap].sort((a, b) => b.priority - a.priority);

  for (const mapping of sorted) {
    if (mapping.match_field === 'tag' && lead.tag === mapping.match_value) {
      return mapping.profile;
    }
  }
  for (const mapping of sorted) {
    if (mapping.match_field === 'source' && lead.source === mapping.match_value) {
      return mapping.profile;
    }
  }
  return defaultProfile;
}

/** Carrega histórico de mensagens da conversa do lead (últimas N). */
async function loadConversationHistory(supabase: any, leadId: string, limit = 10): Promise<any[]> {
  // Busca a conversa mais recente do lead
  const { data: conv } = await supabase
    .from('ia_conversations')
    .select('id')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conv) return [];

  const { data: messages } = await supabase
    .from('ia_messages')
    .select('direction, sender_type, message_text, created_at')
    .eq('conversation_id', conv.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (messages || []).reverse();
}

/** Monta o prompt completo para o LLM. */
function buildPrompt(systemPrompt: string, lead: any, history: any[], hoursStale: number): string {
  const historyText = history.length > 0
    ? history.map((m: any) => {
        const role = m.direction === 'incoming' ? 'LEAD' : 'IA';
        return `[${role}] ${m.message_text}`;
      }).join('\n')
    : '(sem histórico de mensagens)';

  return `${systemPrompt}

===CONTEXTO DO PRODUTO===
Empreendimento MCMV na planta. SEM fotos/vídeos disponíveis.
NUNCA mencione fotos, vídeos, tours ou conteúdo visual.
Objetivo: lead trazer documentos para análise GRATUITA de subsídio do governo OU agendar visita.

===REGRAS===
- Português do Brasil, tom casual e caloroso
- Máximo 3 frases por mensagem
- 1 pergunta por mensagem, nunca 2
- Baseie-se no histórico para NÃO repetir perguntas já feitas
- Se lead disser que não tem interesse, agradeça e encerre

===LEAD===
Nome: ${lead.name} | Tag: ${lead.tag || 'N/A'} | ${Math.floor(hoursStale)}h sem resposta

===HISTÓRICO (últimas 10 mensagens)===
${historyText}

===INSTRUÇÃO===
Escreva UMA mensagem WhatsApp para reengajar este lead.
Guie em direção à análise gratuita de subsídio ou agendamento de visita.
Responda APENAS com o texto da mensagem, sem prefixos, sem aspas.`;
}

/** Atualiza last_interaction_at e last_broker_whatsapp_at do lead. */
async function updateLeadInteraction(supabase: any, leadId: string) {
  const ts = new Date().toISOString();
  await supabase
    .from('leads')
    .update({ last_interaction_at: ts, last_broker_whatsapp_at: ts })
    .eq('id', leadId);
}

// ── Handler principal ─────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  );

  try {
    // a. Carregar configuração
    const { data: config } = await supabase
      .from('ai_sentinela_config')
      .select('*, default_profile:ai_profiles!default_profile_id(*)')
      .maybeSingle();

    if (!config || !config.is_enabled) {
      return new Response(
        JSON.stringify({ skipped: 'disabled', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // b. Verificar orçamento mensal
    if (config.monthly_spent_usd >= config.monthly_budget_usd) {
      console.log('[ai-sentinela] Orçamento mensal esgotado');
      return new Response(
        JSON.stringify({ skipped: 'budget_exhausted', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // c. Verificar janela de horário
    if (!isWithinOperatingWindow(config.window_start_brt, config.window_end_brt)) {
      console.log('[ai-sentinela] Fora da janela operacional');
      return new Response(
        JSON.stringify({ skipped: 'outside_window', processed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar chave da API
    if (config.provider === 'anthropic' && !ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
    if (config.provider === 'openai'    && !OPENAI_API_KEY)    throw new Error('OPENAI_API_KEY não configurada');
    if (config.provider === 'gemini'    && !GEMINI_API_KEY)    throw new Error('GEMINI_API_KEY não configurada');

    // d. Carregar mapeamentos perfil
    const { data: profileMapRaw } = await supabase
      .from('ai_sentinela_profile_map')
      .select('*, profile:ai_profiles!profile_id(*)')
      .order('priority', { ascending: false });

    const profileMap = profileMapRaw || [];
    const defaultProfile = config.default_profile;

    // e. Buscar leads parados (stale_threshold_h horas+)
    const thresholdAgo = new Date(Date.now() - config.stale_threshold_h * 3600000).toISOString();
    const nowMs = Date.now();

    const { data: staleWithInteraction } = await supabase
      .from('leads')
      .select('id, name, phone, status, tag, source, broker_id, last_interaction_at, last_broker_whatsapp_at, broker:profiles(first_name, bot_instance_id)')
      .in('status', ['NEW', 'IN_PROGRESS', 'DOCS_REQUESTED'])
      .lt('last_interaction_at', thresholdAgo)
      .not('broker_id', 'is', null)
      .limit(20);

    const { data: staleWithoutInteraction } = await supabase
      .from('leads')
      .select('id, name, phone, status, tag, source, broker_id, last_interaction_at, created_at, last_broker_whatsapp_at, broker:profiles(first_name, bot_instance_id)')
      .in('status', ['NEW', 'IN_PROGRESS', 'DOCS_REQUESTED'])
      .is('last_interaction_at', null)
      .lt('created_at', thresholdAgo)
      .not('broker_id', 'is', null)
      .limit(10);

    // Deduplicar
    const seenIds = new Set<string>();
    const staleLeads = [
      ...(staleWithInteraction || []),
      ...(staleWithoutInteraction || []),
    ].filter(l => {
      if (seenIds.has(l.id)) return false;
      seenIds.add(l.id);
      return true;
    });

    console.log(`[ai-sentinela] ${staleLeads.length} leads parados encontrados`);

    let processed = 0;
    const errors: string[] = [];

    for (const lead of staleLeads) {
      try {
        const broker = (lead as any).broker;
        if (!broker?.bot_instance_id || !lead.phone) continue;

        // Verificar orçamento restante antes de cada lead
        const remainingBudget = config.monthly_budget_usd - config.monthly_spent_usd;
        if (remainingBudget <= 0) {
          console.log('[ai-sentinela] Orçamento esgotado durante processamento');
          break;
        }

        // Buscar ou criar sessão
        const { data: existingSession } = await supabase
          .from('ai_sentinela_sessions')
          .select('*')
          .eq('lead_id', lead.id)
          .in('status', ['active', 'paused'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        let session = existingSession;

        if (!session) {
          // Criar nova sessão
          const { data: newSession } = await supabase
            .from('ai_sentinela_sessions')
            .insert({
              lead_id: lead.id,
              status: 'active',
              messages_sent: 0,
              max_messages: config.max_messages_session,
            })
            .select()
            .single();
          session = newSession;
        }

        if (!session || session.status !== 'active') continue;

        // Verificar se corretor assumiu a conversa
        const tookOver = await brokerTookOver(supabase, lead, session.started_at);
        if (tookOver) {
          await supabase.from('ai_sentinela_sessions').update({
            status: 'broker_takeover',
            ended_at: new Date().toISOString(),
            end_reason: 'broker_takeover',
          }).eq('id', session.id);
          continue;
        }

        // Verificar limite de mensagens da sessão
        if (session.messages_sent >= session.max_messages) {
          await supabase.from('ai_sentinela_sessions').update({
            status: 'completed',
            ended_at: new Date().toISOString(),
            end_reason: 'max_messages_reached',
          }).eq('id', session.id);
          continue;
        }

        // Escolher perfil
        const profile = pickProfile(lead, profileMap, defaultProfile);
        if (!profile) {
          console.warn(`[ai-sentinela] Nenhum perfil disponível para lead ${lead.id}`);
          continue;
        }

        // Atualizar session com profile
        if (!session.profile_id) {
          await supabase.from('ai_sentinela_sessions').update({ profile_id: profile.id }).eq('id', session.id);
        }

        // Carregar histórico de conversa
        const history = await loadConversationHistory(supabase, lead.id, 10);

        // Calcular horas parado
        const lastActivity = lead.last_interaction_at || (lead as any).created_at;
        const hoursStale = (nowMs - new Date(lastActivity).getTime()) / 3600000;

        // Montar prompt
        const prompt = buildPrompt(profile.system_prompt, lead, history, hoursStale);

        // Chamar LLM
        let llmResult: { text: string; inputTokens: number; outputTokens: number };
        if (config.provider === 'gemini') {
          llmResult = await callGeminiAPI(prompt, config.model_name, config.max_tokens);
        } else if (config.provider === 'anthropic') {
          llmResult = await callAnthropicAPI(prompt, config.model_name, config.max_tokens);
        } else {
          llmResult = await callOpenAIAPI(prompt, config.model_name, config.max_tokens);
        }

        const messageText = llmResult.text.trim();
        if (!messageText) {
          console.warn(`[ai-sentinela] LLM retornou texto vazio para lead ${lead.id}`);
          continue;
        }

        console.log(`[ai-sentinela] Lead ${lead.id} (${lead.name}) — mensagem gerada: ${messageText.substring(0, 80)}...`);

        // Enviar via WhatsApp
        const { data: sendResult } = await supabase.functions.invoke('send_whatsapp_message', {
          body: {
            botId: broker.bot_instance_id,
            phone: lead.phone,
            message: messageText,
          },
        });

        if (!sendResult?.success) {
          console.warn(`[ai-sentinela] Falha ao enviar para ${lead.id}`);
          continue;
        }

        // Log de automação
        await supabase.from('automation_logs').insert({
          entity_type: 'sentinela',
          entity_id: lead.id,
          status: 'success',
          message_sent: messageText,
          recipient_phone: lead.phone,
        }).catch(() => {});

        // Calcular custo
        const costUsd = estimateCost(config.model_name, llmResult.inputTokens, llmResult.outputTokens);

        // Buscar ou criar conversa para registrar mensagem
        let { data: conv } = await supabase
          .from('ia_conversations')
          .select('id')
          .eq('lead_id', lead.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!conv) {
          const { data: newConv } = await supabase
            .from('ia_conversations')
            .insert({
              lead_id: lead.id,
              lead_name: lead.name,
              lead_phone: lead.phone,
              status: 'active',
              sentiment: 'unknown',
            })
            .select('id')
            .single();
          conv = newConv;
        }

        // Registrar mensagem enviada
        if (conv) {
          await supabase.from('ia_messages').insert({
            conversation_id: conv.id,
            message_text: messageText,
            direction: 'outgoing',
            sender_type: 'ia',
            created_at: new Date().toISOString(),
          });
        }

        // Registrar uso/custo → trigger atualiza monthly_spent_usd
        await supabase.from('ai_sentinela_usage').insert({
          session_id:    session.id,
          lead_id:       lead.id,
          provider:      config.provider,
          model_name:    config.model_name,
          input_tokens:  llmResult.inputTokens,
          output_tokens: llmResult.outputTokens,
          cost_usd:      costUsd,
        });

        // Atualizar sessão
        await supabase.from('ai_sentinela_sessions').update({
          messages_sent:   session.messages_sent + 1,
          last_message_at: new Date().toISOString(),
          profile_id:      profile.id,
        }).eq('id', session.id);

        // Resetar contador de interação do lead
        await updateLeadInteraction(supabase, lead.id);

        // Recarregar config para orçamento atualizado
        const { data: updatedConfig } = await supabase
          .from('ai_sentinela_config')
          .select('monthly_spent_usd')
          .maybeSingle();
        if (updatedConfig) config.monthly_spent_usd = updatedConfig.monthly_spent_usd;

        processed++;
        console.log(`[ai-sentinela] ✅ Lead ${lead.id} processado (custo: $${costUsd.toFixed(6)})`);

      } catch (leadErr: any) {
        const msg = `lead ${lead.id}: ${leadErr.message}`;
        console.error(`[ai-sentinela] Erro no ${msg}`);
        errors.push(msg);
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return new Response(
      JSON.stringify({ success: true, processed }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('[ai-sentinela] erro fatal:', err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
