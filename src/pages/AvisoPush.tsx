// /aviso — liga o aviso de cliente nova (Web Push) para qualquer login, inclusive gestor (teste do Junior, 01/11).
import { useAuth } from "@/components/AuthProvider";
import { Navigate } from "react-router-dom";
import AvisoLeadPush from "@/components/painel-corretor/AvisoLeadPush";
import "@/styles/painel-corretor.css";

export default function AvisoPush() {
  const { session, user, loading } = useAuth();
  if (loading) return null;
  if (!session) return <Navigate to="/login" />;
  return (
    <div className="pc"><div className="pc-app" style={{ padding: 16, gap: 12, display: "grid", alignContent: "start" }}>
      <h1 style={{ fontFamily: "var(--fd)", fontSize: 22, margin: "8px 0 0" }}>Aviso de cliente nova</h1>
      <p className="meta" style={{ margin: 0 }}>Liga a notificação neste aparelho. Ela toca mesmo com o Comandra fechado.</p>
      <AvisoLeadPush uid={user?.id || ""} sempre />
      <a className="btn" style={{ textAlign: "center", textDecoration: "none" }} href="/">Voltar ao Comandra</a>
    </div></div>
  );
}
