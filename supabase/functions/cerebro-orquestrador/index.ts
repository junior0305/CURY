import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TERMINAL = ['CONCLUDED', 'ABANDONED', 'EXCLUDED'];
// Leads com visita, documentação em andamento ou negociação ativa: não perturbar
const DO_NOT_DISTURB = [...TERMINAL, 'VISIT_SCHEDULED', 'DOCS_REQUESTED'];

// ── BRT helpers (UTC-3) ────────────────────────────────────────────────────
function getBRTHour(): number {
  return (new Date().getUTCHours() - 3 + 24) % 24;
}

function isWithinWindow(): boolean {
  const now = new Date();
  const brtH = (now.getUTCHours() - 3 + 24) % 24;
  const brtM = now.getUTCMinutes();
  const brtTotal = brtH * 60 + brtM;
  return brtTotal >= 7 * 60 && brtTotal <= 21 * 60 + 30;
}

function nextWindowOpen(): string {
  const now = new Date();
  const brtH = (now.getUTCHours() - 3 + 24) % 24;
  const brtM = now.getUTCMinutes();
  const brtTotal = brtH * 60 + brtM;
  const next = new Date(now);
  if (brtTotal > 21 * 60 + 30) next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(10, 0, 0, 0); // 07:00 BRT = 10:00 UTC
  return next.toISOString();
}

// ── WhatsApp helper ────────────────────────────────────────────────────────
async function sendMsg(supabase: any, botId: string, phone: string, message: string, send_source: string = 'ai_followup'): Promise<boolean> {
  try {
    const { data } = await supabase.functions.invoke('send_whatsapp_message', {
      body: { botId, phone, message, send_source },
    });
    return data?.success === true;
  } catch {
    return false;
  }
}

// ── Gemini Flash helper ────────────────────────────────────────────────────
async function callGemini(apiKey: string, system: string, user: string): Promise<string | null> {
  try {
    const oaKey = Deno.env.get('OPENAI_API_KEY') || '';
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${oaKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        max_tokens: 400, temperature: 0.7,
      }),
    });
    const json = await resp.json();
    return json.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

function interpolate(template: string, name: string, broker: string): string {
  return template
    .replace(/\{nome\}/gi, name?.split(' ')[0] || 'você')
    .replace(/\{broker\}/gi, broker || 'nossa equipe');
}

// ── Análise de conversa por IA ─────────────────────────────────────────────
// Retorna decisão: 'ok' | 'nao_perturbar' | 'agendado_N' | 'negociando' | 'docs_enviados'
// 'agendado_N' = pausar N horas (ex: 'agendado_48')
// suggested_status: pipeline status a atualizar se avanço detectado
async function analyzeConversation(
  supabase: any,
  leadId: string,
  geminiKey: string
): Promise<{ decision: string; reason: string; suggested_status?: string | null } | null> {
  if (!geminiKey) return null;

  // Busca conversa mais recente do lead
  const { data: conv } = await supabase
    .from('ia_conversations')
    .select('id')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conv?.id) return null;

  // Busca últimas 12 mensagens
  const { data: msgs } = await supabase
    .from('ia_messages')
    .select('direction, sender_type, message_text, created_at')
    .eq('conversation_id', conv.id)
    .order('created_at', { ascending: false })
    .limit(12);

  if (!msgs?.length) return null;

  const history = [...msgs].reverse()
    .map((m: any) => {
      const role = m.direction === 'incoming' ? 'LEAD' : 'CORRETOR/BOT';
      return `[${role}] ${m.message_text}`;
    })
    .join('\n');

  const system = `Você analisa conversas de WhatsApp entre corretores de imóveis e leads.
Sua tarefa: (1) decidir se o sistema de automação deve enviar mensagem agora, e (2) identificar avanço no pipeline.

Responda APENAS em JSON válido, sem markdown:
{
  "decision": "ok" | "nao_perturbar" | "agendado_48" | "agendado_72" | "negociando" | "docs_enviados",
  "suggested_status": "VISIT_SCHEDULED" | "DOCS_REQUESTED" | "IN_PROGRESS" | null,
  "reason": "motivo curto em português"
}

Regras para decision (prioridade decrescente — aplique a primeira que se encaixar):
- "nao_perturbar": lead pediu para parar, ficou irritado, disse não tem interesse, "não quero mais", "me tira da lista", "para de me mandar mensagem", "não tenho interesse", "desiste"
- "agendado_48": lead confirmou visita, reunião, ligação ou encontro combinado para os próximos 2 dias — frases como "vou lá amanhã", "pode me esperar", "confirmo para segunda", "vou sim", "apareço sábado", "a que horas é?", "ok combinado", "até lá", "a visita está confirmada"
- "agendado_72": visita ou compromisso combinado em 3+ dias — "semana que vem", "na próxima quinta", "no fim de semana"
- "negociando": corretor e lead trocando mensagens ativas sobre proposta, valores, condições, subsídio — não enviar automação enquanto negociação está viva
- "docs_enviados": lead disse que já enviou ou vai enviar documentos agora
- "ok": conversa inativa ou sem compromissos — pode enviar automação

Regras para suggested_status (só quando há evidência CLARA no texto):
- "VISIT_SCHEDULED": lead confirmou presença em visita ou tour — expressões como "vou sim", "apareço lá", "confirmado", "ok, estarei lá", "sábado eu vou", "pode me esperar", "a que horas é a visita"
- "DOCS_REQUESTED": lead enviou ou confirmou envio de documentos (RG, CPF, comprovante de renda, holerite)
- "IN_PROGRESS": conversa ativa e positiva sem evento específico de avanço de pipeline
- null: sem evidência clara de avanço

IMPORTANTE: Priorize SEMPRE proteger o lead que já agendou visita. Em caso de dúvida entre "ok" e "agendado_*", escolha "agendado_48".`;

  const result = await callGemini(geminiKey, system, `Histórico da conversa:\n${history}`);
  if (!result) return null;

  try {
    const parsed = JSON.parse(result.replace(/```json|```/g, '').trim());
    return {
      decision: parsed.decision || 'ok',
      reason: parsed.reason || '',
      suggested_status: parsed.suggested_status || null,
    };
  } catch {
    return null;
  }
}

