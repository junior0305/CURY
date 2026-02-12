import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, Sun, Moon, CalendarDays, Zap, PhoneMissed, MessageCircle, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { addDays, addHours, setHours, setMinutes, startOfTomorrow } from "date-fns";

interface QuickScheduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string | null;
  onScheduled: () => void;
}

export function QuickScheduleModal({ open, onOpenChange, leadId, onScheduled }: QuickScheduleModalProps) {
  
  const handleSchedule = async (date: Date, type?: string) => {
    if (!leadId) return;

    try {
      const { error } = await supabase
        .from('leads')
        .update({ 
          next_action_date: date.toISOString(),
          // Opcional: Poderíamos salvar o "Motivo" ou "Resultado" em algum log de interação futuro
        })
        .eq('id', leadId);

      if (error) throw error;

      toast.success(type ? `Playbook "${type}" ativado!` : "Agendamento confirmado!");
      onScheduled();
      onOpenChange(false);
    } catch (error) {
      toast.error("Erro ao agendar.");
    }
  };

  const playbooks = [
    {
      label: "Não Atendeu (Blitz)",
      description: "Tentar de novo em 3h",
      icon: PhoneMissed,
      color: "text-rose-600 bg-rose-50 border-rose-100 hover:bg-rose-100",
      action: () => addHours(new Date(), 3)
    },
    {
      label: "Pediu Info (Nutrição)",
      description: "Enviar material em 24h",
      icon: MessageCircle,
      color: "text-sky-600 bg-sky-50 border-sky-100 hover:bg-sky-100",
      action: () => addDays(new Date(), 1)
    },
    {
      label: "Agendou Visita (Ataque)",
      description: "Confirmar amanhã",
      icon: UserCheck,
      color: "text-emerald-600 bg-emerald-50 border-emerald-100 hover:bg-emerald-100",
      action: () => setHours(startOfTomorrow(), 9)
    },
    {
      label: "Sem Interesse (Geladeira)",
      description: "Retomar em 15 dias",
      icon: Moon,
      color: "text-slate-500 bg-slate-50 border-slate-100 hover:bg-slate-100",
      action: () => addDays(new Date(), 15)
    }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-3xl border-none shadow-2xl bg-white p-6">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Zap className="h-6 w-6 text-amber-500 fill-amber-500" />
            Resultado da Missão
          </DialogTitle>
          <p className="text-sm text-slate-500 font-medium">O que aconteceu nesta tentativa? O sistema define o próximo passo.</p>
        </DialogHeader>
        
        <div className="grid grid-cols-1 gap-3">
          {playbooks.map((play, idx) => (
            <Button
              key={idx}
              variant="outline"
              className={`h-auto py-4 px-4 justify-start rounded-2xl border-2 transition-all group ${play.color}`}
              onClick={() => handleSchedule(play.action(), play.label)}
            >
              <div className="h-10 w-10 rounded-full bg-white/80 flex items-center justify-center mr-4 shadow-sm group-hover:scale-110 transition-transform">
                <play.icon className="h-5 w-5" />
              </div>
              <div className="text-left">
                <div className="font-black text-sm uppercase tracking-wide opacity-90">{play.label}</div>
                <div className="text-xs font-semibold opacity-60">{play.description}</div>
              </div>
            </Button>
          ))}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl text-slate-400 w-full hover:text-slate-600 hover:bg-slate-50">
            Cancelar / Manter na Fila
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}