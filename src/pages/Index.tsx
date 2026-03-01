import { Navigate } from "react-router-dom";
import { useAuth } from "@/components/AuthProvider";

const Index = () => {
  const { session, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (session) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Navigate to="/login" replace />;
};

export default Index;