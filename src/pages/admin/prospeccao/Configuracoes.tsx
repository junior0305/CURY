import { Settings, Info, Copy, Key, Shield, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

export default function Configuracoes() {
  const { toast } = useToast();
  const webhookUrl = "https://dcimeuefnhaiemrfiklj.supabase.co/functions/v1/webhook_receiver";

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-black text-white flex items-center gap-2">
          <Settings className="w-7 h-7 text-gray-400" />
          Configurações do Sistema
        </h3>
        <p className="text-sm text-gray-500">URLs e configurações importantes</p>
      </div>

      <Card className="border-2 border-purple-500/30 bg-purple-950/20">
        <CardHeader>
          <CardTitle className="text-white text-lg font-bold flex items-center gap-2">
            <Info className="w-5 h-5 text-purple-400" />
            Webhook URL (Evolution API)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-400">
            Configure esta URL no Evolution API para receber mensagens dos leads:
          </p>
          <div className="flex items-center gap-2 bg-slate-900/60 rounded-lg px-4 py-3 border border-purple-500/20">
            <code className="flex-1 text-purple-200 text-sm font-mono break-all">{webhookUrl}</code>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                navigator.clipboard.writeText(webhookUrl);
                toast({ title: "📋 Copiado para área de transferência!" });
              }}
              className="text-purple-400 hover:text-white hover:bg-purple-900/40"
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <div className="bg-slate-900/40 rounded-lg p-3 text-xs text-gray-500 space-y-1">
            <p className="font-bold text-gray-400">📖 Como configurar no Evolution API:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Acesse o painel do Evolution API</li>
              <li>Vá em <strong>Webhooks</strong> → <strong>Messages</strong></li>
              <li>Cole a URL acima no campo de webhook</li>
              <li>Marque a opção <strong>"Message Received"</strong></li>
              <li>Salve as configurações</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card className="border-2 border-yellow-500/30 bg-yellow-950/20">
        <CardHeader>
          <CardTitle className="text-white text-lg font-bold flex items-center gap-2">
            <Key className="w-5 h-5 text-yellow-400" />
            Anthropic API Key (Claude)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-400">
            Para que o motor de IA funcione, você precisa configurar a chave da Anthropic:
          </p>
          
          <div className="bg-slate-900/40 rounded-lg p-4 border border-yellow-500/20">
            <p className="text-sm font-bold text-yellow-300 mb-3">🔧 Passos para configurar:</p>
            <ol className="list-decimal list-inside text-sm text-gray-300 space-y-2">
              <li>
                Obtenha sua chave em:{" "}
                <a 
                  href="https://console.anthropic.com/settings/keys" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-400 underline hover:text-blue-300 inline-flex items-center gap-1"
                >
                  console.anthropic.com
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>
                Acesse:{" "}
                <a 
                  href="https://supabase.com/dashboard/project/dcimeuefnhaiemrfiklj/settings/functions" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-400 underline hover:text-blue-300 inline-flex items-center gap-1"
                >
                  Supabase Dashboard → Edge Functions
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>Clique em <strong className="text-yellow-300">"Add Secret"</strong> ou <strong className="text-yellow-300">"Edge Function Secrets"</strong></li>
              <li>Name: <code className="bg-slate-800 px-2 py-0.5 rounded text-yellow-300 font-mono">ANTHROPIC_API_KEY</code></li>
              <li>Value: <code className="bg-slate-800 px-2 py-0.5 rounded text-yellow-300 font-mono">sk-ant-...</code> (sua chave)</li>
              <li>Clique em <strong>"Save"</strong></li>
            </ol>
          </div>

          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 text-xs text-red-300">
            <p className="font-bold mb-1">⚠️ Importante:</p>
            <p>Sem esta configuração, o motor de IA não funcionará e as campanhas falharão ao tentar responder leads.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-2 border-blue-500/30 bg-blue-950/20">
        <CardHeader>
          <CardTitle className="text-white text-lg font-bold flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            Edge Functions Deployadas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400 mb-4">Funções serverless ativas no backend:</p>
          <div className="space-y-2">
            {[
              { name: "orchestrator", desc: "Distribui leads entre bots (load balancer)" },
              { name: "send_whatsapp_message", desc: "Envia mensagens via Evolution API" },
              { name: "webhook_receiver", desc: "Recebe respostas dos leads" },
              { name: "ia_chat_engine", desc: "Motor de IA conversacional (Claude)" },
            ].map(func => (
              <div key={func.name} className="flex items-start justify-between p-3 bg-slate-900/40 rounded-lg border border-gray-700/30">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <code className="text-blue-300 font-mono text-sm">{func.name}</code>
                    <Badge className="bg-green-900/40 text-green-300 border-green-500/30 text-xs">Active</Badge>
                  </div>
                  <p className="text-xs text-gray-500">{func.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-2 border-green-500/30 bg-green-950/20">
        <CardHeader>
          <CardTitle className="text-white text-lg font-bold">
            ✅ Checklist de Setup
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-3 p-2 bg-slate-900/40 rounded">
              <span className="text-xl">☐</span>
              <div>
                <p className="text-white font-semibold">1. Configurar Anthropic API Key</p>
                <p className="text-xs text-gray-500">No Supabase Edge Function Secrets</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-2 bg-slate-900/40 rounded">
              <span className="text-xl">☐</span>
              <div>
                <p className="text-white font-semibold">2. Configurar Webhook no Evolution API</p>
                <p className="text-xs text-gray-500">Apontar para o webhook_receiver</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-2 bg-slate-900/40 rounded">
              <span className="text-xl">☐</span>
              <div>
                <p className="text-white font-semibold">3. Adicionar pelo menos 1 Bot</p>
                <p className="text-xs text-gray-500">Na aba Exército</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-2 bg-slate-900/40 rounded">
              <span className="text-xl">☐</span>
              <div>
                <p className="text-white font-semibold">4. Criar uma Campanha de teste</p>
                <p className="text-xs text-gray-500">Na aba Campanhas</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-2 bg-slate-900/40 rounded">
              <span className="text-xl">☐</span>
              <div>
                <p className="text-white font-semibold">5. Clicar em "Iniciar" na campanha</p>
                <p className="text-xs text-gray-500">Sistema começará a prospectar automaticamente!</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}