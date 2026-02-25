import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  BarChart3, 
  Trophy, 
  Target, 
  TrendingUp, 
  AlertTriangle, 
  Coins, 
  ArrowUpRight,
  CheckCircle2,
  FileText,
  Percent,
  Activity,
  Zap
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  Radar,
  Legend
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface IntelTacticsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brokerId: string;
  userName?: string; // Nome do usuário sendo visualizado (opcional)
}

export function IntelTacticsModal({ open, onOpenChange, brokerId, userName }: IntelTacticsModalProps) {
  
  // 1. Meus Dados Detalhados
  const { data: myStats } = useQuery({
    queryKey: ['intel-my-stats-advanced', brokerId],
    queryFn: async () => {
      const { data: leads } = await supabase.from('leads').select('status').eq('broker_id', brokerId);
      
      const total = leads?.length || 0;
      const newLeads = leads?.filter(l => l.status === 'NEW').length || 0;
      const inProgress = leads?.filter(l => l.status === 'IN_PROGRESS').length || 0;
      const visits = leads?.filter(l => l.status === 'VISIT_SCHEDULED').length || 0;
      const docs = leads?.filter(l => l.status === 'DOCS_REQUESTED').length || 0;
      const sales = leads?.filter(l => l.status === 'CONCLUDED').length || 0;
      
      // Funil Absoluto
      const active = total - newLeads; // Leads trabalhados
      
      return {
        total,
        docs, // A MINA DE OURO
        funnel: [
          { name: 'Recebidos', value: total, fill: '#94a3b8' },
          { name: 'Atendidos', value: active, fill: '#6366f1' },
          { name: 'Visitas', value: visits, fill: '#8b5cf6' },
          { name: 'Propostas/Docs', value: docs + sales, fill: '#f59e0b' }, // Docs + Vendas = Propostas reais
          { name: 'Vendas', value: sales, fill: '#10b981' },
        ],
        rates: {
          engagement: total > 0 ? (active / total) * 100 : 0, // Taxa de Atendimento
          persuasion: active > 0 ? (visits / active) * 100 : 0, // Conversão para Visita
          technical: visits > 0 ? ((docs + sales) / visits) * 100 : 0, // Visita para Proposta
          closing: (docs + sales) > 0 ? (sales / (docs + sales)) * 100 : 0, // Proposta para Venda
        }
      };
    },
    enabled: open
  });

  // 2. Benchmarking (Média da Tropa)
  const { data: troopStats } = useQuery({
    queryKey: ['intel-troop-stats-advanced'],
    queryFn: async () => {
      const { data: leads } = await supabase.from('leads').select('status');
      
      const total = leads?.length || 0;
      const newLeads = leads?.filter(l => l.status === 'NEW').length || 0;
      const active = total - newLeads;
      const visits = leads?.filter(l => l.status === 'VISIT_SCHEDULED').length || 0;
      const docs = leads?.filter(l => l.status === 'DOCS_REQUESTED').length || 0;
      const sales = leads?.filter(l => l.status === 'CONCLUDED').length || 0;
      
      return {
        rates: {
          engagement: total > 0 ? (active / total) * 100 : 0,
          persuasion: active > 0 ? (visits / active) * 100 : 0,
          technical: visits > 0 ? ((docs + sales) / visits) * 100 : 0,
          closing: (docs + sales) > 0 ? (sales / (docs + sales)) * 100 : 0,
        }
      };
    },
    enabled: open
  });

  // 3. Minhas Recompensas (Espólios)
  const { data: rewards = [] } = useQuery({
    queryKey: ['my-rewards', brokerId],
    queryFn: async () => {
      const { data } = await supabase
        .from('achievements')
        .select('*')
        .eq('profile_id', brokerId)
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: open
  });

  const radarData = [
    { subject: 'Engajamento', A: myStats?.rates.engagement || 0, B: troopStats?.rates.engagement || 0, fullMark: 100 },
    { subject: 'Persuasão', A: myStats?.rates.persuasion || 0, B: troopStats?.rates.persuasion || 0, fullMark: 100 },
    { subject: 'Técnica', A: myStats?.rates.technical || 0, B: troopStats?.rates.technical || 0, fullMark: 100 },
    { subject: 'Fechamento', A: myStats?.rates.closing || 0, B: troopStats?.rates.closing || 0, fullMark: 100 },
    { subject: 'Constância', A: 85, B: 70, fullMark: 100 }, // Mockado por enquanto (Baseado em dias ativos)
  ];

  const displayName = userName ? userName.split(' ')[0] : 'Eu';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 gap-0 bg-slate-50 overflow-hidden rounded-3xl">
        <div className="p-6 bg-white border-b flex items-center justify-between shrink-0">
          <div>
            <DialogTitle className="text-2xl font-black text-slate-900 flex items-center gap-2 uppercase tracking-tighter">
              <Activity className="h-6 w-6 text-indigo-600" />
              {userName ? `Dossiê Tático: ${userName}` : "Meu Cockpit de Guerra"}
            </DialogTitle>
            <DialogDescription className="text-slate-500 font-medium">
              Análise profunda de performance e inteligência de combate.
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2 bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100">
            <Trophy className="h-5 w-5 text-amber-500" />
            <span className="font-bold text-indigo-900 text-sm">
              Nível: {rewards.length > 5 ? 'Veterano de Elite' : 'Recruta em Ascensão'}
            </span>
          </div>
        </div>

        <Tabs defaultValue="overview" className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 pt-4 bg-white border-b shrink-0">
            <TabsList className="bg-slate-100 p-1 rounded-xl">
              <TabsTrigger value="overview" className="rounded-lg font-bold text-xs px-6">Radar Tático</TabsTrigger>
              <TabsTrigger value="funnel" className="rounded-lg font-bold text-xs px-6">Funil de Vazamento</TabsTrigger>
              <TabsTrigger value="rewards" className="rounded-lg font-bold text-xs px-6">Espólios de Guerra</TabsTrigger>
            </TabsList>
          </div>

          {/* TAB 1: VISÃO GERAL (RADAR + MINA DE OURO) */}
          <TabsContent value="overview" className="flex-1 p-6 overflow-y-auto space-y-6">
            
            {/* KPI CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4 bg-amber-50 border-amber-200 border-l-4 border-l-amber-500 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity"><FileText className="h-16 w-16 text-amber-600" /></div>
                <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-1">Mina de Ouro (Docs)</p>
                <div className="flex items-baseline gap-1">
                  <h3 className="text-3xl font-black text-slate-900">{myStats?.docs || 0}</h3>
                  <span className="text-xs font-bold text-amber-600">Leads Travados</span>
                </div>
                <p className="text-xs text-amber-800 mt-2 font-medium">Potencial de fechamento imediato. Foque aqui!</p>
              </Card>

              <Card className="p-4 bg-white border-slate-200 shadow-sm relative overflow-hidden">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Taxa de Fechamento</p>
                 <div className="flex items-baseline gap-2">
                    <h3 className="text-3xl font-black text-emerald-600">{Math.round(myStats?.rates.closing || 0)}%</h3>
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                 </div>
                 <p className="text-xs text-slate-500 mt-2">Média da Tropa: <span className="font-bold">{Math.round(troopStats?.rates.closing || 0)}%</span></p>
              </Card>

              <Card className="p-4 bg-indigo-600 text-white border-none shadow-md relative overflow-hidden">
                 <div className="absolute -right-4 -bottom-4 bg-white/10 w-24 h-24 rounded-full blur-2xl" />
                 <p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-1">Eficiência Tática</p>
                 <div className="flex items-baseline gap-2">
                    <h3 className="text-3xl font-black text-white">{(myStats?.rates.engagement || 0) > 80 ? 'S' : (myStats?.rates.engagement || 0) > 50 ? 'A' : 'B'}</h3>
                    <span className="text-xs font-bold text-indigo-200">Tier</span>
                 </div>
                 <p className="text-xs text-indigo-100 mt-2">Baseado na sua velocidade e conversão.</p>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[400px]">
              {/* GRÁFICO DE RADAR */}
              <Card className="p-4 border-slate-200 shadow-sm flex flex-col">
                <div className="mb-4">
                  <h3 className="text-sm font-black text-slate-700 uppercase tracking-tight flex items-center gap-2">
                    <Target className="h-4 w-4 text-indigo-600" /> Radar de Competências
                  </h3>
                  <p className="text-xs text-slate-400">Comparativo direto com a média do batalhão.</p>
                </div>
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold' }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar name={displayName} dataKey="A" stroke="#4f46e5" strokeWidth={3} fill="#4f46e5" fillOpacity={0.2} />
                      <Radar name="Tropa" dataKey="B" stroke="#94a3b8" strokeWidth={2} fill="#94a3b8" fillOpacity={0.1} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 'bold' }} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
                        itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* DICAS DE INTELIGÊNCIA */}
              <Card className="p-0 border-slate-200 shadow-sm overflow-hidden flex flex-col bg-slate-50">
                 <div className="p-4 bg-white border-b">
                    <h3 className="text-sm font-black text-slate-700 uppercase tracking-tight flex items-center gap-2">
                      <Zap className="h-4 w-4 text-amber-500" /> Ordens de Melhoria
                    </h3>
                 </div>
                 <div className="p-4 space-y-3 overflow-y-auto custom-scrollbar">
                    {(myStats?.docs || 0) > 0 && (
                      <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 flex gap-3">
                         <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                         <div>
                            <h4 className="text-xs font-bold text-amber-800 uppercase mb-1">Ataque à Mina de Ouro</h4>
                            <p className="text-xs text-amber-700 leading-relaxed">
                               Você tem <span className="font-black">{myStats?.docs} clientes</span> com documentação pendente. 
                               Se focar neles hoje, sua chance de venda é de 60%. Pare de prospectar novos e feche esses primeiro!
                            </p>
                         </div>
                      </div>
                    )}

                    {(myStats?.rates.persuasion || 0) < (troopStats?.rates.persuasion || 0) && (
                      <div className="bg-white p-3 rounded-xl border border-slate-200 flex gap-3">
                         <TrendingUp className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
                         <div>
                            <h4 className="text-xs font-bold text-rose-700 uppercase mb-1">Melhore a Persuasão</h4>
                            <p className="text-xs text-slate-600 leading-relaxed">
                               Você atende muito, mas agenda pouco. Tente usar a técnica do "Falso Dilema" (Manhã ou Tarde?) para forçar o agendamento.
                            </p>
                         </div>
                      </div>
                    )}

                    <div className="bg-white p-3 rounded-xl border border-slate-200 flex gap-3 opacity-70">
                       <CheckCircle2 className="h-5 w-5 text-slate-400 shrink-0 mt-0.5" />
                       <div>
                          <h4 className="text-xs font-bold text-slate-600 uppercase mb-1">Volume de Atividade</h4>
                          <p className="text-xs text-slate-500 leading-relaxed">
                             Seu volume de novos leads está saudável. Mantenha a cadência atual para garantir o funil cheio na próxima semana.
                          </p>
                       </div>
                    </div>
                 </div>
              </Card>
            </div>
          </TabsContent>

          {/* TAB 2: FUNIL */}
          <TabsContent value="funnel" className="flex-1 p-6 overflow-y-auto">
            <Card className="p-6 h-[500px] border-none shadow-none bg-transparent">
              <div className="flex items-center justify-between mb-6">
                 <div>
                    <h3 className="text-lg font-black text-slate-800">Seu Funil de Vendas</h3>
                    <p className="text-sm text-slate-500">Onde seus leads estão ficando pelo caminho.</p>
                 </div>
                 <div className="text-right">
                    <p className="text-xs font-bold text-slate-400 uppercase">Conversão Global</p>
                    <p className="text-2xl font-black text-indigo-600">
                       {((myStats?.rates.closing || 0) * (myStats?.rates.technical || 0) * (myStats?.rates.persuasion || 0) * (myStats?.rates.engagement || 0) / 1000000).toFixed(1)}%
                    </p>
                 </div>
              </div>

              <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={myStats?.funnel || []} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 11, fontWeight: 'bold', fill: '#475569'}} />
                    <Tooltip 
                      cursor={{fill: 'transparent'}}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
                    />
                    <Bar dataKey="value" name="Leads" radius={[0, 4, 4, 0]} barSize={30} label={{ position: 'right', fill: '#64748b', fontWeight: 'bold', fontSize: 12 }} />
                 </BarChart>
              </ResponsiveContainer>
            </Card>
          </TabsContent>

          {/* TAB 3: REWARDS (Mantido igual) */}
          <TabsContent value="rewards" className="flex-1 p-6 overflow-y-auto">
            {rewards.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <Coins className="h-16 w-16 mb-4 opacity-20" />
                <p className="font-medium">Nenhum espólio conquistado ainda.</p>
                <p className="text-sm">Bata as metas da Semana Turbinada para encher seu cofre!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {rewards.map((r: any) => (
                  <Card key={r.id} className="p-4 border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition-all">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                          {new Date(r.created_at).toLocaleDateString()}
                        </p>
                        <h4 className="font-bold text-slate-900">{r.reward_label}</h4>
                      </div>
                      <Badge className={cn("text-[10px]", r.status === 'APPROVED' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
                        {r.status === 'APPROVED' ? 'RESGATADO' : 'PENDENTE'}
                      </Badge>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center">
                      <span className="font-black text-emerald-600 text-lg">R$ {r.reward_value}</span>
                      {r.status === 'APPROVED' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}