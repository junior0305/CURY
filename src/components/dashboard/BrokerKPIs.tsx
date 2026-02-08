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

    const conversionRate = total > 0 
      ? ((byStatus.VISIT_SCHEDULED + byStatus.DOCS_REQUESTED) / total * 100).toFixed(1)
      : 0;

    const funnelData = [
      { name: "Novos", value: byStatus.NEW },
      { name: "Atendimento", value: byStatus.IN_PROGRESS },
      { name: "Visitas", value: byStatus.VISIT_SCHEDULED },
      { name: "Docs", value: byStatus.DOCS_REQUESTED },
    ];

    return { total, byStatus, conversionRate, funnelData };
  }, [leads]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full hover:bg-white shadow-sm">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Meus KPIs</h2>
            <p className="text-slate-500 text-sm font-medium">Análise de performance: {brokerName}</p>
          </div>
        </div>
        <Badge className="bg-indigo-600 text-white px-3 py-1 rounded-full font-bold">
          Meta: 85% Concluída
        </Badge>
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
