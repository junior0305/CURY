import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Settings, Zap } from "lucide-react";
import UserManagement from "@/components/admin/UserManagement";

const Admin = () => {
  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-extrabold text-gray-900 mb-6 border-b pb-2">
          CRM Admin Dashboard
        </h1>

        <Tabs defaultValue="users" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-12 bg-white shadow-xl rounded-xl p-1">
            <TabsTrigger value="users" className="flex items-center gap-2 data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-lg transition-colors font-semibold">
              <Users className="w-5 h-5" />
              Gestão de Usuários
            </TabsTrigger>
            <TabsTrigger value="leads" className="flex items-center gap-2 data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-lg transition-colors font-semibold">
              <Zap className="w-5 h-5" />
              Distribuição de Leads
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2 data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-lg transition-colors font-semibold">
              <Settings className="w-5 h-5" />
              Configurações
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-6">
            <Card className="shadow-xl border-none rounded-xl">
              <CardHeader>
                <CardTitle className="text-2xl font-bold text-indigo-700">Gerenciar Equipe</CardTitle>
              </CardHeader>
              <CardContent>
                <UserManagement />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="leads" className="mt-6">
            <Card className="shadow-xl border-none rounded-xl">
              <CardHeader>
                <CardTitle className="text-2xl font-bold text-indigo-700">Configuração de Leads</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">Aqui você configurará as tags do Make e a fila de distribuição.</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="mt-6">
            <Card className="shadow-xl border-none rounded-xl">
              <CardHeader>
                <CardTitle className="text-2xl font-bold text-indigo-700">Configurações Gerais</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">Configurações gerais do sistema.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
