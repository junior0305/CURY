import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Settings, Zap, Globe, RefreshCcw } from "lucide-react";
import UserManagement from "@/components/admin/UserManagement";
import AdminStats from "@/components/admin/AdminStats";
import LeadDistribution from "@/components/admin/LeadDistribution";
import IntegrationsManagement from "@/components/admin/IntegrationsManagement";
import LeadRework from "@/components/admin/LeadRework";

const Admin = () => {
  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">
            Dashboard <span className="text-indigo-600">Admin</span>
          </h1>
          <div className="flex items-center gap-2 text-sm text-gray-500 bg-white px-4 py-2 rounded-full shadow-sm">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Sistema em Tempo Real
          </div>
        </div>

        <AdminStats />

        <Tabs defaultValue="users" className="w-full">
          <TabsList className="grid w-full grid-cols-5 h-14 bg-white shadow-lg rounded-2xl p-1.5 border border-indigo-50 mb-8">
            <TabsTrigger value="users" className="flex items-center gap-2 data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-xl transition-all font-semibold text-base">
              <Users className="w-5 h-5" />
              Equipe
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
                <CardTitle className="text-2xl font-bold text-gray-800">Gestão de Equipe</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <UserManagement />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="leads" className="mt-0 outline-none">
            <div className="space-y-6">
               <LeadDistribution />
            </div>
          </TabsContent>

          <TabsContent value="rework" className="mt-0 outline-none">
            <LeadRework />
          </TabsContent>

          <TabsContent value="integrations" className="mt-0 outline-none">
            <IntegrationsManagement />
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