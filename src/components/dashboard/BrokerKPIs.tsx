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
  BarChart3
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface BrokerKPIsProps {
  leads: Lead[];
  onBack: () => void;
  brokerName: string;
}

const COLORS = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444"];

export default function BrokerKPIs({ leads, onBack, brokerName }: BrokerKPIsProps) {
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

        <Card className="rounded-3xl border-none shadow-xl bg-white p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" /> Histórico de Atividade
            </h3>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.funnelData}
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={8}
                  dataKey="value"
                >
                  {stats.funnelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            {stats.funnelData.map((item, idx) => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full" style={{backgroundColor: COLORS[idx % COLORS.length]}} />
                <span className="text-xs font-bold text-slate-600 uppercase tracking-tighter">{item.name}</span>
                <span className="text-xs font-black text-slate-900 ml-auto">{item.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}