// ── Lead State helpers ─────────────────────────────────────────────────────

interface LeadState {
  intencao:      string;
  tema:          string;
  momento:       string;
  ultimo_evento: string;
  modo:          string;
  proxima_acao:  string;
  bloqueado:     boolean;
}

async function getLeadState(supabase: any, leadId: string): Promise<LeadState | null> {
  const { data } = await supabase
    .from('lead_state')
    .select('intencao,tema,momento,ultimo_evento,modo,proxima_acao,bloqueado')
    .eq('lead_id', leadId)
    .maybeSingle();
  return data || null;
}

async function setLeadState(
  supabase: any,
  leadId: string,
  patch: Partial<LeadState> & { atualizado_por?: string }
): Promise<void> {
  try {
    await supabase.rpc('upsert_lead_state', {
      p_lead_id:       leadId,
      p_intencao:      patch.intencao      ?? null,
      p_tema:          patch.tema          ?? null,
      p_momento:       patch.momento       ?? null,
      p_ultimo_evento: patch.ultimo_evento ?? null,
      p_modo:          patch.modo          ?? null,
      p_proxima_acao:  patch.proxima_acao  ?? null,
      p_bloqueado:     patch.bloqueado     ?? null,
      p_atualizado_por: patch.atualizado_por ?? 'cerebro',
    });
  } catch (e: any) {
    console.warn('[cerebro] setLeadState error:', e.message);
  }
}

