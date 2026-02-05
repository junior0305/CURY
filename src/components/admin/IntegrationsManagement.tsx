import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Copy, Link2, ExternalLink, Save, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const IntegrationsManagement = () => {
  const { toast } = useToast();
  // Simulação da URL do projeto Supabase
  const incomingWebhookUrl = "https://jcmovytbcghvvukaszyb.supabase.co/functions/v1/incoming-lead";
  const [makeOutboundUrl, setMakeOutboundUrl] = useState("https://hook.us1.make.com/xxxxxxxxxxxx");
  const [isSaved, setIsSaved] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiado!",
      description: "URL copiada para a área de transferência.",
    });
  };

  const handleSave = () => {
    setIsSaved(true);
    toast({
      title: "Configurações Salvas",
      description: "As URLs de integração foram atualizadas com sucesso.",
    });
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Receber Leads do Make */}
        <Card className="border-none shadow-md overflow-hidden">
          <CardHeader className="bg-indigo-600 text-white">
            <div className="flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              <CardTitle className="text-lg">Webhook de Entrada (Make → CRM)</CardTitle>
            </div>
            <CardDescription className="text-indigo-100">
              Use esta URL no seu módulo HTTP/Webhook do Make para enviar leads ao sistema.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <Label>URL de Destino</Label>
              <div className="flex gap-2">
                <Input 
                  readOnly 
                  value={incomingWebhookUrl} 
                  className="bg-gray-50 font-mono text-xs"
                />
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => copyToClipboard(incomingWebhookUrl)}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="p-4 bg-amber-50 rounded-lg border border-amber-100 text-sm text-amber-900 space-y-2">
              <p className="font-bold flex items-center gap-2">
                <ExternalLink className="w-4 h-4" /> Formato de JSON esperado:
              </p>
              <pre className="text-[10px] bg-white p-2 rounded border font-mono">
{`{
  "name": "Nome do Lead",
  "email": "lead@email.com",
  "phone": "11999999999",
  "tag": "lancamentos_sp"
}`}
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* Enviar Atualizações para o Make */}
        <Card className="border-none shadow-md">
          <CardHeader className="bg-slate-800 text-white">
            <div className="flex items-center gap-2">
              <ExternalLink className="w-5 h-5" />
              <CardTitle className="text-lg">Webhook de Saída (CRM → Make)</CardTitle>
            </div>
            <CardDescription className="text-slate-300">
              O CRM enviará notificações para esta URL quando um status de lead mudar.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="make-url">URL do Webhook do Make</Label>
              <Input 
                id="make-url"
                placeholder="https://hook.us1.make.com/..."
                value={makeOutboundUrl}
                onChange={(e) => setMakeOutboundUrl(e.target.value)}
              />
            </div>

            <div className="space-y-4">
              <Label>Eventos Habilitados</Label>
              <div className="grid grid-cols-2 gap-2">
                <Badge variant="secondary" className="justify-center py-2 bg-green-50 text-green-700 border-green-200">
                  Novo Lead Recebido
                </Badge>
                <Badge variant="secondary" className="justify-center py-2 bg-blue-50 text-blue-700 border-blue-200">
                  Status Alterado
                </Badge>
                <Badge variant="secondary" className="justify-center py-2 bg-amber-50 text-amber-700 border-amber-200">
                  Lead Redistribuído
                </Badge>
                <Badge variant="secondary" className="justify-center py-2 bg-red-50 text-red-700 border-red-200">
                  Lead Excluído
                </Badge>
              </div>
            </div>

            <Button 
              onClick={handleSave} 
              className={`w-full transition-all ${isSaved ? "bg-green-600 hover:bg-green-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
            >
              {isSaved ? (
                <><CheckCircle2 className="w-4 h-4 mr-2" /> Salvo!</>
              ) : (
                <><Save className="w-4 h-4 mr-2" /> Salvar Configurações</>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-md bg-white">
        <CardHeader>
          <CardTitle className="text-indigo-700">Como funciona a integração?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-600 space-y-4">
          <p>
            1. No <strong>Make</strong>, crie um cenário que comece com o seu formulário ou fonte de leads.
          </p>
          <p>
            2. Adicione um módulo <strong>HTTP "Make a request"</strong> configurado como <strong>POST</strong> e cole a URL de Entrada acima.
          </p>
          <p>
            3. No campo <code>tag</code>, envie o nome exato da fila que você criou na aba de <strong>Distribuição de Leads</strong>. O sistema usará essa tag para decidir quais corretores entrarão na rodada de sorteio.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default IntegrationsManagement;