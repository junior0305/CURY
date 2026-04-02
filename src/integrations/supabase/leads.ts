import { supabase } from "@/integrations/supabase/client";
import { Lead, ExclusionReason, LeadStatus } from "@/types/lead";

const mapLeadFromDB = (l: any): Lead => ({
  id: l.id,
  name: l.name,
  email: l.email,
  phone: l.phone,
  status: l.status,
  brokerId: l.broker_id,
  managerId: l.manager_id,
  tag: l.tag,
  createdAt: l.created_at,
  lastInteractionAt: l.last_interaction_at,
  lastLeadResponseAt: l.last_lead_response_at ?? null,
  lastBrokerWhatsappAt: l.last_broker_whatsapp_at ?? null,
  exclusionReason: l.exclusion_reason as ExclusionReason,
});

// ─── XP por transição de status ───────────────────────────────────────────────
// Só ganha XP quando avança no funil — não ao voltar ou excluir
const XP_BY_STATUS: Partial<Record<LeadStatus, number>> = {
  IN_PROGRESS:      10,   // Primeiro contato feito
  VISIT_SCHEDULED:  30,   // Visita agendada
  DOCS_REQUESTED:   50,   // Documentação solicitada
  CONCLUDED:        200,  // Venda fechada 🏆
};

// Missões que devem ser avançadas por transição de status
const MISSION_ACTION_BY_STATUS: Partial<Record<LeadStatus, string>> = {
  IN_PROGRESS:      "CONTACT_LEADS",
  VISIT_SCHEDULED:  "SCHEDULE_VISITS",
  CONCLUDED:        "CLOSE_SALES",
};

// ─── Helper: dar XP + avançar missão (fire-and-forget, nunca bloqueia) ────────
async function applyGamification(
  brokerId: string,
  status: LeadStatus,
  leadId: string,
  leadName: string
) {
  try {
    const xp = XP_BY_STATUS[status];
    const missionAction = MISSION_ACTION_BY_STATUS[status];
    const today = new Date().toISOString().split("T")[0];

    // 1. Dar XP se essa transição de status tiver recompensa
    if (xp) {
      await supabase.rpc("add_xp", {
        p_broker_id: brokerId,
        p_amount: xp,
        p_reason: `STATUS_${status}`,
        p_metadata: { lead_id: leadId, lead_name: leadName },
      });
      console.log(`[XP] +${xp} XP para broker ${brokerId} — ${status}`);
    }

    // 2. Avançar progresso de missão diária correspondente
    if (missionAction) {
      const { data: missions } = await supabase
        .from("daily_missions")
        .select("id, progress, target, completed, mission_templates(xp_reward, prize_type, prize_value, prize_label)")
        .eq("broker_id", brokerId)
        .eq("date", today)
        .eq("completed", false);

      // Filtrar missões cujo action_type bate com a ação atual
      const { data: matchingMissions } = await supabase
        .from("daily_missions")
        .select(`
          id, progress, target, completed,
          mission_templates!inner(xp_reward, prize_type, prize_value, prize_label, action_type)
        `)
        .eq("broker_id", brokerId)
        .eq("date", today)
        .eq("completed", false)
        .eq("mission_templates.action_type", missionAction);

      for (const mission of matchingMissions || []) {
        const newProgress = (mission.progress || 0) + 1;
        const nowComplete = newProgress >= mission.target;
        const template = mission.mission_templates as any;

        await supabase
          .from("daily_missions")
          .update({
            progress: newProgress,
            completed: nowComplete,
            completed_at: nowComplete ? new Date().toISOString() : null,
          })
          .eq("id", mission.id);

        if (nowComplete) {
          // XP de conclusão de missão
          if (template?.xp_reward) {
            await supabase.rpc("add_xp", {
              p_broker_id: brokerId,
              p_amount: template.xp_reward,
              p_reason: "MISSION_COMPLETE",
              p_metadata: { mission_id: mission.id },
            });
          }

          // Criar prize_claim se tiver prêmio real
          if (template?.prize_type && template?.prize_value > 0) {
            await supabase.from("prize_claims").insert({
              broker_id: brokerId,
              mission_id: mission.id,
              prize_type: template.prize_type,
              prize_value: template.prize_value,
              prize_label: template.prize_label || template.prize_type,
              status: "PENDING",
            });
          }

          console.log(`[Missão] Missão concluída para broker ${brokerId} — ${missionAction}`);
        }
      }
    }

    // 3. XP extra e missão de venda ao fechar negócio
    if (status === "CONCLUDED") {
      // Atualizar missão UPDATE_PIPELINE também (fechar uma venda conta como atualizar pipeline)
      const { data: pipelineMissions } = await supabase
        .from("daily_missions")
        .select(`
          id, progress, target,
          mission_templates!inner(xp_reward, prize_type, prize_value, prize_label, action_type)
        `)
        .eq("broker_id", brokerId)
        .eq("date", today)
        .eq("completed", false)
        .eq("mission_templates.action_type", "UPDATE_PIPELINE");

      for (const mission of pipelineMissions || []) {
        const newProgress = (mission.progress || 0) + 1;
        const nowComplete = newProgress >= mission.target;
        const template = mission.mission_templates as any;

        await supabase
          .from("daily_missions")
          .update({
            progress: newProgress,
            completed: nowComplete,
            completed_at: nowComplete ? new Date().toISOString() : null,
          })
          .eq("id", mission.id);

        if (nowComplete && template?.xp_reward) {
          await supabase.rpc("add_xp", {
            p_broker_id: brokerId,
            p_amount: template.xp_reward,
            p_reason: "MISSION_COMPLETE",
            p_metadata: { mission_id: mission.id },
          });
        }
      }
    }
  } catch (err) {
    // Gamificação nunca bloqueia o fluxo principal
    console.error("[Gamificação] Falha silenciosa:", err);
  }
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export const fetchTeamLeads = async (brokerIds: string[]): Promise<Lead[]> => {
  if (!brokerIds.length) return [];
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .in('broker_id', brokerIds)
    .not('status', 'in', '("EXCLUDED")')
    .order('last_interaction_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapLeadFromDB);
};

export const fetchUnassignedLeads = async (): Promise<Lead[]> => {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .is('broker_id', null)
    .not('status', 'in', '("EXCLUDED","ABANDONED","CONCLUDED")')
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) throw error;
  return (data || []).map(mapLeadFromDB);
};

export const fetchLeadsForAdmin = async (): Promise<Lead[]> => {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[fetchLeadsForAdmin] Error:", error);
    if ((error as any).code === "PGRST303" || (error as any).message?.includes("JWT")) {
      window.dispatchEvent(new CustomEvent("supabase-auth-error", { detail: error }));
    }
    if ((error as any).code === "42P01") return [];
    throw error;
  }

  return (data || []).map(mapLeadFromDB);
};

