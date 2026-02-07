import { useState } from "react";
import { Lead } from "@/types/lead";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Zap, RefreshCw, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface AIAssistantProps {
  lead: Lead;
  isBusy: boolean;
}

const AIAssistant = ({ lead, isBusy }: AIAssistantProps) => {
  const [generatedMessage, setGeneratedMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const generateMessage = () => {
    setIsGenerating(true);
    // Simulação de chamada de IA
    setTimeout(() => {
      const message = `Olá ${lead.name}! Vi que você demonstrou interesse em um imóvel na região de ${lead.tag}. Em vez daquela conversa monótona, que tal eu te enviar um vídeo rápido de 30 segundos com as 3 melhores opções que se encaixam no seu perfil? Posso te enviar agora?`;
      setGeneratedMessage(message);
      setIsGenerating(false);
      toast.info("Mensagem de IA gerada!");
    }, 1500);
  };

  const handleSendWhatsApp = () => {
    if (!generatedMessage) {
      toast.error("Gere uma mensagem primeiro.");
      return;
    }
    
    const encodedMessage = encodeURIComponent(generatedMessage);
    // Remove caracteres não numéricos do telefone para garantir o formato correto
    const phoneNumber = lead.phone.replace(/\D/g, ''); 
    
    // Abre o WhatsApp Web/App com a mensagem pronta
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
    
    // O corretor deve registrar a ação no CadenceFlow após o envio
    toast.success("WhatsApp aberto! Não se esqueça de registrar a ação no Fluxo de Cadência.");
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-700 flex items-center gap-2">
        <Zap className="w-5 h-5 text-amber-500" /> Assistente de Abordagem IA
      </h3>
      
      <Card className="border-amber-200 bg-amber-50 shadow-inner">
        <CardContent className="p-4 space-y-3">
          <Textarea 
            placeholder="Clique em 'Gerar Mensagem' para uma abordagem de alto impacto..."
            value={generatedMessage}
            onChange={(e) => setGeneratedMessage(e.target.value)}
            rows={4}
            disabled={isBusy || isGenerating}
            className="bg-white border-amber-300"
          />
          
          <div className="flex gap-3">
            <Button 
              onClick={generateMessage} 
              disabled={isBusy || isGenerating}
              variant="outline"
              className="flex-1 border-amber-600 text-amber-600 hover:bg-amber-100"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Gerar Mensagem
            </Button>
            
            <Button 
              onClick={handleSendWhatsApp} 
              disabled={isBusy || isGenerating || !generatedMessage}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              <Send className="w-4 h-4 mr-2" /> Enviar via WhatsApp
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AIAssistant;