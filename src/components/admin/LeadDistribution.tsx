import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getMockUsers } from "@/data/mock-users";
import { Zap, Settings2, Plus, Info } from "lucide-react";
import { useState } from "react";

const LeadDistribution = () => {
  const brokersInQueue = getMockUsers().filter(u => u.role === 'BROKER' && u.leadAssignmentEnabled);
  const [tags, setTags] = useState(["Imóveis Prontos", "Lançamentos", "Minha Casa Minha Vida"]);
  const [newTag, setNewTag] = useState("");

  const handleAddTag = () => {
    if (newTag && !tags.includes(newTag)) {
      setTags([...tags, newTag]);
      setNewTag("");
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Configuração de Tags */}
        <Card className="lg:col-span-1 border-none shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-indigo-700">
              <Settings2 className="w-5 h-5" />
              Configuração do Make
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100 flex gap-3 text-sm text-indigo-800">
              <Info className="w-5 h-5 shrink-0" />
              <p>Estas tags devem ser enviadas no campo "tag" do seu webhook no Make para filtrar os leads.</p>
            </div>
            
            <div className="space-y-2">
              <Label>Tags Ativas</Label>
              <div className="flex flex-wrap gap-2 mb-4">
                {tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="bg-white border text-indigo-600 px-3 py-1">
                    {tag}
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input 
                  placeholder="Nova tag..." 
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                />
                <Button size="icon" onClick={handleAddTag} className="bg-indigo-600">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Fila de Distribuição */}
        <Card className="lg:col-span-2 border-none shadow-md">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-indigo-700">
              <Zap className="w-5 h-5 text-amber-500" />
              Fila de Distribuição (Round Robin)
            </CardTitle>
            <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
              Sistema Ativo
            </Badge>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Ordem</TableHead>
                  <TableHead>Corretor</TableHead>
                  <TableHead>Último Lead</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {brokersInQueue.map((broker, index) => (
                  <TableRow key={broker.id}>
                    <TableCell className="font-bold text-gray-400">#{index + 1}</TableCell>
                    <TableCell className="font-medium">{broker.name}</TableCell>
                    <TableCell className="text-gray-500">Há 45 min</TableCell>
                    <TableCell className="text-right">
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none">
                        Próximo
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LeadDistribution;