export const fetchLeadsForDashboard = async (): Promise<Lead[]> => {
  console.log("[LeadsAPI] Buscando leads para o Dashboard...");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.log("[LeadsAPI] Nenhum usuário logado encontrado.");
    return [];
  }

  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq('broker_id', user.id)
    .not("status", "in", '("ABANDONED","EXCLUDED")')
    .order("last_interaction_at", { ascending: true });

  if (error) {
    console.error("[fetchLeadsForDashboard] Error:", error);
    if ((error as any).code === "42P01") return [];
    throw error;
  }

  console.log(`[LeadsAPI] ${data?.length} leads retornados do banco.`);
  return (data || []).map(mapLeadFromDB);
};

export const createManualLead = async (leadData: {
  name: string;
  email: string;
  phone: string;
  tag: string;
  brokerId: string;
  managerId: string | null;
}) => {
  const { data, error } = await supabase
    .from("leads")
    .insert({
      name: leadData.name,
      email: leadData.email,
      phone: leadData.phone,
      tag: leadData.tag,
      broker_id: leadData.brokerId,
      manager_id: leadData.managerId,
      status: "NEW",
      last_interaction_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return mapLeadFromDB(data);
};

export const touchLeadInteraction = async (leadId: string) => {
  await supabase
    .from("leads")
    .update({ last_interaction_at: new Date().toISOString() })
    .eq("id", leadId);
};

export const updateLeadBroker = async (leadId: string, brokerId: string) => {
  const { error } = await supabase
    .from("leads")
    .update({
      broker_id: brokerId,
      status: "NEW",
      last_interaction_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  if (error) throw error;
};

export const updateLeadStatus = async (
  leadId: string,
  status: LeadStatus,
  exclusionReason: ExclusionReason = null
) => {
  const payload: any = {
    status,
    last_interaction_at: new Date().toISOString(),
  };

  if (status === "EXCLUDED" || status === "ABANDONED") {
    payload.exclusion_reason = exclusionReason;
  }

  // 1. Buscar dados do lead ANTES de atualizar (precisamos do broker_id e nome)
  const { data: leadBefore } = await supabase
    .from("leads")
    .select("broker_id, name, profiles:broker_id(first_name, phone, evolution_instance)")
    .eq("id", leadId)
    .single();

  // 2. Atualizar status no banco
  const { error } = await supabase
    .from("leads")
    .update(payload)
    .eq("id", leadId);

  if (error) throw error;

  const brokerId = leadBefore?.broker_id;
  const leadName = leadBefore?.name || "";
  const brokerProfile = leadBefore?.profiles as any;

  // 3. Gamificação: XP + missões (fire-and-forget, não bloqueia)
  if (brokerId && XP_BY_STATUS[status]) {
    applyGamification(brokerId, status, leadId, leadName);
  }

  // 4. WhatsApp automático ao fechar venda
  if (status === "CONCLUDED") {
    try {
      if (brokerProfile?.phone) {
        const message = `🚀 Parabéns ${brokerProfile.first_name}! O Superintendente viu sua venda do cliente ${leadName}. Excelente trabalho! Mais uma para a conta!`;

        supabase.functions.invoke("send-whatsapp", {
          body: { phone: brokerProfile.phone, message, instance_name: brokerProfile.evolution_instance || null },
        });

        console.log(`[Auto-Zap] Parabéns enviado para ${brokerProfile.first_name}`);
      }
    } catch (err) {
      console.error("[Auto-Zap] Falha silenciosa:", err);
    }
  }
};