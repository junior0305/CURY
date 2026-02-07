import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DistributionQueue } from "@/types/queue";
import { Plus, Trash2, Loader2, Users, User, Save, ChevronRight, Check } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useQuery } from "@tanstack/react-query";
import { fetchTeams, fetchProfiles } from "@/integrations/supabase/profiles";
import { Team, User as AppUser } from "@/types/user";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const LeadDistribution = () => {
  const { toast } = useToast();
  
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

  const brokers = useMemo(() => allProfiles.filter(u => u.role === 'BROKER'), [allProfiles]);

  const [queues, setQueues] = useState<DistributionQueue[]>([]);

  const [newQueue, setNewQueue] = useState<Partial<DistributionQueue & { brokerIds: string[] }>>({
    name: "",
    matchField: "titulo",
    matchValue: "",
    brokerIds: [], // New field to hold selected broker IDs
    isActive: true
  });

  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);

  const selectedTeam = teams.find(t => t.id === activeTeamId);
  const brokersInSelectedTeam = useMemo(() => {
    if (!activeTeamId) return [];
    return brokers.filter(b => b.teamId === activeTeamId);
  }, [brokers, activeTeamId]);

  // Handler for toggling broker selection
  const handleToggleBroker = (brokerId: string) => {
    const currentIds = newQueue.brokerIds || [];
    setNewQueue({
      ...newQueue,
      brokerIds: currentIds.includes(brokerId) ? currentIds.filter(bid => bid !== brokerId) : [...currentIds, brokerId]
    });
  };

  const handleCreateQueue = () => {
    if (!newQueue.name || !newQueue.matchValue || (newQueue.brokerIds?.length || 0) === 0) {
      toast({ title: "Erro", description: "Preencha todos os campos e selecione pelo menos um corretor.", variant: "destructive" });
      return;
    }
    
    // For now, we store the selected broker IDs. We can derive teamIds later if needed.
    setQueues([...queues, { 
      ...(newQueue as DistributionQueue), 
      id: Date.now().toString(), 
      lastAssignedIndex: 0,
      teamIds: [], // Placeholder, as we are using brokerIds now
    }]);
    
    setNewQueue({ name: "", matchField: "titulo", matchValue: "", brokerIds: [], isActive: true });
    setActiveTeamId(null);
    toast({ title: "Fila Criada", description: "Regra ativada com sucesso." });
  };

  const isLoading = isLoadingTeams || isLoadingProfiles;

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
      <Card className="lg:col-span-1 shadow-md border-none">
        <CardHeader>
          <CardTitle className="text-indigo-700 flex items-center gap-2"><Plus className="w-5 h-5" /> Nova Fila</CardTitle>
          <CardDescription>Configure regras de entrada do Make.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Nome da Fila</Label><Input value={newQueue.name} onChange={e => setNewQueue({...newQueue, name: e.target.value})} /></div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={newQueue.matchField} onValueChange={(val: any) => setNewQueue({...newQueue, matchField: val})}>
              <SelectTrigger><SelectValue placeholder="Campo de Match" /></SelectTrigger>
              <SelectContent><SelectItem value="titulo">Título</SelectItem><SelectItem value="tag">Tag</SelectItem></SelectContent>
            </Select>
            <Input placeholder="Valor de Match" value={newQueue.matchValue} onChange={e => setNewQueue({...newQueue, matchValue: e.target.value})} />
          </div>
          
          <Separator />

          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              <span>Corretores na Fila</span>
              <span className="text-xs font-bold text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">{selectedBrokersCount} Selecionados</span>
            </Label>
            
            <div className="grid grid-cols-2 gap-4 h-80">
              {/* Coluna 1: Seleção de Equipes */}
              <Card className="border-indigo-200 shadow-inner">
                <CardHeader className="p-3 border-b bg-indigo-50/50">
                  <CardTitle className="text-sm font-bold text-indigo-700 flex items-center gap-2"><Users className="w-4 h-4" /> Equipes</CardTitle>
                </CardHeader>
                <ScrollArea className="h-[calc(320px-48px)]">
                  {teams.map(team => (
                    <div 
                      key={team.id} 
                      className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${activeTeamId === team.id ? 'bg-indigo-100 font-semibold' : 'hover:bg-gray-50'}`}
                      onClick={() => setActiveTeamId(team.id)}
                    >
                      <span className="text-sm">{team.name}</span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </div>
                  ))}
                </ScrollArea>
              </Card>

              {/* Coluna 2: Seleção de Corretores */}
              <Card className="border-green-200 shadow-inner">
                <CardHeader className="p-3 border-b bg-green-50/50">
                  <CardTitle className="text-sm font-bold text-green-700 flex items-center gap-2">
                    <User className="w-4 h-4" /> 
                    {selectedTeam ? selectedTeam.name : 'Selecione Equipe'}
                  </CardTitle>
                </CardHeader>
                <ScrollArea className="h-[calc(320px-48px)]">
                  {activeTeamId && brokersInSelectedTeam.length > 0 ? (
                    brokersInSelectedTeam.map(broker => (
                      <div 
                        key={broker.id} 
                        className="flex items-center justify-between p-3 hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => handleToggleBroker(broker.id)}
                      >
                        <Label htmlFor={broker.id} className="text-sm font-normal cursor-pointer">
                          {broker.name}
                        </Label>
                        <Checkbox 
                          id={broker.id} 
                          checked={newQueue.brokerIds?.includes(broker.id)} 
                          onCheckedChange={() => handleToggleBroker(broker.id)} 
                          className="rounded-full data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                        />
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-sm text-gray-400 p-4">
                      {activeTeamId ? 'Nenhum corretor nesta equipe.' : 'Selecione uma equipe ao lado.'}
                    </p>
                  )}
                </ScrollArea>
              </Card>
            </div>
          </div>

          <Button onClick={handleCreateQueue} className="w-full bg-indigo-600" disabled={selectedBrokersCount === 0}>
            <Save className="w-4 h-4 mr-2" /> Criar Fila
          </Button>
        </CardContent>
      </Card>

      <div className="lg:col-span-2 space-y-4">
        <h2 className="text-xl font-bold text-gray-900">Filas Ativas ({queues.length})</h2>
        {queues.map(q => (
          <Card key={q.id} className="border-none shadow-lg flex flex-col p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">{q.name}</h3>
                <p className="text-xs text-gray-500">{q.matchField}: {q.matchValue}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setQueues(queues.filter(item => item.id !== q.id))}><Trash2 className="w-4 h-4 text-red-400" /></Button>
            </div>
            <Separator className="my-2" />
            <div className="flex flex-wrap gap-2 mt-2">
              {(q as any).brokerIds?.map((brokerId: string) => {
                const broker = brokers.find(b => b.id === brokerId);
                return broker ? (
                  <span key={brokerId} className="flex items-center text-xs font-medium bg-green-100 text-green-800 px-3 py-1 rounded-full">
                    <Check className="w-3 h-3 mr-1" /> {broker.name}
                  </span>
                ) : null;
              })}
            </div>
          </Card>
        ))}
        {queues.length === 0 && (
          <Card className="p-6 text-center text-gray-400 border-dashed">
            Nenhuma fila de distribuição ativa. Crie uma nova para começar.
          </Card>
        )}
      </div>
    </div>
  );
};

export default LeadDistribution;