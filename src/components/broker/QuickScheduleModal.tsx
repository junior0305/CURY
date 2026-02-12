
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, Sun, Moon, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { addDays, setHours, setMinutes, startOfTomorrow } from "date-fns";

interface QuickScheduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string | null;
  onScheduled: () => void;
}

export function QuickScheduleModal({ open, onOpenChange, leadId, onScheduled }: QuickScheduleModalProps) {
  
  const handleSchedule = async (date: Date) => {
    if (!leadId) return;

    try {
      const { error } = await supabase
        .from('leads')
        .update({ next_action_date: date.toISOString() })
        .eq('id', leadId);

      if (error) throw error;

      toast.success("Agendado! O lead sairá da sua frente até lá.");
      onScheduled();
      onOpenChange(false);
    } catch (error) {
      toast.error("Erro ao agendar.");
    }
  };

  const getQuickDates = () => {
    const tomorrow = startOfTomorrow();
    const in2Days = addDays(new Date(), 2);
    const in3Days = addDays(new Date(), 3);
    const nextWeek = addDays(new Date(), 7);

    return [
      { label: "Amanhã Manhã (09h)", date: setHours(tomorrow, 9), icon: Sun },
      { label: "Amanhã Tarde (15h)", date: setHours(tomorrow, 15), icon: Sun },
      { label: "Em 2 Dias", date: setHours(in2Days, 10), icon: CalendarDays },
      { label: "Em 3 Dias", date: setHours(in3Days, 10), icon: CalendarDays },
      { label: "Semana que vem", date: setHours(nextWeek, 10), icon: Calendar },
    ];
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-3xl border-none shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Clock className="h-6 w-6 text-indigo-600" />
            Quando falamos de novo?
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-4">
          {getQuickDates().map((opt, idx) => (
            <Button
              key={idx}
              variant="outline"
              className="h-14 justify-start px-4 rounded-xl border-slate-200 hover:bg-indigo-50 hover:text-indigo-700 font-bold text-slate-600 transition-all"
              onClick={() => handleSchedule(opt.date)}
            >
              <opt.icon className="h-5 w-5 mr-3 opacity-50" />
              {opt.label}
            </Button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl text-slate-400">
            Não agendar (Manter na fila)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
