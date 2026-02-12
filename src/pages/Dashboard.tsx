import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  Loader2,
  PlusCircle,
  LogOut,
  Target,
  Users2,
  Calendar,
  FileText,
  BarChart3,
  BellRing,
  Trophy,
  LayoutDashboard,
  CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import LeadForm from "@/components/broker/LeadForm";
import LeadList from "@/components/broker/LeadList";
import LeadDetail from "@/components/broker/LeadDetail";
import AchievementTicker from "@/components/dashboard/AchievementTicker";
import CampaignHeroBanner from "@/components/dashboard/CampaignHeroBanner";
import { MissionToday } from "@/components/broker/MissionToday";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { fetchLeadsForDashboard } from "@/integrations/supabase/leads";
import { fetchProfiles } from "@/integrations/supabase/profiles";
import type { Lead, LeadStatus } from "@/types/lead";
import type { User } from "@/types/user";
import { Badge } from "@/components/ui/badge";
import TaskCenter from "@/components/broker/TaskCenter";
import TaskForm from "@/components/broker/TaskForm";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import BrokerKPIs from "@/components/dashboard/BrokerKPIs";
import LeaderboardPodium from "@/components/dashboard/LeaderboardPodium";
import { useAudioArena } from "@/hooks/use-audio-arena";
import { Volume2, VolumeX } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMediaQuery } from "@/hooks/use-media-query";

