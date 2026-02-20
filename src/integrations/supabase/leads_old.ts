import { supabase } from "@/integrations/supabase/client";
import { Lead, ExclusionReason, LeadStatus } from "@/types/lead";
import { toast } from "sonner";

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
  // FILTRO CRÍTICO: No Dashboard só aparecem leads que NÃO foram abandonados ou excluídos.
  // Leads abandonados/excluídos só aparecem no Painel Admin (Rework).
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .not('status', 'in', '("ABANDONED","EXCLUDED")')
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

  // 1. Atualizar no Banco
  const { error } = await supabase
    .from('leads')
    .update(payload)
    .eq('id', leadId);

  if (error) throw error;

  // 2. AUTOMAÇÃO: Se for VENDA, dispara Parabéns via WhatsApp (n8n)
  if (status === 'CONCLUDED') {
    try {
      // Buscar dados do lead e do corretor
      const { data: leadData } = await supabase
        .from('leads')
        .select(`
          name, 
          broker_id,
          profiles:broker_id (first_name, phone)
        `)
        .eq('id', leadId)
        .single();

      if (leadData && leadData.profiles && leadData.profiles.phone) {
        const brokerName = leadData.profiles.first_name;
        const brokerPhone = leadData.profiles.phone;
        const leadName = leadData.name;

        const message = `🚀 Parabéns ${brokerName}! O Superintendente viu sua venda do cliente ${leadName}. Excelente trabalho! Mais uma para a conta!`;

        // Disparo "Fire and Forget" para a Edge Function
        supabase.functions.invoke('send-whatsapp', {
          body: { phone: brokerPhone, message }
        });
        
        console.log(`[Auto-Zap] Mensagem de parabéns enviada para ${brokerName}`);
      }
    } catch (err) {
      console.error("[Auto-Zap] Falha silenciosa ao enviar parabéns:", err);
      // Não damos erro para o usuário pois a atualização do status funcionou
    }
  }
};