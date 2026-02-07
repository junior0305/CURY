import { supabase } from "./client";
import { Lead } from "@/types/lead";

export const fetchLeadsForAdmin = async (): Promise<Lead[]> => {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching leads:", error);
    return []; // Retornar vazio se a tabela ainda não existir
  }
  
  return (data || []).map(l => ({
    id: l.id,
    name: l.name,
    email: l.email,
    phone: l.phone,
    status: l.status,
    brokerId: l.broker_id,
    managerId: l.manager_id,
    tag: l.tag,
    createdAt: l.created_at,
    lastInteractionAt: l.last_interaction_at
  }));
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