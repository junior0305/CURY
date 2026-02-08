import { useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Loader2, PlusCircle, LogOut, Sparkles, BellPlus, LayoutDashboard, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import LeadForm from "@/components/broker/LeadForm";
import LeadList from "@/components/broker/LeadList";
import LeadDetail from "@/components/broker/LeadDetail";
import FunnelStageCards, { FunnelFilter } from "@/components/dashboard/FunnelStageCards";
import LeaderboardPodium from "@/components/dashboard/LeaderboardPodium";
import { useQuery } from "@tanstack/react-query";
import { fetchLeadsForDashboard } from "@/integrations/supabase/leads";
import { fetchProfiles } from "@/integrations/supabase/profiles";
import type { Lead } from "@/types/lead";
import type { User } from "@/types/user";
import { Badge } from "@/components/ui/badge";
import TaskCenter from "@/components/broker/TaskCenter";
import TaskForm from "@/components/broker/TaskForm";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Zap, Flame, Calendar, Clock, Target, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";

const Dashboard = () => {
  const { user, role, loading, signOut } = useAuth();

  const [isLeadFormOpen, setIsLeadFormOpen] = useState(false);
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FunnelFilter>("ACTIVE");
  const [viewMode, setViewMode] = useState("leads");

  const { data: leads = [], refetch: refetchLeads } = useQuery<Lead[]>({
    queryKey: ["dashboardLeads"],
    queryFn: fetchLeadsForDashboard,
  });

  const { data: profiles = [] } = useQuery<User[]>({
    queryKey: ["profiles"],
    queryFn: fetchProfiles,
  });

  const userName = useMemo(() => {
    const email = user?.email ?? "";
    return email.split("@")[0] || "Corretor";
  }, [user?.email]);

  // Mission Logic: Grouping leads by "Intent and Urgency" instead of just status
  const missions = useMemo(() => {
    const now = Date.now();
    return {
      urgent: leads.filter(l => {
        const isNew = l.status === 'NEW';
        const hoursSinceCreated = (now - new Date(l.createdAt).getTime()) / (1000 * 60 * 60);
        return isNew || (l.status === 'IN_PROGRESS' && hoursSinceCreated > 24);
      }),
      pipeline: leads.filter(l => l.status === 'VISIT_SCHEDULED' || l.status === 'DOCS_REQUESTED'),
      regular: leads.filter(l => l.status === 'IN_PROGRESS'),
    };
  }, [leads]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Top chrome */}
      <header className="sticky top-0 z-30 bg-white/70 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-600 text-white shadow-sm dashboard-tilt">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 truncate">
                    Dashboard
                    <span className="text-indigo-600"> CRM</span>
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 truncate">
                    Olá, <span className="font-semibold text-slate-700">{userName}</span> — foco no próximo passo.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsTaskFormOpen(true)}
                className="rounded-2xl bg-white/70 backdrop-blur border-slate-200 hover:bg-white h-10 sm:h-11"
              >
                <BellPlus className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Nova Tarefa</span>
                <span className="sm:hidden">Tarefa</span>
              </Button>

              <Sheet open={isLeadFormOpen} onOpenChange={setIsLeadFormOpen}>
                <SheetTrigger asChild>
                  <Button className="rounded-2xl bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-100 h-10 sm:h-11">
                    <PlusCircle className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Novo Lead</span>
                    <span className="sm:hidden">Lead</span>
                  </Button>
                </SheetTrigger>
                <LeadForm
                  onOpenChange={setIsLeadFormOpen}
                  brokerId={user?.id || ""}
                  managerId={(user as any)?.user_metadata?.manager_id || null}
                />
              </Sheet>

              <div className="h-8 w-px bg-slate-200 mx-1 hidden sm:block" />

              <Button
                variant="ghost"
                className="rounded-2xl hover:bg-rose-50 hover:text-rose-700 h-10 sm:h-11"
                onClick={signOut}
                title="Sair"
              >
                <LogOut className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline text-xs font-bold uppercase tracking-wider">Sair</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <TaskForm
        open={isTaskFormOpen}
        onOpenChange={setIsTaskFormOpen}
        userId={user?.id || ""}
        leads={leads}
        defaultLeadId={selectedLeadId}
      />

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
        <div className="relative">
          <section className="relative mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
                <Target className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-3xl font-black tracking-tight">Painel de Missões</h2>
                <p className="text-slate-500 font-medium text-sm">Pare de "olhar leads" e comece a "executar vendas".</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Mission 1: Speed to Lead */}
              <Card className="relative overflow-hidden rounded-3xl border-none bg-white shadow-[0_20px_50px_-20px_rgba(225,29,72,0.3)] ring-1 ring-rose-100 transition-all hover:scale-[1.02]">
                <div className="absolute top-0 right-0 p-4">
                  <Flame className="h-6 w-6 text-rose-500 animate-pulse" />
                </div>
                <div className="p-6">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 bg-rose-50 px-2 py-1 rounded-full">Urgente</span>
                  <h3 className="text-xl font-extrabold mt-3">Fogo no Funil</h3>
                  <p className="text-sm text-slate-500 mt-1">Leads novos ou sem resposta.</p>
                  <div className="mt-6 flex items-end justify-between">
                    <span className="text-4xl font-black text-slate-900">{missions.urgent.length}</span>
                    <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50 font-bold" onClick={() => {setFilter('NEW'); setViewMode('leads');}}>Resolver Agora</Button>
                  </div>
                </div>
              </Card>

              {/* Mission 2: Money in the Pipeline */}
              <Card className="relative overflow-hidden rounded-3xl border-none bg-white shadow-[0_20px_50px_-20px_rgba(79,70,229,0.3)] ring-1 ring-indigo-100 transition-all hover:scale-[1.02]">
                <div className="absolute top-0 right-0 p-4">
                  <Zap className="h-6 w-6 text-indigo-500" />
                </div>
                <div className="p-6">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 bg-indigo-50 px-2 py-1 rounded-full">Pipeline</span>
                  <h3 className="text-xl font-extrabold mt-3">Dinheiro na Mesa</h3>
                  <p className="text-sm text-slate-500 mt-1">Visitas e Documentação.</p>
                  <div className="mt-6 flex items-end justify-between">
                    <span className="text-4xl font-black text-slate-900">{missions.pipeline.length}</span>
                    <Button variant="ghost" size="sm" className="text-indigo-600 hover:bg-indigo-50 font-bold" onClick={() => {setFilter('VISIT_SCHEDULED'); setViewMode('leads');}}>Fechar Venda</Button>
                  </div>
                </div>
              </Card>

              {/* Mission 3: Follow-up Control */}
              <Card className="relative overflow-hidden rounded-3xl border-none bg-white shadow-[0_20px_50px_-20px_rgba(16,185,129,0.3)] ring-1 ring-emerald-100 transition-all hover:scale-[1.02]">
                <div className="absolute top-0 right-0 p-4">
                  <Calendar className="h-6 w-6 text-emerald-500" />
                </div>
                <div className="p-6">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 bg-emerald-50 px-2 py-1 rounded-full">Rotina</span>
                  <h3 className="text-xl font-extrabold mt-3">Controle de Fluxo</h3>
                  <p className="text-sm text-slate-500 mt-1">Manter a cadência ativa.</p>
                  <div className="mt-6 flex items-end justify-between">
                    <span className="text-4xl font-black text-slate-900">{missions.regular.length}</span>
                    <Button variant="ghost" size="sm" className="text-emerald-600 hover:bg-emerald-50 font-bold" onClick={() => {setFilter('IN_PROGRESS'); setViewMode('leads');}}>Dar Feedback</Button>
                  </div>
                </div>
              </Card>
            </div>
          </section>

          <Tabs value={viewMode} onValueChange={setViewMode} className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <TabsList className="bg-slate-200/50 p-1 rounded-2xl h-12 shadow-inner ring-1 ring-slate-200">
                <TabsTrigger value="leads" className="rounded-xl px-6 data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-md font-bold text-xs transition-all">
                  <LayoutDashboard className="w-4 h-4 mr-2" />
                  Mural de Vendas
                </TabsTrigger>
                <TabsTrigger value="performance" className="rounded-xl px-6 data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-md font-bold text-xs transition-all">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Performance
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="leads" className="mt-0 outline-none">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-4 space-y-6">
                  <TaskCenter
                    leads={leads}
                    onOpenLead={(id) => {
                      setSelectedLeadId(id);
                      setFilter("ALL");
                    }}
                  />
                  <LeadList
                    selectedLeadId={selectedLeadId}
                    onSelectLead={setSelectedLeadId}
                    currentUserRole={role || "BROKER"}
                    filter={filter}
                  />
                </div>

                <div className="lg:col-span-8">
                  <LeadDetail leadId={selectedLeadId} onLeadUpdated={() => setSelectedLeadId(null)} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="performance" className="mt-0 outline-none">
              <div className="max-w-4xl">
                <LeaderboardPodium leads={leads} users={profiles} />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;