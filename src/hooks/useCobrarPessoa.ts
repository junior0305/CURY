// Mandar mensagem de cobrança pelo WhatsApp DO CHIP DE QUEM CLICA (edge cobrar-pessoa), em vez de
// abrir o WhatsApp ao lado. Se o chip de quem clica estiver desconectado, sai pelo chip reserva.
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type Destino = { paraId?: string | null; paraNome?: string | null; paraPhone?: string | null; rotulo?: string };

export async function enviarPeloMeuChip(d: Destino & { mensagem: string; motivo?: string; registrar?: boolean; leadIds?: string[] }) {
  const { data, error } = await supabase.functions.invoke("cobrar-pessoa", {
    body: {
      para_id: d.paraId || undefined, para_nome: d.paraId ? undefined : d.paraNome || undefined,
      para_phone: d.paraId || d.paraNome ? undefined : d.paraPhone || undefined, para_rotulo: d.rotulo,
      mensagem: d.mensagem, motivo: d.motivo, registrar: d.registrar, lead_ids: d.leadIds,
    },
  });
  const r = (data ?? {}) as { ok?: boolean; para?: string; chip?: string | null; pelo_meu_chip?: boolean; error?: string; erro?: string };
  const nome = r.para || d.rotulo || d.paraNome || "a pessoa";
  if (error || r.error) {
    toast.error(r.error || "Não consegui enviar. Tente de novo.");
    return false;
  }
  if (!r.ok) {
    toast.error(r.erro || `A mensagem para ${nome} não saiu.`);
    return false;
  }
  toast.success(r.pelo_meu_chip
    ? `Mensagem enviada para ${nome} pelo seu WhatsApp.`
    : `Mensagem enviada para ${nome} pelo chip reserva (o seu WhatsApp está desconectado).`);
  return true;
}
