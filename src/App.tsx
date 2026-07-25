import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./components/AuthProvider";
import { WhatsAppGatekeeper } from "./components/WhatsAppGatekeeper";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useEffect } from "react";
import { syncAudioSettings } from "@/hooks/use-audio-arena";
import { supabase } from "@/integrations/supabase/client";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard"; // mantido como backup
import DashboardWolf from "./pages/DashboardWolf";
import DashboardFoco from "./pages/DashboardFoco";
import Atender from "./pages/Atender";
import ManagerDashboard from "./pages/ManagerDashboard";
import ManagerV2 from "./pages/ManagerV2";
import ManagerV3 from "./pages/ManagerV3";
import CoachIndex from "./pages/manager-v2/CoachIndex";
import CoachBroker from "./pages/manager-v2/CoachBroker";
import CampanhaIndex from "./pages/manager-v2/CampanhaIndex";
import CampanhaNova from "./pages/manager-v2/CampanhaNova";
import CampanhaDetalhe from "./pages/manager-v2/CampanhaDetalhe";
import LigaPage from "./pages/manager-v2/LigaPage";
import AnalisePage from "./pages/manager-v2/AnalisePage";
import PoolPage from "./pages/manager/PoolPage";
import { Loader2 } from "lucide-react";
import CommandCenter from "./pages/CommandCenter";
import BootstrapAdmin from "@/pages/BootstrapAdmin";
import ProfileDebug from "@/pages/ProfileDebug";
import UserManagement from "@/pages/UserManagement";
import AtribuirChips from "@/pages/admin/AtribuirChips";
import ColdPool from "@/pages/admin/ColdPool";
import Replicacao from "@/pages/admin/Replicacao";
import OuroAna from "@/pages/admin/OuroAna";
import Secretaria from "@/pages/Secretaria";
import ForcePasswordChange from "@/pages/ForcePasswordChange";

const queryClient = new QueryClient();

// Sincroniza sons customizados do banco → localStorage uma vez por sessão
// Garante que corretores e gestores toquem o som certo sem abrir configurações
function AudioSyncOnLoad() {
  useEffect(() => { syncAudioSettings(supabase); }, []);
  return null;
}

const LoadingScreen = () => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900">
    <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
  </div>
);

const ProtectedAdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, role, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" />;
  if (role === "SECRETARY") return <Navigate to="/secretaria" />;
  if (role !== "SUPERINTENDENT" && role !== "ADMIN") {
    if (role === "MANAGER") return <Navigate to="/manager" />;
    return <Navigate to="/dashboard" />;
  }
  return <>{children}</>;
};

const ProtectedManagerRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, role, loading, mustChangePassword } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" />;
  if (role === "ADMIN" || role === "SUPERINTENDENT") return <Navigate to="/admin" />;
  if (role === "SECRETARY") return <Navigate to="/secretaria" />;
  if (role !== "MANAGER") return <Navigate to="/dashboard" />;
  if (mustChangePassword) return <Navigate to="/force-password-change" replace />;
  return <WhatsAppGatekeeper>{children}</WhatsAppGatekeeper>;
};

const ProtectedBrokerRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, role, loading, mustChangePassword } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" />;
  if (role === "ADMIN" || role === "SUPERINTENDENT") return <Navigate to="/admin" />;
  if (role === "MANAGER") return <Navigate to="/manager" />;
  if (role === "SECRETARY") return <Navigate to="/secretaria" />;
  if (mustChangePassword) return <Navigate to="/force-password-change" replace />;
  return <WhatsAppGatekeeper>{children}</WhatsAppGatekeeper>;
};

const ProtectedSecretaryRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, role, loading, mustChangePassword } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" />;
  if (role === "ADMIN" || role === "SUPERINTENDENT") return <Navigate to="/admin" />;
  if (role === "MANAGER") return <Navigate to="/manager" />;
  if (role !== "SECRETARY") return <Navigate to="/dashboard" />;
  if (mustChangePassword) return <Navigate to="/force-password-change" replace />;
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
          <AudioSyncOnLoad />
          <Toaster />
          <Sonner />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<ProtectedBrokerRoute><Atender /></ProtectedBrokerRoute>} />
            <Route path="/atender" element={<ProtectedBrokerRoute><Atender /></ProtectedBrokerRoute>} />
            <Route path="/dashboard-classico" element={<ProtectedBrokerRoute><DashboardFoco /></ProtectedBrokerRoute>} />
            <Route path="/dashboard-wolf" element={<ProtectedBrokerRoute><DashboardWolf /></ProtectedBrokerRoute>} />
            {/* /manager = novo cockpit (v2). /manager-v1 = backup do antigo. */}
            <Route path="/manager" element={<ProtectedManagerRoute><ManagerV2 /></ProtectedManagerRoute>} />
            <Route path="/manager-v1" element={<ProtectedManagerRoute><ManagerDashboard /></ProtectedManagerRoute>} />
            <Route path="/manager-v3" element={<ProtectedManagerRoute><ManagerV3 /></ProtectedManagerRoute>} />
            <Route path="/manager/coach" element={<ProtectedManagerRoute><CoachIndex /></ProtectedManagerRoute>} />
            <Route path="/manager/coach/:brokerId" element={<ProtectedManagerRoute><CoachBroker /></ProtectedManagerRoute>} />
            <Route path="/manager/campanha" element={<ProtectedManagerRoute><CampanhaIndex /></ProtectedManagerRoute>} />
            <Route path="/manager/campanha/nova" element={<ProtectedManagerRoute><CampanhaNova /></ProtectedManagerRoute>} />
            <Route path="/manager/campanha/:id" element={<ProtectedManagerRoute><CampanhaDetalhe /></ProtectedManagerRoute>} />
            <Route path="/manager/liga" element={<ProtectedManagerRoute><LigaPage /></ProtectedManagerRoute>} />
            <Route path="/manager/analise" element={<ProtectedManagerRoute><AnalisePage /></ProtectedManagerRoute>} />
            <Route path="/manager/pool" element={<ProtectedManagerRoute><PoolPage /></ProtectedManagerRoute>} />
            {/* Aliases legados — redirecionam pra nova URL */}
            <Route path="/manager-v2" element={<Navigate to="/manager" replace />} />
            <Route path="/manager-v2/coach" element={<Navigate to="/manager/coach" replace />} />
            <Route path="/manager-v2/liga" element={<Navigate to="/manager/liga" replace />} />
            <Route path="/manager-v2/campanha" element={<Navigate to="/manager/campanha" replace />} />
            <Route path="/manager-v2/analise" element={<Navigate to="/manager/analise" replace />} />
            <Route path="/admin" element={<ProtectedAdminRoute><Admin /></ProtectedAdminRoute>} />
            <Route path="/command-center" element={<ProtectedAdminRoute><CommandCenter /></ProtectedAdminRoute>} />
            <Route path="/user-management" element={<ProtectedAdminRoute><UserManagement /></ProtectedAdminRoute>} />
            <Route path="/atribuir-chips" element={<ProtectedAdminRoute><AtribuirChips /></ProtectedAdminRoute>} />
            <Route path="/cold-pool" element={<ProtectedAdminRoute><ColdPool /></ProtectedAdminRoute>} />
            <Route path="/admin/replicacao" element={<ProtectedAdminRoute><Replicacao /></ProtectedAdminRoute>} />
            <Route path="/admin/ouro-ana" element={<ProtectedAdminRoute><OuroAna /></ProtectedAdminRoute>} />
            <Route path="/secretaria" element={<ProtectedSecretaryRoute><Secretaria /></ProtectedSecretaryRoute>} />
            <Route path="/force-password-change" element={<ForcePasswordChange />} />
            <Route path="/bootstrap-admin" element={<BootstrapAdmin />} />
            <Route path="/profile-debug" element={<ProfileDebug />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;