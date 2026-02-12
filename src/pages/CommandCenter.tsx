import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  BarChart3, 
  Target, 
  Users, 
  TrendingUp, 
  ShieldAlert, 
  Activity, 
  Rocket, 
  LayoutDashboard,
  CalendarDays,
  Settings2,
  AlertTriangle,
  Banknote,
  Plus,
  Trash2
} from "lucide-react";
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  ScatterChart, 
  Scatter, 
  ZAxis, 
  PieChart, 
  Pie, 
  Cell,
  Legend
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, parseISO, subMonths, eachMonthOfInterval, subYears } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { useAuth } from "@/components/AuthProvider";
import { useQueryClient } from "@tanstack/react-query";

const CommandCenter = () => {
  const { user } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<any>(null);
  const [newGoal, setNewGoal] = useState("");
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isInvestmentModalOpen, setIsInvestmentModalOpen] = useState(false);
  const [newInvestment, setNewInvestment] = useState({
    amount: "",
    category: "MARKETING",
    team_id: "GLOBAL",
    description: "",
    date: format(new Date(), 'yyyy-MM-dd')
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // 1. Fetch Teams
  const { data: teams = [] } = useQuery({
    queryKey: ['teams-command'],
    queryFn: async () => {
      const { data } = await supabase.from('teams').select('*');
      return data || [];
    }
  });

  // 2. Fetch Goals for Month
  const { data: goals = [], refetch: refetchGoals } = useQuery({
    queryKey: ['goals-command', selectedMonth],
    queryFn: async () => {
      const start = startOfMonth(selectedMonth).toISOString();
      // Adjust to YYYY-MM-DD
      const monthStr = start.split('T')[0]; 
      
      const { data } = await supabase
        .from('team_goals')
        .select('*')
        .eq('month', monthStr);
      return data || [];
    }
  });

  // 3. Fetch Leads/Sales Data (CURRENT MONTH)
  const { data: stats = [] } = useQuery({
    queryKey: ['stats-command', selectedMonth],
    queryFn: async () => {
      const start = startOfMonth(selectedMonth).toISOString();
      const end = endOfMonth(selectedMonth).toISOString();
      
      // Get all leads active in this period or created in this period
      const { data: leads } = await supabase
        .from('leads')
        .select(`
          id, 
          status, 
          created_at, 
          broker_id, 
          exclusion_reason,
          profiles:broker_id (
            id, 
            first_name, 
            last_name, 
            team_id
          )
        `)
        .gte('created_at', start)
        .lte('created_at', end);
        
      return leads || [];
    }
  });

  // 4. Fetch Leads/Sales Data (PREVIOUS MONTH) - For Comparison
  const previousMonth = subMonths(selectedMonth, 1);
  const { data: prevStats = [] } = useQuery({
    queryKey: ['stats-command-prev', previousMonth],
    queryFn: async () => {
      const start = startOfMonth(previousMonth).toISOString();
      const end = endOfMonth(previousMonth).toISOString();
      
      const { data: leads } = await supabase
        .from('leads')
        .select(`
          id, 
          status, 
          created_at, 
          broker_id, 
          exclusion_reason,
          profiles:broker_id (
            id, 
            first_name, 
            last_name, 
            team_id
          )
        `)
        .gte('created_at', start)
        .lte('created_at', end);
        
      return leads || [];
    }
  });

  // 5. Fetch 6-Month Trend Data
  const { data: trendData = [] } = useQuery({
    queryKey: ['stats-trend-6m'],
    queryFn: async () => {
      const today = new Date();
      const sixMonthsAgo = subMonths(today, 5); // Current + 5 prev = 6 months
      const start = startOfMonth(sixMonthsAgo).toISOString();
      
      // Fetch minimal data for trend
      const { data: leads } = await supabase
        .from('leads')
        .select('created_at, status')
        .gte('created_at', start);
      
      if (!leads) return [];

      const months = eachMonthOfInterval({ start: sixMonthsAgo, end: today });
      return months.map(month => {
        const monthStart = startOfMonth(month);
        const monthEnd = endOfMonth(month);
        
        const monthLeads = leads.filter((l: any) => {
          const d = new Date(l.created_at);
          return d >= monthStart && d <= monthEnd;
        });
        
        const sales = monthLeads.filter((l: any) => l.status === 'CONCLUDED').length;
        const total = monthLeads.length;

        return {
          name: format(month, 'MMM', { locale: ptBR }).toUpperCase(),
          Vendas: sales,
          Leads: total
        };
      });
    }
  });

  // 6. Fetch Rewards Data (CURRENT MONTH) - For Financial ROI
  const { data: rewardsStats = [] } = useQuery({
    queryKey: ['rewards-command', selectedMonth],
    queryFn: async () => {
      const start = startOfMonth(selectedMonth).toISOString();
      const end = endOfMonth(selectedMonth).toISOString();
      
      const { data } = await supabase
        .from('achievements')
        .select(`
          id, 
          reward_type, 
          reward_value, 
          created_at, 
          status,
          profiles:profile_id (
            id, 
            first_name, 
            last_name, 
            team_id,
            teams:team_id (name)
          )
        `)
        .eq('status', 'APPROVED') // Only paid rewards count as investment
        .gte('created_at', start)
        .lte('created_at', end);
        
      return data || [];
    }
  });

  // 7. Fetch Manual Investments (CURRENT MONTH)
  const { data: investments = [], refetch: refetchInvestments } = useQuery({
    queryKey: ['investments-command', selectedMonth],
    queryFn: async () => {
      const start = startOfMonth(selectedMonth).toISOString();
      const end = endOfMonth(selectedMonth).toISOString();
      
      const { data } = await supabase
        .from('team_investments')
        .select(`
          id, 
          amount, 
          category, 
          description,
          investment_date,
          team_id,
          teams:team_id (name),
          profiles:investor_id (first_name, last_name)
        `)
        .gte('investment_date', start)
        .lte('investment_date', end);
        
      return data || [];
    }
  });

  const handleSaveInvestment = async () => {
    if (!newInvestment.amount || !newInvestment.description) {
      toast.error("Preencha o valor e a descrição.");
      return;
    }
    
    try {
      const payload: any = {
        amount: parseFloat(newInvestment.amount),
        category: newInvestment.category,
        description: newInvestment.description,
        investment_date: newInvestment.date,
        investor_id: user?.id,
      };

      if (newInvestment.team_id !== 'GLOBAL') {
        payload.team_id = newInvestment.team_id;
      }

      const { error } = await supabase.from('team_investments').insert(payload);
      if (error) throw error;
      
      toast.success("Aporte registrado com sucesso! 💰");
      refetchInvestments();
      setIsInvestmentModalOpen(false);
      setNewInvestment({ amount: "", category: "MARKETING", team_id: "GLOBAL", description: "", date: format(new Date(), 'yyyy-MM-dd') });
    } catch (e: any) {
      toast.error("Erro ao registrar aporte: " + e.message);
    }
  };

  const deleteInvestmentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('team_investments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Aporte removido.");
      refetchInvestments();
    }
  });

  // AGGREGATION LOGIC
  const teamStats = teams.map(team => {
    // Current Stats
    const teamLeads = stats.filter((l: any) => l.profiles?.team_id === team.id);
    const sales = teamLeads.filter((l: any) => l.status === 'CONCLUDED').length;
    const visits = teamLeads.filter((l: any) => l.status === 'VISIT_SCHEDULED').length;
    const active = teamLeads.filter((l: any) => !['ABANDONED', 'EXCLUDED', 'NEW'].includes(l.status)).length;
    const total = teamLeads.length;
    
    // Previous Stats
    const prevTeamLeads = prevStats.filter((l: any) => l.profiles?.team_id === team.id);
    const prevSales = prevTeamLeads.filter((l: any) => l.status === 'CONCLUDED').length;
    const prevVisits = prevTeamLeads.filter((l: any) => l.status === 'VISIT_SCHEDULED').length;
    const prevTotal = prevTeamLeads.filter((l: any) => true).length; // Total leads last month

    // Headcount (Simplified: unique brokers active in period)
    const brokersCurrent = new Set(teamLeads.map((l: any) => l.broker_id).filter(Boolean)).size;
    const brokersPrev = new Set(prevTeamLeads.map((l: any) => l.broker_id).filter(Boolean)).size;

    // Financials (Rewards + Manual Investments)
    const teamRewards = rewardsStats.filter((r: any) => r.profiles?.team_id === team.id);
    const rewardsTotal = teamRewards.reduce((acc: number, curr: any) => acc + Number(curr.reward_value), 0);
    
    const teamManualInvestments = investments.filter((i: any) => i.team_id === team.id);
    const manualTotal = teamManualInvestments.reduce((acc: number, curr: any) => acc + Number(curr.amount), 0);
    
    const totalInvestment = rewardsTotal + manualTotal;
    
    // ROI Calculation (Cost per Sale)
    const costPerSale = sales > 0 ? totalInvestment / sales : totalInvestment;

    // Deltas
    const salesDelta = sales - prevSales;
    const visitsDelta = visits - prevVisits;
    const brokersDelta = brokersCurrent - brokersPrev;
    
    // Goal
    const goalEntry = goals.find((g: any) => g.team_id === team.id);
    const target = goalEntry?.sales_target || 0;
    
    // Forecast (Simple projection: Sales + 20% of Visits)
    const forecast = sales + Math.round(visits * 0.2);

    return {
      ...team,
      sales,
      visits,
      active,
      total,
      target,
      forecast,
      conversion: total > 0 ? (sales / total) * 100 : 0,
      gap: target - sales,
      // Trends
      salesDelta,
      visitsDelta,
      brokersDelta,
      prevSales,
      // Finance
      rewardsTotal,
      manualTotal,
      investment: totalInvestment,
      costPerSale
    };
  });

  const brokerStats = stats.reduce((acc: any[], lead: any) => {
    if (!lead.broker_id) return acc;
    const existing = acc.find(b => b.id === lead.broker_id);
    const isSale = lead.status === 'CONCLUDED';
    
    if (existing) {
      existing.leads += 1;
      if (isSale) existing.sales += 1;
    } else {
      acc.push({
        id: lead.broker_id,
        name: lead.profiles?.first_name || 'Unknown',
        teamId: lead.profiles?.team_id,
        leads: 1,
        sales: isSale ? 1 : 0
      });
    }
    return acc;
  }, []).map(b => ({
    ...b,
    conversion: (b.sales / b.leads) * 100
  }));

  const lossReasons = stats
    .filter((l: any) => l.status === 'EXCLUDED' || l.status === 'ABANDONED')
    .reduce((acc: any, curr: any) => {
      const reason = curr.exclusion_reason || 'Não Informado';
      acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {});

  const lossData = Object.entries(lossReasons).map(([name, value]) => ({ name, value }));
  const COLORS = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#06b6d4', '#6366f1', '#ec4899'];

  const totalInvestment = rewardsStats.reduce((acc: number, curr: any) => acc + Number(curr.reward_value), 0);
  
  // Global Investments (Superintendent level not tied to a team)
  const globalInvestments = investments.filter((i: any) => !i.team_id);
  const globalManualTotal = globalInvestments.reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0);
  
  const totalRewardsSystem = rewardsStats.reduce((acc: number, curr: any) => acc + Number(curr.reward_value || 0), 0);
  const totalManualSystem = investments.reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0);
  const grandTotalInvestment = totalRewardsSystem + totalManualSystem;

  const investmentByTeam = teamStats.map(t => ({
    name: t.name,
    value: t.investment || 0
  })).filter(t => t.value > 0);
  
  if (globalManualTotal > 0) {
    investmentByTeam.push({ name: 'Global (Superintendência)', value: globalManualTotal });
  }

  // PROTECTION: If no data for pie chart, provide a placeholder or don't render
  const hasInvestmentData = investmentByTeam.length > 0;

  const handleSaveGoal = async () => {
    if (!editingTeam || !newGoal) return;
    
    try {
      const monthStr = startOfMonth(selectedMonth).toISOString().split('T')[0];
      
      const { error } = await supabase.from('team_goals').upsert({
        team_id: editingTeam.id,
        month: monthStr,
        sales_target: parseInt(newGoal)
      }, { onConflict: 'team_id, month' });
      
      if (error) throw error;
      
      toast.success("Meta atualizada com sucesso!");
      refetchGoals();
      setIsGoalModalOpen(false);
    } catch (e: any) {
      toast.error("Erro ao salvar meta: " + e.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30">
      
      {/* HEADER COMMAND */}
      <header className="bg-slate-900 border-b border-slate-800 p-6 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-4">
           <Button variant="ghost" size="icon" onClick={() => navigate('/admin')} className="text-slate-400 hover:text-white hover:bg-slate-800 rounded-full h-10 w-10">
              <TrendingUp className="h-6 w-6 rotate-180" />
           </Button>
           <div className="p-3 bg-indigo-600 rounded-xl shadow-lg shadow-indigo-500/20">
             <LayoutDashboard className="h-6 w-6 text-white" />
           </div>
           <div>
             <h1 className="text-2xl font-black tracking-tight text-white">QG DE COMANDO</h1>
             <p className="text-sm text-slate-400 font-medium">Visão Estratégica Global</p>
           </div>
        </div>
        
        <div className="flex items-center gap-4">
           <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
             <PopoverTrigger asChild>
               <Button variant="outline" className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white font-bold h-10 px-4">
                 <CalendarDays className="h-4 w-4 mr-2 text-indigo-400" />
                 <span className="capitalize">{format(selectedMonth, 'MMMM yyyy', { locale: ptBR })}</span>
               </Button>
             </PopoverTrigger>
             <PopoverContent className="w-auto p-0 bg-slate-900 border-slate-700" align="end">
               <Calendar
                 mode="single"
                 selected={selectedMonth}
                 onSelect={(date) => {
                   if (date) {
                     setSelectedMonth(date);
                     setIsCalendarOpen(false);
                   }
                 }}
                 initialFocus
                 className="p-3 text-slate-200"
                 classNames={{
                   day_selected: "bg-indigo-600 text-white hover:bg-indigo-600 hover:text-white focus:bg-indigo-600 focus:text-white",
                   day_today: "bg-slate-800 text-white",
                   day: "h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-slate-800 rounded-md",
                 }}
               />
             </PopoverContent>
           </Popover>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6 space-y-8">
        
        <Tabs defaultValue="strategy" className="w-full">
          <TabsList className="bg-slate-900 border border-slate-800 p-1 mb-6 rounded-xl">
             <TabsTrigger value="strategy" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white text-xs uppercase font-black px-6 py-2 rounded-lg">Estratégia de Combate</TabsTrigger>
             <TabsTrigger value="finance" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white text-xs uppercase font-black px-6 py-2 rounded-lg">Finanças de Guerra (ROI)</TabsTrigger>
          </TabsList>

          <TabsContent value="strategy" className="space-y-8 animate-in slide-in-from-left-4 fade-in duration-500">
            {/* ROW 0: TENDÊNCIA DE VENDAS (6 MESES) */}
            <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
               <Card className="col-span-1 md:col-span-3 bg-slate-900 border-slate-800 p-6 flex flex-col h-[300px]">
                  <div className="mb-4 flex justify-between items-center">
                     <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                          <TrendingUp className="h-5 w-5 text-emerald-500" /> Tendência de Combate
                        </h3>
                        <p className="text-sm text-slate-500">Evolução de Vendas nos últimos 6 meses.</p>
                     </div>
                  </div>
                  <div className="flex-1 w-full min-h-0">
                     <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={trendData}>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                           <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                           <Tooltip cursor={{fill: '#1e293b'}} contentStyle={{ backgroundColor: '#0f172a', border: 'none', color: '#f8fafc', borderRadius: '8px' }} />
                           <Bar dataKey="Vendas" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
                        </BarChart>
                     </ResponsiveContainer>
                  </div>
               </Card>

               <Card className="col-span-1 bg-indigo-600 border-none shadow-xl p-6 flex flex-col justify-center text-white relative overflow-hidden">
                  <div className="absolute -right-10 -bottom-10 bg-white/10 w-40 h-40 rounded-full blur-3xl" />
                  <p className="text-xs font-black text-indigo-200 uppercase tracking-widest mb-2">Total Consolidado ({format(selectedMonth, 'MMM', { locale: ptBR })})</p>
                  <h2 className="text-5xl font-black mb-1">{stats.filter((l: any) => l.status === 'CONCLUDED').length}</h2>
                  <p className="text-sm font-bold text-indigo-100 mb-6">Vendas Confirmadas</p>
                  
                  <div className="pt-6 border-t border-indigo-500/30">
                     <div className="flex justify-between items-end">
                        <div>
                           <p className="text-3xl font-bold text-white/90">{stats.length}</p>
                           <p className="text-[10px] uppercase font-bold text-indigo-300">Leads Totais</p>
                        </div>
                        <div className="text-right">
                           <p className="text-3xl font-bold text-white/90">
                              {stats.length > 0 ? ((stats.filter((l: any) => l.status === 'CONCLUDED').length / stats.length) * 100).toFixed(1) : 0}%
                           </p>
                           <p className="text-[10px] uppercase font-bold text-indigo-300">Conversão Global</p>
                        </div>
                     </div>
                  </div>
               </Card>
            </section>

            {/* ROW 1: PREVISIBILIDADE (FORECAST) + MOM COMPARISON */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Target className="h-5 w-5 text-emerald-500" />
                <h2 className="text-lg font-bold text-slate-200 uppercase tracking-wide">Performance Tática (Mês vs. Mês Anterior)</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {teamStats.map(team => (
                  <Card key={team.id} className="bg-slate-900 border-slate-800 p-5 relative overflow-hidden group hover:border-indigo-500/50 transition-all">
                    {/* Indicador de Tendência (MOM) */}
                    <div className="absolute top-4 right-4 flex flex-col items-end">
                       <div className={cn("flex items-center text-xs font-black px-2 py-1 rounded-full", team.salesDelta >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400")}>
                          {team.salesDelta >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingUp className="h-3 w-3 mr-1 rotate-180" />}
                          {team.salesDelta > 0 ? '+' : ''}{team.salesDelta} Vendas
                       </div>
                       <p className="text-[9px] text-slate-500 mt-1 uppercase font-bold">vs. Mês Passado</p>
                    </div>
                    
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">{team.name}</h3>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-3xl font-black text-white">{team.sales}</span>
                          <span className="text-xs text-slate-500 font-bold">/ {team.target} Metas</span>
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-3">
                      <div 
                        className="h-full bg-gradient-to-r from-indigo-600 to-purple-600 transition-all duration-1000" 
                        style={{ width: `${Math.min((team.sales / (team.target || 1)) * 100, 100)}%` }}
                      />
                    </div>
                    
                    {/* Comparison Details */}
                    <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-800">
                       <div>
                          <p className="text-[10px] text-slate-500 uppercase font-bold">Visitas</p>
                          <p className={cn("text-sm font-bold", team.visitsDelta >= 0 ? "text-emerald-400" : "text-rose-400")}>
                             {team.visits} <span className="text-[10px] opacity-70">({team.visitsDelta > 0 ? '+' : ''}{team.visitsDelta})</span>
                          </p>
                       </div>
                       <div className="text-right">
                          <p className="text-[10px] text-slate-500 uppercase font-bold">Tropa (Ativos)</p>
                          <p className={cn("text-sm font-bold", team.brokersDelta >= 0 ? "text-emerald-400" : "text-rose-400")}>
                             {team.brokersDelta > 0 ? '+' : ''}{team.brokersDelta} <span className="text-[10px] text-slate-500 font-normal">Soldados</span>
                          </p>
                       </div>
                    </div>
                    
                    <div className="mt-2 text-xs text-slate-600 italic text-center bg-slate-950/50 py-1 rounded">
                       {team.brokersDelta > 0 && team.salesDelta > 0 
                         ? "🔥 Contratou e vendeu mais!" 
                         : team.brokersDelta > 0 && team.salesDelta <= 0 
                         ? "⚠️ Inchou a equipe, mas venda caiu."
                         : team.salesDelta > 0 
                         ? "🚀 Mais eficiente com mesmo time."
                         : "💤 Estável ou em queda."}
                    </div>

                    {/* Settings Button */}
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="absolute bottom-2 left-2 h-6 w-6 text-slate-700 hover:text-white hover:bg-slate-800"
                        onClick={() => {
                          setEditingTeam(team);
                          setNewGoal(team.target.toString());
                          setIsGoalModalOpen(true);
                        }}
                      >
                        <Settings2 className="h-3 w-3" />
                    </Button>
                  </Card>
                ))}
              </div>
            </section>

            {/* ROW 2: MATRIZ DE EFICIÊNCIA & CEMITÉRIO */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* SCATTER PLOT */}
              <Card className="lg:col-span-2 bg-slate-900 border-slate-800 p-6 flex flex-col h-[450px]">
                <div className="mb-6 flex justify-between items-end">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <Rocket className="h-5 w-5 text-indigo-500" /> Matriz de Eficiência
                    </h3>
                    <p className="text-sm text-slate-500">Volume de Leads vs. Taxa de Conversão. Identifique desperdícios.</p>
                  </div>
                </div>
                <div className="flex-1 w-full min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis type="number" dataKey="leads" name="Volume" unit=" leads" stroke="#64748b" fontSize={12} tickLine={false} />
                      <YAxis type="number" dataKey="conversion" name="Conversão" unit="%" stroke="#64748b" fontSize={12} tickLine={false} />
                      <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', color: '#f8fafc' }} />
                      <Legend />
                      <Scatter name="Corretores" data={brokerStats} fill="#6366f1">
                        {brokerStats.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.conversion > 10 ? '#10b981' : entry.leads > 20 ? '#ef4444' : '#6366f1'} />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 flex gap-4 text-xs text-slate-400 justify-center">
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500" /> Alta Performance</div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-rose-500" /> Sobrecarga / Baixa Conv.</div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-indigo-500" /> Em Desenvolvimento</div>
                </div>
              </Card>

              {/* PIE CHART LOSS REASONS */}
              <Card className="bg-slate-900 border-slate-800 p-6 flex flex-col h-[450px]">
                 <div className="mb-4">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <ShieldAlert className="h-5 w-5 text-rose-500" /> Cemitério de Leads
                    </h3>
                    <p className="text-sm text-slate-500">Por que estamos perdendo vendas?</p>
                 </div>
                 <div className="flex-1 w-full min-h-0 relative">
                   <ResponsiveContainer width="100%" height="100%">
                     <PieChart>
                        <Pie
                          data={lossData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {lossData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="rgba(0,0,0,0)" />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', color: '#f8fafc', borderRadius: '8px' }} />
                        <Legend layout="vertical" verticalAlign="bottom" wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }} />
                     </PieChart>
                   </ResponsiveContainer>
                   {/* Center Text */}
                   <div className="absolute inset-0 flex items-center justify-center pointer-events-none mb-12">
                      <span className="text-2xl font-black text-white">{stats.filter((l: any) => l.status === 'EXCLUDED' || l.status === 'ABANDONED').length}</span>
                   </div>
                 </div>
              </Card>

            </div>

            {/* ROW 3: PLATOON X-RAY (TABLE) */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Users className="h-5 w-5 text-sky-500" />
                <h2 className="text-lg font-bold text-slate-200 uppercase tracking-wide">Raio-X dos Pelotões</h2>
              </div>
              
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-sm text-slate-400">
                  <thead className="bg-slate-950 text-slate-200 font-bold uppercase tracking-wider text-xs">
                    <tr>
                      <th className="p-4">Pelotão (Equipe)</th>
                      <th className="p-4 text-center">Soldados</th>
                      <th className="p-4 text-center">Leads Recebidos</th>
                      <th className="p-4 text-center">Visitas Agendadas</th>
                      <th className="p-4 text-center">Vendas Confirmadas</th>
                      <th className="p-4 text-right">Conversão Real</th>
                      <th className="p-4 text-right">Eficiência</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {teamStats.map((team, idx) => (
                      <tr key={team.id} className="hover:bg-slate-800/50 transition-colors">
                        <td className="p-4 font-bold text-white flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-black">
                            {idx + 1}
                          </div>
                          {team.name}
                        </td>
                        <td className="p-4 text-center font-medium">{brokerStats.filter(b => b.teamId === team.id).length}</td>
                        <td className="p-4 text-center text-slate-300">{team.total}</td>
                        <td className="p-4 text-center text-slate-300">{team.visits}</td>
                        <td className="p-4 text-center font-black text-emerald-400 text-lg">{team.sales}</td>
                        <td className="p-4 text-right font-bold text-white">{team.conversion.toFixed(1)}%</td>
                        <td className="p-4 text-right">
                           <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase ${team.conversion > 5 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                             {team.conversion > 5 ? 'ALTA' : 'BAIXA'}
                           </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="finance" className="space-y-8 animate-in slide-in-from-right-4 fade-in duration-500">
             {/* ROW 1: RESUMO FINANCEIRO */}
             <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="bg-emerald-600 border-none shadow-xl p-6 text-white relative overflow-hidden">
                   <div className="absolute -right-6 -top-6 bg-white/10 w-32 h-32 rounded-full blur-2xl" />
                   <p className="text-xs font-black text-emerald-200 uppercase tracking-widest mb-1">Custo Total de Guerra ({format(selectedMonth, 'MMM', { locale: ptBR })})</p>
                   <h2 className="text-4xl font-black mb-1">R$ {grandTotalInvestment.toFixed(2)}</h2>
                   <div className="flex gap-4 mt-2 text-xs font-medium text-emerald-100/80">
                      <span>Prêmios: R$ {totalRewardsSystem.toFixed(2)}</span>
                      <span>|</span>
                      <span>Aportes: R$ {totalManualSystem.toFixed(2)}</span>
                   </div>
                </Card>

                <Card className="bg-slate-900 border-slate-800 p-6 relative overflow-hidden group hover:border-indigo-500/50 transition-all cursor-pointer" onClick={() => setIsInvestmentModalOpen(true)}>
                   <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <Banknote className="h-16 w-16 text-white" />
                   </div>
                   <p className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-1">Novo Aporte Manual</p>
                   <h2 className="text-2xl font-black text-white mb-2">Lançar Investimento</h2>
                   <p className="text-xs text-slate-500 font-medium leading-relaxed">
                      Registre gastos externos (Marketing, Eventos, Bonificações) para compor o ROI real.
                   </p>
                   <Button size="sm" className="mt-4 bg-indigo-600 hover:bg-indigo-700 font-bold text-xs w-full">
                      <Plus className="h-3 w-3 mr-2" /> Adicionar Custo
                   </Button>
                </Card>

                <Card className="bg-slate-900 border-slate-800 p-6 flex items-center justify-between">
                   <div>
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Maior Custo (Equipe/Global)</p>
                      <h3 className="text-xl font-bold text-white">
                         {investmentByTeam.sort((a, b) => b.value - a.value)[0]?.name || "Nenhum"}
                      </h3>
                      <p className="text-sm text-slate-500">R$ {investmentByTeam.sort((a, b) => b.value - a.value)[0]?.value.toFixed(2)} total</p>
                   </div>
                   <div className="h-12 w-12 bg-rose-500/20 rounded-full flex items-center justify-center">
                      <TrendingUp className="h-6 w-6 text-rose-500" />
                   </div>
                </Card>
             </section>

             {/* ROW 2: ROI POR EQUIPE */}
             <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 bg-slate-900 border-slate-800 p-6">
                   <div className="mb-6">
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Activity className="h-5 w-5 text-emerald-500" /> Eficiência do Investimento (ROI Real)
                      </h3>
                      <p className="text-sm text-slate-500">Prêmios do Sistema + Aportes Manuais vs. Vendas Entregues.</p>
                   </div>
                   <div className="h-[350px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                         <BarChart data={teamStats} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                            <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis yAxisId="left" stroke="#10b981" fontSize={12} tickFormatter={(val) => `R$ ${val}`} />
                            <YAxis yAxisId="right" orientation="right" stroke="#6366f1" fontSize={12} tickFormatter={(val) => `${val} un`} />
                            <Tooltip 
                               contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', color: '#f8fafc', borderRadius: '8px' }} 
                               formatter={(value: any, name: string) => [
                                  name === 'investment' ? `R$ ${value}` : 
                                  name === 'manualTotal' ? `R$ ${value}` : value, 
                                  name === 'investment' ? 'Total Investido' : 
                                  name === 'manualTotal' ? 'Aportes Manuais' : 'Vendas'
                               ]}
                            />
                            <Legend />
                            <Bar yAxisId="left" dataKey="investment" name="Custo Total (R$)" fill="#10b981" radius={[4, 4, 0, 0]} barSize={30} />
                            <Bar yAxisId="right" dataKey="sales" name="Vendas (Qtd)" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={30} />
                         </BarChart>
                      </ResponsiveContainer>
                   </div>
                </Card>

                <Card className="bg-slate-900 border-slate-800 p-6 flex flex-col">
                   <div className="mb-4">
                      <h3 className="text-lg font-bold text-white">Fatia do Orçamento</h3>
                      <p className="text-sm text-slate-500">Quem consumiu mais recursos?</p>
                   </div>
                   <div className="flex-1 min-h-0 relative">
                      {hasInvestmentData ? (
                        <ResponsiveContainer width="100%" height="100%">
                           <PieChart>
                              <Pie
                                 data={investmentByTeam}
                                 cx="50%"
                                 cy="50%"
                                 innerRadius={60}
                                 outerRadius={80}
                                 paddingAngle={5}
                                 dataKey="value"
                              >
                                 {investmentByTeam.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="rgba(0,0,0,0)" />
                                 ))}
                              </Pie>
                              <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: 'none', color: '#f8fafc', borderRadius: '8px' }} formatter={(val: number) => `R$ ${val.toFixed(2)}`} />
                              <Legend layout="horizontal" verticalAlign="bottom" wrapperStyle={{ fontSize: '10px', color: '#94a3b8' }} />
                           </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-600">
                           <Banknote className="h-12 w-12 mb-2 opacity-20" />
                           <p className="text-xs">Sem investimentos registrados.</p>
                        </div>
                      )}
                      
                      {hasInvestmentData && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none mb-8">
                            <span className="text-xl font-black text-white">R$ {grandTotalInvestment.toFixed(0)}</span>
                         </div>
                      )}
                   </div>
                </Card>
             </section>

             {/* ROW 3: LISTAGEM DE APORTES MANUAIS */}
             <section>
               <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mb-8">
                 <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                    <h3 className="font-bold text-white uppercase text-sm tracking-wide flex items-center gap-2">
                       <Banknote className="h-4 w-4 text-indigo-400" /> Diário de Aportes Manuais
                    </h3>
                    <Badge variant="outline" className="border-indigo-500/30 text-indigo-400 font-mono text-xs">{investments.length} lançamentos</Badge>
                 </div>
                 <div className="max-h-[300px] overflow-y-auto">
                   <table className="w-full text-left text-sm text-slate-400">
                     <thead className="bg-slate-900 text-slate-500 font-bold uppercase tracking-wider text-[10px] sticky top-0">
                       <tr>
                         <th className="p-3">Data</th>
                         <th className="p-3">Responsável</th>
                         <th className="p-3">Destino</th>
                         <th className="p-3">Categoria</th>
                         <th className="p-3">Descrição</th>
                         <th className="p-3 text-right">Valor</th>
                         <th className="p-3 text-center">Ação</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-800">
                       {investments.length === 0 ? (
                          <tr><td colSpan={7} className="p-6 text-center text-slate-600 italic">Nenhum aporte manual registrado neste mês.</td></tr>
                       ) : (
                         investments.map((i: any) => (
                           <tr key={i.id} className="hover:bg-slate-800/50 transition-colors group">
                             <td className="p-3 font-mono text-xs">{format(parseISO(i.investment_date), 'dd/MM/yyyy')}</td>
                             <td className="p-3 font-bold text-slate-300">{i.profiles?.first_name}</td>
                             <td className="p-3 text-xs">{i.teams?.name || <Badge variant="secondary" className="bg-indigo-900 text-indigo-200 border-none text-[9px]">GLOBAL</Badge>}</td>
                             <td className="p-3">
                                <Badge variant="outline" className="border-slate-700 text-slate-400 text-[9px] uppercase font-bold">
                                   {i.category}
                                </Badge>
                             </td>
                             <td className="p-3 text-xs italic text-slate-500 max-w-[200px] truncate">{i.description}</td>
                             <td className="p-3 text-right font-bold text-white font-mono">R$ {i.amount}</td>
                             <td className="p-3 text-center">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-6 w-6 text-slate-600 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => deleteInvestmentMutation.mutate(i.id)}
                                >
                                   <Trash2 className="h-3 w-3" />
                                </Button>
                             </td>
                           </tr>
                         ))
                       )}
                     </tbody>
                   </table>
                 </div>
               </div>
             </section>

             {/* ROW 4: LISTAGEM DE SAÍDAS (PRÊMIOS) - JÁ EXISTENTE */}
             <section>
               <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                 <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                    <h3 className="font-bold text-white uppercase text-sm tracking-wide">Registro de Prêmios (Sistema)</h3>
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 font-mono text-xs">{rewardsStats.length} pagamentos</Badge>
                 </div>
                 <div className="max-h-[400px] overflow-y-auto">
                   <table className="w-full text-left text-sm text-slate-400">
                     <thead className="bg-slate-950 text-slate-500 font-bold uppercase tracking-wider text-[10px] sticky top-0">
                       <tr>
                         <th className="p-3">Data</th>
                         <th className="p-3">Beneficiário (Soldado)</th>
                         <th className="p-3">Equipe</th>
                         <th className="p-3">Motivo</th>
                         <th className="p-3 text-right">Valor Pago</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-800">
                       {rewardsStats.map((r: any) => (
                         <tr key={r.id} className="hover:bg-slate-800/50 transition-colors">
                           <td className="p-3 font-mono text-xs">{format(new Date(r.created_at), 'dd/MM HH:mm')}</td>
                           <td className="p-3 font-bold text-slate-200">{r.profiles?.first_name} {r.profiles?.last_name}</td>
                           <td className="p-3 text-xs">{r.profiles?.teams?.name || '-'}</td>
                           <td className="p-3">
                              <Badge variant="secondary" className="bg-slate-800 text-slate-300 border-none text-[10px] uppercase font-bold">
                                 {r.reward_type}
                              </Badge>
                           </td>
                           <td className="p-3 text-right font-bold text-emerald-400 font-mono">R$ {r.reward_value}</td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </div>
               </div>
             </section>
          </TabsContent>
        </Tabs>

        {/* MODAL NOVO APORTE */}
        <Dialog open={isInvestmentModalOpen} onOpenChange={setIsInvestmentModalOpen}>
          <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="text-xl font-black flex items-center gap-2">
                <Banknote className="h-6 w-6 text-indigo-500" />
                Lançar Investimento Manual
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                Adicione custos de marketing, infraestrutura ou bonificações externas.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-slate-500">Valor (R$)</Label>
                    <Input 
                      type="number" 
                      value={newInvestment.amount} 
                      onChange={(e) => setNewInvestment({...newInvestment, amount: e.target.value})} 
                      className="bg-slate-950 border-slate-700 text-white font-mono text-lg font-bold"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-slate-500">Data</Label>
                    <Input 
                      type="date" 
                      value={newInvestment.date} 
                      onChange={(e) => setNewInvestment({...newInvestment, date: e.target.value})} 
                      className="bg-slate-950 border-slate-700 text-white"
                    />
                  </div>
               </div>

               <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-slate-500">Destino (Equipe)</Label>
                  <Select value={newInvestment.team_id} onValueChange={(v) => setNewInvestment({...newInvestment, team_id: v})}>
                    <SelectTrigger className="bg-slate-950 border-slate-700 text-white h-11">
                      <SelectValue placeholder="Selecione a equipe ou Global" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700 text-white">
                      <SelectItem value="GLOBAL" className="font-bold text-indigo-300">🏢 GLOBAL (Superintendência)</SelectItem>
                      {teams.map((t: any) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
               </div>

               <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-slate-500">Categoria</Label>
                  <Select value={newInvestment.category} onValueChange={(v) => setNewInvestment({...newInvestment, category: v})}>
                    <SelectTrigger className="bg-slate-950 border-slate-700 text-white h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700 text-white">
                      <SelectItem value="MARKETING">📣 Marketing / Leads</SelectItem>
                      <SelectItem value="INFRA">🏢 Infraestrutura / Aluguel</SelectItem>
                      <SelectItem value="BONUS_OFF">💰 Bônus (Fora do Sistema)</SelectItem>
                      <SelectItem value="EVENTS">🎉 Eventos / Confraternização</SelectItem>
                      <SelectItem value="OTHER">🔧 Outros</SelectItem>
                    </SelectContent>
                  </Select>
               </div>

               <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-slate-500">Descrição</Label>
                  <Input 
                    value={newInvestment.description} 
                    onChange={(e) => setNewInvestment({...newInvestment, description: e.target.value})} 
                    className="bg-slate-950 border-slate-700 text-white"
                    placeholder="Ex: Compra de leads Facebook Ads"
                  />
               </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsInvestmentModalOpen(false)} className="text-slate-400 hover:text-white">Cancelar</Button>
              <Button onClick={handleSaveInvestment} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8">
                 Confirmar Lançamento
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </main>

      {/* MODAL META */}
      <Dialog open={isGoalModalOpen} onOpenChange={setIsGoalModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-xl font-black flex items-center gap-2">
              <Target className="h-6 w-6 text-indigo-500" />
              Definir Meta de Combate
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
             <div className="space-y-2">
                <Label>Equipe</Label>
                <div className="p-3 bg-slate-800 rounded-lg font-bold text-slate-300 border border-slate-700">
                  {editingTeam?.name}
                </div>
             </div>
             <div className="space-y-2">
                <Label>Meta de Vendas (Unidades)</Label>
                <Input 
                  type="number" 
                  value={newGoal} 
                  onChange={(e) => setNewGoal(e.target.value)} 
                  className="bg-slate-950 border-slate-700 text-white font-mono text-lg"
                  placeholder="Ex: 10"
                />
             </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsGoalModalOpen(false)} className="text-slate-400 hover:text-white">Cancelar</Button>
            <Button onClick={handleSaveGoal} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
               Confirmar Ordem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CommandCenter;