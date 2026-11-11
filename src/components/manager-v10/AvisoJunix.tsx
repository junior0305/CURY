// Aviso de Junix parado (11/11). Venda e pasta vêm do Junix (ImobFlow) por robô. Quando o robô fica sem puxar
// (como no bloqueio de 03/11), os números do mês ficam congelados e enganam. Este aviso lê a hora real da última
// atualização e, se estiver velha, mostra uma faixa amarela com a data. Some sozinho quando o Junix volta.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;
const HORAS_LIMITE = 20;   // o robô roda de hora em hora; +20h parado = algo travou

export default function AvisoJunix({ oque = "Venda e pasta" }: { oque?: string }) {
  const { data } = useQuery({
    queryKey: ["aviso-junix"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await sb.from("junix_vendas").select("atualizado_em").order("atualizado_em", { ascending: false }).limit(1).maybeSingle();
      return (data?.atualizado_em as string) ?? null;
    },
  });
  if (!data) return null;
  const quando = new Date(data);
  const horas = (Date.now() - quando.getTime()) / 36e5;
  if (horas < HORAS_LIMITE) return null;
  const dt = quando.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  return (
    <div role="status" style={{
      display: "flex", gap: 10, alignItems: "flex-start", margin: "0 0 14px", padding: "12px 14px", borderRadius: 12,
      border: "1px solid #E8B65C", background: "rgba(232,182,92,0.14)", color: "var(--cv-text-main,#4A3A10)", fontSize: 13.5,
    }}>
      <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>⚠️</span>
      <span><b>{oque} do Junix estão sem atualizar desde {dt}.</b> O Junix parou de responder ao Comandra. Os números deste mês podem estar incompletos até a conexão voltar — o que você vê é o último valor lido.</span>
    </div>
  );
}
