import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getMockUsers } from "@/data/mock-users";
import { DistributionQueue } from "@/types/queue";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const LeadDistribution = () => {
  const brokers = getMockUsers().filter(u => u.role === 'BROKER');
  const { toast } = useToast();
  
  const [queues, setQueues] = useState<DistributionQueue[]>([]);

  const [newQueue, setNewQueue] = useState<Partial<DistributionQueue>>({
    name: "",
    matchField: "titulo",
    matchValue: "",
    participantIds: [],
    isActive: true
  });

  const handleToggleBroker = (id: string) => {
    const currentIds = newQueue.participantIds || [];
    setNewQueue({
      ...newQueue,
      participantIds: currentIds.includes(id) ? currentIds.filter(bid => bid !== id) : [...currentIds, id]
    });
  };

  const handleCreateQueue = () => {
    if (!newQueue.name || !newQueue.matchValue || (newQueue.participantIds?.length || 0) === 0) {
      toast({ title: "Erro", description: "Campos incompletos.", variant: "destructive" });
      return;
    }
    setQueues([...queues, { ...(newQueue as DistributionQueue), id: Date.now().toString(), lastAssignedIndex: 0 }]);
    setNewQueue({ name: "", matchField: "titulo", matchValue: "", participantIds: [], isActive: true });
    toast({ title: "Fila Criada", description: "Regra ativada com sucesso." });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <Card className="lg:col-span-1 shadow-md border-none">
        <CardHeader>
          <CardTitle className="text-indigo-700 flex items-center gap-2"><Plus className="w-5 h-5" /> Nova Fila</CardTitle>
          <CardDescription>Configure regras de entrada do Make.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Nome</Label><Input value={newQueue.name} onChange={e => setNewQueue({...newQueue, name: e.target.value})} /></div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={newQueue.matchField} onValueChange={(val: any) => setNewQueue({...newQueue, matchField: val})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="titulo">Título</SelectItem><SelectItem value="tag">Tag</SelectItem></SelectContent>
            </Select>
            <Input placeholder="Match Value" value={newQueue.matchValue} onChange={e => setNewQueue({...newQueue, matchValue: e.target.value})} />
          </div>
          <div className="space-y-2">
            <Label>Participantes</Label>
            <div className="max-h-40 overflow-y-auto border rounded p-2 bg-gray-50">
              {brokers.length === 0 ? (
                <p className="text-sm text-gray-500 p-2">Nenhum corretor encontrado.</p>
              ) : (
                brokers.map(b => (
                  <div key={b.id} className="flex items-center space-x-2 p-1">
                    <Checkbox id={b.id} checked={newQueue.participantIds?.includes(b.id)} onCheckedChange={() => handleToggleBroker(b.id)} />
                    <Label htmlFor={b.id} className="text-sm">{b.name}</Label>
                  </div>
                ))
              )}
            </div>
          </div>
          <Button onClick={handleCreateQueue} className="w-full bg-indigo-600">Criar Fila</Button>
        </CardContent>
      </Card>

      <div className="lg:col-span-2 space-y-4">
        {queues.map(q => (
          <Card key={q.id} className="border-none shadow-sm flex items-center p-4 justify-between">
            <div>
              <h3 className="font-bold text-gray-900">{q.name}</h3>
              <p className="text-xs text-gray-500">{q.matchField}: {q.matchValue} | {q.participantIds.length} corretores</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setQueues(queues.filter(item => item.id !== q.id))}><Trash2 className="w-4 h-4 text-red-400" /></Button>
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