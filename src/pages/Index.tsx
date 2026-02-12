
import { Navigate } from "react-router-dom";
import { useAuth } from "@/components/AuthProvider";

const Index = () => {
  const { session, loading } = useAuth();

  if (loading) {
    return null; // Ou um spinner
  }

  // Se já estiver logado, vai pro Dashboard (QG)
  if (session) {
    return <Navigate to="/dashboard" replace />;
  }

  // Se não, vai pro Login
  return <Navigate to="/login" replace />;
};

export default Index;
