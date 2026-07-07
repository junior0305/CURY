/**
 * atender.ts — helpers do novo dashboard do corretor (/atender, estilo WhatsApp Web).
 * Isolado do resto: conversa (ia_messages), anotações (lead_notes), temperatura e envio pelo chip.
 */
import { supabase } from "@/integrations/supabase/client";
import type { LeadTemperature } from "@/types/lead";

export interface ChatMessage {
  id: string;
  text: string;
  direction: "incoming" | "outgoing";
  senderType: string | null; // lead | broker | ia
  createdAt: string;
}

/** Espelho da conversa do lead no WhatsApp (última ia_conversation → ia_messages). */
export async function fetchLeadConversation(leadId: string): Promise<ChatMessage[]> {
  const { data: conv } = await supabase
    .from("ia_conversations")
    .select("id")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!conv) return [];
  const { data: msgs } = await supabase
    .from("ia_messages")
    .select("id, message_text, direction, sender_type, created_at")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: true })
    .limit(60);
  return (msgs || [])
    .filter((m: any) => (m.message_text || "").trim() !== "")
    .map((m: any) => ({
      id: m.id,
      text: m.message_text,
      direction: m.direction === "incoming" ? "incoming" : "outgoing",
      senderType: m.sender_type ?? null,
      createdAt: m.created_at,
    }));
}

/** Retorna o id da conversa ativa do lead (pra enviar msg no thread certo). */
export async function fetchActiveConversationId(leadId: string): Promise<string | null> {
  const { data } = await supabase
    .from("ia_conversations")
    .select("id")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export interface LeadNote {
  id: string;
  content: string;
  createdAt: string;
  brokerId: string | null;
}

/** Linha do tempo de anotações do corretor (o "o que aconteceu"). */
export async function fetchLeadNotes(leadId: string): Promise<LeadNote[]> {
  const { data } = await supabase
    .from("lead_notes")
    .select("id, content, created_at, broker_id")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  return (data || []).map((n: any) => ({
    id: n.id,
    content: n.content,
    createdAt: n.created_at,
    brokerId: n.broker_id ?? null,
  }));
}

export async function addLeadNote(leadId: string, brokerId: string, content: string): Promise<void> {
  const { error } = await supabase
    .from("lead_notes")
    .insert({ lead_id: leadId, broker_id: brokerId, content });
  if (error) throw error;
}

/** Corretor pode ajustar a temperatura na mão (além do que o sistema calcula). */
export async function setLeadTemperature(leadId: string, temp: LeadTemperature): Promise<void> {
  const { error } = await supabase
    .from("leads")
    .update({ lead_temperature: temp, temperature_updated_at: new Date().toISOString() })
    .eq("id", leadId);
  if (error) throw error;
}

/** Envia mensagem PELO CHIP do corretor (Evolution), igual um WhatsApp. */
export async function sendLeadMessage(
  botId: string,
  phone: string,
  message: string,
  conversationId?: string | null,
): Promise<{ success: boolean; error?: string }> {
  const body: any = { botId, phone, message, send_source: "broker_manual" };
  if (conversationId) body.conversationId = conversationId;
  const { data, error } = await supabase.functions.invoke("send_whatsapp_message", { body });
  if (error) return { success: false, error: error.message };
  if (data?.success) return { success: true };
  return { success: false, error: data?.error || data?.skipped || "erro desconhecido" };
}

/** Link wa.me (fallback quando desconectado — desktop abre WhatsApp Web, celular abre o app). */
export function waLink(phone: string, msg?: string): string {
  const d = (phone || "").replace(/\D/g, "");
  const n = d.startsWith("55") ? d : `55${d}`;
  return msg ? `https://wa.me/${n}?text=${encodeURIComponent(msg)}` : `https://wa.me/${n}`;
}
