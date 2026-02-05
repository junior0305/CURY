import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mockLeads } from "@/data/mock-leads";
import { getMockUsers } from "@/data/mock-users";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const LeadRedistribution = () => {
  const [leads, setLeads] = useState(mockLeads);
  const brokers = getMockUsers().filter(u => u.role === 'BROKER');
  const { toast } = useToast();

  const handleRedistribute = (leadId: string, newBrokerId: string) => {
    setLeads(prev => prev.map(l => 
      l.id === leadId ? { ...l, brokerId: newBrokerId, status: 'NEW' as const } : l
    ));

    const brokerName = brokers.find(b => b.id === newBrokerId)?.name;
    toast({
      title: "Lead Redistribuído",
      description: `Lead enviado para ${brokerName}.`,
    });
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex gap-3 text-amber-800">
        <AlertTriangle className="w-5 h-5 shrink-0" />
        <p className="text-sm">Leads com status <b>Abandonado</b> ou sem interação por mais de 24h aparecem aqui para redistribuição.</p>
      </div>

      <div className="rounded-xl border bg-white overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Corretor Atual</TableHead>
              <TableHead>Status / Atraso</TableHead>
              <TableHead className="text-right">Redistribuir Para</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map(lead => (
              <TableRow key={lead.id}>
                <TableCell>
                  <div className="font-medium">{lead.name}</div>
                  <div className="text-xs text-gray-500">{lead.tag}</div>
                </TableCell>
                <TableCell className="text-gray-600">
                  {brokers.find(b => b.id === lead.brokerId)?.name || "Sem Corretor"}
                </TableCell>
                <TableCell>
                  <Badge variant={lead.status === 'ABANDONED' ? 'destructive' : 'secondary'}>
                    {lead.status === 'ABANDONED' ? 'Abandonado' : 'Parado'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Select onValueChange={(val) => handleRedistribute(lead.id, val)}>
                      <SelectTrigger className="w-[180px] h-9">
                        <SelectValue placeholder="Selecionar Corretor" />
                      </SelectTrigger>
                      <SelectContent>
                        {brokers.filter(b => b.id !== lead.brokerId).map(broker => (
                          <SelectItem key={broker.id} value={broker.id}>{broker.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" className="h-9">
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default LeadRedistribution;