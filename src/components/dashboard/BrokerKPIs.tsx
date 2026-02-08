import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from "recharts";
import { Lead } from "@/types/lead";
import { 
  TrendingUp, 
  Target, 
  Clock, 
  ChevronLeft, 
  CheckCircle2, 
  AlertCircle,
  BarChart3,
  Rocket,
  Trophy
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface BrokerKPIsProps {
  leads: Lead[];
  onBack: () => void;
  brokerName: string;
}

const COLORS = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444"];

export default function BrokerKPIs({ leads, onBack, brokerName }: BrokerKPIsProps) {
  const queryClient = useQueryClient();

  // 1. Buscar conquistas reais deste corretor - AGORA COM FILTRO DE USER_ID
  const { data: myAchievements = [], isLoading: loadingAch } = useQuery({
    queryKey: ['my-achievements'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('achievements')
        .select('*')
        .eq('user_id', user.id) // FILTRO CRITICAL: Garante que só veja os seus
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    }
  });

  const stats = useMemo(() => {
    const total = leads.length;
    const byStatus = {
      NEW: leads.filter(l => l.status === 'NEW').length,
      IN_PROGRESS: leads.filter(l => l.status === 'IN_PROGRESS').length,
      VISIT_SCHEDULED: leads.filter(l => l.status === 'VISIT_SCHEDULED').length,
      DOCS_REQUESTED: leads.filter(l => l.status === 'DOCS_REQUESTED').length,
      ABANDONED: leads.filter(l => l.status === 'ABANDONED').length,
    };

    // Meta dinâmica baseada em Visitas + Documentos
    // Vamos definir uma meta padrão de 10 "Avanços Reais" (Visitas ou Documentos) por período
    const GOAL_TARGET = 10;
    const actualProgress = byStatus.VISIT_SCHEDULED + byStatus.DOCS_REQUESTED;
    const goalPercentage = Math.min(Math.round((actualProgress / GOAL_TARGET) * 100), 100);

    const conversionRate = total > 0 
      ? ((byStatus.VISIT_SCHEDULED + byStatus.DOCS_REQUESTED) / total * 100).toFixed(1)
      : 0;

    const funnelData = [
      { name: "Novos", value: byStatus.NEW },
      { name: "Atendimento", value: byStatus.IN_PROGRESS },
      { name: "Visitas", value: byStatus.VISIT_SCHEDULED },
      { name: "Docs", value: byStatus.DOCS_REQUESTED },
    ];

    return { total, byStatus, conversionRate, funnelData, goalPercentage };
  }, [leads]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="flex items-center justify-between bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
          <Button 
            variant="default" 
            onClick={onBack} 
            className="rounded-2xl bg-slate-900 hover:bg-black text-white px-6 font-bold flex items-center gap-2 shadow-lg transition-all active:scale-95"
          >
            <ChevronLeft className="h-5 w-5" />
            Voltar ao Mural
          </Button>
          <div className="h-8 w-px bg-slate-200 mx-2" />
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-none">Meu Raio-X</h2>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Performance: {brokerName}</p>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <Badge className="bg-indigo-600 text-white px-4 py-1.5 rounded-full font-black text-xs shadow-sm">
            META: {stats.goalPercentage}%
          </Badge>
          <div className="w-32 h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden border border-slate-200">
            <div 
              className="h-full bg-indigo-600 transition-all duration-1000 ease-out" 
              style={{ width: `${stats.goalPercentage}%` }} 
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="rounded-3xl border-none shadow-[0_15px_40px_-20px_rgba(0,0,0,0.1)] bg-white p-6 dashboard-tilt">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600"><Target className="h-5 w-5" /></div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Conversão Real</span>
          </div>
          <p className="text-4xl font-black text-slate-900">{stats.conversionRate}%</p>
          <div className="mt-2 flex items-center gap-1 text-xs font-bold text-emerald-600">
            <TrendingUp className="h-3 w-3" /> +2.4% vs mês anterior
          </div>
        </Card>

        <Card className="rounded-3xl border-none shadow-[0_15px_40px_-20px_rgba(0,0,0,0.1)] bg-white p-6 dashboard-tilt">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-50 rounded-xl text-amber-600"><Clock className="h-5 w-5" /></div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tempo de Resposta</span>
          </div>
          <p className="text-4xl font-black text-slate-900">12m</p>
          <div className="mt-2 flex items-center gap-1 text-xs font-bold text-indigo-600">
            Padrão Ouro: abaixo de 15m
          </div>
        </Card>

        <Card className="rounded-3xl border-none shadow-[0_15px_40px_-20px_rgba(0,0,0,0.1)] bg-white p-6 dashboard-tilt">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600"><CheckCircle2 className="h-5 w-5" /></div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total de Leads</span>
          </div>
          <p className="text-4xl font-black text-slate-900">{stats.total}</p>
          <div className="mt-2 flex items-center gap-1 text-xs font-bold text-slate-400">
            {stats.byStatus.ABANDONED} excluídos no período
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico 1 */}
        <Card className="rounded-3xl border-none shadow-xl bg-white p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-indigo-600" /> Saúde do Funil
            </h3>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.funnelData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12, fontWeight: 600}} dy={10} />
                <YAxis hide />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 50px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="value" radius={[10, 10, 10, 10]} barSize={45}>
                  {stats.funnelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Minhas Conquistas (Economia Gamificada) */}
        <Card className="rounded-3xl border-none shadow-xl bg-slate-900 text-white p-6 relative overflow-hidden">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-indigo-500/10 blur-2xl" />
          
          <div className="flex items-center justify-between mb-6 relative z-10">
            <h3 className="font-black text-white flex items-center gap-2 uppercase tracking-tighter italic">
              <Trophy className="h-5 w-5 text-amber-400" /> Minha Galeria de Prêmios
            </h3>
            <Badge className="bg-indigo-600 border-none text-white font-bold">{myAchievements.length}</Badge>
          </div>

          <div className="space-y-3 h-[300px] overflow-y-auto pr-2 custom-scrollbar relative z-10">
            {myAchievements.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
                <Rocket className="h-10 w-10 opacity-20" />
                <p className="text-sm font-medium italic">Faça sua primeira venda para inaugurar a galeria!</p>
              </div>
            ) : (
              myAchievements.map((ach: any) => (
                <div key={ach.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10 hover:bg-white/10 transition-colors">
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-indigo-400 uppercase tracking-widest">{ach.reward_label}</span>
                    <span className="text-[10px] text-slate-400 mt-0.5">{new Date(ach.created_at).toLocaleDateString()}</span>
                  </div>
                  <Badge className={cn(
                    "text-[9px] font-black uppercase tracking-tighter px-2 h-5",
                    ach.status === 'APPROVED' ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
                    ach.status === 'PENDING' ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
                    "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                  )}>
                    {ach.status === 'APPROVED' ? "Aprovado" : ach.status === 'PENDING' ? "Pendente" : "Recusado"}
                  </Badge>
                </div>
              ))
            )}
          </div>
          
          <div className="mt-4 p-4 bg-indigo-600/20 rounded-2xl border border-indigo-500/20 relative z-10">
            <p className="text-[10px] text-indigo-300 font-bold leading-relaxed italic">
              * Prêmios aprovados são pagos/ativados pelo Financeiro em até 24h.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}