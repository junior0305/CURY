import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Users, 
  Settings, 
  Zap, 
  Globe, 
  RefreshCw, 
  ShieldCheck, 
  UserCircle, 
  Loader2, 
  Group, 
  History, 
  CheckCircle, 
  AlertCircle,
  LogOut,
  Coins, 
  CheckCircle2, 
  XCircle as XCircleIcon, 
  Banknote, 
  Rocket, 
  Save,
  Plus,
  Trash2
} from "lucide-react";
import UserManagement from "@/components/admin/UserManagement";
import TeamManagement from "@/components/admin/TeamManagement";
import AdminStats from "@/components/admin/AdminStats";
import LeadDistribution from "@/components/admin/LeadDistribution";
import IntegrationsManagement from "@/components/admin/IntegrationsManagement";
import LeadRework from "@/components/admin/LeadRework";
import { useAuth } from "@/components/AuthProvider";
import { User, UserRole } from "@/types/user";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchProfiles } from "@/integrations/supabase/profiles";
import { fetchLeadsForAdmin } from "@/integrations/supabase/leads";
import type { Lead } from "@/types/lead";
import LeaderboardPodium from "@/components/dashboard/LeaderboardPodium";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "@/components/ui/dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const DistributionLogs = () => {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['distribution-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('distribution_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000 // Atualiza a cada 10 segundos
  });

  return (
    <Card className="shadow-xl border-none p-6 bg-white rounded-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Histórico de Entrada (Make)</h2>
          <p className="text-sm text-slate-500">Acompanhe quem recebeu cada lead em tempo real.</p>
        </div>
        {isLoading && <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-4 py-3 text-left font-bold text-slate-700">Data/Hora</th>
              <th className="px-4 py-3 text-left font-bold text-slate-700">Lead</th>
              <th className="px-4 py-3 text-left font-bold text-slate-700">Regra (Tag)</th>
              <th className="px-4 py-3 text-left font-bold text-slate-700">Corretor Destino</th>
              <th className="px-4 py-3 text-left font-bold text-slate-700">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {logs.length === 0 && !isLoading ? (
              <tr><td colSpan={5} className="py-10 text-center text-slate-400 italic">Nenhum lead recebido ainda via integração externa.</td></tr>
            ) : (
              logs.map((log: any) => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {new Date(log.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-900">{log.lead_name}</div>
                    <div className="text-[10px] text-slate-400">{log.lead_phone}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="bg-slate-100 border-none font-bold text-[10px] uppercase">{log.queue_name}</Badge>
                  </td>
                  <td className="px-4 py-3 font-medium text-indigo-600">
                    {log.assigned_to_name}
                  </td>
                  <td className="px-4 py-3">
                    {log.status === 'SUCCESS' ? (
                      <span className="flex items-center text-xs text-green-600 font-bold">
                        <CheckCircle className="w-3 h-3 mr-1" /> OK
                      </span>
                    ) : (
                      <span className="flex items-center text-xs text-rose-600 font-bold">
                        <AlertCircle className="w-3 h-3 mr-1" /> FALHOU
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

const EconomyManagement = () => {
  const queryClient = useQueryClient();
  
  // 1. Fetch Configs
  const { data: configs = [], isLoading: loadingConfigs } = useQuery({
    queryKey: ['reward-configs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('reward_configs').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  // 2. NEW: State for adding rules
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [newRule, setNewRule] = useState({
    action_type: 'SALE',
    label: '',
    reward_type: 'PIX',
    amount_value: 0
  });

  const createRuleMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await supabase.from('reward_configs').insert([payload]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reward-configs'] });
      toast.success("Nova regra de premiação ativa!");
      setIsAddingRule(false);
      setNewRule({ action_type: 'SALE', label: '', reward_type: 'PIX', amount_value: 0 });
    }
  });

  const toggleRuleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string, active: boolean }) => {
      const { error } = await supabase.from('reward_configs').update({ is_active: active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reward-configs'] })
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('reward_configs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reward-configs'] });
      toast.success("Regra removida.");
    }
  });

  // 3. Fetch Pending Redemptions (Achievements)
  const { data: pending = [], isLoading: loadingPending } = useQuery({
    queryKey: ['pending-achievements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('achievements')
        .select('*, profiles(first_name, last_name)')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const updateConfigMutation = useMutation({
    mutationFn: async ({ id, value }: { id: string, value: number }) => {
      const { error } = await supabase.from('reward_configs').update({ amount_value: value }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reward-configs'] });
      toast.success("Valor do prêmio atualizado!");
    }
  });

  const handleAchievementStatus = async (id: string, newStatus: string) => {
    try {
      console.log(`[Economy] Alterando status da conquista ${id} para ${newStatus}`);
      const { error } = await supabase
        .from('achievements')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) {
        console.error("[Economy] Erro ao atualizar status:", error);
        throw error;
      }

      toast.success(newStatus === 'APPROVED' ? "Prêmio aprovado e publicado!" : "Solicitação recusada.");
      
      // Invalidação forçada de múltiplas queries para limpar a tela
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pending-achievements'] }),
        queryClient.invalidateQueries({ queryKey: ['public-achievements'] }),
        queryClient.invalidateQueries({ queryKey: ['my-achievements'] })
      ]);
    } catch (err: any) {
      toast.error(`Erro ao processar: ${err.message}`);
    }
  };

  // NEW: Campaign Management logic
  const { data: campaigns = [] } = useQuery({
    queryKey: ['active-campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase.from('active_campaigns').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const [newCampaign, setNewCampaign] = useState({
    title: "",
    target_action: "VISIT",
    target_count: 10,
    reward_amount: 150,
    ends_at: ""
  });

  const createCampaignMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await supabase.from('active_campaigns').insert([payload]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['active-campaign'] });
      toast.success("Novo desafio publicado para o time!");
      setNewCampaign({ title: "", target_action: "VISIT", target_count: 10, reward_amount: 150, ends_at: "" });
    }
  });

  const stats = useMemo(() => {
    // Calculando totais para o controle de caixa
    return {
      totalPaid: 0, // Placeholder
      totalPending: pending.reduce((acc: number, curr: any) => acc + Number(curr.reward_value), 0)
    };
  }, [pending]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* 3. Dashboard de Caixa (NOVO) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6 rounded-3xl border-none shadow-lg bg-white">
          <p className="text-[10px] font-black text-slate-400 uppercase">Total Pendente</p>
          <p className="text-3xl font-black text-rose-600">R$ {stats.totalPending.toFixed(2)}</p>
        </Card>
        <Card className="p-6 rounded-3xl border-none shadow-lg bg-slate-900">
          <p className="text-[10px] font-black text-indigo-300 uppercase">Campanha Ativa</p>
          <p className="text-xl font-bold text-white truncate">{campaigns.find(c => c.is_active)?.title || "Nenhuma"}</p>
        </Card>
        <Card className="p-6 rounded-3xl border-none shadow-lg bg-emerald-600">
          <p className="text-[10px] font-black text-emerald-100 uppercase">Fator de Urgência</p>
          <p className="text-3xl font-black text-white">MÁXIMO</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lado Esquerdo: Config de Valores e Nova Campanha */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-none shadow-xl rounded-3xl p-6 bg-white ring-1 ring-slate-100">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-100 text-amber-600 rounded-2xl"><Coins className="h-6 w-6" /></div>
                <div><h3 className="font-black text-slate-900 uppercase tracking-tighter italic">Gatilhos</h3></div>
              </div>
              <Button size="icon" variant="outline" className="rounded-full" onClick={() => setIsAddingRule(!isAddingRule)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {isAddingRule && (
              <div className="mb-6 p-4 bg-indigo-50 rounded-2xl border border-indigo-100 space-y-3 animate-in slide-in-from-top-2">
                <div className="space-y-1">
                  <Label className="text-[10px] font-black uppercase">Ação (Gatilho)</Label>
                  <Select value={newRule.action_type} onValueChange={(v) => setNewRule({...newRule, action_type: v})}>
                    <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SALE">Venda Concluída</SelectItem>
                      <SelectItem value="VISIT">Visita Agendada</SelectItem>
                      <SelectItem value="DOCS">Documento Recebido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-black uppercase">Nome do Prêmio</Label>
                  <Input placeholder="Ex: Jantar na Lapa" className="h-9 bg-white" value={newRule.label} onChange={e => setNewRule({...newRule, label: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-black uppercase">Valor (R$)</Label>
                  <Input type="number" className="h-9 bg-white" value={newRule.amount_value} onChange={e => setNewRule({...newRule, amount_value: parseFloat(e.target.value)})} />
                </div>
                <Button className="w-full h-9 bg-indigo-600 text-xs font-bold" onClick={() => createRuleMutation.mutate(newRule)} disabled={!newRule.label}>ATIVAR REGRA</Button>
              </div>
            )}

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
              {configs.map((c: any) => (
                <div key={c.id} className={cn("p-4 rounded-2xl border transition-all", c.is_active ? "bg-slate-50 border-slate-100" : "bg-slate-100/50 border-slate-200 opacity-60")}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <Badge className="text-[8px] font-black uppercase tracking-tighter mb-1 bg-indigo-100 text-indigo-600 border-none">
                        {c.action_type === 'SALE' ? 'VENDA' : c.action_type === 'VISIT' ? 'VISITA' : 'DOCS'}
                      </Badge>
                      <p className="text-sm font-bold text-slate-800 leading-tight">{c.label}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-400" onClick={() => deleteRuleMutation.mutate(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-lg font-black text-slate-900 leading-none">R$ {c.amount_value}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">{c.is_active ? 'Ativo' : 'Pausado'}</span>
                      <input 
                        type="checkbox" 
                        checked={c.is_active} 
                        onChange={(e) => toggleRuleMutation.mutate({ id: c.id, active: e.target.checked })}
                        className="accent-indigo-600 h-4 w-4 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="border-none shadow-xl rounded-3xl p-6 bg-indigo-600 text-white">
            <h3 className="font-black uppercase tracking-tighter italic mb-4 flex items-center gap-2">
              <Rocket className="h-5 w-5" /> Lançar Desafio
            </h3>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black text-indigo-200">Título do Anúncio</Label>
                <Input value={newCampaign.title} onChange={(e) => setNewCampaign({...newCampaign, title: e.target.value})} placeholder="Ex: SEMANA TURBO" className="bg-white/10 border-white/20 text-white placeholder:text-white/30 h-10 rounded-xl" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black text-indigo-200">Ação</Label>
                  <Select value={newCampaign.target_action} onValueChange={(v) => setNewCampaign({...newCampaign, target_action: v})}>
                    <SelectTrigger className="bg-white/10 border-white/20 text-white h-10 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="VISIT">Visitas</SelectItem><SelectItem value="SALE">Vendas</SelectItem><SelectItem value="DOCS">Documentos</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black text-indigo-200">Meta (Qtde)</Label>
                  <Input type="number" value={newCampaign.target_count} onChange={(e) => setNewCampaign({...newCampaign, target_count: parseInt(e.target.value)})} className="bg-white/10 border-white/20 text-white h-10 rounded-xl" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black text-indigo-200">Prêmio Extra (R$)</Label>
                <Input type="number" value={newCampaign.reward_amount} onChange={(e) => setNewCampaign({...newCampaign, reward_amount: parseFloat(e.target.value)})} className="bg-white/10 border-white/20 text-white h-10 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black text-indigo-200">Expira em</Label>
                <Input type="date" value={newCampaign.ends_at} onChange={(e) => setNewCampaign({...newCampaign, ends_at: e.target.value})} className="bg-white/10 border-white/20 text-white h-10 rounded-xl" />
              </div>
              <Button onClick={() => createCampaignMutation.mutate(newCampaign)} disabled={!newCampaign.title || !newCampaign.ends_at} className="w-full bg-white text-indigo-600 hover:bg-indigo-50 font-black rounded-xl">PUBLICAR DESAFIO</Button>
            </div>
          </Card>
        </div>

        {/* Box 2: Aprovações Pendentes */}
        <Card className="lg:col-span-2 border-none shadow-xl rounded-3xl p-6 bg-white ring-1 ring-slate-100 overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl"><Banknote className="h-6 w-6" /></div>
              <div>
                <h3 className="font-black text-slate-900 uppercase tracking-tighter italic">Pedidos de Resgate</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Aguardando Validação Financeira</p>
              </div>
            </div>
            <Badge className="bg-rose-500 text-white animate-pulse">{pending.length} Pendentes</Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-[10px] uppercase font-black border-b border-slate-50">
                  <th className="pb-3 text-left">Corretor</th>
                  <th className="pb-3 text-left">Conquista</th>
                  <th className="pb-3 text-left">Valor Est.</th>
                  <th className="pb-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pending.length === 0 ? (
                  <tr><td colSpan={4} className="py-10 text-center text-slate-300 italic">Nenhum prêmio pendente de aprovação.</td></tr>
                ) : (
                  pending.map((p: any) => (
                    <tr key={p.id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 font-bold text-slate-900">{p.profiles?.first_name}</td>
                      <td className="py-4">
                        <Badge variant="outline" className="bg-indigo-50 border-none text-indigo-600 font-bold text-[10px]">
                          {p.reward_label}
                        </Badge>
                      </td>
                      <td className="py-4 font-black text-slate-700">R$ {p.reward_value}</td>
                      <td className="py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            size="sm" 
                            className="bg-emerald-600 hover:bg-emerald-700 h-8 rounded-lg font-bold text-[11px]"
                            onClick={() => handleAchievementStatus(p.id, 'APPROVED')}
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Aprovar
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="text-rose-500 hover:bg-rose-50 h-8 rounded-lg font-bold text-[11px]"
                            onClick={() => handleAchievementStatus(p.id, 'CANCELLED')}
                          >
                            <XCircleIcon className="h-3 w-3 mr-1" /> Recusar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};

const Admin = () => {
  const { user: authUser, role: userRole, loading: authLoading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState("users");
  const [isRescueOpen, setIsRescueOpen] = useState(false);
  const [rescueBrokerId, setRescueBrokerId] = useState<string>("");
  const [isRescuing, setIsRescuing] = useState(false);
  const queryClient = useQueryClient();

  const { data: profiles = [] } = useQuery<User[]>({
    queryKey: ["profiles"],
    queryFn: fetchProfiles,
  });

  const { data: leads = [] } = useQuery<Lead[]>({
    queryKey: ["adminLeads"],
    queryFn: fetchLeadsForAdmin,
  });

  // Query specifically for failed distribution logs to show the alert
  const { data: failedLogs = [] } = useQuery({
    queryKey: ['failed-distribution-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('distribution_logs')
        .select('*')
        .eq('status', 'NO_BROKER_AVAILABLE')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    refetchInterval: 15000 
  });

  const handleRescueLeads = async () => {
    if (!rescueBrokerId) {
      toast.error("Selecione um corretor para receber os leads.");
      return;
    }

    setIsRescuing(true);
    try {
      const selectedBroker = profiles.find(p => p.id === rescueBrokerId);
      if (!selectedBroker) throw new Error("Corretor não encontrado.");

      // 1. Get all leads that were not assigned (those in failed logs)
      const phoneNumbers = failedLogs.map(log => log.lead_phone).filter(Boolean);
      
      if (phoneNumbers.length === 0) {
        toast.info("Nenhum lead com telefone encontrado para resgate.");
        setIsRescueOpen(false);
        return;
      }

      // 2. Update the leads table to assign these leads to the selected broker
      const { error: updateError } = await supabase
        .from('leads')
        .update({ 
          broker_id: selectedBroker.id,
          manager_id: selectedBroker.managerId,
          status: 'NEW',
          last_interaction_at: new Date().toISOString()
        })
        .in('phone', phoneNumbers)
        .is('broker_id', null);

      if (updateError) throw updateError;

      // 3. Update the logs to mark them as RESCUED
      const { error: logError } = await supabase
        .from('distribution_logs')
        .update({ 
          status: 'SUCCESS', 
          assigned_to_name: `${selectedBroker.name} (Resgatado)` 
        })
        .in('lead_phone', phoneNumbers)
        .eq('status', 'NO_BROKER_AVAILABLE');

      if (logError) console.error("Erro ao atualizar logs:", logError);

      toast.success(`${failedLogs.length} leads resgatados e enviados para ${selectedBroker.name}!`);
      queryClient.invalidateQueries({ queryKey: ['failed-distribution-logs'] });
      queryClient.invalidateQueries({ queryKey: ['distribution-logs'] });
      setIsRescueOpen(false);
    } catch (err: any) {
      toast.error(`Falha no resgate: ${err.message}`);
    } finally {
      setIsRescuing(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
      </div>
    );
  }

  const currentUser: User = {
    id: authUser?.id || "unknown",
    name: authUser?.email || "Admin User",
    email: authUser?.email || "",
    role: (userRole as UserRole) || "SUPERINTENDENT",
    managerId: null,
    teamId: null,
    leadAssignmentEnabled: false,
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Urgent Alert for unassigned leads */}
        {failedLogs.length > 0 && (
          <Alert variant="destructive" className="mb-6 border-2 border-rose-500 bg-rose-50 animate-pulse rounded-2xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4 p-6">
            <div className="flex items-center">
              <AlertCircle className="h-8 w-8 text-rose-600 shrink-0" />
              <div className="ml-4">
                <AlertTitle className="font-black text-rose-800 uppercase tracking-wider text-lg">
                  Leads em Perigo!
                </AlertTitle>
                <AlertDescription className="text-rose-700 font-medium">
                  {failedLogs.length} leads chegaram e estão sem dono. Resgate-os agora para não perder a venda.
                </AlertDescription>
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button 
                className="bg-rose-600 hover:bg-rose-700 text-white font-black px-6 py-2 rounded-xl shadow-md transition-all active:scale-95 flex-1 sm:flex-none"
                onClick={() => setIsRescueOpen(true)}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Resgatar Leads
              </Button>
              <Button
                variant="outline"
                className="border-rose-200 text-rose-600 font-bold px-4 py-2 rounded-xl flex-1 sm:flex-none"
                onClick={() => setActiveTab("users")}
              >
                Ativar Fila
              </Button>
            </div>
          </Alert>
        )}

        {/* Rescue Modal */}
        <Dialog open={isRescueOpen} onOpenChange={setIsRescueOpen}>
          <DialogContent className="sm:max-w-md rounded-3xl border-none shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black text-slate-900">Resgate de Leads</DialogTitle>
              <DialogDescription className="text-slate-500 font-medium text-left">
                Escolha o corretor que vai assumir esses {failedLogs.length} leads agora.
              </DialogDescription>
            </DialogHeader>
            <div className="py-6 space-y-4 text-left">
              <div className="space-y-2">
                <Label className="font-bold text-slate-700">Destinar leads para:</Label>
                <Select onValueChange={setRescueBrokerId} value={rescueBrokerId}>
                  <SelectTrigger className="h-12 rounded-xl border-slate-200 focus:ring-indigo-500">
                    <SelectValue placeholder="Selecione o corretor sortudo" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-none shadow-xl">
                    {profiles.filter(p => p.role === 'BROKER').map(broker => (
                      <SelectItem key={broker.id} value={broker.id} className="focus:bg-indigo-50 rounded-lg">
                        {broker.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                <p className="text-xs text-indigo-700 font-medium leading-relaxed">
                  * Ao resgatar, os leads aparecerão instantaneamente no dashboard do corretor escolhido como "NOVOS".
                </p>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" onClick={() => setIsRescueOpen(false)} className="rounded-xl font-bold">Cancelar</Button>
              <Button
                onClick={handleRescueLeads}
                disabled={isRescuing || !rescueBrokerId}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-black px-8 rounded-xl shadow-lg shadow-indigo-100 h-11"
              >
                {isRescuing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Confirmar Resgate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-extrabold text-gray-900">
              Dashboard <span className="text-indigo-600">Admin</span>
            </h1>
            <p className="text-gray-500 mt-1 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Nível: <b>{currentUser.role}</b>
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-white p-3 rounded-2xl shadow-sm border border-indigo-50 flex items-center gap-3">
              <UserCircle className="w-8 h-8 text-indigo-200" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-gray-400">LOGADO COMO:</span>
                <span className="text-indigo-600 font-bold">{currentUser.name}</span>
              </div>
            </div>
            <Button 
              variant="outline" 
              onClick={signOut}
              className="rounded-2xl border-rose-100 text-rose-600 hover:bg-rose-50 hover:text-rose-700 h-12 px-6 font-bold shadow-sm transition-all"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>

        <AdminStats currentUser={currentUser} />

        <div className="mb-8">
          <LeaderboardPodium
            leads={leads}
            users={profiles}
            isMonthly={false}
          />
        </div>

        <Tabs defaultValue="users" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-8 h-14 bg-white shadow-lg rounded-2xl p-1 mb-8">
            <TabsTrigger value="users" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-xl text-[10px] sm:text-xs uppercase font-black tracking-tighter"><Users className="w-3.5 h-3.5 mr-1" /> Time</TabsTrigger>
            <TabsTrigger value="teams" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-xl text-[10px] sm:text-xs uppercase font-black tracking-tighter"><Group className="w-3.5 h-3.5 mr-1" /> Equipes</TabsTrigger>
            <TabsTrigger value="economy" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-xl text-[10px] sm:text-xs uppercase font-black tracking-tighter"><Coins className="w-3.5 h-3.5 mr-1" /> Economia</TabsTrigger>
            <TabsTrigger value="leads" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-xl text-[10px] sm:text-xs uppercase font-black tracking-tighter"><Zap className="w-3.5 h-3.5 mr-1" /> Regras</TabsTrigger>
            <TabsTrigger value="logs" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-xl text-[10px] sm:text-xs uppercase font-black tracking-tighter"><History className="w-3.5 h-3.5 mr-1" /> Logs</TabsTrigger>
            <TabsTrigger value="rework" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-xl text-[10px] sm:text-xs uppercase font-black tracking-tighter"><RefreshCw className="w-3.5 h-3.5 mr-1" /> Rework</TabsTrigger>
            <TabsTrigger value="integrations" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-xl text-[10px] sm:text-xs uppercase font-black tracking-tighter"><Globe className="w-3.5 h-3.5 mr-1" /> Webhooks</TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white rounded-xl text-[10px] sm:text-xs uppercase font-black tracking-tighter"><Settings className="w-3.5 h-3.5 mr-1" /> Ajustes</TabsTrigger>
          </TabsList>

          <TabsContent value="users"><Card className="shadow-xl border-none p-6"><UserManagement currentUser={currentUser} /></Card></TabsContent>
          <TabsContent value="teams"><Card className="shadow-xl border-none p-6"><TeamManagement /></Card></TabsContent>
          <TabsContent value="economy"><EconomyManagement /></TabsContent>
          <TabsContent value="leads"><LeadDistribution /></TabsContent>
          <TabsContent value="logs"><DistributionLogs /></TabsContent>
          <TabsContent value="rework"><LeadRework /></TabsContent>
          <TabsContent value="integrations"><IntegrationsManagement /></TabsContent>
          <TabsContent value="settings"><Card className="p-10 text-center text-gray-400">Configurações globais em breve.</Card></TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;