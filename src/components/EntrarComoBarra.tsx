// Faixa fixa no topo de TODAS as telas enquanto o diretor/admin está "entrando como" outra pessoa (28/10).
import { useState } from "react";
import { entrandoComo, voltarParaMeuLogin } from "@/lib/entrarComo";

const PAPEL: Record<string, string> = { SUPERINTENDENT: "superintendente", MANAGER: "gerente", BROKER: "corretor", DIRECTOR: "diretor", SECRETARY: "secretária" };

export default function EntrarComoBarra() {
  const info = entrandoComo();
  const [saindo, setSaindo] = useState(false);
  if (!info) return null;
  return (
    <div role="status" style={{ position: "sticky", top: 0, zIndex: 9999, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
      justifyContent: "center", padding: "8px 16px", background: "#7c2d12", color: "#fff", fontSize: 13.5, fontWeight: 600 }}>
      <span>🔒 Você está como <b>{info.nome}</b> ({PAPEL[info.role] ?? info.role}). Mensagens e disparos estão bloqueados.</span>
      <button type="button" disabled={saindo} onClick={() => { setSaindo(true); voltarParaMeuLogin(); }}
        style={{ font: "inherit", fontWeight: 800, padding: "5px 12px", borderRadius: 8, border: "1px solid #fff", background: "#fff", color: "#7c2d12", cursor: "pointer" }}>
        {saindo ? "Voltando…" : `Voltar para o meu login${info.por ? ` (${info.por})` : ""}`}
      </button>
    </div>
  );
}
