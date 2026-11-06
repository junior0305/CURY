// Pedidos de liberação de check-in (06/11): faixa no topo de TODAS as telas do gerente, super e diretor enquanto houver
// corretor aguardando. Liberar (entra no fim da roleta) · Liberar e corrigir o plantão para o ponto do corretor · Recusar.
// O pedido vence em 1 hora (robô plantao_vencer_pedidos). Também chega no WhatsApp do líder (plantao_whats).
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { distTxt, horaTxt, erroTxt } from "@/lib/plantao";

type Pedido = {
  broker_id: string; nome: string; gerente: string | null; em: string; dist_m: number | null; lat: number | null; lng: number | null;
  motivo: string | null; pedido: boolean; plantao_id: string; plantao: string | null; plantao_lat: number | null; plantao_lng: number | null;
  aproximado: boolean; pedidos_semana: number;
};
const LIDER = new Set(["MANAGER", "SUPERINTENDENT", "DIRECTOR", "ADMIN"]);

export default function PedidosLiberacaoBarra() {
  const { user, role } = useAuth() as any;
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const ativo = !!user?.id && LIDER.has(role || "");
  const { data: pedidos = [] } = useQuery<Pedido[]>({
    queryKey: ["plantaoPedidos", user?.id], enabled: ativo, refetchInterval: 60_000, refetchOnWindowFocus: true,
    queryFn: async () => { const { data, error } = await (supabase as any).rpc("plantao_pedidos", { p_como: null }); if (error) throw error; return data || []; },
  });
  if (!ativo || !pedidos.length) return null;

  const decidir = async (p: Pedido, acao: "liberar" | "corrigir" | "recusar") => {
    setOcupado(p.broker_id);
    try {
      const { error } = await (supabase as any).rpc("plantao_liberacao_decidir", { p_broker: p.broker_id, p_acao: acao });
      if (error) throw error;
      toast.success(acao === "recusar" ? `Check-in de ${p.nome} recusado` : acao === "corrigir" ? `${p.nome} liberado · ${p.plantao} corrigido para o ponto dele` : `${p.nome} liberado · entrou no fim da roleta`);
      qc.invalidateQueries({ queryKey: ["plantaoPedidos"] }); qc.invalidateQueries({ queryKey: ["plantaoAgora"] });
    } catch (e) { toast.error(erroTxt(e)); } finally { setOcupado(null); }
  };
  const mapa = (p: Pedido) => p.lat != null
    ? (p.plantao_lat != null ? `https://www.google.com/maps/dir/?api=1&origin=${p.lat},${p.lng}&destination=${p.plantao_lat},${p.plantao_lng}` : `https://www.google.com/maps?q=${p.lat},${p.lng}`)
    : null;
  const btn: React.CSSProperties = { border: "1px solid #E8B65C", background: "#fff", color: "#5A3A00", borderRadius: 8, padding: "7px 10px", fontWeight: 700, fontSize: 13, cursor: "pointer", minHeight: 34 };

  return (
    <div role="region" aria-label="Pedidos de liberação de check-in" style={{ position: "sticky", top: 0, zIndex: 9998, background: "#FFF4E0", borderBottom: "2px solid #E8B65C",
      color: "#3D2A05", fontFamily: "Inter, system-ui, sans-serif", padding: "8px 14px", display: "grid", gap: 6, maxHeight: "40vh", overflowY: "auto" }}>
      {pedidos.map((p) => {
        const vence = Math.max(0, Math.round((Date.parse(p.em) + 3.6e6 - Date.now()) / 60000));
        const link = mapa(p);
        return (
          <div key={p.broker_id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ flex: "1 1 320px", fontSize: 14, lineHeight: 1.4 }}>
              📍 <b>{p.nome}</b>{p.gerente ? ` (equipe ${p.gerente})` : ""} pede liberação do check-in no <b>{p.plantao || "plantão"}</b>
              {p.pedido && p.dist_m != null ? <> · está a <b>{distTxt(p.dist_m)}</b>{p.aproximado ? " de um endereço ainda não conferido" : ""}</> : null}
              {p.motivo ? <> · {p.motivo}</> : !p.pedido ? <> · sua equipe exige liberação</> : null}
              <span style={{ color: "#7A5520" }}> · pediu às {horaTxt(p.em)}{p.pedido ? `, vence em ${vence} min` : ""}</span>
              {p.pedidos_semana >= 3 && <b style={{ color: "#B4462F" }}> · {p.pedidos_semana}º pedido na semana</b>}
            </span>
            <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {link && <a href={link} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: "none" }}>Ver no mapa</a>}
              <button type="button" style={{ ...btn, background: "#0B7A6A", borderColor: "#0B7A6A", color: "#fff" }} disabled={ocupado === p.broker_id} onClick={() => decidir(p, "liberar")}>Liberar</button>
              {p.pedido && p.lat != null && <button type="button" style={btn} disabled={ocupado === p.broker_id} onClick={() => decidir(p, "corrigir")}>Liberar e corrigir o plantão</button>}
              <button type="button" style={{ ...btn, color: "#B4462F", borderColor: "#E9A796" }} disabled={ocupado === p.broker_id} onClick={() => decidir(p, "recusar")}>Recusar</button>
            </span>
          </div>);
      })}
    </div>
  );
}
