import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { getMockUsers } from "@/data/mock-users";
import { Users, Plus, Save } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const QueueManagement = () => {
  const brokers = getMockUsers().filter(u => u.role === 'BROKER');
  const [queueName, setQueueName] = useState("");
  const [selectedBrokers, setSelectedBrokers] = useState<string[]>([]);
  const { toast } = useToast();

  const toggleBroker = (id: string) => {
    setSelectedBrokers(prev => 
      prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
    );
  };

  const handleSaveQueue = () => {
    if (!queueName || selectedBrokers.length === 0) return;
    
    toast({
      title: "Fila Criada",
      description: `A fila "${queueName}" com ${selectedBrokers.length} corretores foi configurada.`,
    });
    setQueueName("");
    setSelectedBrokers([]);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card className="border-none shadow-md">
        <CardHeader>
          <CardTitle className="text-lg text-indigo-700">Nova Fila de Distribuição</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="qname">Nome da Fila (Tag no Make)</Label>
            <Input 
              id="qname" 
              placeholder="Ex: Minha Casa Minha Vida" 
              value={queueName}
              onChange={(e) => setQueueName(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            <Label>Selecionar Participantes</Label>
            <div className="max-h-60 overflow-y-auto space-y-2 p-2 border rounded-lg bg-gray-50">
              {brokers.map(broker => (
                <div key={broker.id} className="flex items-center space-x-2 bg-white p-2 rounded border shadow-sm">
                  <Checkbox 
                    id={broker.id} 
                    checked={selectedBrokers.includes(broker.id)}
                    onCheckedChange={() => toggleBroker(broker.id)}
                  />
                  <Label htmlFor={broker.id} className="flex-1 cursor-pointer font-medium">
                    {broker.name}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <Button onClick={handleSaveQueue} className="w-full bg-indigo-600">
            <Plus className="w-4 h-4 mr-2" />
            Criar Fila
          </Button>
        </CardContent>
      </Card>

      <Card className="border-none shadow-md">
        <CardHeader>
          <CardTitle className="text-lg text-indigo-700">Filas Ativas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="p-4 border rounded-xl bg-indigo-50/50">
              <div className="flex justify-between items-start mb-2">
                <h4 className="font-bold text-indigo-900">Lançamentos</h4>
                <Badge className="bg-green-500">Ativa</Badge>
              </div>
              <p className="text-sm text-gray-600 mb-3">Tag Make: <code className="bg-white px-1 rounded">lancamentos_sp</code></p>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline" className="bg-white">Carlos</Badge>
                <Badge variant="outline" className="bg-white">Ana</Badge>
                <Badge variant="outline" className="bg-white">+2</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default QueueManagement;