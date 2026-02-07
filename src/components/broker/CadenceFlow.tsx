import { LeadStatus } from "@/types/lead";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, MessageSquare, Phone, Mic, Video, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface CadenceFlowProps {
  currentStatus: LeadStatus;
  onStatusChange: (status: LeadStatus) => void;
  isBusy: boolean;
}

// Simulação de um fluxo de cadência simples
const CADENCE_STEPS = [
  { id: 1, label: "1ª Tentativa: Mensagem de Texto", icon: MessageSquare, action: "IN_PROGRESS" },
  { id: 2, label: "2ª Tentativa: Áudio Curto", icon: Mic, action: "IN_PROGRESS" },
  { id: 3, label: "3ª Tentativa: Ligação", icon: Phone, action: "IN_PROGRESS" },
  { id: 4, label: "4ª Tentativa: Vídeo Personalizado", icon: Video, action: "IN_PROGRESS" },
];

const CadenceFlow = ({ currentStatus, onStatusChange, isBusy }: CadenceFlowProps) => {
  // Na implementação real, você calcularia o passo atual baseado no histórico de interações
  // Por enquanto, vamos simular que o corretor está sempre no primeiro passo se o status for NEW.
  const currentStepIndex = currentStatus === 'NEW' ? 0 : 
                           currentStatus === 'IN_PROGRESS' ? 1 : 
                           CADENCE_STEPS.length;

  const nextStep = CADENCE_STEPS[currentStepIndex];
  const isCadenceComplete = currentStepIndex >= CADENCE_STEPS.length;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-700 flex items-center gap-2">
        <Clock className="w-5 h-5 text-indigo-500" /> Fluxo de Cadência
      </h3>
      
      <Card className="border-indigo-200 bg-indigo-50 shadow-inner">
        <CardContent className="p-4">
          {isCadenceComplete ? (
            <div className="text-center p-4 text-green-700">
              <CheckCircle className="w-6 h-6 mx-auto mb-2" />
              <p className="font-semibold">Cadência Concluída!</p>
              <p className="text-sm text-gray-600">Busque uma decisão (Visita ou Documento).</p>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-600 rounded-full text-white">
                  <nextStep.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-indigo-700">PRÓXIMA AÇÃO:</p>
                  <p className="text-lg font-bold text-gray-900">{nextStep.label}</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                className="bg-white border-indigo-600 text-indigo-600 hover:bg-indigo-100"
                onClick={() => onStatusChange(nextStep.action as LeadStatus)}
                disabled={isBusy}
              >
                <ArrowRight className="w-4 h-4 mr-2" /> Registrar Ação
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      
      <div className="flex justify-between text-xs text-gray-500 pt-2">
        {CADENCE_STEPS.map((step, index) => (
          <div key={step.id} className={cn(
            "flex flex-col items-center",
            index < currentStepIndex ? "text-green-600" : "text-gray-400"
          )}>
            <step.icon className="w-4 h-4 mb-1" />
            <span>{step.id}ª Tentativa</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CadenceFlow;