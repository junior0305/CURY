import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Globe, Copy, Check, ExternalLink, Shield, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const IntegrationsManagement = () => {
  const [copied, setCopied] = useState<string | null>(null);
  
  const webhookUrl = "https://jcmovytbcghvvukaszyb.supabase.co/functions/v1/incoming-lead";
  const authToken = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjbW92eXRiY2dodnZ1a2FzenliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTM1MzksImV4cCI6MjA4NTg4OTUzOX0.Iwcm9SHz8OT3xicgB_iMCqz1HHZg1SGJQnG8Xok8K0E";

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    toast.success("Copiado para a área de transferência!");
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-100">
          <Globe className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Integrações Externas</h2>
          <p className="text-sm text-gray-500">Conecte o Facebook Leads ou Make (Integromat) ao seu CRM.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden">
          <CardHeader className="bg-slate-50 border-b border-slate-100 p-6">
            <CardTitle className="text-indigo-700 flex items-center gap-2">
              <Globe className="w-5 h-5" /> Webhook de Entrada
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="space-y-3">
              <Label className="font-bold text-slate-700">URL do Webhook (Make/Zapier)</Label>
              <div className="flex gap-2">
                <Input value={webhookUrl} readOnly className="bg-slate-50 font-mono text-xs h-11 rounded-xl border-slate-200" />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(webhookUrl, 'url')} className="rounded-xl h-11 w-11 shrink-0">
                  {copied === 'url' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-[11px] text-slate-400 italic">* Use o método POST no módulo HTTP do Make.</p>
            </div>

            <div className="space-y-3 p-4 bg-amber-50 border border-amber-100 rounded-2xl">
              <Label className="font-black text-amber-800 flex items-center gap-2">
                <Shield className="w-4 h-4" /> Chave de Autorização (Make Header)
              </Label>
              <div className="flex gap-2">
                <Input value={authToken} readOnly className="bg-white font-mono text-[10px] h-11 rounded-xl border-amber-200 text-amber-900" />
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(authToken, 'token')} className="rounded-xl h-11 w-11 shrink-0 bg-white border-amber-200 hover:bg-amber-100">
                  {copied === 'token' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <div className="text-[11px] text-amber-700 space-y-1">
                <p><strong>Como usar no Make:</strong></p>
                <p>1. No módulo HTTP, clique em "Add a header".</p>
                <p>2. Name: <strong>Authorization</strong></p>
                <p>3. Value: Cole a chave acima (incluindo o prefixo "Bearer").</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-xl bg-slate-900 text-white rounded-3xl overflow-hidden">
          <CardHeader className="p-6 border-b border-slate-800">
            <CardTitle className="flex items-center gap-2">
              <ExternalLink className="w-5 h-5 text-indigo-400" /> Documentação API
            </CardTitle>
            <CardDescription className="text-slate-400">Exemplo de Payload para o JSON do Make.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="bg-slate-800 rounded-2xl p-4 font-mono text-[10px] leading-relaxed overflow-x-auto text-indigo-300 border border-slate-700">
              <pre>{`{
  "name": "Nome do Lead",
  "phone": "+5511999999999",
  "email": "lead@email.com",
  "tag": "LAPA",
  "source": "Instagram",
  "renda": "R$ 5.000,00"
}`}</pre>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-slate-400 italic">* Campos 'name' e 'phone' são obrigatórios.</p>
              <Button variant="outline" className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 rounded-xl">
                <Save className="w-4 h-4 mr-2" /> Baixar Documentação PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default IntegrationsManagement;
