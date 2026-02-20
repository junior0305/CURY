import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  Loader2, PlusCircle, LogOut, Target, Users2, Calendar,
  FileText, BarChart3, Trophy, LayoutDashboard, Sparkles,
  Zap, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import LeadForm from "@/components/broker/LeadForm";
import LeadList from "@/components/broker/LeadList";
import LeadDetail from "@/components/broker/LeadDetail";
import AchievementTicker from "@/components/dashboard/AchievementTicker";
import CampaignHeroBanner from "@/components/dashboard/CampaignHeroBanner";
import { MissionToday } from "@/components/broker/MissionToday";
import { useQuery } from "@tanstack/react-query";
import { fetchLeadsForDashboard } from "@/integrations/supabase/leads";
import { fetchProfiles } from "@/integrations/supabase/profiles";
import type { Lead, LeadStatus } from "@/types/lead";
import type { User } from "@/types/user";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import LeaderboardPodium from "@/components/dashboard/LeaderboardPodium";
import { useAudioArena } from "@/hooks/use-audio-arena";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMediaQuery } from "@/hooks/use-media-query";
import { IntelTacticsModal } from "@/components/broker/IntelTacticsModal";
import { MyRewardsModal } from "@/components/broker/MyRewardsModal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GamificationBar } from "@/components/gamification/GamificationBar";
import { DailyMissionsPanel } from "@/components/gamification/DailyMissionsPanel";
import { useRivalWatch } from "@/hooks/useRivalWatch";
import { useGamification } from "@/hooks/useGamification";