const Dashboard = () => {
  const { user, role, loading, signOut } = useAuth();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { playSound } = useAudioArena();
  
  // States
  const [activeTab, setActiveTab] = useState("mission"); // 'mission', 'lead', 'stats'
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isLeadFormOpen, setIsLeadFormOpen] = useState(false);
  const [filter, setFilter] = useState<LeadStatus | "ACTIVE" | "ALL">("ACTIVE");
  
  // Data Fetching
  const { data: leads = [] } = useQuery<Lead[]>({
    queryKey: ["dashboardLeads"],
    queryFn: fetchLeadsForDashboard,
  });

  const { data: profiles = [] } = useQuery<User[]>({
    queryKey: ["profiles"],
    queryFn: fetchProfiles,
  });

  // Derived Data
  const userName = useMemo(() => {
    const email = user?.email ?? "";
    return email.split("@")[0] || "Corretor";
  }, [user?.email]);

  const stats = useMemo(() => {
    const isPowerUser = role === 'SUPERINTENDENT' || role === 'ADMIN';
    const displayLeads = isPowerUser ? leads : leads.filter(l => l.brokerId === user?.id);

    return {
      total: displayLeads.length,
      new: displayLeads.filter(l => l.status === 'NEW').length,
      in_progress: displayLeads.filter(l => l.status === 'IN_PROGRESS').length,
      visits: displayLeads.filter(l => l.status === 'VISIT_SCHEDULED').length,
      docs: displayLeads.filter(l => l.status === 'DOCS_REQUESTED').length,
      concluded: displayLeads.filter(l => l.status === 'CONCLUDED').length
    };
  }, [leads, user?.id, role]);

  // Effects (Audio & Nudges)
  useEffect(() => {
    // Monitoramento de Novos Leads para disparar áudio
    if (!user?.id) return;

    const channel = supabase
      .channel('new-leads-audio')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'leads',
          filter: `broker_id=eq.${user.id}`
        },
        (payload) => {
          console.log("[Dashboard] NOVO LEAD RECEBIDO! Disparando som...", payload.new);
          playSound('NEW_LEAD');
          
          // Opcional: Toast para reforçar visualmente usando sonner
          toast.info(`🚀 Novo Lead: ${payload.new.name}`, {
            description: "Atenda o mais rápido possível para garantir a conversão!",
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, playSound]);

  // Layout Logic
  const handleLeadSelect = (id: string) => {
    setSelectedLeadId(id);
    if (!isDesktop) setActiveTab("lead");
  };

  const handleBackToList = () => {
    setSelectedLeadId(null);
    if (!isDesktop) setActiveTab("mission");
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
  }

  // --- MOBILE LAYOUT ---
  if (!isDesktop) {
    return (
      <div className="flex flex-col h-screen bg-[#F8FAFC]">
        <header className="flex-none p-4 bg-white border-b flex justify-between items-center">
          <h1 className="font-black text-slate-900">CRM <span className="text-indigo-600">Mobile</span></h1>
          <div className="flex gap-2">
             <Sheet open={isLeadFormOpen} onOpenChange={setIsLeadFormOpen}>
              <SheetTrigger asChild>
                <Button size="sm" variant="outline" className="rounded-full"><PlusCircle className="w-4 h-4" /></Button>
              </SheetTrigger>
              <LeadForm onOpenChange={setIsLeadFormOpen} brokerId={user?.id || ""} />
            </Sheet>
            <Button size="sm" variant="ghost" onClick={signOut}><LogOut className="w-4 h-4 text-rose-500" /></Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 pb-20">
          {activeTab === 'mission' && (
            <div className="space-y-6">
              <MissionToday brokerId={user?.id || ""} onSelectLead={handleLeadSelect} />
              <div className="space-y-3">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Pipeline</h3>
                <LeadList selectedLeadId={null} onSelectLead={handleLeadSelect} currentUserRole={role} filter={filter} />
              </div>
            </div>
          )}

          {activeTab === 'lead' && (
            selectedLeadId ? (
              <LeadDetail leadId={selectedLeadId} onLeadUpdated={() => {}} onBack={handleBackToList} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <Target className="w-12 h-12 mb-2 opacity-20" />
                <p>Selecione um lead na Missão</p>
                <Button variant="link" onClick={() => setActiveTab("mission")}>Voltar</Button>
              </div>
            )
          )}

          {activeTab === 'stats' && (
            <div className="space-y-6">
              <CampaignHeroBanner leads={leads} users={profiles} />
              <LeaderboardPodium leads={leads} users={profiles} />
            </div>
          )}
        </main>

        <nav className="flex-none bg-white border-t flex justify-around p-2 pb-safe">
          <NavButton icon={LayoutDashboard} label="Missão" active={activeTab === 'mission'} onClick={() => setActiveTab('mission')} />
          <NavButton icon={Target} label="Lead Atual" active={activeTab === 'lead'} onClick={() => setActiveTab('lead')} />
          <NavButton icon={Trophy} label="Ranking" active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} />
        </nav>
      </div>
    );
  }

  // --- DESKTOP COCKPIT LAYOUT ---
  return (
    <div className="h-screen flex flex-col bg-[#F8FAFC] overflow-hidden">
      <AchievementTicker />
      
      <header className="h-14 bg-white border-b flex items-center justify-between px-6 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white"><Target className="h-5 w-5" /></div>
          <span className="font-bold text-slate-900 tracking-tight">Cockpit de Vendas</span>
        </div>
        <div className="flex items-center gap-2">
           <Sheet open={isLeadFormOpen} onOpenChange={setIsLeadFormOpen}>
              <SheetTrigger asChild>
                <Button className="rounded-full bg-indigo-600 hover:bg-indigo-700 font-bold h-9">
                  <PlusCircle className="w-4 h-4 mr-2" /> Novo Lead
                </Button>
              </SheetTrigger>
              <LeadForm onOpenChange={setIsLeadFormOpen} brokerId={user?.id || ""} />
            </Sheet>
            <Button variant="ghost" size="icon" onClick={signOut} className="text-slate-400 hover:text-rose-600"><LogOut className="w-4 h-4" /></Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* COLUNA 1: AGENDA & LISTA (30%) */}
        <aside className="w-[380px] flex flex-col border-r bg-white z-10 shadow-sm">
          <div className="p-4 border-b bg-indigo-50/50">
            <MissionToday brokerId={user?.id || ""} onSelectLead={handleLeadSelect} />
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <div className="mb-2 px-2 pt-2">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Carteira Total</h3>
              {/* Filtros rápidos de Pipeline */}
              <div className="flex gap-1 mb-3 overflow-x-auto pb-2 scrollbar-hide">
                <PipelineBadge label="Novos" count={stats.new} active={filter === 'NEW'} onClick={() => setFilter('NEW')} color="sky" />
                <PipelineBadge label="Atend." count={stats.in_progress} active={filter === 'IN_PROGRESS'} onClick={() => setFilter('IN_PROGRESS')} color="indigo" />
                <PipelineBadge label="Visita" count={stats.visits} active={filter === 'VISIT_SCHEDULED'} onClick={() => setFilter('VISIT_SCHEDULED')} color="emerald" />
                <PipelineBadge label="Docs" count={stats.docs} active={filter === 'DOCS_REQUESTED'} onClick={() => setFilter('DOCS_REQUESTED')} color="amber" />
              </div>
            </div>
            <LeadList selectedLeadId={selectedLeadId} onSelectLead={handleLeadSelect} currentUserRole={role} filter={filter} compact={true} />
          </div>
        </aside>

        {/* COLUNA 2: AÇÃO (50%) */}
        <main className="flex-1 bg-slate-50/50 relative flex flex-col min-w-[500px]">
          {selectedLeadId ? (
            <LeadDetail leadId={selectedLeadId} onLeadUpdated={() => {}} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
              <Target className="w-24 h-24 mb-4 opacity-20" />
              <p className="text-lg font-medium">Selecione um lead ao lado para iniciar a missão</p>
            </div>
          )}
        </main>

        {/* COLUNA 3: GLÓRIA (20%) */}
        <aside className="w-[320px] flex flex-col border-l bg-white overflow-y-auto">
          <div className="p-4 space-y-6">
            <CampaignHeroBanner leads={leads} users={profiles} />
            
            <div className="space-y-3">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Trophy className="w-3 h-3" /> Hall da Fama
              </h3>
              <LeaderboardPodium leads={leads} users={profiles} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

// Subcomponentes visuais
const NavButton = ({ icon: Icon, label, active, onClick }: any) => (
  <button onClick={onClick} className={cn("flex flex-col items-center p-2 rounded-xl transition-all", active ? "text-indigo-600 bg-indigo-50" : "text-slate-400")}>
    <Icon className={cn("w-6 h-6 mb-1", active && "fill-current")} />
    <span className="text-[10px] font-bold">{label}</span>
  </button>
);

const PipelineBadge = ({ label, count, active, onClick, color }: any) => {
  const colors: any = {
    sky: "bg-sky-100 text-sky-700 border-sky-200",
    indigo: "bg-indigo-100 text-indigo-700 border-indigo-200",
    emerald: "bg-emerald-100 text-emerald-700 border-emerald-200",
    amber: "bg-amber-100 text-amber-700 border-amber-200",
  };
  return (
    <button onClick={onClick} className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition-all whitespace-nowrap", active ? colors[color] : "bg-white border-slate-100 text-slate-500 hover:border-slate-200")}>
      {label} <span className="bg-white/50 px-1 rounded text-current">{count}</span>
    </button>
  );
};

export default Dashboard;