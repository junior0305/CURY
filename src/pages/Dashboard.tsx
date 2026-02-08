import { useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Loader2, PlusCircle, LogOut, Sparkles } from "lucide-react";
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

const Dashboard = () => {
  const { user, role, loading, signOut } = useAuth();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FunnelFilter>("ACTIVE");

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
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
              <Sheet open={isFormOpen} onOpenChange={setIsFormOpen}>
                <SheetTrigger asChild>
                  <Button className="rounded-2xl bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-100">
                    <PlusCircle className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">Novo Lead</span>
                    <span className="sm:hidden">Lead</span>
                  </Button>
                </SheetTrigger>
                <LeadForm
                  onOpenChange={setIsFormOpen}
                  brokerId={user?.id || ""}
                  managerId={(user as any)?.user_metadata?.manager_id || null}
                />
              </Sheet>

              <Badge className="hidden sm:inline-flex rounded-full bg-indigo-600 text-white">
                {role || "BROKER"}
              </Badge>

              <Button
                variant="ghost"
                className="rounded-2xl hover:bg-rose-50 hover:text-rose-700"
                onClick={signOut}
                title="Sair"
              >
                <LogOut className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Sair</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
        <div className="relative">
          <div className="pointer-events-none absolute -top-10 right-0 h-52 w-52 rounded-full bg-indigo-600/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-12 left-0 h-52 w-52 rounded-full bg-sky-600/10 blur-2xl" />

          <section className="relative">
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                  Funil em cards
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Visual rápido das etapas — clique para filtrar a lista.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setFilter((prev) => (prev === "ALL" ? "ACTIVE" : "ALL"))}
                className="rounded-2xl bg-white/70 backdrop-blur border-slate-200 hover:bg-white"
              >
                {filter === "ALL" ? "Mostrar Ativos" : "Mostrar Tudo"}
              </Button>
            </div>

            <div className="mt-4">
              <FunnelStageCards leads={leads} value={filter} onChange={(v) => {
                setFilter(v);
                setSelectedLeadId(null);
              }} />
            </div>
          </section>

          <section className="relative mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4">
              <LeadList
                selectedLeadId={selectedLeadId}
                onSelectLead={setSelectedLeadId}
                currentUserRole={role || "BROKER"}
                filter={filter}
              />
            </div>

            <div className="lg:col-span-8 space-y-6">
              <LeadDetail leadId={selectedLeadId} onLeadUpdated={() => setSelectedLeadId(null)} />

              {/* Podium (mainly useful for managers/superintendents; brokers may see limited data by RLS) */}
              <LeaderboardPodium leads={leads} users={profiles} />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;