const Dashboard = () => {
  const { user, role, loading, signOut } = useAuth();
  const [isIntelOpen, setIsIntelOpen] = useState(false);
  const [isRewardsOpen, setIsRewardsOpen] = useState(false);
  const [isMissionsOpen, setIsMissionsOpen] = useState(false);
  const [intelTargetUser, setIntelTargetUser] = useState<{ id: string; name: string } | null>(null);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const { playSound } = useAudioArena();

  const isBroker = role === "BROKER";
  useRivalWatch(isBroker);
  const { prizeClaims } = useGamification();
  const pendingPrizes = prizeClaims.filter(p => p.status === "PENDING").length;

  const [activeTab, setActiveTab] = useState("mission");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isLeadFormOpen, setIsLeadFormOpen] = useState(false);
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
    const isPowerUser = role === "SUPERINTENDENT" || role === "ADMIN";
    const displayLeads = isPowerUser ? leads : leads.filter(l => l.brokerId === user?.id);
    return {
      new: displayLeads.filter(l => l.status === "NEW").length,
      in_progress: displayLeads.filter(l => l.status === "IN_PROGRESS").length,
      visits: displayLeads.filter(l => l.status === "VISIT_SCHEDULED").length,
      docs: displayLeads.filter(l => l.status === "DOCS_REQUESTED").length,
    };
  }, [leads, user?.id, role]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel("new-leads-audio")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "leads", filter: `broker_id=eq.${user.id}` },
        (payload) => {
          playSound("NEW_LEAD");
          toast.info(`🚀 Novo Lead: ${payload.new.name}`, {
            description: "Atenda o mais rápido possível!",
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, playSound]);

  const handleLeadSelect = (id: string) => {
    setSelectedLeadId(id);
    if (!isDesktop) setActiveTab("lead");
  };

  const handleBackToList = () => {
    setSelectedLeadId(null);
    if (!isDesktop) setActiveTab("mission");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <Loader2 className="animate-spin text-indigo-400 w-8 h-8" />
      </div>
    );
  }

  // ── MOBILE ────────────────────────────────────────────────────────────────────
  if (!isDesktop) {
    return (
      <div className="flex flex-col h-screen bg-slate-900">
        <div className="flex-none z-50"><AchievementTicker /></div>

        <header className="flex-none bg-slate-900 border-b border-gray-700/50 z-40">
          <div className="p-3 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Avatar className="h-9 w-9 border-2 border-indigo-500/30">
                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email}`} />
                <AvatarFallback className="bg-indigo-700 text-white font-black text-xs">
                  {userName.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <h1 className="font-black text-white text-sm leading-none">{userName}</h1>
                <p className="text-[10px] font-bold text-indigo-400 uppercase">Agente de Campo</p>
              </div>
            </div>
            <div className="flex gap-2">
              {isBroker && (
                <Button size="sm" variant="ghost"
                  className="rounded-full border border-yellow-500/30 text-yellow-400 bg-yellow-500/10 h-9 w-9 p-0 relative hover:bg-yellow-500/20"
                  onClick={() => setIsMissionsOpen(true)}>
                  <Zap className="w-4 h-4" />
                  {pendingPrizes > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">{pendingPrizes}</span>
                  )}
                </Button>
              )}
              <Button size="sm" variant="ghost"
                className="rounded-full border border-indigo-500/30 text-indigo-400 bg-indigo-500/10 h-9 w-9 p-0 hover:bg-indigo-500/20"
                onClick={() => { setIntelTargetUser(null); setIsIntelOpen(true); }}>
                <BarChart3 className="w-4 h-4" />
              </Button>
              <Sheet open={isLeadFormOpen} onOpenChange={setIsLeadFormOpen}>
                <SheetTrigger asChild>
                  <Button size="sm" className="rounded-full bg-indigo-600 hover:bg-indigo-500 h-9 w-9 p-0 shadow-lg shadow-indigo-900/40">
                    <PlusCircle className="w-5 h-5" />
                  </Button>
                </SheetTrigger>
                <LeadForm onOpenChange={setIsLeadFormOpen} brokerId={user?.id || ""} managerId={null} />
              </Sheet>
            </div>
          </div>
          {isBroker && (
            <div className="px-3 pb-3">
              <GamificationBar compact onClickMissions={() => setIsMissionsOpen(true)} pendingPrizes={pendingPrizes} />
            </div>
          )}
        </header>

        <main className="flex-1 overflow-y-auto p-3 pb-20 space-y-3">
          {activeTab === "mission" && (
            <>
              <CampaignHeroBanner leads={leads} users={profiles} />
              <div className="grid grid-cols-2 gap-2">
                <PipelineStat label="Novos" count={stats.new} active={filter === "NEW"} onClick={() => setFilter("NEW")} color="sky" icon={Sparkles} />
                <PipelineStat label="Atend." count={stats.in_progress} active={filter === "IN_PROGRESS"} onClick={() => setFilter("IN_PROGRESS")} color="indigo" icon={Users2} />
                <PipelineStat label="Visita" count={stats.visits} active={filter === "VISIT_SCHEDULED"} onClick={() => setFilter("VISIT_SCHEDULED")} color="emerald" icon={Calendar} />
                <PipelineStat label="Docs" count={stats.docs} active={filter === "DOCS_REQUESTED"} onClick={() => setFilter("DOCS_REQUESTED")} color="amber" icon={FileText} />
              </div>
              <MissionToday brokerId={user?.id || ""} onSelectLead={handleLeadSelect} />
              <div className="space-y-2">
                <h3 className="text-xs font-black text-gray-600 uppercase tracking-widest px-1">Pipeline Geral</h3>
                <LeadList selectedLeadId={null} onSelectLead={handleLeadSelect} currentUserRole={role} filter={filter} />
              </div>
            </>
          )}

          {activeTab === "lead" && (
            selectedLeadId
              ? <div className="h-full"><LeadDetail leadId={selectedLeadId} onLeadUpdated={() => {}} onBack={handleBackToList} /></div>
              : (
                <div className="flex flex-col items-center justify-center py-20 text-gray-600">
                  <Target className="w-12 h-12 mb-2 opacity-20" />
                  <p className="text-sm">Selecione um lead na Missão</p>
                  <Button variant="link" className="text-indigo-400 text-sm" onClick={() => setActiveTab("mission")}>Voltar</Button>
                </div>
              )
          )}

          {activeTab === "stats" && (
            <div className="space-y-4 pt-2">
              <h2 className="text-xl font-black text-white text-center uppercase tracking-tight">Ranking de Elite</h2>
              <LeaderboardPodium leads={leads} users={profiles}
                onOpenKPIs={(id, name) => { setIntelTargetUser({ id, name }); setIsIntelOpen(true); }} />
            </div>
          )}
        </main>

        <IntelTacticsModal open={isIntelOpen} onOpenChange={setIsIntelOpen}
          brokerId={intelTargetUser?.id || user?.id || ""} userName={intelTargetUser?.name} />
        <DailyMissionsPanel open={isMissionsOpen} onOpenChange={setIsMissionsOpen} />

        <nav className="flex-none bg-slate-900 border-t border-gray-700/50 flex justify-around p-2 z-40">
          <NavButton icon={LayoutDashboard} label="Missão" active={activeTab === "mission"} onClick={() => setActiveTab("mission")} />
          <NavButton icon={Target} label="Lead" active={activeTab === "lead"} onClick={() => setActiveTab("lead")} />
          <NavButton icon={Trophy} label="Ranking" active={activeTab === "stats"} onClick={() => setActiveTab("stats")} />
        </nav>
      </div>
    );
  }

  // ── DESKTOP ───────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black overflow-hidden">
      <AchievementTicker />

      <IntelTacticsModal open={isIntelOpen} onOpenChange={setIsIntelOpen}
        brokerId={intelTargetUser?.id || user?.id || ""} userName={intelTargetUser?.name} />
      <MyRewardsModal isOpen={isRewardsOpen} onOpenChange={setIsRewardsOpen} />
      <DailyMissionsPanel open={isMissionsOpen} onOpenChange={setIsMissionsOpen} />

      {/* Header */}
      <header className="h-14 bg-slate-900/80 backdrop-blur-sm border-b border-gray-700/50 flex items-center justify-between px-6 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-900/50">
            <Shield className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-white tracking-tight hidden sm:inline">QG de Vendas</span>
        </div>

        <div className="flex items-center gap-2">
          {isBroker && (
            <Button variant="ghost" size="sm" onClick={() => setIsMissionsOpen(true)}
              className="hidden sm:flex items-center gap-2 rounded-full border border-yellow-500/30 text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20 font-bold h-9 px-4 relative">
              <Zap className="w-4 h-4" /> Missões
              {pendingPrizes > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">{pendingPrizes}</span>
              )}
            </Button>
          )}
          <Button variant="ghost" size="sm"
            onClick={() => { setIntelTargetUser(null); setIsIntelOpen(true); }}
            className="hidden sm:flex items-center gap-2 rounded-full border border-indigo-500/30 text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 font-bold h-9 px-4">
            <BarChart3 className="w-4 h-4" /> Intel Tática
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setIsRewardsOpen(true)}
            className="hidden sm:flex items-center gap-2 rounded-full text-amber-400 hover:bg-amber-500/10 font-bold h-9 px-4">
            <Trophy className="w-4 h-4" /> Espólio
          </Button>

          <div className="h-5 w-px bg-gray-700 mx-1 hidden sm:block" />

          <div className="flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-white leading-none">{userName}</p>
              <p className="text-[10px] font-medium text-gray-500 uppercase mt-0.5">
                {role === "BROKER" ? "Agente de Campo" : role}
              </p>
            </div>
            <Avatar className="h-8 w-8 border-2 border-indigo-500/30 cursor-pointer hover:scale-105 transition-transform">
              <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email}`} />
              <AvatarFallback className="bg-indigo-700 text-white font-black text-xs">
                {userName.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>

          <Sheet open={isLeadFormOpen} onOpenChange={setIsLeadFormOpen}>
            <SheetTrigger asChild>
              <Button className="rounded-full bg-indigo-600 hover:bg-indigo-500 font-bold h-9 shadow-lg shadow-indigo-900/40">
                <PlusCircle className="w-4 h-4 mr-2" /> Novo Lead
              </Button>
            </SheetTrigger>
            <LeadForm onOpenChange={setIsLeadFormOpen} brokerId={user?.id || ""} managerId={null} />
          </Sheet>

          <Button variant="ghost" size="icon" onClick={signOut} className="text-gray-600 hover:text-red-400 hover:bg-red-900/20">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Conteúdo scrollável */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1800px] mx-auto p-4 space-y-4">

          {isBroker && (
            <GamificationBar
              onClickMissions={() => setIsMissionsOpen(true)}
              onClickPrizes={() => setIsRewardsOpen(true)}
              pendingPrizes={pendingPrizes}
            />
          )}

          <CampaignHeroBanner leads={leads} users={profiles} />

          {/* Split view */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[700px]">

            {/* Coluna esquerda */}
            <div className="lg:col-span-4 flex flex-col gap-3">

              {/* Missão do dia */}
              <div className="bg-slate-800/50 border border-gray-700/40 rounded-2xl p-4">
                <MissionToday brokerId={user?.id || ""} onSelectLead={handleLeadSelect} />
              </div>

              {/* Pipeline */}
              <div className="grid grid-cols-2 gap-2">
                <PipelineStat label="Novos" count={stats.new} active={filter === "NEW"} onClick={() => { setFilter("NEW"); setSelectedLeadId(null); }} color="sky" icon={Sparkles} />
                <PipelineStat label="Atendimento" count={stats.in_progress} active={filter === "IN_PROGRESS"} onClick={() => { setFilter("IN_PROGRESS"); setSelectedLeadId(null); }} color="indigo" icon={Users2} />
                <PipelineStat label="Visitas" count={stats.visits} active={filter === "VISIT_SCHEDULED"} onClick={() => { setFilter("VISIT_SCHEDULED"); setSelectedLeadId(null); }} color="emerald" icon={Calendar} />
                <PipelineStat label="Documentação" count={stats.docs} active={filter === "DOCS_REQUESTED"} onClick={() => { setFilter("DOCS_REQUESTED"); setSelectedLeadId(null); }} color="amber" icon={FileText} />
              </div>

              {/* Lista */}
              <div className="flex-1 flex flex-col bg-slate-800/40 border border-gray-700/40 rounded-2xl overflow-hidden min-h-[400px]">
                <div className="px-4 py-3 border-b border-gray-700/40 flex justify-between items-center">
                  <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest">Carteira Total</h3>
                  <Badge className="bg-slate-700/60 text-gray-500 border-gray-600/30 text-[10px]">
                    {leads.filter(l => l.brokerId === user?.id).length} leads
                  </Badge>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  <LeadList selectedLeadId={selectedLeadId} onSelectLead={handleLeadSelect} currentUserRole={role} filter={filter} compact />
                </div>
              </div>
            </div>

            {/* Coluna direita */}
            <div className="lg:col-span-8 min-h-[600px] mb-10">
              {selectedLeadId ? (
                <div className="h-full rounded-2xl overflow-hidden border border-gray-700/40">
                  <LeadDetail leadId={selectedLeadId} onLeadUpdated={() => {}} />
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center bg-slate-800/20 border border-gray-700/20 border-dashed rounded-2xl text-gray-700">
                  <div className="bg-slate-800/60 p-6 rounded-full mb-4 border border-gray-700/40">
                    <Target className="w-12 h-12 text-indigo-900" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-600">Pronto para o Combate?</h3>
                  <p className="text-sm text-gray-700 mt-1">Selecione um alvo na lista ao lado.</p>
                </div>
              )}
            </div>
          </div>

          {/* Ranking */}
          <section className="pb-10 pt-6 border-t border-gray-700/30">
            <div className="flex items-center gap-2 mb-6 justify-center">
              <Trophy className="h-5 w-5 text-amber-400" />
              <h2 className="text-lg font-black text-white uppercase tracking-tight">Ranking de Elite</h2>
            </div>
            <LeaderboardPodium leads={leads} users={profiles}
              onOpenKPIs={(id, name) => { setIntelTargetUser({ id, name }); setIsIntelOpen(true); }} />
          </section>
        </div>
      </div>
    </div>
  );
};

