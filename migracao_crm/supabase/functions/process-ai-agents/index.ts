import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req: Request) => {
  // Aceita chamada manual (POST) ou cron (GET)
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const results = await processAgents();
    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("process-ai-agents error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

async function processAgents() {
  // 1. Buscar agentes ativos
  const { data: agents } = await supabase
    .from("ai_agents")
    .select("*")
    .eq("is_active", true);

  if (!agents || agents.length === 0) return { processed: 0 };

  // 2. Buscar configurações globais
  const { data: integrations } = await supabase
    .from("system_integrations")
    .select("key, value")
    .in("key", ["evolution_api_url", "evolution_api_key", "anthropic_api_key", "n8n_webhook_url"]);

  const cfg: Record<string, string> = {};
  (integrations || []).forEach((i: any) => { cfg[i.key] = i.value; });

  if (!cfg.anthropic_api_key || !cfg.n8n_webhook_url) {
    console.log("Anthropic key ou n8n webhook não configurados");
    return { processed: 0, reason: "missing_config" };
  }

  let totalDispatched = 0;

  for (const agent of agents) {
    const dispatched = await processAgent(agent, cfg);
    totalDispatched += dispatched;
  }

  return { processed: totalDispatched };
}

async function processAgent(agent: any, cfg: Record<string, string>): Promise<number> {
  const now = new Date();
  let dispatched = 0;

  // Montar query de leads elegíveis para este agente
  let query = supabase
    .from("leads")
    .select(`
      id, name, phone, status, notes, tag,
      last_interaction_at, last_broker_whatsapp_at,
      ai_paused_until, ai_conversation_active,
      broker_id,
      profiles!leads_broker_id_fkey(id, first_name, last_name, email, evolution_instance)
    `)
    .not("broker_id", "is", null)
    .not("phone", "is", null)
    .eq("ai_conversation_active", false)
    .not("status", "in", "(CONCLUDED,ABANDONED,EXCLUDED)");

  // Filtrar por status se o agente é de mudança de status
  if (agent.trigger_type === "STATUS_CHANGE" && agent.trigger_status) {
    query = query.eq("status", agent.trigger_status);
  }

  const { data: leads } = await query;
  if (!leads || leads.length === 0) return 0;

  for (const lead of leads) {
    const broker = (lead as any).profiles;
    if (!broker?.evolution_instance) continue; // Corretor sem instância — pula

    // ── Verificar proteções de silêncio ─────────────────────────────────────

    // 1. Lead com pausa manual ativa
    if (lead.ai_paused_until && new Date(lead.ai_paused_until) > now) continue;

    // 2. Corretor enviou mensagem WA recentemente
    if (lead.last_broker_whatsapp_at) {
      const hoursSinceBrokerWa =
        (now.getTime() - new Date(lead.last_broker_whatsapp_at).getTime()) / 3600000;
      if (hoursSinceBrokerWa < agent.silence_after_broker_activity_hours) continue;
    }

    // 3. Verificar critério do gatilho
    if (agent.trigger_type === "NO_INTERACTION") {
      const lastActivity = lead.last_interaction_at || lead.last_broker_whatsapp_at;
      if (!lastActivity) continue;
      const hoursSince = (now.getTime() - new Date(lastActivity).getTime()) / 3600000;
      if (hoursSince < agent.trigger_hours) continue;
    }

    if (agent.trigger_type === "NEW_LEAD") {
      // Só dispara uma vez por lead novo — se já tem dispatch, pula
    }

    // 4. Verificar tentativas já feitas para este lead/agente
    const { data: existingDispatches } = await supabase
      .from("ai_agent_dispatches")
      .select("id, attempt_number, sent_at, created_at")
      .eq("agent_id", agent.id)
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(1);

    const lastDispatch = existingDispatches?.[0];
    const attemptNumber = lastDispatch ? (lastDispatch.attempt_number + 1) : 1;

    // Máximo de tentativas atingido
    if (lastDispatch && lastDispatch.attempt_number >= agent.max_attempts) continue;

    // Intervalo entre tentativas não passou
    if (lastDispatch?.sent_at) {
      const hoursSinceLast = (now.getTime() - new Date(lastDispatch.sent_at).getTime()) / 3600000;
      if (hoursSinceLast < agent.interval_hours) continue;
    }

    // ── Gerar mensagem com Claude ────────────────────────────────────────────
    const message = await generateMessage(agent, lead, broker, cfg.anthropic_api_key);
    if (!message) continue;

    // ── Criar dispatch ───────────────────────────────────────────────────────
    const { data: dispatch } = await supabase
      .from("ai_agent_dispatches")
      .insert({
        agent_id: agent.id,
        lead_id: lead.id,
        broker_id: broker.id,
        message_generated: message,
        status: agent.require_approval ? "PENDING" : "PENDING",
        attempt_number: attemptNumber,
      })
      .select("id")
      .single();

    if (!dispatch) continue;

    // ── Se não requer aprovação, dispara direto via n8n ──────────────────────
    if (!agent.require_approval) {
      await fireWebhook(cfg, {
        lead_id: lead.id,
        lead_name: lead.name,
        lead_phone: normalizePhone(lead.phone),
        broker_id: broker.id,
        broker_name: broker.first_name,
        evolution_instance: broker.evolution_instance,
        message,
        agent_id: agent.id,
        dispatch_id: dispatch.id,
      });
    }

    dispatched++;
  }

  return dispatched;
}

async function generateMessage(agent: any, lead: any, broker: any, apiKey: string): Promise<string | null> {
  try {
    const brokerName = broker.first_name || "o corretor";
    const prompt = `Você é ${brokerName}, um corretor de imóveis. Gere UMA mensagem de WhatsApp para enviar para ${lead.name}.

Sua personalidade e forma de falar: ${agent.broker_personality}

Objetivo desta mensagem: ${agent.message_objective}

Contexto do lead:
- Nome: ${lead.name}
- Status atual no CRM: ${lead.status}
- Tag/Origem: ${lead.tag || "não informado"}
- Última nota registrada: ${lead.notes || "nenhuma"}
- Última interação: ${lead.last_interaction_at ? new Date(lead.last_interaction_at).toLocaleDateString("pt-BR") : "não registrada"}

REGRAS OBRIGATÓRIAS:
1. Escreva APENAS a mensagem, sem explicações, sem aspas, sem prefixos
2. Máximo 3 frases curtas — WhatsApp, não e-mail
3. Tom natural, como se você realmente estivesse digitando no celular
4. NÃO mencione que é uma mensagem automática
5. NÃO use linguagem corporativa ou formal demais
6. Assine como ${brokerName} apenas se fizer sentido natural

Mensagem:`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error("Anthropic API error:", await response.text());
      return null;
    }

    const data = await response.json();
    return data.content?.[0]?.text?.trim() || null;
  } catch (err) {
    console.error("generateMessage error:", err);
    return null;
  }
}

async function fireWebhook(cfg: Record<string, string>, payload: any) {
  try {
    await fetch(cfg.n8n_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        evolution_api_url: cfg.evolution_api_url,
        evolution_api_key: cfg.evolution_api_key,
        supabase_url: Deno.env.get("SUPABASE_URL"),
        supabase_anon_key: Deno.env.get("SUPABASE_ANON_KEY"),
      }),
    });
  } catch (err) {
    console.error("fireWebhook error:", err);
  }
}

function normalizePhone(phone: string): string {
  // Remove tudo que não é número
  const digits = phone.replace(/\D/g, "");
  // Adiciona DDI 55 se não tiver
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 11 || digits.length === 10) return `55${digits}`;
  return digits;
}
