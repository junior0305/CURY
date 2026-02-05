import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Settings, Zap, Globe, RefreshCcw, ShieldCheck, UserCircle, Loader2 } from "lucide-react";
import UserManagement from "@/components/admin/UserManagement";
import AdminStats from "@/components/admin/AdminStats";
import LeadDistribution from "@/components/admin/LeadDistribution";
import IntegrationsManagement from "@/components/admin/IntegrationsManagement";
import LeadRework from "@/components/admin/LeadRework";
import { useAuth } from "@/components/AuthProvider";
import { User, UserRole } from "@/types/user";

const Admin = () => {
  const { user: authUser, role: userRole, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState("users");

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
      </div>
    );
  }

  // Construct a minimal User object based on authenticated session data
  const currentUser: User = {
    id: authUser?.id || 'unknown',
    name: authUser?.email || 'Admin User',
    email: authUser?.email || '',
    role: (userRole as UserRole) || 'SUPERINTENDENT',
    managerId: null,
    leadAssignmentEnabled: false,
  };
  
  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-extrabold text-gray-900">Dashboard <span className="text-indigo-600">Admin</span></h1>
            <p className="text-gray-500 mt-1 flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Nível: <b>{currentUser.role}</b></p>
          </div>
          <div className="bg-white p-3 rounded-2xl shadow-sm border border-indigo-50 flex items-center gap-3">
            <UserCircle className="w-8 h-8 text-indigo-200" />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-gray-400">LOGADO COMO:</span>
              <span className="text-indigo-600 font-bold">{currentUser.name}</span>
            </div>
          </div>
        </div>

        <AdminStats currentUser={currentUser} />

        <Tabs defaultValue="users" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-5 h-14 bg-white shadow-lg rounded-2xl p-1 mb-8">
            <TabsTrigger value="users" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-xl"><Users className="w-4 h-4 mr-2" /> Time</TabsTrigger>
            <TabsTrigger value="leads" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-xl"><Zap className="w-4 h-4 mr-2" /> Regras</TabsTrigger>
            <TabsTrigger value="rework" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-xl"><RefreshCcw className="w-4 h-4 mr-2" /> Retrabalho</TabsTrigger>
            <TabsTrigger value="integrations" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-xl"><Globe className="w-4 h-4 mr-2" /> Webhooks</TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-xl"><Settings className="w-4 h-4 mr-2" /> Ajustes</TabsTrigger>
          </TabsList>

          <TabsContent value="users"><Card className="shadow-xl border-none p-6"><UserManagement currentUser={currentUser} /></Card></TabsContent>
          <TabsContent value="leads"><LeadDistribution /></TabsContent>
          <TabsContent value="rework"><LeadRework /></TabsContent>
          <TabsContent value="integrations"><IntegrationsManagement /></TabsContent>
          <TabsContent value="settings"><Card className="p-10 text-center text-gray-400">Configurações globais em breve.</Card></TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;