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
  ArrowUpRight 
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Badge, CheckCircle2 } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface IntelTacticsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brokerId: string;
  userName?: string; // Nome do usuário sendo visualizado (opcional)
}

export function IntelTacticsModal({ open, onOpenChange, brokerId, userName }: IntelTacticsModalProps) {
  
  // 1. Meus Dados
  const { data: myStats } = useQuery({
    queryKey: ['intel-my-stats', brokerId],
    queryFn: async () => {
      const { data: leads } = await supabase.from('leads').select('status').eq('broker_id', brokerId);
      const total = leads?.length || 0;
      const visits = leads?.filter(l => l.status === 'VISIT_SCHEDULED').length || 0;
      const sales = leads?.filter(l => l.status === 'CONCLUDED').length || 0;
      
      return {
        visitRate: total > 0 ? (visits / total) * 100 : 0,
        saleRate: total > 0 ? (sales / total) * 100 : 0,
      };
    },
    enabled: open
  });

  // 2. Benchmarking (Média da Tropa)
  const { data: troopStats } = useQuery({
    queryKey: ['intel-troop-stats'],
    queryFn: async () => {
      // Simplificado: Pega todos os leads do sistema para média geral
      const { data: leads } = await supabase.from('leads').select('status');
      const total = leads?.length || 0;
      const visits = leads?.filter(l => l.status === 'VISIT_SCHEDULED').length || 0;
      const sales = leads?.filter(l => l.status === 'CONCLUDED').length || 0;
      
      return {
        visitRate: total > 0 ? (visits / total) * 100 : 0,
        saleRate: total > 0 ? (sales / total) * 100 : 0,
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

  const chartData = [
    { name: 'Conv. Visita', Eu: myStats?.visitRate || 0, Tropa: troopStats?.visitRate || 0 },
    { name: 'Fechamento', Eu: myStats?.saleRate || 0, Tropa: troopStats?.saleRate || 0 },
  ];

  const displayName = userName ? userName.split(' ')[0] : 'Eu';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0 bg-slate-50 overflow-hidden rounded-3xl">
        <div className="p-6 bg-white border-b flex items-center justify-between">
          <div>
            <DialogTitle className="text-2xl font-black text-slate-900 flex items-center gap-2 uppercase tracking-tighter">
              <Target className="h-6 w-6 text-indigo-600" />
              {userName ? `Dossiê: ${userName}` : "Intel Tática"}
            </DialogTitle>
            <DialogDescription className="text-slate-500 font-medium">
              Análise de performance e espólios de guerra.
            </DialogDescription>
          </div>
          <div className="flex items-center gap-2 bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100">
            <Trophy className="h-5 w-5 text-amber-500" />
            <span className="font-bold text-indigo-900 text-sm">
              Nível: {rewards.length > 5 ? 'Veterano de Elite' : 'Recruta em Ascensão'}
            </span>
          </div>
        </div>

        <Tabs defaultValue="benchmarking" className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 pt-4 bg-white border-b">
            <TabsList className="bg-slate-100 p-1 rounded-xl">
              <TabsTrigger value="benchmarking" className="rounded-lg font-bold text-xs">Comparativo Tático</TabsTrigger>
              <TabsTrigger value="rewards" className="rounded-lg font-bold text-xs">Espólios de Guerra</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="benchmarking" className="flex-1 p-6 overflow-y-auto space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Gráfico Comparativo */}
              <Card className="p-6 border-none shadow-md">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">
                   {displayName} vs. A Tropa
                </h3>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 10, fontWeight: 'bold'}} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
                        cursor={{fill: 'transparent'}}
                        labelStyle={{fontWeight: 'bold', color: '#1e293b'}}
                      />
                      <Bar dataKey="Eu" name={displayName} fill="#4F46E5" radius={[0, 4, 4, 0]} barSize={20} />
                      <Bar dataKey="Tropa" name="Média Tropa" fill="#CBD5E1" radius={[0, 4, 4, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 flex justify-center gap-6 text-xs font-bold">
                  <div className="flex items-center gap-2"><div className="w-3 h-3 bg-indigo-600 rounded-full"/> {displayName}</div>
                  <div className="flex items-center gap-2"><div className="w-3 h-3 bg-slate-300 rounded-full"/> Média Tropa</div>
                </div>
              </Card>

              {/* Insights Táticos */}
              <div className="space-y-4">
                <Card className="p-5 bg-indigo-600 text-white border-none shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10"><TrendingUp className="h-24 w-24" /></div>
                  <h4 className="font-black text-lg mb-2">Diagnóstico de Combate</h4>
                  <p className="text-indigo-100 text-sm leading-relaxed">
                    A taxa de conversão em visitas está {(myStats?.visitRate || 0) > (troopStats?.visitRate || 0) ? 'acima' : 'abaixo'} da média do batalhão.
                  </p>
                  <div className="mt-4 pt-4 border-t border-indigo-500/30">
                    <p className="text-xs font-bold uppercase tracking-widest text-indigo-300 mb-1">Dica do Comandante:</p>
                    <p className="text-sm font-medium">
                      {(myStats?.visitRate || 0) < 15 
                        ? "Foque em ligar nos primeiros 10 minutos. Isso aumenta em 3x a chance de agendamento."
                        : "Excelente ritmo! O foco agora é pedir indicações para os leads quentes."}
                    </p>
                  </div>
                </Card>

                <Card className="p-5 bg-white border-slate-200 shadow-sm">
                  <div className="flex items-center gap-3 mb-2">
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    <h4 className="font-bold text-slate-700">Pontos de Atenção</h4>
                  </div>
                  <ul className="text-sm text-slate-500 space-y-2 list-disc list-inside">
                    <li>3 leads sem interação há mais de 48h.</li>
                    <li>Agenda de amanhã com poucas ações de ataque.</li>
                  </ul>
                </Card>
              </div>
            </div>
          </TabsContent>

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