// Classifica intenção com base no evento e estado atual
function deriveNextState(
  actionType: string,
  currentState: LeadState | null,
  hadLeadResponse: boolean
): Partial<LeadState> {
  const current = currentState ?? { intencao: 'sem_info', tema: 'sem_info', momento: 'explorando' } as LeadState;

  switch (actionType) {
    case 'toque_1':
      return {
        ultimo_evento: 'toque_1_enviado',
        proxima_acao:  'aguardar',
        modo:          current.modo === 'humano_ativo' ? 'humano_ativo' : 'automatico',
      };
    case 'toque_2':
      return {
        ultimo_evento: 'toque_2_enviado',
        proxima_acao:  hadLeadResponse ? 'aguardar' : 'alertar_gerente',
      };
    case 'sentinela':
      return {
        ultimo_evento: 'sentinela_enviado',
        momento:       'sumiu',
        proxima_acao:  'aguardar',
      };
    case 'last_chance':
      return {
        ultimo_evento: 'ultima_tentativa_enviada',
        proxima_acao:  'encerrar',
        momento:       'sumiu',
      };
    case 'auto_resposta':
      return {
        ultimo_evento: 'auto_resposta_enviada',
        proxima_acao:  'aguardar',
      };
    case 'broker_warmup':
      return {
        ultimo_evento: 'warmup_enviado',
        proxima_acao:  'aguardar',
      };
    case 'docs_reminder':
      return {
        ultimo_evento: 'docs_reminder_enviado',
        proxima_acao:  'aguardar',
      };
    case 'broker_alert':
      return {
        ultimo_evento: 'corretor_alertado',
        proxima_acao:  'aguardar',
      };
    case 'manager_alert':
      return {
        ultimo_evento: 'gerente_alertado',
        proxima_acao:  'aguardar',
      };
    case 'sla_first_contact':
      return {
        ultimo_evento: 'sla_alerta_enviado',
        proxima_acao:  'aguardar',
      };
    default:
      return { ultimo_evento: actionType };
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const startTime = Date.now();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  );
  const now = new Date().toISOString();

  try {
    // ── 1. Check cerebro_enabled ───────────────────────────────────────────
    const { data: cfg } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'cerebro_enabled')
      .maybeSingle();

    if (cfg?.value !== true && cfg?.value !== 'true') {
      return new Response(JSON.stringify({ skipped: 'cerebro_disabled' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const withinWindow = isWithinWindow();
    const brtHour = getBRTHour();

    // ── 2. Auto-queue: leads parados sem item pendente na fila ────────────
    const twentyFourAgo = new Date(Date.now() - 24 * 3600000).toISOString();
    const fortyEightAgo = new Date(Date.now() - 48 * 3600000).toISOString();

    const { data: staleLeadsForQueue } = await supabase
      .from('leads')
      .select('id, last_lead_response_at, last_broker_whatsapp_at')
      .in('status', ['NEW', 'IN_PROGRESS'])
      .not('broker_id', 'is', null)
      .eq('pause_auto_messages', false)
      .or(`last_interaction_at.lt.${twentyFourAgo},and(last_interaction_at.is.null,created_at.lt.${twentyFourAgo})`)
      .limit(60);

    for (const sl of staleLeadsForQueue || []) {
      // Não enfileirar se o cliente respondeu DEPOIS da última mensagem do corretor
      // (cliente está aguardando o corretor — não enviar automação)
      const clientWaitingBroker = sl.last_lead_response_at && (
        !sl.last_broker_whatsapp_at ||
        new Date(sl.last_lead_response_at) > new Date(sl.last_broker_whatsapp_at)
      );
      if (clientWaitingBroker) continue;

      const { data: existing } = await supabase
        .from('lead_activation_queue')
        .select('id, status, attempts, last_attempt_at')
        .eq('lead_id', sl.id)
        .in('status', ['pending', 'processing', 'sent', 'failed'])
        .order('last_attempt_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Não re-enfileirar se já tem item ativo ou foi enviado nas últimas 24h
      const hasActive = existing && ['pending', 'processing'].includes(existing.status);
      const sentRecently = existing?.status === 'sent' && existing?.last_attempt_at &&
        new Date(existing.last_attempt_at).getTime() > Date.now() - 24 * 3600000;
      const failedExhausted = existing?.status === 'failed' && (existing.attempts || 0) >= 5;
      const shouldQueue = !hasActive && !sentRecently && (!existing || failedExhausted);

      if (shouldQueue) {
        await supabase.from('lead_activation_queue').insert({
          lead_id: sl.id,
          action_type: 'toque_1',
          scheduled_for: now,
          status: 'pending',
        });
      }
    }

    const { data: docsLeads } = await supabase
      .from('leads')
      .select('id')
      .eq('status', 'DOCS_REQUESTED')
      .lt('last_interaction_at', fortyEightAgo)
      .limit(20);

    for (const dl of docsLeads || []) {
      const { data: existingDocs } = await supabase
        .from('lead_activation_queue')
        .select('id, status, attempts, last_attempt_at')
        .eq('lead_id', dl.id)
        .eq('action_type', 'docs_reminder')
        .in('status', ['pending', 'processing', 'sent', 'failed'])
        .order('last_attempt_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const hasActiveDocs = existingDocs && ['pending', 'processing'].includes(existingDocs.status);
      const docsSentRecently = existingDocs?.status === 'sent' && existingDocs?.last_attempt_at &&
        new Date(existingDocs.last_attempt_at).getTime() > Date.now() - 48 * 3600000;
      const docsFailedExhausted = existingDocs?.status === 'failed' && (existingDocs.attempts || 0) >= 5;
      const shouldQueueDocs = !hasActiveDocs && !docsSentRecently && (!existingDocs || docsFailedExhausted);
      if (shouldQueueDocs) {
        await supabase.from('lead_activation_queue').insert({
          lead_id: dl.id,
          action_type: 'docs_reminder',
          scheduled_for: now,
          status: 'pending',
        });
      }
    }

    // ── 2b. SLA: leads com broker atribuído mas sem 1º contato (15-90 min) ──
    if (withinWindow) {
      const fifteenMinAgo = new Date(Date.now() - 15 * 60000).toISOString();
      const ninetyMinAgo  = new Date(Date.now() - 90 * 60000).toISOString();
      const { data: slaLeads } = await supabase
        .from('leads')
        .select('id')
        .in('status', ['NEW', 'IN_PROGRESS'])
        .not('broker_id', 'is', null)
        .is('last_broker_whatsapp_at', null)
        .lte('created_at', fifteenMinAgo)
        .gte('created_at', ninetyMinAgo)
        .limit(30);

      for (const sla of slaLeads || []) {
        const { data: existingSla } = await supabase
          .from('lead_activation_queue')
          .select('id')
          .eq('lead_id', sla.id)
          .eq('action_type', 'sla_first_contact')
          .in('status', ['pending', 'sent'])
          .limit(1).maybeSingle();
        if (!existingSla) {
          await supabase.from('lead_activation_queue').insert({
            lead_id: sla.id,
            action_type: 'sla_first_contact',
            scheduled_for: now,
            status: 'pending',
          });
        }
      }
    }

    // ── 3. Fetch pending queue items ───────────────────────────────────────
    // Recover stuck 'processing' items (> 10 min sem atualização) back to pending
    await supabase.from('lead_activation_queue')
      .update({ status: 'pending' })
      .eq('status', 'processing')
      .lt('last_attempt_at', new Date(Date.now() - 10 * 60000).toISOString());

    const { data: items } = await supabase
      .from('lead_activation_queue')
      .select('id, lead_id, action_type, scheduled_for, metadata, attempts')
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .order('scheduled_for', { ascending: true })
      .limit(60);

    const { data: welcomeTemplates } = await supabase
      .from('welcome_templates').select('message').eq('is_active', true);
    const { data: cadenceTemplates } = await supabase
      .from('cadence_templates').select('cadence_steps(content, media_type)').eq('is_active', true);
    const cadenceSteps = (cadenceTemplates || [])
      .flatMap((c: any) => (c.cadence_steps || []).filter((s: any) => s.media_type === 'text' && s.content));
    const welcomeTpls = welcomeTemplates || [];
    const geminiKey = Deno.env.get('GEMINI_API_KEY') || '';

    let processed = 0, rescheduled = 0, cancelled = 0, skipped = 0;
    const details: any[] = [];
    // Rastreia leads já tocados neste run para evitar envio duplo quando
    // duas instâncias concorrentes processam itens diferentes do mesmo lead
    const touchedLeadIds = new Set<string>();

    for (const item of items || []) {
      try {
        // ── Claim atômico: evita processamento duplicado em execuções concorrentes ──
        const { data: claimed } = await supabase
          .from('lead_activation_queue')
          .update({ status: 'processing', last_attempt_at: new Date().toISOString() })
          .eq('id', item.id)
          .eq('status', 'pending')
          .select('id')
          .maybeSingle();
        if (!claimed) { skipped++; continue; } // já foi reclamado por outra execução

        // ── Evita 2 mensagens outbound para o mesmo lead no mesmo run ──────────
        const isOutboundCheck = !['broker_alert', 'manager_alert', 'sla_first_contact'].includes(item.action_type);
        if (isOutboundCheck && touchedLeadIds.has(item.lead_id)) {
          // Libera o item para o próximo ciclo
          await supabase.from('lead_activation_queue')
            .update({ status: 'pending', last_attempt_at: null })
            .eq('id', item.id);
          skipped++;
          continue;
        }

        // Load lead
        const { data: lead } = await supabase
          .from('leads')
          .select('id, name, phone, status, tag, source, broker_id, created_at, last_lead_response_at, last_broker_whatsapp_at, broker:profiles!broker_id(automation_settings)')
          .eq('id', item.lead_id)
          .maybeSingle();

        if (!lead) {
          await supabase.from('lead_activation_queue')
            .update({ status: 'cancelled', cancel_reason: 'lead_not_found' })
            .eq('id', item.id);
          cancelled++;
          continue;
        }

        const leadStatusUpper = (lead.status || '').toUpperCase();
        if (DO_NOT_DISTURB.includes(leadStatusUpper)) {
          // Para VISIT_SCHEDULED e DOCS_REQUESTED: cancela TODOS os itens outbound pendentes
          if (leadStatusUpper === 'VISIT_SCHEDULED' || leadStatusUpper === 'DOCS_REQUESTED') {
            const cancelReason = leadStatusUpper === 'VISIT_SCHEDULED' ? 'visit_scheduled' : 'docs_requested';
            await supabase.from('lead_activation_queue')
              .update({ status: 'cancelled', cancel_reason: cancelReason })
              .eq('lead_id', lead.id)
              .in('action_type', ['toque_1','toque_2','sentinela','last_chance','broker_warmup','auto_resposta']);
            console.log(`[cerebro] 📄 Fila limpa para ${lead.name} — status ${leadStatusUpper}`);
          } else {
            await supabase.from('lead_activation_queue')
              .update({ status: 'cancelled', cancel_reason: `lead_${lead.status}` })
              .eq('id', item.id);
          }
          await setLeadState(supabase, lead.id, {
            ultimo_evento: `lead_${lead.status.toLowerCase()}`,
            proxima_acao:  leadStatusUpper === 'VISIT_SCHEDULED' ? 'aguardar_visita' : 'encerrar',
            atualizado_por: 'cerebro',
          });
          cancelled++;
          continue;
        }

        // ── LEITURA DO ESTADO ──────────────────────────────────────────────
        const leadState = await getLeadState(supabase, lead.id);

        // Se modo=humano_ativo ou bloqueado=true: pula ações outbound ao lead
        const outboundToLead = ['toque_1','toque_2','sentinela','last_chance','broker_warmup','docs_reminder','auto_resposta'];
        if (outboundToLead.includes(item.action_type)) {
          // Respeita config do corretor: IA conversa sozinha é OFF por padrão.
          // Só roda se ai_assist_enabled === true (estrito).
          const brokerAutom = (lead as any).broker?.automation_settings;
          if (brokerAutom?.ai_assist_enabled !== true) {
            await supabase.from('lead_activation_queue')
              .update({ status: 'cancelled', cancel_reason: 'ai_assist_disabled_default_off' })
              .eq('id', item.id);
            console.log(`[cerebro] 🤖 ${item.action_type} cancelado — ai_assist OFF (default) → ${lead.name}`);
            cancelled++;
            continue;
          }

          if (leadState?.bloqueado === true || leadState?.modo === 'humano_ativo') {
            await supabase.from('lead_activation_queue')
              .update({ status: 'cancelled', cancel_reason: 'human_mode_active' })
              .eq('id', item.id);
            console.log(`[cerebro] ⏸ ${item.action_type} bloqueado (modo humano) → ${lead.name}`);
            cancelled++;
            continue;
          }

          // ── CAMADA 1: Estado avançado do lead_state (tema/momento/intencao) ──
          // Nunca disparar quando lead está em fase de visita ou documentação
          if (leadState?.tema === 'visita' || leadState?.tema === 'documentacao') {
            await supabase.from('lead_activation_queue')
              .update({ status: 'cancelled', cancel_reason: 'active_tema_visit_or_docs' })
              .eq('id', item.id);
            console.log(`[cerebro] 🏠 ${item.action_type} cancelado — tema=${leadState?.tema} (fase avançada) → ${lead.name}`);
            cancelled++;
            continue;
          }

          // Nunca disparar quando lead já decidiu comprar
          if (leadState?.momento === 'decidido') {
            await supabase.from('lead_activation_queue')
              .update({ status: 'cancelled', cancel_reason: 'lead_decided' })
              .eq('id', item.id);
            console.log(`[cerebro] ✅ ${item.action_type} cancelado — momento=decidido → ${lead.name}`);
            cancelled++;
            continue;
          }

          // Silêncio de 24h quando lead está quente (não perturbar conversa ativa)
          if (leadState?.intencao === 'quente') {
            const lastOutboundMs = lead.last_broker_whatsapp_at
              ? new Date(lead.last_broker_whatsapp_at).getTime()
              : 0;
            if (lastOutboundMs > 0 && Date.now() - lastOutboundMs < 24 * 3600000) {
              const resumeAt = new Date(lastOutboundMs + 24 * 3600000).toISOString();
              await supabase.from('lead_activation_queue')
                .update({ status: 'pending', scheduled_for: resumeAt })
                .eq('id', item.id);
              console.log(`[cerebro] 🔥 ${item.action_type} adiado — lead quente, silêncio 24h → ${lead.name}`);
              rescheduled++;
              continue;
            }
          }

          // ── CAMADA 2: Janelas de silêncio recente ───────────────────────
          // Corretor falou há menos de 6h → não perturbar conversa ativa
          if (lead.last_broker_whatsapp_at) {
            const brokerSentMs = new Date(lead.last_broker_whatsapp_at).getTime();
            if (Date.now() - brokerSentMs < 6 * 3600000) {
              const resumeAt = new Date(brokerSentMs + 6 * 3600000).toISOString();
              await supabase.from('lead_activation_queue')
                .update({ status: 'pending', scheduled_for: resumeAt })
                .eq('id', item.id);
              console.log(`[cerebro] ⏱ ${item.action_type} adiado — corretor falou há <6h → ${lead.name}`);
              rescheduled++;
              continue;
            }
          }

          // Lead respondeu há menos de 2h → aguardar andamento da conversa
          if (lead.last_lead_response_at) {
            const leadRepliedMs = new Date(lead.last_lead_response_at).getTime();
            if (Date.now() - leadRepliedMs < 2 * 3600000) {
              const resumeAt = new Date(leadRepliedMs + 2 * 3600000).toISOString();
              await supabase.from('lead_activation_queue')
                .update({ status: 'pending', scheduled_for: resumeAt })
                .eq('id', item.id);
              console.log(`[cerebro] 💬 ${item.action_type} adiado — lead respondeu há <2h → ${lead.name}`);
              rescheduled++;
              continue;
            }
          }

          // IA enviou mensagem há menos de 1h → aguardar resposta do lead
          {
            const { data: latestConv } = await supabase
              .from('ia_conversations')
              .select('id')
              .eq('lead_id', lead.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (latestConv?.id) {
              const { data: recentIaMsg } = await supabase
                .from('ia_messages')
                .select('created_at')
                .eq('conversation_id', latestConv.id)
                .eq('direction', 'outgoing')
                .gt('created_at', new Date(Date.now() - 3600000).toISOString())
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (recentIaMsg) {
                const resumeAt = new Date(new Date(recentIaMsg.created_at).getTime() + 3600000).toISOString();
                await supabase.from('lead_activation_queue')
                  .update({ status: 'pending', scheduled_for: resumeAt })
                  .eq('id', item.id);
                console.log(`[cerebro] 🤖 ${item.action_type} adiado — IA enviou msg há <1h → ${lead.name}`);
                rescheduled++;
                continue;
              }
            }
          }

          // ── PROTEÇÃO ANTI-SPAM: não disparar se o cliente já respondeu e está
          //    aguardando o corretor (last_lead_response_at > last_broker_whatsapp_at)
          const clientWaitingBroker = lead.last_lead_response_at && (
            !lead.last_broker_whatsapp_at ||
            new Date(lead.last_lead_response_at) > new Date(lead.last_broker_whatsapp_at)
          );
          if (clientWaitingBroker) {
            await supabase.from('lead_activation_queue')
              .update({ status: 'cancelled', cancel_reason: 'client_already_replied_awaiting_broker' })
              .eq('id', item.id);
            console.log(`[cerebro] 🛑 ${item.action_type} cancelado — ${lead.name} já respondeu e aguarda corretor`);
            cancelled++;
            continue;
          }

          // ── ANÁLISE DE CONVERSA POR IA ────────────────────────────────────
          // Lê as últimas mensagens do WhatsApp e decide se deve enviar
          const convAnalysis = await analyzeConversation(supabase, lead.id, geminiKey);
          if (convAnalysis) {
            const { decision, reason, suggested_status } = convAnalysis;
            console.log(`[cerebro] 🧠 análise conversa ${lead.name}: ${decision} — ${reason}`);

            // ── Camada 3: Atualização automática de status do pipeline ────
            if (suggested_status) {
              const PIPELINE_ORDER = ['NEW', 'IN_PROGRESS', 'VISIT_SCHEDULED', 'DOCS_REQUESTED', 'CONCLUDED'];
              const curIdx = PIPELINE_ORDER.indexOf((lead.status || 'NEW').toUpperCase());
              const newIdx = PIPELINE_ORDER.indexOf(suggested_status);
              if (newIdx > curIdx) {
                await supabase.from('leads')
                  .update({ status: suggested_status })
                  .eq('id', lead.id);
                await supabase.from('automation_logs').insert({
                  entity_type: 'ia_status_analysis',
                  entity_id: lead.id,
                  status: 'success',
                  message_sent: `${lead.status} → ${suggested_status}: ${reason}`,
                  recipient_phone: lead.phone,
                }).catch(() => {});
                await supabase.from('lead_notes').insert({
                  lead_id: lead.id,
                  content: `🤖 Status atualizado pela IA: ${lead.status} → ${suggested_status}. Motivo: ${reason}`,
                  type: 'SYSTEM',
                }).catch(() => {});
                console.log(`[cerebro] 📊 ${lead.name}: ${lead.status} → ${suggested_status}`);

                // Se visita agendada detectada: cancelar TODA a fila outbound pendente
                if (suggested_status === 'VISIT_SCHEDULED') {
                  await supabase.from('lead_activation_queue')
                    .update({ status: 'cancelled', cancel_reason: 'visit_scheduled_detected_by_ia' })
                    .eq('lead_id', lead.id)
                    .in('action_type', ['toque_1','toque_2','sentinela','last_chance','broker_warmup','auto_resposta'])
                    .in('status', ['pending']);
                  await supabase.from('lead_notes').insert({
                    lead_id: lead.id,
                    content: `📅 Automações pausadas — visita agendada detectada pela IA na conversa.`,
                    type: 'SYSTEM',
                  }).catch(() => {});
                  console.log(`[cerebro] 📅 Fila outbound limpa para ${lead.name} — visita detectada na conversa`);
                  // Cancela o item atual e pula
                  await supabase.from('lead_activation_queue')
                    .update({ status: 'cancelled', cancel_reason: 'visit_scheduled_detected_by_ia' })
                    .eq('id', item.id);
                  cancelled++;
                  continue;
                }
              }
            }

            if (decision === 'nao_perturbar') {
              // Marca como EXCLUDED e cancela tudo
              await supabase.from('leads').update({ status: 'EXCLUDED' }).eq('id', lead.id);
              await supabase.from('lead_activation_queue')
                .update({ status: 'cancelled', cancel_reason: 'opt_out_detected_by_ia' })
                .eq('lead_id', lead.id).eq('status', 'pending');
              await supabase.from('lead_activation_queue')
                .update({ status: 'cancelled', cancel_reason: 'opt_out_detected_by_ia' })
                .eq('id', item.id);
              console.log(`[cerebro] 🚫 ${lead.name} marcado EXCLUDED por opt-out detectado pela IA`);
              cancelled++;
              continue;
            }

            if (decision === 'negociando' || decision === 'docs_enviados') {
              // Pausa 48h — corretor está ativo, não perturbar
              const pauseUntil = new Date(Date.now() + 48 * 3600000).toISOString();
              await supabase.from('lead_activation_queue')
                .update({ status: 'pending', scheduled_for: pauseUntil })
                .eq('id', item.id);
              console.log(`[cerebro] ⏸ ${item.action_type} pausado 48h (${decision}) → ${lead.name}`);
              rescheduled++;
              continue;
            }

            if (decision === 'agendado_48') {
              const pauseUntil = new Date(Date.now() + 48 * 3600000).toISOString();
              await supabase.from('lead_activation_queue')
                .update({ status: 'pending', scheduled_for: pauseUntil })
                .eq('id', item.id);
              console.log(`[cerebro] 📅 ${item.action_type} pausado 48h (compromisso agendado) → ${lead.name}`);
              rescheduled++;
              continue;
            }

            if (decision === 'agendado_72') {
              const pauseUntil = new Date(Date.now() + 72 * 3600000).toISOString();
              await supabase.from('lead_activation_queue')
                .update({ status: 'pending', scheduled_for: pauseUntil })
                .eq('id', item.id);
              console.log(`[cerebro] 📅 ${item.action_type} pausado 72h (compromisso agendado) → ${lead.name}`);
              rescheduled++;
              continue;
            }
            // decision === 'ok' → prossegue normalmente
          }
        }

        const broker = lead.broker_id ? (await supabase
          .from('profiles')
          .select('id, first_name, bot_instance_id, manager_id, phone')
          .eq('id', lead.broker_id)
          .maybeSingle()).data : null;

        // Verifica se a instância do corretor está marcada como notification_only
        // Se sim, não pode ser usada para enviar mensagens a leads
        if (broker?.bot_instance_id) {
          const { data: botInst } = await supabase
            .from('bot_instances')
            .select('notification_only')
            .eq('id', broker.bot_instance_id)
            .maybeSingle();
          if (botInst?.notification_only === true) {
            console.warn(`[cerebro] ⛔ bot ${broker.bot_instance_id} é notification_only — skipping lead ${lead.name}`);
            skipped++;
            continue;
          }
        }

        const isOutbound = !['broker_alert', 'manager_alert', 'sla_first_contact'].includes(item.action_type);

        if (isOutbound && !withinWindow) {
          await supabase.from('lead_activation_queue')
            .update({ scheduled_for: nextWindowOpen() })
            .eq('id', item.id);
          rescheduled++;
          continue;
        }

        // ── Process action ─────────────────────────────────────────────────
        let success = false;

        switch (item.action_type) {

          case 'toque_1':
          case 'toque_2': {
            if (!broker?.bot_instance_id || !lead.phone) { skipped++; break; }
            const bn = broker.first_name || 'nossa equipe';
            const hadConv = !!lead.last_lead_response_at;
            let msg: string;
            if (!hadConv && welcomeTpls.length > 0) {
              const tpl = welcomeTpls[Math.floor(Math.random() * welcomeTpls.length)];
              msg = interpolate(tpl.message, lead.name, bn);
            } else if (hadConv && cadenceSteps.length > 0) {
              const step = cadenceSteps[Math.floor(Math.random() * cadenceSteps.length)];
              msg = interpolate(step.content, lead.name, bn);
            } else {
              msg = item.action_type === 'toque_1'
                ? `Olá ${lead.name?.split(' ')[0] || 'você'}! 👋 Vi seu interesse em nosso empreendimento. Estou separando as melhores condições para você. Posso te ajudar? 😊`
                : `${lead.name?.split(' ')[0] || 'você'}! 🏠 Passando para ver se surgiu alguma dúvida. Estou aqui para ajudar!`;
            }
            success = await sendMsg(supabase, broker.bot_instance_id, lead.phone, msg);
            break;
          }

          case 'sentinela': {
            if (!broker?.bot_instance_id || !lead.phone || !geminiKey) { skipped++; break; }

            const { data: conv } = await supabase
              .from('ia_conversations')
              .select('id')
              .eq('lead_id', lead.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            let historyText = 'Sem histórico de conversa anterior.';
            if (conv?.id) {
              const { data: msgs } = await supabase
                .from('ia_messages')
                .select('direction, message_text')
                .eq('conversation_id', conv.id)
                .order('created_at', { ascending: false })
                .limit(10);
              if (msgs?.length > 0) {
                historyText = msgs.reverse()
                  .map((m: any) => `[${m.direction === 'incoming' ? 'LEAD' : 'IA'}] ${m.message_text}`)
                  .join('\n');
              }
            }

            // Usa tema do lead_state para personalizar a mensagem
            const temaContext = leadState?.tema !== 'sem_info'
              ? `O lead demonstrou interesse em: ${leadState?.tema}.`
              : '';

            const hoursStale = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 3600000);

            const aiText = await callGemini(
              geminiKey,
              `Você é um assistente de vendas de imóveis MCMV (Minha Casa Minha Vida) na planta.
NUNCA mencione fotos, vídeos ou conteúdo visual — não há disponíveis.
Objetivo: levar o lead a trazer documentos para análise GRATUITA de subsídio do governo OU agendar visita.
Português do Brasil, tom casual e caloroso. Máximo 3 frases. 1 pergunta por mensagem.
Baseie-se no histórico para NÃO repetir perguntas já feitas.`,
              `Lead: ${lead.name} | Tag: ${lead.tag || 'sem tag'} | ${hoursStale}h sem resposta
${temaContext}

HISTÓRICO:
${historyText}

Escreva UMA mensagem WhatsApp para reengajar este lead em direção à análise gratuita ou visita.
Responda APENAS com o texto da mensagem, sem prefixos, sem aspas.`
            );

            if (aiText) {
              success = await sendMsg(supabase, broker.bot_instance_id, lead.phone, aiText);
              if (success && conv?.id) {
                await supabase.from('ia_messages').insert({
                  conversation_id: conv.id,
                  message_text: aiText,
                  direction: 'outgoing',
                  sender_type: 'ia',
                  created_at: new Date().toISOString(),
                });
              }
            }
            break;
          }

          case 'last_chance': {
            if (!broker?.bot_instance_id || !lead.phone) { skipped++; break; }
            const firstName = lead.name?.split(' ')[0] || 'você';
            success = await sendMsg(
              supabase, broker.bot_instance_id, lead.phone,
              `${firstName}, esta é minha última tentativa de contato. 🙏\n\nSe tiver interesse no imóvel, me responda qualquer coisa e retomo o atendimento.\n\nSe não tiver mais interesse, tudo bem — boa sorte! 😊`
            );
            break;
          }

          case 'broker_warmup': {
            if (!broker?.bot_instance_id || !lead.phone) { skipped++; break; }
            if (lead.last_broker_whatsapp_at && lead.last_lead_response_at &&
                new Date(lead.last_broker_whatsapp_at) > new Date(lead.last_lead_response_at)) {
              await supabase.from('lead_activation_queue')
                .update({ status: 'cancelled', cancel_reason: 'broker_already_replied' })
                .eq('id', item.id);
              cancelled++;
              continue;
            }
            const firstName = lead.name?.split(' ')[0] || 'você';
            const bn = broker.first_name || 'nosso corretor';
            success = await sendMsg(
              supabase, broker.bot_instance_id, lead.phone,
              `Olá ${firstName}! 😊\n\n${bn} está verificando sua solicitação e entra em contato em breve. Agradecemos sua paciência! 🏠`
            );
            break;
          }

          case 'docs_reminder': {
            if (!broker?.bot_instance_id || !lead.phone) { skipped++; break; }
            const firstName = lead.name?.split(' ')[0] || 'você';
            success = await sendMsg(
              supabase, broker.bot_instance_id, lead.phone,
              `${firstName}, sua proposta está quase pronta! 📄\n\nSó precisamos dos seus documentos para garantir o subsídio do governo. Uma foto legível já basta!\n\nConsegue enviar hoje? 😊`
            );
            break;
          }

          case 'auto_resposta': {
            // Disparado quando lead quente respondeu mas corretor ainda não agiu
            // Só envia se corretor realmente não respondeu desde a última resposta do lead
            if (!broker?.bot_instance_id || !lead.phone) { skipped++; break; }
            if (
              lead.last_broker_whatsapp_at && lead.last_lead_response_at &&
              new Date(lead.last_broker_whatsapp_at) > new Date(lead.last_lead_response_at)
            ) {
              await supabase.from('lead_activation_queue')
                .update({ status: 'cancelled', cancel_reason: 'broker_already_replied' })
                .eq('id', item.id);
              cancelled++;
              continue;
            }

            const firstName = lead.name?.split(' ')[0] || 'você';
            const tema = leadState?.tema ?? 'sem_info';
            const temaMsg: Record<string, string> = {
              preco:        `${firstName}, entendo que o valor é uma preocupação importante. Me conta: você já tem ideia de qual parcela caberia no seu orçamento?`,
              entrada:      `${firstName}, a boa notícia é que temos opções com entrada bem facilitada. Posso te mostrar como funciona?`,
              localizacao:  `${firstName}, a localização é ótima mesmo! Quer que eu te explique como chegar ou marque uma visita rápida?`,
              documentacao: `${firstName}, a análise de documentos é gratuita e sem compromisso. Posso te ajudar a entender o que precisa?`,
              sem_info:     `${firstName}, estou aqui para tirar qualquer dúvida. O que posso esclarecer para você? 😊`,
            };
            const autoMsg = temaMsg[tema] ?? temaMsg['sem_info'];
            success = await sendMsg(supabase, broker.bot_instance_id, lead.phone, autoMsg);
            if (success) {
              console.log(`[cerebro] 🤖 auto_resposta (tema=${tema}) → ${lead.name}`);
            }
            break;
          }

          case 'broker_alert': {
            if (!lead.broker_id) { skipped++; break; }
            if (lead.last_broker_whatsapp_at && lead.last_lead_response_at &&
                new Date(lead.last_broker_whatsapp_at) > new Date(lead.last_lead_response_at)) {
              await supabase.from('lead_activation_queue')
                .update({ status: 'cancelled', cancel_reason: 'broker_already_replied' })
                .eq('id', item.id);
              cancelled++;
              continue;
            }
            await supabase.from('internal_notifications').insert({
              to_id: lead.broker_id,
              type: 'CEREBRO_BROKER_ALERT',
              message: `⚡ ${lead.name} respondeu sua mensagem há mais de 2h e está aguardando. Atenda agora!`,
            });
            success = true;
            break;
          }

          case 'sla_first_contact': {
            if (!lead.broker_id) { skipped++; break; }
            // Se broker já contatou, cancela
            if (lead.last_broker_whatsapp_at) {
              await supabase.from('lead_activation_queue')
                .update({ status: 'cancelled', cancel_reason: 'broker_already_contacted' })
                .eq('id', item.id);
              cancelled++;
              continue;
            }
            const minutesWaiting = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 60000);
            const brokerName = broker?.first_name || 'Corretor';
            // Alerta para o corretor
            await supabase.from('internal_notifications').insert({
              to_id: lead.broker_id,
              type: 'SLA_BREACH',
              message: `⚡ SLA: ${lead.name} aguarda seu 1º contato há ${minutesWaiting} min! Contate agora.`,
            });
            // Alerta para o gerente (se tiver)
            if (broker?.manager_id) {
              await supabase.from('internal_notifications').insert({
                to_id: broker.manager_id,
                type: 'SLA_BREACH',
                message: `⏱️ SLA breach: ${lead.name} aguarda contato há ${minutesWaiting} min. Corretor: ${brokerName}.`,
              });
            }
            success = true;
            break;
          }

          case 'manager_alert': {
            if (!broker?.manager_id) { skipped++; break; }
            if (lead.last_broker_whatsapp_at && lead.last_lead_response_at &&
                new Date(lead.last_broker_whatsapp_at) > new Date(lead.last_lead_response_at)) {
              await supabase.from('lead_activation_queue')
                .update({ status: 'cancelled', cancel_reason: 'broker_already_replied' })
                .eq('id', item.id);
              cancelled++;
              continue;
            }
            await supabase.from('internal_notifications').insert({
              to_id: broker.manager_id,
              type: 'CEREBRO_MANAGER_ALERT',
              message: `🚨 ${lead.name} está há mais de 4h sem resposta do corretor ${broker.first_name || ''}. Intervenha!`,
            });
            success = true;
            break;
          }
        }

        // ── Atualiza fila ──────────────────────────────────────────────────
        if (success) {
          await supabase.from('lead_activation_queue').update({
            status: 'sent',
            last_attempt_at: new Date().toISOString(),
            attempts: (item.attempts || 0) + 1,
          }).eq('id', item.id);

          if (outboundToLead.includes(item.action_type)) {
            const ts = new Date().toISOString();
            await supabase.from('leads').update({
              last_interaction_at: ts,
              last_broker_whatsapp_at: ts,
            }).eq('id', lead.id);
          }

          // ── ATUALIZA ESTADO DO LEAD ──────────────────────────────────────
          const nextState = deriveNextState(
            item.action_type,
            leadState,
            !!lead.last_lead_response_at
          );
          await setLeadState(supabase, lead.id, {
            ...nextState,
            atualizado_por: 'cerebro',
          });

          try { await supabase.from('cerebro_learning').insert({
            lead_id: lead.id,
            action_type: item.action_type,
            lead_source: lead.source,
            lead_tag: lead.tag,
            sent_hour_brt: brtHour,
            responded: false,
          }); } catch {}

          processed++;
          if (isOutbound) touchedLeadIds.add(lead.id);
          details.push({ action: item.action_type, lead: lead.name, status: 'sent' });
          console.log(`[cerebro] ✅ ${item.action_type} → ${lead.name} | estado: ${nextState.ultimo_evento}`);

        } else if (isOutbound) {
          const newAttempts = (item.attempts || 0) + 1;
          if (newAttempts >= 5) {
            await supabase.from('lead_activation_queue').update({
              status: 'failed',
              last_attempt_at: new Date().toISOString(),
              attempts: newAttempts,
            }).eq('id', item.id);
            details.push({ action: item.action_type, lead: lead.name, status: 'failed' });
          } else {
            const retryTime = withinWindow
              ? new Date(Date.now() + 30 * 60000).toISOString()
              : nextWindowOpen();
            await supabase.from('lead_activation_queue').update({
              status: 'pending', // volta para pending para ser reprocessado no horário agendado
              scheduled_for: retryTime,
              last_attempt_at: new Date().toISOString(),
              attempts: newAttempts,
            }).eq('id', item.id);
            rescheduled++;
            details.push({ action: item.action_type, lead: lead.name, status: `retry_${newAttempts}` });
          }
        } else {
          // Ação não-outbound que não setou success (skipped) — libera o item
          await supabase.from('lead_activation_queue')
            .update({ status: 'cancelled', cancel_reason: 'skipped_no_broker_or_manager' })
            .eq('id', item.id);
        }

        await new Promise(r => setTimeout(r, 300));

      } catch (e: any) {
        console.error(`[cerebro] item error (${item.id}):`, e.message);
        skipped++;
      }
    }

    const durationMs = Date.now() - startTime;
    try { await supabase.from('cerebro_runs').insert({
      ran_at: now, status: 'success',
      processed, rescheduled, cancelled, skipped,
      duration_ms: durationMs,
      details: { items: details },
    }); } catch {}

    console.log(`[cerebro] done — processed=${processed} rescheduled=${rescheduled} cancelled=${cancelled} skipped=${skipped} (${durationMs}ms)`);

    return new Response(JSON.stringify({ processed, rescheduled, cancelled, skipped }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[cerebro] fatal:', error.message);
    try { await supabase.from('cerebro_runs').insert({
      ran_at: now, status: 'error',
      error_message: error.message,
      duration_ms: Date.now() - startTime,
    }); } catch {}
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
