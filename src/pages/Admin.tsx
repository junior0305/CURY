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
  // Simulação de troca de usuário para demonstração
  const [currentUser, setCurrentUser] = useState<User>(allUsers[0]); // Começa como Superintendente

  const isSuper = currentUser.role === 'SUPERINTENDENT';

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header com Seletor de Perfil (Simulação) */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">
              Dashboard <span className="text-indigo-600">Admin</span>
            </h1>
            <p className="text-gray-500 mt-1 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-500" />
              Nível de Acesso: <span className="font-bold text-gray-700">{currentUser.role}</span>
            </p>
          </div>

          <div className="flex items-center gap-3 bg-white p-3 rounded-2xl shadow-sm border border-indigo-50">
            <UserCircle className="w-8 h-8 text-indigo-200" />
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-gray-400 uppercase">Simular Login como:</span>
              <Select 
                value={currentUser.id} 
                onValueChange={(id) => setCurrentUser(allUsers.find(u => u.id === id)!)}
              >
                <SelectTrigger className="h-8 border-none p-0 focus:ring-0 font-bold text-indigo-600">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="u1">Alice (Superintendente)</SelectItem>
                  <SelectItem value="u2">Bob (Gerente Equipe A)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <AdminStats currentUser={currentUser} />

        <Tabs defaultValue="users" className="w-full">
          <TabsList className="grid w-full grid-cols-5 h-14 bg-white shadow-lg rounded-2xl p-1.5 border border-indigo-50 mb-8">
            <TabsTrigger value="users" className="flex items-center gap-2 data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-xl transition-all font-semibold text-base">
              <Users className="w-5 h-5" />
              {isSuper ? "Toda Equipe" : "Minha Equipe"}
            </TabsTrigger>
            <TabsTrigger value="leads" className="flex items-center gap-2 data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-xl transition-all font-semibold text-base">
              <Zap className="w-5 h-5" />
              Distribuição
            </TabsTrigger>
            <TabsTrigger value="rework" className="flex items-center gap-2 data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-xl transition-all font-semibold text-base">
              <RefreshCcw className="w-5 h-5" />
              Retrabalho
            </TabsTrigger>
            <TabsTrigger value="integrations" className="flex items-center gap-2 data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-xl transition-all font-semibold text-base">
              <Globe className="w-5 h-5" />
              Integrações
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2 data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-xl transition-all font-semibold text-base">
              <Settings className="w-5 h-5" />
              Ajustes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-0 outline-none">
            <Card className="shadow-xl border-none rounded-2xl overflow-hidden">
              <CardHeader className="bg-white border-b border-gray-50">
                <CardTitle className="text-2xl font-bold text-gray-800">
                  {isSuper ? "Gestão Global de Usuários" : "Gestão de Corretores"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <UserManagement currentUser={currentUser} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="leads" className="mt-0 outline-none">
            <LeadDistribution currentUser={currentUser} />
          </TabsContent>

          <TabsContent value="rework" className="mt-0 outline-none">
            <LeadRework currentUser={currentUser} />
          </TabsContent>

          <TabsContent value="integrations" className="mt-0 outline-none">
            <IntegrationsManagement currentUser={currentUser} />
          </TabsContent>

          <TabsContent value="settings" className="mt-0 outline-none">
            <Card className="shadow-xl border-none rounded-2xl overflow-hidden">
              <CardHeader className="bg-white border-b border-gray-50">
                <CardTitle className="text-2xl font-bold text-gray-800">Configurações Gerais</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <p className="text-gray-600 italic">As configurações do sistema estarão disponíveis em breve.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;