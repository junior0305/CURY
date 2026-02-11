import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  Loader2,
  PlusCircle,
  LogOut,
  Sparkles,
  BellPlus,
  Target,
  Users2,
  TrendingUp,
  Calendar,
  FileText,
  BarChart3,
  Flame,
  Clock,
  BellRing,
  LayoutDashboard,
  Trophy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import LeadForm from "@/components/broker/LeadForm";
import LeadList from "@/components/broker/LeadList";
import LeadDetail from "@/components/broker/LeadDetail";
import AchievementTicker from "@/components/dashboard/AchievementTicker";
import CampaignHeroBanner from "@/components/dashboard/CampaignHeroBanner";
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

const Dashboard = () => {
  const { user, role, loading, signOut } = useAuth();
  const { playSound } = useAudioArena();
  const [isMuted, setIsMuted] = useState(localStorage.getItem('crm_audio_muted') === 'true');

  const toggleMute = () => {
    const newState = !isMuted;
    setIsMuted(newState);
    localStorage.setItem('crm_audio_muted', String(newState));
  };

  const [isLeadFormOpen, setIsLeadFormOpen] = useState(false);
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [filter, setFilter] = useState<LeadStatus | "ACTIVE" | "ALL">("ACTIVE");
  const [viewMode, setViewMode] = useState("leads");
  
  // States for Leaderboard and KPIs
  const [isMonthly, setIsMonthly] = useState(false);
  const [showKPIsFor, setShowKPIsFor] = useState<{ id: string; name: string } | null>(null);

  // State for Nudge/Internal Notifications
  const [activeNudge, setActiveNudge] = useState<any | null>(null);

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

  const leadsForKPIs = useMemo(() => {
    if (!showKPIsFor) return [];
    return leads.filter(l => l.brokerId === showKPIsFor.id);
  }, [leads, showKPIsFor]);

  // Query para buscar o histórico de funil (Mantido apenas para uso futuro ou componentes filhos)
  const { data: history = [] } = useQuery({
    queryKey: ['funnel-history-dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase.from('funnel_history').select('*');
      if (error) throw error;
      return data;
    }
  });

  const stats = useMemo(() => {
    // FILTRO DE PRIVACIDADE PARA OS CARDS: O corretor SÓ deve ver a contagem dos seus próprios leads
    // Exceto se for Superintendent ou Admin (que vêem o total do time)
    const isPowerUser = role === 'SUPERINTENDENT' || role === 'ADMIN';
    const displayLeads = isPowerUser ? leads : leads.filter(l => l.brokerId === user?.id);

    // VOLTANDO PARA A LÓGICA DE "ESTADO ATUAL" (SNAPSHOT)
    // Os cards devem mostrar onde o lead está AGORA, não por onde ele passou.
    // A gamificação (Pódio/Banner) continua usando o histórico cumulativo.
    return {
      total: displayLeads.length,
      new: displayLeads.filter(l => l.status === 'NEW').length,
      in_progress: displayLeads.filter(l => l.status === 'IN_PROGRESS').length,
      visits: displayLeads.filter(l => l.status === 'VISIT_SCHEDULED').length,
      docs: displayLeads.filter(l => l.status === 'DOCS_REQUESTED').length,
      concluded: displayLeads.filter(l => l.status === 'CONCLUDED').length
    };
  }, [leads, user?.id, role]);

  // Monitoramento de Novos Leads para disparar áudio
  useEffect(() => {
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

  // Monitoramento de Cutucões (Internal Notifications)
  useEffect(() => {
    if (!user?.id) return;

    const fetchNudges = async () => {
      const { data, error } = await supabase
        .from('internal_notifications')
        .select('*')
        .eq('to_id', user.id)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setActiveNudge(data);
      }
    };

    fetchNudges();
    const interval = setInterval(fetchNudges, 10000); // Checa a cada 10s

    return () => clearInterval(interval);
  }, [user?.id]);

  const markNudgeRead = async () => {
    if (!activeNudge) return;
    await supabase
      .from('internal_notifications')
      .update({ is_read: true })
      .eq('id', activeNudge.id);
    setActiveNudge(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="sticky top-0 z-50">
        <AchievementTicker />
      </div>
      
      {/* Pop-up de Cutucão (Nudge Alert) */}
      <Dialog open={!!activeNudge} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md border-none shadow-[0_0_50px_rgba(245,158,11,0.4)] rounded-[2rem] bg-white">
          <DialogHeader className="flex flex-col items-center text-center">
            <div className="h-16 w-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4 animate-bounce">
              <BellRing className="h-8 w-8" />
            </div>
            <DialogTitle className="text-2xl font-black text-slate-900 uppercase tracking-tighter italic">
              Alerta de Gestão!
            </DialogTitle>
            <DialogDescription className="text-slate-600 font-medium text-base mt-2">
              {activeNudge?.message}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <Button 
              className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-lg shadow-indigo-100 text-sm uppercase tracking-widest"
              onClick={markNudgeRead}
            >
              Entendido, vou atender agora!
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <header className="sticky top-12 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/60 px-4 sm:px-6 py-3">
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
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMute}
              className="rounded-full mr-2"
              title={isMuted ? "Ativar Sons" : "Mutar Arena Sonora"}
            >
              {isMuted ? <VolumeX className="h-5 w-5 text-slate-400" /> : <Volume2 className="h-5 w-5 text-indigo-600" />}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const me = profiles.find(p => p.id === user?.id);
                if (me) setShowKPIsFor({ id: me.id, name: me.name });
              }}
              className="rounded-full text-indigo-600 hover:bg-indigo-50 font-bold px-4 hidden sm:flex items-center gap-2"
            >
              <BarChart3 className="h-4 w-4" />
              Meu Desempenho
            </Button>

            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs font-bold text-slate-700">{userName}</span>
              <Badge variant="secondary" className="bg-white text-[9px] font-black uppercase tracking-tighter h-4 px-1 border-slate-300">{role}</Badge>
            </div>
            
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
        {showKPIsFor ? (
          <BrokerKPIs 
            leads={leads.filter(l => l.brokerId === showKPIsFor.id)} 
            brokerName={showKPIsFor.name} 
            brokerId={showKPIsFor.id}
            onBack={() => setShowKPIsFor(null)} 
          />
        ) : (
          <>
            {/* Campaign Hero Section */}
            <CampaignHeroBanner leads={leads} users={profiles} />

            {/* Podium Section */}
            <section className="mb-10 max-w-4xl mx-auto">
              <LeaderboardPodium 
                leads={leads} 
                users={profiles} 
                isMonthly={isMonthly}
                onToggleTimeframe={() => setIsMonthly(!isMonthly)}
                onOpenKPIs={(id, name) => setShowKPIsFor({ id, name })}
              />
            </section>

            {/* Pipeline Stats */}
            <section className="mb-6 sm:mb-8">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
                <PipelineStat 
                  label="Novos" 
                  count={stats.new} 
                  active={filter === 'NEW'} 
                  onClick={() => {setFilter('NEW'); setSelectedLeadId(null);}}
                  color="sky"
                  icon={Sparkles}
                />
                <PipelineStat 
                  label="Atendimento" 
                  count={stats.in_progress} 
                  active={filter === 'IN_PROGRESS'} 
                  onClick={() => {setFilter('IN_PROGRESS'); setSelectedLeadId(null);}}
                  color="indigo"
                  icon={Users2}
                />
                <PipelineStat 
                  label="Visitas" 
                  count={stats.visits} 
                  active={filter === 'VISIT_SCHEDULED'} 
                  onClick={() => {setFilter('VISIT_SCHEDULED'); setSelectedLeadId(null);}}
                  color="emerald"
                  icon={Calendar}
                />
                <PipelineStat 
                  label="Documentação" 
                  count={stats.docs} 
                  active={filter === 'DOCS_REQUESTED'} 
                  onClick={() => {setFilter('DOCS_REQUESTED'); setSelectedLeadId(null);}}
                  color="amber"
                  icon={FileText}
                />
                <PipelineStat 
                  label="Vendas" 
                  count={stats.concluded} 
                  active={filter === 'CONCLUDED'} 
                  onClick={() => {setFilter('CONCLUDED' as LeadStatus); setSelectedLeadId(null);}}
                  color="rose"
                  icon={Trophy}
                />
              </div>
            </section>

            <Tabs value={viewMode} onValueChange={setViewMode} className="mt-8">
              <TabsList className="bg-slate-200/50 p-1 rounded-2xl h-12 shadow-inner ring-1 ring-slate-200 mb-6">
                <TabsTrigger value="leads" className="rounded-xl px-6 data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-md font-bold text-xs">
                  <LayoutDashboard className="w-4 h-4 mr-2" /> Mural de Vendas
                </TabsTrigger>
                <TabsTrigger value="performance" className="rounded-xl px-6 data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-md font-bold text-xs">
                  <Sparkles className="w-4 h-4 mr-2" /> Performance
                </TabsTrigger>
              </TabsList>

              <TabsContent value="leads" className="mt-0">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[calc(100vh-250px)]">
                  <div className="lg:col-span-4 space-y-6">
                    <TaskCenter leads={leads} onOpenLead={(id) => { setSelectedLeadId(id); setFilter("ALL"); }} />
                    <LeadList selectedLeadId={selectedLeadId} onSelectLead={setSelectedLeadId} currentUserRole={role || "BROKER"} filter={filter} />
                  </div>
                  <div className="lg:col-span-8">
                    <LeadDetail leadId={selectedLeadId} onLeadUpdated={() => setSelectedLeadId(null)} />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="performance">
                <div className="max-w-4xl"><LeaderboardPodium leads={leads} users={profiles} onOpenKPIs={(id, name) => setShowKPIsFor({ id, name })} /></div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>

      <TaskForm open={isTaskFormOpen} onOpenChange={setIsTaskFormOpen} userId={user?.id || ""} leads={leads} defaultLeadId={selectedLeadId} />
    </div>
  );
};

const PipelineStat = ({ label, count, active, onClick, color, icon: Icon }: any) => {
  const colors: any = {
    sky: active ? "bg-sky-600 text-white" : "bg-sky-50 text-sky-700 border-sky-100",
    indigo: active ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-700 border-indigo-100",
    emerald: active ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: active ? "bg-amber-600 text-white" : "bg-amber-50 text-amber-700 border-amber-100",
    slate: active ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 border-slate-200",
  };

  return (
    <button onClick={onClick} className={cn("flex flex-col p-4 rounded-3xl border transition-all duration-300 text-left relative overflow-hidden group", colors[color], active ? "shadow-lg scale-[1.02] ring-2 ring-offset-2 ring-indigo-500" : "hover:border-slate-300 shadow-sm")}>
      <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-110", active ? "bg-white/20" : "bg-white shadow-sm")}><Icon className={cn("h-4 w-4", active ? "text-white" : "")} /></div>
      <p className={cn("text-[11px] font-bold uppercase tracking-wider opacity-80", active ? "text-white" : "text-slate-500")}>{label}</p>
      <p className="text-3xl font-black mt-1 tracking-tighter">{count}</p>
      {active && <div className="absolute top-2 right-3 h-1.5 w-1.5 bg-white rounded-full animate-ping" />}
    </button>
  );
}

export default Dashboard;