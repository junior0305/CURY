import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Link2, ExternalLink, Save } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const IntegrationsManagement = () => {
  const { toast } = useToast();
  const incomingUrl = "https://jcmovytbcghvvukaszyb.supabase.co/functions/v1/incoming-lead";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card className="shadow-md border-none">
        <CardHeader className="bg-indigo-600 text-white rounded-t-xl">
          <CardTitle className="flex items-center gap-2"><Link2 className="w-5 h-5" /> Webhook de Entrada</CardTitle>
          <CardDescription className="text-indigo-100">Make → CRM</CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <Label>URL</Label>
            <div className="flex gap-2">
              <Input readOnly value={incomingUrl} className="bg-gray-50 text-xs" />
              <Button size="icon" variant="outline" onClick={() => { navigator.clipboard.writeText(incomingUrl); toast({title: "Copiado!"}); }}><Copy className="w-4 h-4" /></Button>
            </div>
          </div>
          <pre className="text-[10px] bg-slate-900 text-green-400 p-3 rounded">{`{ "name": "...", "phone": "...", "tag": "..." }`}</pre>
        </CardContent>
      </Card>

      <Card className="shadow-md border-none">
        <CardHeader className="bg-slate-800 text-white rounded-t-xl">
          <CardTitle className="flex items-center gap-2"><ExternalLink className="w-5 h-5" /> Webhook de Saída</CardTitle>
          <CardDescription className="text-slate-300">CRM → Make (Notificações)</CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <Label>URL do Webhook do Make</Label>
          <Input placeholder="https://hook.make.com/..." />
          <Button className="w-full bg-indigo-600"><Save className="w-4 h-4 mr-2" /> Salvar</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default IntegrationsManagement;