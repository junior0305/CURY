import { supabase } from "./client";
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
  exclusionReason: l.exclusion_reason as ExclusionReason,
});

export const fetchLeadsForAdmin = async (): Promise<Lead[]> => {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error("[fetchLeadsForAdmin] Error:", error);
    if ((error as any).code === 'PGRST303' || (error as any).message?.includes('JWT')) {
      window.dispatchEvent(new CustomEvent('supabase-auth-error', { detail: error }));
    }
    if ((error as any).code === '42P01') return [];
    throw error;
  }

  return (data || []).map(mapLeadFromDB);
};

export const fetchLeadsForDashboard = async (): Promise<Lead[]> => {
  console.log("[LeadsAPI] Buscando leads para o Dashboard...");
  // Buscamos absolutamente todos os leads sem filtros de status aqui
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('last_interaction_at', { ascending: true });

  if (error) {
    console.error("[fetchLeadsForDashboard] Error:", error);
    if ((error as any).code === '42P01') return [];
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
      last_interaction_at: new Date().toISOString(),
    })
    .eq('id', leadId);

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

  if (status === 'EXCLUDED' || status === 'ABANDONED') {
    payload.exclusion_reason = exclusionReason;
  }

  const { error } = await supabase
    .from('leads')
    .update(payload)
    .eq('id', leadId);

  if (error) throw error;
};