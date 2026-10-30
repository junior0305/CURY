// /l/<código> — link do aviso de lead novo no WhatsApp (sem telefone). Guarda o código e abre o painel do corretor,
// que procura o lead (RPC lead_por_codigo, só entre os leads que o corretor enxerga) e abre a ficha.
// Funciona também quem ainda não entrou: o login leva para /dashboard e o código continua guardado.
import { Navigate, useParams } from "react-router-dom";

export default function LinkLead() {
  const { codigo = "" } = useParams();
  try { localStorage.setItem("pc_lead_pendente", codigo); } catch { /* sem storage: abre só o painel */ }
  return <Navigate to="/dashboard" replace />;
}
