import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getMockUsers } from "@/data/mock-users";
import { DistributionQueue } from "@/types/queue";
import { Plus, Users, Zap, Trash2, Settings2, Info } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const LeadDistribution = () => {
  const brokers = getMockUsers().filter(u => u.role === 'BROKER');
  const { toast } = useToast();
  
  const [queues, setQueues] = useState<DistributionQueue[]>([
    {
      id: "1",
      name: "Campanha Zona Sul",
      matchField: "titulo",
      matchValue: "Lead ZS Santi",
      participantIds: ["u3", "u5"],
      isActive: true,
      lastAssignedIndex: 0
    }
  ]);

  const [newQueue, setNewQueue] = useState<Partial<DistributionQueue>>({
    name: "",
    matchField: "titulo",
    matchValue: "",
    participantIds: [],
    isActive: true
  });

  const handleToggleBroker = (id: string) => {
    const currentIds = newQueue.participantIds || [];
    if (currentIds.includes(id)) {
      setNewQueue({ ...newQueue, participantIds: currentIds.filter(bid => bid !== id) });
    } else {
      setNewQueue({ ...newQueue, participantIds: [...currentIds, id] });
    }
  };

  const handleCreateQueue = () => {
    if (!newQueue.name || !newQueue.matchValue || (newQueue.participantIds?.length || 0) === 0) {
      toast({
        title: "Campos incompletos",
        description: "Preencha o nome, o valor de match e selecione ao menos um corretor.",
        variant: "destructive"
      });
      return;
    }

    const queue: DistributionQueue = {
      ...(newQueue as DistributionQueue),
      id: Date.now().toString(),
      lastAssignedIndex: 0
    };

    setQueues([...queues, queue]);
    setNewQueue({
      name: "",
      matchField: "titulo",
      matchValue: "",
      participantIds: [],
      isActive: true
    });

    toast({
      title: "Fila Criada",
      description: `A fila "${queue.name}" foi ativada com sucesso.`
    });
  };

  const deleteQueue = (id: string) => {
    setQueues(queues.filter(q => q.id !== id));
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Formulário de Criação */}
        <Card className="lg:col-span-1 border-none shadow-xl bg-white">
          <CardHeader>
            <CardTitle className="text-indigo-700 flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Nova Fila de Regras
            </CardTitle>
            <CardDescription>Configure como os leads do Make serão direcionados.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Nome da Fila</Label>
              <Input 
                placeholder="Ex: Campanha Facebook" 
                value={newQueue.name}
                onChange={e => setNewQueue({...newQueue, name: e.target.value})}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Campo JSON</Label>
                <Select 
                  value={newQueue.matchField} 
                  onValueChange={(val: any) => setNewQueue({...newQueue, matchField: val})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="titulo">Título</SelectItem>
                    <SelectItem value="tag">Tag</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor Esperado</Label>
                <Input 
                  placeholder="Lead ZS Santi" 
                  value={newQueue.matchValue}
                  onChange={e => setNewQueue({...newQueue, matchValue: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="flex justify-between items-center">
                <span>Corretores Participantes</span>
                <Badge variant="secondary" className="text-[10px]">{newQueue.participantIds?.length || 0} selecionados</Badge>
              </Label>
              <div className="max-h-48 overflow-y-auto border rounded-xl p-2 space-y-1 bg-gray-50/50">
                {brokers.map(broker => (
                  <div key={broker.id} className="flex items-center space-x-3 p-2 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-indigo-100">
                    <Checkbox 
                      id={`b-${broker.id}`} 
                      checked={newQueue.participantIds?.includes(broker.id)}
                      onCheckedChange={() => handleToggleBroker(broker.id)}
                    />
                    <Label htmlFor={`b-${broker.id}`} className="flex-1 cursor-pointer text-sm font-medium">
                      {broker.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <Button onClick={handleCreateQueue} className="w-full bg-indigo-600 hover:bg-indigo-700 h-11">
              Criar Fila de Distribuição
            </Button>
          </CardContent>
        </Card>

        {/* Listagem de Filas Ativas */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              Filas Ativas
            </h3>
            <div className="text-sm text-gray-500 flex items-center gap-1">
              <Info className="w-4 h-4" />
              O sistema distribui entre os participantes da fila.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {queues.map(queue => (
              <Card key={queue.id} className="border-none shadow-md hover:shadow-lg transition-all group overflow-hidden">
                <div className="h-1 bg-indigo-500 w-full" />
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg font-bold">{queue.name}</CardTitle>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => deleteQueue(queue.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex gap-2 items-center mt-1">
                    <Badge className="bg-indigo-50 text-indigo-700 hover:bg-indigo-50 border-indigo-100">
                      {queue.matchField}: {queue.matchValue}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Users className="w-4 h-4" />
                      <span>{queue.participantIds.length} Corretores</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {queue.participantIds.map(pid => {
                        const b = brokers.find(u => u.id === pid);
                        return (
                          <Badge key={pid} variant="outline" className="text-[10px] bg-white">
                            {b?.name.split(' ')[0]}
                          </Badge>
                        )
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {queues.length === 0 && (
              <div className="col-span-2 py-12 text-center border-2 border-dashed rounded-2xl border-gray-200">
                <p className="text-gray-500">Nenhuma fila configurada. Crie uma ao lado.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeadDistribution;