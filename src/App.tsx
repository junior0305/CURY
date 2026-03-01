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
import ManagerDashboard from "./pages/ManagerDashboard";
import { Loader2 } from "lucide-react";
import CommandCenter from "./pages/CommandCenter";
import BootstrapAdmin from "@/pages/BootstrapAdmin";
import ProfileDebug from "@/pages/ProfileDebug";
import UserManagement from "@/pages/UserManagement";

const queryClient = new QueryClient();

const LoadingScreen = () => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900">
    <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
  </div>
);

const ProtectedAdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, role, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" />;
  if (role !== "SUPERINTENDENT" && role !== "ADMIN") {
    if (role === "MANAGER") return <Navigate to="/manager" />;
    return <Navigate to="/dashboard" />;
  }
  return <>{children}</>;
};

const ProtectedManagerRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, role, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" />;
  if (role === "ADMIN" || role === "SUPERINTENDENT") return <Navigate to="/admin" />;
  if (role !== "MANAGER") return <Navigate to="/dashboard" />;
  return <>{children}</>;
};

const ProtectedBrokerRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, role, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" />;
  if (role === "ADMIN" || role === "SUPERINTENDENT") return <Navigate to="/admin" />;
  if (role === "MANAGER") return <Navigate to="/manager" />;
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
            <Route path="/manager" element={<ProtectedManagerRoute><ManagerDashboard /></ProtectedManagerRoute>} />
            <Route path="/admin" element={<ProtectedAdminRoute><Admin /></ProtectedAdminRoute>} />
            <Route path="/command-center" element={<ProtectedAdminRoute><CommandCenter /></ProtectedAdminRoute>} />
            <Route path="/user-management" element={<ProtectedAdminRoute><UserManagement /></ProtectedAdminRoute>} />
            <Route path="/bootstrap-admin" element={<BootstrapAdmin />} />
            <Route path="/profile-debug" element={<ProfileDebug />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;