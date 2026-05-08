import { Navigate } from "react-router-dom";
import { useAuth } from "@/components/AuthProvider";

const Index = () => {
  const { session, role, loading } = useAuth();

  if (loading || (session && !role)) {
    return null;
  }

  if (!session) return <Navigate to="/login" replace />;

  if (role === "SECRETARY") return <Navigate to="/secretaria" replace />;
  if (role === "MANAGER") return <Navigate to="/manager" replace />;
  if (role === "ADMIN" || role === "SUPERINTENDENT") return <Navigate to="/admin" replace />;
  return <Navigate to="/dashboard" replace />;
};

export default Index;