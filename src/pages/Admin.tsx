import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Settings, Zap, Globe, RefreshCcw, ShieldCheck, UserCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import UserManagement from "@/components/admin/UserManagement";
import AdminStats from "@/components/admin/AdminStats";
import LeadDistribution from "@/components/admin/LeadDistribution";
import IntegrationsManagement from "@/components/admin/IntegrationsManagement";
import LeadRework from "@/components/admin/LeadRework";
import { getMockUsers } from "@/data/mock-users";
import { User } from "@/types/user";

const Admin = () => {
  const allUsers = getMockUsers();
  const [currentUser, setCurrentUser] = useState<User>(allUsers[0]);
  const isSuper = currentUser.role === 'SUPERINTENDENT';

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
              <span className="text-[10px] font-bold text-gray-400">SIMULAR LOGIN:</span>
              <Select value={currentUser.id} onValueChange={(id) => setCurrentUser(allUsers.find(u => u.id === id)!)}>
                <SelectTrigger className="h-6 border-none p-0 focus:ring-0 text-indigo-600 font-bold"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="u1">Alice (Super)</SelectItem><SelectItem value="u2">Bob (Gerente)</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <AdminStats currentUser={currentUser} />

        <Tabs defaultValue="users" className="w-full">
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