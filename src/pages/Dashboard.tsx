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
  CheckCircle2,
  Sparkles
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
import { IntelTacticsModal } from "@/components/broker/IntelTacticsModal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const Dashboard = () => {
  const { user, role, loading, signOut } = useAuth();
  const [isIntelOpen, setIsIntelOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { playSound } = useAudioArena();
  
  // States
  const [activeTab, setActiveTab] = useState("mission"); // 'mission', 'lead', 'stats'
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isLeadFormOpen, setIsLeadFormOpen] = useState(false);
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
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
        {/* Ticker de Conquistas Fixo no Topo Mobile */}
        <div className="flex-none z-50">
          <AchievementTicker />
        </div>

        <header className="flex-none p-4 bg-white border-b flex justify-between items-center shadow-sm z-40">
           <div className="flex items-center gap-2">
             <Avatar className="h-9 w-9 border-2 border-indigo-100">
               <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email}`} />
               <AvatarFallback className="bg-indigo-600 text-white font-black text-xs">
                 {userName.substring(0, 2).toUpperCase()}
               </AvatarFallback>
             </Avatar>
             <div>
                <h1 className="font-black text-slate-900 text-sm leading-none">{userName}</h1>
                <p className="text-[10px] font-bold text-indigo-600 uppercase">Agente Tático</p>
             </div>
           </div>
           
           <div className="flex gap-2">
             <Button 
               size="sm" 
               variant="outline" 
               className="rounded-full border-indigo-100 text-indigo-600 bg-indigo-50 h-9 w-9 p-0"
               onClick={() => setIsIntelOpen(true)}
             >
               <BarChart3 className="w-4 h-4" />
             </Button>

             <Sheet open={isLeadFormOpen} onOpenChange={setIsLeadFormOpen}>
              <SheetTrigger asChild>
                <Button size="sm" className="rounded-full bg-indigo-600 h-9 w-9 p-0 shadow-md shadow-indigo-200"><PlusCircle className="w-5 h-5" /></Button>
              </SheetTrigger>
              <LeadForm onOpenChange={setIsLeadFormOpen} brokerId={user?.id || ""} />
            </Sheet>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 pb-20">
          {activeTab === 'mission' && (
            <div className="space-y-6">
              {/* Banner de Campanha no Topo da Missão */}
              <CampaignHeroBanner leads={leads} users={profiles} />
              
              {/* Cards de Pipeline (Grid 2 colunas) */}
              <div className="grid grid-cols-2 gap-2">
                <PipelineStat label="Novos" count={stats.new} active={filter === 'NEW'} onClick={() => setFilter('NEW')} color="sky" icon={Sparkles} compact />
                <PipelineStat label="Atend." count={stats.in_progress} active={filter === 'IN_PROGRESS'} onClick={() => setFilter('IN_PROGRESS')} color="indigo" icon={Users2} compact />
                <PipelineStat label="Visita" count={stats.visits} active={filter === 'VISIT_SCHEDULED'} onClick={() => setFilter('VISIT_SCHEDULED')} color="emerald" icon={Calendar} compact />
                <PipelineStat label="Docs" count={stats.docs} active={filter === 'DOCS_REQUESTED'} onClick={() => setFilter('DOCS_REQUESTED')} color="amber" icon={FileText} compact />
              </div>

              {/* Agenda do Dia */}
              <MissionToday brokerId={user?.id || ""} onSelectLead={handleLeadSelect} />
              
              {/* Lista Completa */}
              <div className="space-y-3">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Pipeline Geral</h3>
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
            <div className="space-y-6 pt-4">
              <h2 className="text-xl font-black text-slate-900 text-center uppercase tracking-tight">Ranking de Elite</h2>
              <LeaderboardPodium leads={leads} users={profiles} />
            </div>
          )}
        </main>
        
        {/* Modais Globais Mobile */}
        <IntelTacticsModal open={isIntelOpen} onOpenChange={setIsIntelOpen} />

        <nav className="flex-none bg-white border-t flex justify-around p-2 pb-safe z-40 relative shadow-[0_-5px_10px_rgba(0,0,0,0.02)]">
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
      <IntelTacticsModal open={isIntelOpen} onOpenChange={setIsIntelOpen} />
      
      <header className="h-14 bg-white border-b flex items-center justify-between px-6 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white"><Target className="h-5 w-5" /></div>
          <span className="font-bold text-slate-900 tracking-tight hidden sm:inline">QG de Vendas</span>
        </div>
        
        <div className="flex items-center gap-3">
           <Button 
             variant="outline" 
             size="sm" 
             onClick={() => setIsIntelOpen(true)}
             className="hidden sm:flex items-center gap-2 rounded-full border-indigo-100 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 font-bold h-9 px-4 shadow-sm"
           >
             <BarChart3 className="w-4 h-4" />
             Intel Tática
           </Button>

           <div className="h-6 w-[1px] bg-slate-200 mx-1 hidden sm:block" />

           <div className="flex items-center gap-2 mr-2">
             <div className="text-right hidden sm:block">
               <p className="text-xs font-bold text-slate-900 leading-none">{userName}</p>
               <p className="text-[10px] font-medium text-slate-500 uppercase">{role === 'BROKER' ? 'Agente de Campo' : role}</p>
             </div>
             <Avatar className="h-8 w-8 border-2 border-white shadow-sm cursor-pointer hover:scale-105 transition-transform">
               <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email}`} />
               <AvatarFallback className="bg-indigo-600 text-white font-black text-xs">
                 {userName.substring(0, 2).toUpperCase()}
               </AvatarFallback>
             </Avatar>
           </div>

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

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-[1800px] mx-auto p-4 space-y-6">
          
          {/* TOPO: BANNER DA CAMPANHA (Horizontal) */}
          <section className="w-full">
            <CampaignHeroBanner leads={leads} users={profiles} />
          </section>

          {/* MEIO: ÁREA DE TRABALHO (Split View) */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[700px]">
            {/* Coluna Esquerda: Agenda e Lista (4 colunas) */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              <Card className="p-0 overflow-hidden border-none shadow-md bg-white">
                <div className="p-3 bg-indigo-50/50 border-b border-indigo-100">
                  <MissionToday brokerId={user?.id || ""} onSelectLead={handleLeadSelect} />
                </div>
              </Card>
              
              {/* CARDS DE PIPELINE (Trazidos de volta em formato Grid Compacto) */}
              <div className="grid grid-cols-2 gap-2">
                <PipelineStat 
                  label="Novos" 
                  count={stats.new} 
                  active={filter === 'NEW'} 
                  onClick={() => {setFilter('NEW'); setSelectedLeadId(null);}}
                  color="sky"
                  icon={Sparkles}
                  compact
                />
                <PipelineStat 
                  label="Atendimento" 
                  count={stats.in_progress} 
                  active={filter === 'IN_PROGRESS'} 
                  onClick={() => {setFilter('IN_PROGRESS'); setSelectedLeadId(null);}}
                  color="indigo"
                  icon={Users2}
                  compact
                />
                <PipelineStat 
                  label="Visitas" 
                  count={stats.visits} 
                  active={filter === 'VISIT_SCHEDULED'} 
                  onClick={() => {setFilter('VISIT_SCHEDULED'); setSelectedLeadId(null);}}
                  color="emerald"
                  icon={Calendar}
                  compact
                />
                <PipelineStat 
                  label="Documentação" 
                  count={stats.docs} 
                  active={filter === 'DOCS_REQUESTED'} 
                  onClick={() => {setFilter('DOCS_REQUESTED'); setSelectedLeadId(null);}}
                  color="amber"
                  icon={FileText}
                  compact
                />
              </div>

              <Card className="flex-1 flex flex-col overflow-hidden border-slate-200 shadow-sm min-h-[400px]">
                <div className="p-3 border-b bg-slate-50 flex justify-between items-center">
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Carteira Total</h3>
                  <Badge variant="outline" className="text-[10px]">{leads.filter(l => l.brokerId === user?.id).length} Leads</Badge>
                </div>
                <div className="flex-1 overflow-y-auto p-2 bg-white">
                  <LeadList selectedLeadId={selectedLeadId} onSelectLead={handleLeadSelect} currentUserRole={role} filter={filter} compact={true} />
                </div>
              </Card>
            </div>

            {/* Coluna Direita: Ação / Detalhe (8 colunas) */}
            <div className="lg:col-span-8 h-full min-h-[600px] mb-20">
              {selectedLeadId ? (
                <LeadDetail leadId={selectedLeadId} onLeadUpdated={() => {}} />
              ) : (
                <Card className="h-full flex flex-col items-center justify-center text-slate-300 border-dashed border-2 bg-slate-50/50 shadow-none">
                  <div className="bg-white p-6 rounded-full shadow-sm mb-4">
                    <Target className="w-12 h-12 text-indigo-200" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-700">Pronto para o Combate?</h3>
                  <p className="text-sm font-medium">Selecione um alvo na lista ao lado para iniciar a missão.</p>
                </Card>
              )}
            </div>
          </section>

          {/* RODAPÉ: HALL DA FAMA (Horizontal - Com margem de segurança) */}
          <section className="w-full pb-10 pt-10 border-t border-slate-200 mt-10">
            <div className="flex items-center gap-2 mb-6 justify-center">
              <Trophy className="h-6 w-6 text-amber-500" />
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Ranking de Elite</h2>
            </div>
            <LeaderboardPodium leads={leads} users={profiles} />
          </section>

        </div>
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

const PipelineStat = ({ label, count, active, onClick, color, icon: Icon, compact }: any) => {
  const colors: any = {
    sky: active ? "bg-sky-600 text-white" : "bg-sky-50 text-sky-700 border-sky-100",
    indigo: active ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-700 border-indigo-100",
    emerald: active ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: active ? "bg-amber-600 text-white" : "bg-amber-50 text-amber-700 border-amber-100",
    slate: active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 border-slate-200",
  };

  return (
    <button onClick={onClick} className={cn("flex flex-col rounded-2xl border transition-all duration-300 text-left relative overflow-hidden group", colors[color], active ? "shadow-md scale-[1.02] ring-2 ring-offset-1 ring-indigo-500" : "hover:border-slate-300 shadow-sm", compact ? "p-3" : "p-4")}>
      <div className="flex items-center justify-between w-full">
        <p className={cn("font-bold uppercase tracking-wider opacity-80 truncate", compact ? "text-[9px]" : "text-[11px]", active ? "text-white" : "text-slate-500")}>{label}</p>
        <Icon className={cn(compact ? "h-3 w-3" : "h-4 w-4", active ? "text-white" : "")} />
      </div>
      <p className={cn("font-black tracking-tighter mt-1", compact ? "text-xl" : "text-3xl")}>{count}</p>
    </button>
  );
};

export default Dashboard;