import { supabase } from "./client";
import { Lead, ExclusionReason } from "@/types/lead";

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
  exclusionReason: l.exclusion_reason as ExclusionReason,
});

export const fetchLeadsForAdmin = async (): Promise<Lead[]> => {
  // Esta função é usada no painel Admin (Rework) e se beneficia do RLS
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching leads:", error);
    return []; // Retornar vazio se a tabela ainda não existir
  }
  
  return (data || []).map(mapLeadFromDB);
};

export const fetchLeadsForDashboard = async (): Promise<Lead[]> => {
  // Esta função será usada pelo Broker/Manager/Superintendent no Dashboard
  // O RLS garante que cada usuário veja apenas os leads permitidos.
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .not('status', 'eq', 'EXCLUDED') // Leads excluídos não aparecem no dashboard ativo
    .not('status', 'eq', 'ABANDONED') // Leads abandonados não aparecem no dashboard ativo
    .order('last_interaction_at', { ascending: true }); // Prioriza leads mais antigos

  if (error) {
    console.error("Error fetching dashboard leads:", error);
    throw error;
  }
  
  return (data || []).map(mapLeadFromDB);
};

export const createManualLead = async (leadData: { name: string, email: string, phone: string, tag: string, brokerId: string, managerId: string | null }) => {
  const { data, error } = await supabase
    .from('leads')
    .insert({
      name: leadData.name,
      email: leadData.email,
      phone: leadData.phone,
      tag: leadData.tag,
      broker_id: leadData.brokerId,
      manager_id: leadData.managerId,
      status: 'NEW',
      last_interaction_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return mapLeadFromDB(data);
};

export const updateLeadBroker = async (leadId: string, brokerId: string) => {
  const { error } = await supabase
    .from('leads')
    .update({ 
      broker_id: brokerId,
      status: 'NEW',
      last_interaction_at: new Date().toISOString()
    })
    .eq('id', leadId);

  if (error) throw error;
};

export const updateLeadStatus = async (leadId: string, status: LeadStatus, exclusionReason: ExclusionReason = null) => {
  const payload: any = {
    status: status,
    last_interaction_at: new Date().toISOString(),
  };

  if (status === 'EXCLUDED' || status === 'ABANDONED') {
    payload.exclusion_reason = exclusionReason;
  }

  const { error } = await supabase
    .from('leads')
    .update(payload)
    .eq('id', leadId);

  if (error) throw error;
};