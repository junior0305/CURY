import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Upload, RefreshCw, FileSpreadsheet, Trash2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { mockLeads } from "@/data/mock-leads";

const LeadRework = () => {
  const { toast } = useToast();
  const [excludedLeads, setExcludedLeads] = useState(
    mockLeads.filter(l => l.status === 'ABANDONED' || l.status === 'EXCLUDED')
  );
  const [selectedQueue, setSelectedQueue] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedQueue) {
      toast({
        title: "Fila não selecionada",
        description: "Selecione uma fila de destino antes de fazer o upload.",
        variant: "destructive",
      });
      return;
    }
    
    setIsUploading(true);
    // Simulação de processamento de arquivo
    setTimeout(() => {
      setIsUploading(false);
      toast({
        title: "Upload Concluído",
        description: "Os leads da planilha foram adicionados à fila de distribuição.",
      });
      if (e.target) e.target.value = "";
    }, 2000);
  };

  const handleRedistribute = (leadId: string) => {
    setExcludedLeads(prev => prev.filter(l => l.id !== leadId));
    toast({
      title: "Lead em Retrabalho",
      description: "O lead foi enviado novamente para a fila de distribuição.",
    });
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card de Upload de Planilha */}
        <Card className="md:col-span-1 border-none shadow-lg bg-white overflow-hidden">
          <div className="h-1.5 bg-green-500 w-full" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-700">
              <FileSpreadsheet className="w-5 h-5" />
              Importar Planilha
            </CardTitle>
            <CardDescription>Envie leads em massa para uma fila específica.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Fila de Destino</Label>
              <Select value={selectedQueue} onValueChange={setSelectedQueue}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a fila" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Campanha Zona Sul</SelectItem>
                  <SelectItem value="2">Lançamentos SP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="excel-upload" className="block">
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center hover:border-green-400 hover:bg-green-50 transition-all cursor-pointer">
                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                  <span className="text-sm font-medium text-gray-600">
                    {isUploading ? "Processando..." : "Clique para subir .xlsx"}
                  </span>
                </div>
              </Label>
              <Input 
                id="excel-upload" 
                type="file" 
                className="hidden" 
                accept=".xlsx, .xls, .csv"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
            </div>
          </CardContent>
        </Card>

        {/* Listagem de Leads para Retrabalho */}
        <Card className="md:col-span-2 border-none shadow-lg bg-white">
          <CardHeader>
            <CardTitle className="text-indigo-700 flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              Leads Excluídos / Abandonados
            </CardTitle>
            <CardDescription>Recupere leads que foram descartados pelos corretores.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border overflow-hidden">
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Motivo/Status</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {excludedLeads.map((lead) => (
                    <TableRow key={lead.id} className="hover:bg-gray-50">
                      <TableCell>
                        <div className="font-medium text-gray-900">{lead.name}</div>
                        <div className="text-xs text-gray-500">{lead.tag}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-100">
                          {lead.status === 'ABANDONED' ? 'Abandonado' : 'Excluído'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="text-indigo-600 hover:bg-indigo-50 border-indigo-200"
                          onClick={() => handleRedistribute(lead.id)}
                        >
                          <RefreshCw className="w-3.5 h-3.5 mr-2" />
                          Retrabalhar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {excludedLeads.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-gray-500 italic">
                        Nenhum lead aguardando retrabalho no momento.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LeadRework;