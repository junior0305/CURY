import { useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Loader2, PlusCircle, LogOut, Sparkles, BellPlus, LayoutDashboard, Target, Users2, TrendingUp, Calendar, FileText, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import LeadForm from "@/components/broker/LeadForm";
import LeadList from "@/components/broker/LeadList";
import LeadDetail from "@/components/broker/LeadDetail";
import { useQuery } from "@tanstack/react-query";
import { fetchLeadsForDashboard } from "@/integrations/supabase/leads";
import { fetchProfiles } from "@/integrations/supabase/profiles";
import type { Lead, LeadStatus } from "@/types/lead";
import type { User } from "@/types/user";
import { Badge } from "@/components/ui/badge";
import TaskForm from "@/components/broker/TaskForm";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import LeaderboardPodium from "@/components/dashboard/LeaderboardPodium";

const Dashboard = () => {
  const { user, role, loading, signOut } = useAuth();

  const [isLeadFormOpen, setIsLeadFormOpen] = useState(false);
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [filter, setFilter] = useState<LeadStatus | "ACTIVE" | "ALL">("ACTIVE");

  const { data: leads = [] } = useQuery<Lead[]>({
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

  const stats = useMemo(() => {
    const active = leads.filter(l => l.status !== 'ABANDONED' && l.status !== 'EXCLUDED');
    return {
      total: leads.length,
      new: leads.filter(l => l.status === 'NEW').length,
      in_progress: leads.filter(l => l.status === 'IN_PROGRESS').length,
      visits: leads.filter(l => l.status === 'VISIT_SCHEDULED').length,
      docs: leads.filter(l => l.status === 'DOCS_REQUESTED').length,
      activeCount: active.length
    };
  }, [leads]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Optimized Slim Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/60 px-6 py-3">
        <div className="max-w-[1600px] mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="h-9 w-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-indigo-200 shadow-lg">
              <Target className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-none">CRM High Performance</h1>
              <p className="text-xs text-slate-500 mt-1 font-medium italic">Foco total na conversão</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs font-bold text-slate-700">{userName}</span>
              <Badge variant="secondary" className="bg-white text-[9px] font-black uppercase tracking-tighter h-4 px-1 border-slate-300">{role}</Badge>
            </div>
            
            <Sheet open={isLeadFormOpen} onOpenChange={setIsLeadFormOpen}>
              <SheetTrigger asChild>
                <Button size="sm" className="rounded-full bg-indigo-600 hover:bg-indigo-700 px-4 font-bold shadow-md">
                  <PlusCircle className="w-4 h-4 mr-2" /> Novo Lead
                </Button>
              </SheetTrigger>
              <LeadForm
                onOpenChange={setIsLeadFormOpen}
                brokerId={user?.id || ""}
                managerId={(user as any)?.user_metadata?.manager_id || null}
              />
            </Sheet>

            <Button variant="ghost" size="icon" onClick={signOut} className="rounded-full hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6">
        {/* NEW: Competitive Podium Section (Weekly/Monthly) */}
        <section className="mb-8 flex justify-center">
          <div className="w-full max-w-4xl">
            <LeaderboardPodium 
              leads={leads} 
              users={profiles} 
              title="Elite da Semana" 
              subtitle="Quem está dominando o fechamento nesta semana"
            />
          </div>
        </section>

        {/* NEW: Unified Pipeline Stats (Horizontal Bar) */}
        <section className="mb-8">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <PipelineStat 
              label="Novos" 
              count={stats.new} 
              active={filter === 'NEW'} 
              onClick={() => setFilter('NEW')}
              color="sky"
              icon={Sparkles}
            />
            <PipelineStat 
              label="Em Atendimento" 
              count={stats.in_progress} 
              active={filter === 'IN_PROGRESS'} 
              onClick={() => setFilter('IN_PROGRESS')}
              color="indigo"
              icon={Users2}
            />
            <PipelineStat 
              label="Visitas" 
              count={stats.visits} 
              active={filter === 'VISIT_SCHEDULED'} 
              onClick={() => setFilter('VISIT_SCHEDULED')}
              color="emerald"
              icon={Calendar}
            />
            <PipelineStat 
              label="Documentação" 
              count={stats.docs} 
              active={filter === 'DOCS_REQUESTED'} 
              onClick={() => setFilter('DOCS_REQUESTED')}
              color="amber"
              icon={FileText}
            />
            <PipelineStat 
              label="Total Ativos" 
              count={stats.activeCount} 
              active={filter === 'ACTIVE'} 
              onClick={() => setFilter('ACTIVE')}
              color="slate"
              icon={TrendingUp}
            />
          </div>
        </section>

        {/* Unified Workflow Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-220px)]">
          {/* Left: The Action Queue (Leads + Tasks integrated) */}
          <div className="lg:col-span-4 flex flex-col h-full overflow-hidden">
            <LeadList
              selectedLeadId={selectedLeadId}
              onSelectLead={setSelectedLeadId}
              currentUserRole={role || "BROKER"}
              filter={filter}
            />
          </div>

          {/* Right: The Workspace (Detail + AI + Cadence) */}
          <div className="lg:col-span-8 h-full">
            <LeadDetail 
              leadId={selectedLeadId} 
              onLeadUpdated={() => setSelectedLeadId(null)} 
            />
          </div>
        </div>
      </main>

      <TaskForm
        open={isTaskFormOpen}
        onOpenChange={setIsTaskFormOpen}
        userId={user?.id || ""}
        leads={leads}
        defaultLeadId={selectedLeadId}
      />
    </div>
  );
};

// Helper component for Pipeline Stats
const PipelineStat = ({ label, count, active, onClick, color, icon: Icon }: any) => {
  const colors: any = {
    sky: active ? "bg-sky-600 text-white" : "bg-sky-50 text-sky-700 border-sky-100",
    indigo: active ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-700 border-indigo-100",
    emerald: active ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: active ? "bg-amber-600 text-white" : "bg-amber-50 text-amber-700 border-amber-100",
    slate: active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 border-slate-200",
  };

  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col p-4 rounded-3xl border transition-all duration-300 text-left relative overflow-hidden group",
        colors[color],
        active ? "shadow-lg scale-[1.02] ring-2 ring-offset-2 ring-indigo-500" : "hover:border-slate-300 shadow-sm"
      )}
    >
      <div className={cn(
        "h-8 w-8 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-110",
        active ? "bg-white/20" : "bg-white shadow-sm"
      )}>
        <Icon className={cn("h-4 w-4", active ? "text-white" : "")} />
      </div>
      <p className={cn("text-[11px] font-bold uppercase tracking-wider opacity-80", active ? "text-white" : "text-slate-500")}>{label}</p>
      <p className="text-3xl font-black mt-1 tracking-tighter">{count}</p>
      {active && <div className="absolute top-2 right-3 h-1.5 w-1.5 bg-white rounded-full animate-ping" />}
    </button>
  );
}

export default Dashboard;