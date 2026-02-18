import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./components/AuthProvider";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import { Loader2 } from "lucide-react";
import CommandCenter from "./pages/CommandCenter";
import AuthDebug from "@/components/AuthDebug";
import BootstrapAdmin from "@/pages/BootstrapAdmin";
import ProfileDebug from "@/pages/ProfileDebug";

const queryClient = new QueryClient();

const ProtectedAdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, role, loading } = useAuth();
  
  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center">
      <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
    </div>
  );
  
  if (!session) return <Navigate to="/login" />;
  
  // Permitir ADMIN, SUPERINTENDENT e MANAGER
  if (role !== 'SUPERINTENDENT' && role !== 'MANAGER' && role !== 'ADMIN') {
    console.warn(`[AuthGuard] Acesso negado a rota Admin. Role atual: ${role}`);
    return <Navigate to="/dashboard" />;
  }
  
  return <>{children}</>;
};

const ProtectedBrokerRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, role, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center">
      <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
    </div>
  );
  if (!session) return <Navigate to="/login" />;
  
  // Se for SUPERINTENDENT, MANAGER ou ADMIN, redireciona para o painel Admin
  if (role === 'SUPERINTENDENT' || role === 'MANAGER' || role === 'ADMIN') {
    return <Navigate to="/admin" />;
  }
  
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<ProtectedBrokerRoute><Dashboard /></ProtectedBrokerRoute>} />
            <Route path="/admin" element={<ProtectedAdminRoute><Admin /></ProtectedAdminRoute>} />
            <Route path="/command-center" element={<ProtectedAdminRoute><CommandCenter /></ProtectedAdminRoute>} />
            <Route path="/bootstrap-admin" element={<BootstrapAdmin />} />
            <Route path="/profile-debug" element={<ProfileDebug />} />
            <Route path="*" element={<NotFound />} />
          </Routes>

          {/* Debug overlay to inspect session/role in the running app */}
          <AuthDebug />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;