// ── Subcomponentes ─────────────────────────────────────────────────────────────
const NavButton = ({ icon: Icon, label, active, onClick }: any) => (
  <button onClick={onClick}
    className={cn("flex flex-col items-center p-2 rounded-xl transition-all",
      active ? "text-indigo-400 bg-indigo-500/10" : "text-gray-600 hover:text-gray-400")}>
    <Icon className="w-6 h-6 mb-1" />
    <span className="text-[10px] font-bold">{label}</span>
  </button>
);

const PIPELINE_COLORS = {
  sky:     { active: "border-sky-500/50 bg-sky-500/10 text-sky-400",       inactive: "border-gray-700/40 bg-slate-800/60 text-gray-500 hover:border-sky-500/30 hover:text-sky-400" },
  indigo:  { active: "border-indigo-500/50 bg-indigo-500/10 text-indigo-400", inactive: "border-gray-700/40 bg-slate-800/60 text-gray-500 hover:border-indigo-500/30 hover:text-indigo-400" },
  emerald: { active: "border-emerald-500/50 bg-emerald-500/10 text-emerald-400", inactive: "border-gray-700/40 bg-slate-800/60 text-gray-500 hover:border-emerald-500/30 hover:text-emerald-400" },
  amber:   { active: "border-amber-500/50 bg-amber-500/10 text-amber-400",   inactive: "border-gray-700/40 bg-slate-800/60 text-gray-500 hover:border-amber-500/30 hover:text-amber-400" },
};

const PipelineStat = ({ label, count, active, onClick, color, icon: Icon }: any) => {
  const cfg = PIPELINE_COLORS[color as keyof typeof PIPELINE_COLORS];
  return (
    <button onClick={onClick}
      className={cn("rounded-xl border p-3 transition-all text-left flex items-center gap-3",
        active ? cfg.active : cfg.inactive)}>
      <Icon className="w-4 h-4 shrink-0" />
      <div>
        <p className="text-2xl font-black leading-none">{count}</p>
        <p className="text-[10px] uppercase tracking-wider opacity-60 mt-0.5">{label}</p>
      </div>
    </button>
  );
};

export default Dashboard;
