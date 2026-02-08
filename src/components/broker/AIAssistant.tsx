import { useState, useEffect } from "react";
import { Lead } from "@/types/lead";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Zap, RefreshCw, Sparkles, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface AIAssistantProps {
  lead: Lead;
  isBusy: boolean;
}

const AIAssistant = ({ lead, isBusy }: AIAssistantProps) => {
  const [generatedMessage, setGeneratedMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [approachInfo, setApproachInfo] = useState<{ approach: string; reason: string } | null>(null);

  const generateMessage = async () => {
    setIsGenerating(true);
    setApproachInfo(null);
    try {
      const { data, error } = await supabase.functions.invoke('ai-smart-suggestions', {
        body: { 
          leadId: lead.id,
          brokerId: lead.brokerId,
        }
      });

      if (error) throw error;

      setGeneratedMessage(data.message);
      setApproachInfo({ approach: data.approach, reason: data.reason });
      toast.success("IA gerou uma nova estratégia!");
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao chamar a IA. Usando template padrão.");
      // Fallback
      setGeneratedMessage(`Olá ${lead.name}! Tenho uma novidade sobre o imóvel ${lead.tag}. Consegue falar 1 minuto?`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendWhatsApp = () => {
    if (!generatedMessage) {
      toast.error("Gere uma mensagem primeiro.");
      return;
    }
    
    const encodedMessage = encodeURIComponent(generatedMessage);
    const phoneNumber = lead.phone.replace(/\D/g, ''); 
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
    
    toast.success("WhatsApp aberto!");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-700 flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-500" /> Estratégia de Conversão IA
        </h3>
        {approachInfo && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-help bg-indigo-50 px-2 py-1 rounded-full text-[11px] font-bold text-indigo-600 ring-1 ring-indigo-100">
                  <Sparkles className="w-3 h-3" />
                  {approachInfo.approach}
                  <HelpCircle className="w-3 h-3 text-indigo-300" />
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-[250px] bg-slate-900 text-white border-none p-3 rounded-xl shadow-2xl">
                <p className="text-xs leading-relaxed">{approachInfo.reason}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      
      <Card className="border-amber-200 bg-amber-50/50 shadow-inner overflow-hidden rounded-2xl">
        <CardContent className="p-4 space-y-3">
          <Textarea 
            placeholder="A IA vai sugerir uma abordagem baseada no momento do lead..."
            value={generatedMessage}
            onChange={(e) => setGeneratedMessage(e.target.value)}
            rows={4}
            disabled={isBusy || isGenerating}
            className="bg-white border-amber-200 rounded-xl resize-none focus:ring-amber-500 shadow-sm"
          />
          
          <div className="flex gap-3">
            <Button 
              onClick={generateMessage} 
              disabled={isBusy || isGenerating}
              variant="outline"
              className="flex-1 rounded-xl border-amber-600 text-amber-600 hover:bg-amber-100 h-11 font-bold"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              {generatedMessage ? "Trocar Estratégia" : "Sugerir Abordagem"}
            </Button>
            
            <Button 
              onClick={handleSendWhatsApp} 
              disabled={isBusy || isGenerating || !generatedMessage}
              className="flex-1 bg-green-600 hover:bg-green-700 rounded-xl h-11 font-bold shadow-lg shadow-green-100"
            >
              <Send className="w-4 h-4 mr-2" /> Abrir WhatsApp
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AIAssistant;