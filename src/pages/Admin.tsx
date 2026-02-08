import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Settings, Zap, Globe, RefreshCcw, ShieldCheck, UserCircle, Loader2, Group, History, CheckCircle, AlertCircle } from "lucide-react";
import UserManagement from "@/components/admin/UserManagement";
import TeamManagement from "@/components/admin/TeamManagement";
import AdminStats from "@/components/admin/AdminStats";
import LeadDistribution from "@/components/admin/LeadDistribution";
import IntegrationsManagement from "@/components/admin/IntegrationsManagement";
import LeadRework from "@/components/admin/LeadRework";
import { useAuth } from "@/components/AuthProvider";
import { User, UserRole } from "@/types/user";
import { useQuery } from "@tanstack/react-query";
import { fetchProfiles } from "@/integrations/supabase/profiles";
import { fetchLeadsForAdmin } from "@/integrations/supabase/leads";
import type { Lead } from "@/types/lead";
import LeaderboardPodium from "@/components/dashboard/LeaderboardPodium";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, Badge } from "lucide-react";

const Admin = () => {
  const { user: authUser, role: userRole, loading: authLoading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState("users");

  const { data: profiles = [] } = useQuery<User[]>({
    queryKey: ["profiles"],
    queryFn: fetchProfiles,
  });

  const { data: leads = [] } = useQuery<Lead[]>({
    queryKey: ["adminLeads"],
    queryFn: fetchLeadsForAdmin,
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
      </div>
    );
  }

  const currentUser: User = {
    id: authUser?.id || "unknown",
    name: authUser?.email || "Admin User",
    email: authUser?.email || "",
    role: (userRole as UserRole) || "SUPERINTENDENT",
    managerId: null,
    teamId: null,
    leadAssignmentEnabled: false,
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-extrabold text-gray-900">
              Dashboard <span className="text-indigo-600">Admin</span>
            </h1>
            <p className="text-gray-500 mt-1 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Nível: <b>{currentUser.role}</b>
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-white p-3 rounded-2xl shadow-sm border border-indigo-50 flex items-center gap-3">
              <UserCircle className="w-8 h-8 text-indigo-200" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-gray-400">LOGADO COMO:</span>
                <span className="text-indigo-600 font-bold">{currentUser.name}</span>
              </div>
            </div>
            <Button 
              variant="outline" 
              onClick={signOut}
              className="rounded-2xl border-rose-100 text-rose-600 hover:bg-rose-50 hover:text-rose-700 h-12 px-6 font-bold shadow-sm transition-all"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>

        <AdminStats currentUser={currentUser} />

        <div className="mb-8">
          <LeaderboardPodium
            leads={leads}
            users={profiles}
            title="Pódio de Performance"
            subtitle="Ranking do time (proxy baseado em avanço no funil)"
          />
        </div>

        <Tabs defaultValue="users" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-7 h-14 bg-white shadow-lg rounded-2xl p-1 mb-8">
            <TabsTrigger value="users" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-xl text-xs sm:text-sm"><Users className="w-4 h-4 mr-2" /> Time</TabsTrigger>
            <TabsTrigger value="teams" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-xl text-xs sm:text-sm"><Group className="w-4 h-4 mr-2" /> Equipes</TabsTrigger>
            <TabsTrigger value="leads" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-xl text-xs sm:text-sm"><Zap className="w-4 h-4 mr-2" /> Regras</TabsTrigger>
            <TabsTrigger value="logs" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-xl text-xs sm:text-sm"><History className="w-4 h-4 mr-2" /> Logs</TabsTrigger>
            <TabsTrigger value="rework" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-xl text-xs sm:text-sm"><RefreshCcw className="w-4 h-4 mr-2" /> Retrabalho</TabsTrigger>
            <TabsTrigger value="integrations" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-xl text-xs sm:text-sm"><Globe className="w-4 h-4 mr-2" /> Webhooks</TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-xl text-xs sm:text-sm"><Settings className="w-4 h-4 mr-2" /> Ajustes</TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card className="shadow-xl border-none p-6">
              <UserManagement currentUser={currentUser} />
            </Card>
          </TabsContent>
          <TabsContent value="teams">
            <Card className="shadow-xl border-none p-6">
              <TeamManagement />
            </Card>
          </TabsContent>
          <TabsContent value="leads">
            <LeadDistribution />
          </TabsContent>
          <TabsContent value="logs">
            <DistributionLogs />
          </TabsContent>
          <TabsContent value="rework">
            <LeadRework />
          </TabsContent>
          <TabsContent value="integrations">
            <IntegrationsManagement />
          </TabsContent>
          <TabsContent value="settings">
            <Card className="p-10 text-center text-gray-400">Configurações globais em breve.</Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

const DistributionLogs = () => {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['distribution-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('distribution_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000 // Atualiza a cada 10 segundos
  });

  return (
    <Card className="shadow-xl border-none p-6 bg-white rounded-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Histórico de Entrada (Make)</h2>
          <p className="text-sm text-slate-500">Acompanhe quem recebeu cada lead em tempo real.</p>
        </div>
        {isLoading && <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-4 py-3 text-left font-bold text-slate-700">Data/Hora</th>
              <th className="px-4 py-3 text-left font-bold text-slate-700">Lead</th>
              <th className="px-4 py-3 text-left font-bold text-slate-700">Regra (Tag)</th>
              <th className="px-4 py-3 text-left font-bold text-slate-700">Corretor Destino</th>
              <th className="px-4 py-3 text-left font-bold text-slate-700">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {logs.length === 0 && !isLoading ? (
              <tr><td colSpan={5} className="py-10 text-center text-slate-400 italic">Nenhum lead recebido ainda via integração externa.</td></tr>
            ) : (
              logs.map((log: any) => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {new Date(log.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-900">{log.lead_name}</div>
                    <div className="text-[10px] text-slate-400">{log.lead_phone}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="bg-slate-100 border-none font-bold text-[10px] uppercase">{log.queue_name}</Badge>
                  </td>
                  <td className="px-4 py-3 font-medium text-indigo-600">
                    {log.assigned_to_name}
                  </td>
                  <td className="px-4 py-3">
                    {log.status === 'SUCCESS' ? (
                      <span className="flex items-center text-xs text-green-600 font-bold">
                        <CheckCircle className="w-3 h-3 mr-1" /> OK
                      </span>
                    ) : (
                      <span className="flex items-center text-xs text-rose-600 font-bold">
                        <AlertCircle className="w-3 h-3 mr-1" /> FALHOU
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

export default Admin;