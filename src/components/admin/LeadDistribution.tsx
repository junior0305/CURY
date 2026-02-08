import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DistributionQueue } from "@/types/queue";
import { Plus, Trash2, Loader2, Users, Save, ChevronRight, Zap, RefreshCw, Edit } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchTeams, fetchProfiles } from "@/integrations/supabase/profiles";
import { Team, User as AppUser } from "@/types/user";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import UserForm from "./UserForm";

const LeadDistribution = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // States for management
  const [editingQueueId, setEditingQueueId] = useState<string | null>(null);

  // Fetch teams with member count
  const { data: teams = [], isLoading: isLoadingTeams } = useQuery<(Team & { memberCount?: number })[]>({
    queryKey: ['teams'],
    queryFn: fetchTeams,
  });

  // Fetch all profiles to map brokers
  const { data: allProfiles = [], isLoading: isLoadingProfiles } = useQuery<AppUser[]>({
    queryKey: ['profiles'],
    queryFn: fetchProfiles,
  });

  // Fetch Real Queues from DB
  const { data: queues = [], isLoading: isLoadingQueues } = useQuery<DistributionQueue[]>({
    queryKey: ['queues'],
    queryFn: async () => {
      const { data, error } = await supabase.from('distribution_queues').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(q => ({
        id: q.id,
        name: q.name,
        matchField: q.match_field as 'titulo' | 'tag',
        matchValue: q.match_value,
        brokerIds: q.broker_ids || [],
        isActive: q.is_active,
        lastAssignedIndex: q.last_assigned_index,
        teamIds: [] // Mapeamento legado
      }));
    }
  });

  const brokers = useMemo(() => allProfiles.filter(u => u.role === 'BROKER'), [allProfiles]);

  const [newQueue, setNewQueue] = useState<Partial<DistributionQueue & { brokerIds: string[] }>>({
    name: "",
    matchField: "titulo",
    matchValue: "",
    brokerIds: [],
    isActive: true
  });

  // Create or Update Mutation
  const saveQueueMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (editingQueueId) {
        const { error } = await supabase
          .from('distribution_queues')
          .update({
            name: payload.name,
            match_field: payload.matchField,
            match_value: payload.matchValue,
            broker_ids: payload.brokerIds,
            is_active: payload.isActive
          })
          .eq('id', editingQueueId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('distribution_queues')
          .insert({
            name: payload.name,
            match_field: payload.matchField,
            match_value: payload.matchValue,
            broker_ids: payload.brokerIds,
            is_active: payload.isActive
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      toast({ title: "Sucesso", description: editingQueueId ? "Fila atualizada!" : "Fila criada!" });
      resetForm();
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" })
  });

  const deleteQueueMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('distribution_queues').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queues'] });
      toast({ title: "Sucesso", description: "Fila removida." });
    }
  });

  const resetForm = () => {
    setNewQueue({ name: "", matchField: "titulo", matchValue: "", brokerIds: [], isActive: true });
    setEditingQueueId(null);
    setActiveTeamId(null);
  }

  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);

  const selectedTeam = teams.find(t => t.id === activeTeamId);
  const brokersInSelectedTeam = useMemo(() => {
    if (!activeTeamId) return [];
    return brokers.filter(b => b.teamId === activeTeamId);
  }, [brokers, activeTeamId]);

  const handleToggleBroker = (brokerId: string) => {
    const currentIds = newQueue.brokerIds || [];
    setNewQueue({
      ...newQueue,
      brokerIds: currentIds.includes(brokerId) ? currentIds.filter(bid => bid !== brokerId) : [...currentIds, brokerId]
    });
  };

  const handleEditQueue = (q: DistributionQueue) => {
    setEditingQueueId(q.id);
    setNewQueue({
      name: q.name,
      matchField: q.matchField,
      matchValue: q.matchValue,
      brokerIds: (q as any).brokerIds || [],
      isActive: q.isActive
    });
    // Rola para o topo do form se necessário
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isLoading = isLoadingTeams || isLoadingProfiles || isLoadingQueues;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  const selectedBrokersCount = newQueue.brokerIds?.length || 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <Card className="lg:col-span-1 shadow-md border-none sticky top-24 h-fit">
        <CardHeader>
          <CardTitle className="text-indigo-700 flex items-center gap-2">
            {editingQueueId ? <RefreshCw className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            {editingQueueId ? "Editar Fila" : "Nova Fila"}
          </CardTitle>
          <CardDescription>Configure regras de entrada para distribuir leads.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Nome da Fila</Label><Input value={newQueue.name} onChange={e => setNewQueue({...newQueue, name: e.target.value})} /></div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={newQueue.matchField} onValueChange={(val: any) => setNewQueue({...newQueue, matchField: val})}>
              <SelectTrigger><SelectValue placeholder="Campo" /></SelectTrigger>
              <SelectContent><SelectItem value="titulo">Título</SelectItem><SelectItem value="tag">Tag</SelectItem></SelectContent>
            </Select>
            <Input placeholder="Valor" value={newQueue.matchValue} onChange={e => setNewQueue({...newQueue, matchValue: e.target.value})} />
          </div>
          
          <Separator />

          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              <span>Selecionar Corretores</span>
              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{selectedBrokersCount} Selecionados</span>
            </Label>
            
            <div className="grid grid-cols-2 gap-2 h-64">
              <Card className="border-slate-100 shadow-none overflow-hidden">
                <ScrollArea className="h-full">
                  {teams.map(team => (
                    <div 
                      key={team.id} 
                      className={`flex items-center justify-between p-2 cursor-pointer text-xs transition-colors ${activeTeamId === team.id ? 'bg-indigo-50 text-indigo-700 font-bold' : 'hover:bg-slate-50'}`}
                      onClick={() => setActiveTeamId(team.id)}
                    >
                      <span className="truncate">{team.name}</span>
                      <ChevronRight className="w-3 h-3" />
                    </div>
                  ))}
                </ScrollArea>
              </Card>

              <Card className="border-slate-100 shadow-none overflow-hidden">
                <ScrollArea className="h-full">
                  {activeTeamId ? (
                    brokersInSelectedTeam.map(broker => (
                      <div 
                        key={broker.id} 
                        className="flex items-center justify-between p-2 hover:bg-slate-50 transition-colors cursor-pointer text-xs"
                        onClick={() => handleToggleBroker(broker.id)}
                      >
                        <span className="truncate">{broker.name}</span>
                        <Checkbox 
                          id={broker.id} 
                          checked={newQueue.brokerIds?.includes(broker.id)} 
                          onCheckedChange={() => handleToggleBroker(broker.id)} 
                          className="h-3 w-3"
                        />
                      </div>
                    ))
                  ) : (
                    <p className="text-[10px] text-slate-400 p-4 text-center mt-10">Selecione equipe</p>
                  )}
                </ScrollArea>
              </Card>
            </div>
          </div>

          <div className="flex gap-2">
            {editingQueueId && <Button variant="ghost" onClick={resetForm} className="flex-1">Cancelar</Button>}
            <Button onClick={() => saveQueueMutation.mutate(newQueue)} className="flex-1 bg-indigo-600" disabled={selectedBrokersCount === 0 || saveQueueMutation.isPending}>
              {saveQueueMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingQueueId ? "Atualizar Fila" : "Salvar Fila"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="lg:col-span-2 space-y-4">
        <h2 className="text-xl font-bold text-gray-900">Regras de Distribuição Ativas</h2>
        {queues.map(q => (
          <Card key={q.id} className="border-none shadow-md flex flex-col overflow-hidden group">
            <div className="flex items-center justify-between p-4 bg-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-50 rounded-lg"><Zap className="w-5 h-5 text-indigo-600" /></div>
                <div>
                  <h3 className="font-bold text-gray-900">{q.name}</h3>
                  <p className="text-xs text-gray-500 uppercase font-semibold">Se {q.matchField} contém: <span className="text-indigo-600">"{q.matchValue}"</span></p>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" onClick={() => handleEditQueue(q)} className="hover:bg-indigo-50 hover:text-indigo-600"><Edit className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => deleteQueueMutation.mutate(q.id)} className="hover:bg-rose-50 hover:text-rose-600"><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
            <div className="px-4 pb-4 flex flex-wrap gap-1.5">
              {(q as any).brokerIds?.map((brokerId: string) => {
                const broker = brokers.find(b => b.id === brokerId);
                return broker ? (
                  <Badge key={brokerId} variant="secondary" className="text-[9px] font-bold bg-slate-100 text-slate-600 border-none">
                    {broker.name}
                  </Badge>
                ) : null;
              })}
              {(!q as any).brokerIds?.length && <span className="text-[10px] text-rose-400 italic">Sem corretores vinculados</span>}
            </div>
          </Card>
        ))}
        {queues.length === 0 && (
          <Card className="p-12 text-center text-gray-400 border-dashed border-2 bg-transparent shadow-none">
            <Zap className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium">Nenhuma regra de distribuição.</p>
            <p className="text-sm">Crie uma nova fila para começar a distribuir leads automaticamente.</p>
          </Card>
        )}
      </div>
    </div>
  );
};

export default LeadDistribution;