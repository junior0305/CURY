import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Upload, RefreshCw, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { mockLeads } from "@/data/mock-leads";

const LeadRework = () => {
  const { toast } = useToast();
  const [leads, setLeads] = useState(mockLeads.filter(l => l.status === 'ABANDONED'));

  const handleFileUpload = () => {
    toast({ title: "Importação", description: "Leads processados com sucesso." });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card className="md:col-span-1 shadow-md border-none">
        <CardHeader>
          <CardTitle className="text-green-700 flex items-center gap-2"><FileSpreadsheet className="w-5 h-5" /> Importar Planilha</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select><SelectTrigger><SelectValue placeholder="Fila de Destino" /></SelectTrigger><SelectContent><SelectItem value="1">Zona Sul</SelectItem></SelectContent></Select>
          <Label className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center cursor-pointer hover:bg-green-50">
            <Upload className="w-8 h-8 text-gray-400 mb-2" />
            <span className="text-xs text-gray-500">Subir .xlsx</span>
            <Input type="file" className="hidden" onChange={handleFileUpload} />
          </Label>
        </CardContent>
      </Card>

      <Card className="md:col-span-2 shadow-md border-none">
        <CardHeader><CardTitle className="text-indigo-700">Leads Abandonados</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Lead</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ação</TableHead></TableRow></TableHeader>
            <TableBody>
              {leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center text-gray-500">
                    Nenhum lead abandonado para retrabalho.
                  </TableCell>
                </TableRow>
              ) : (
                leads.map(l => (
                  <TableRow key={l.id}>
                    <TableCell><div className="font-bold">{l.name}</div><div className="text-xs">{l.tag}</div></TableCell>
                    <TableCell><Badge variant="destructive">Abandonado</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setLeads(leads.filter(i => i.id !== l.id))}><RefreshCw className="w-3 h-3 mr-2" /> Retrabalhar</Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default LeadRework;