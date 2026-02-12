
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { User, FileText, CheckCircle2, Clock, AlertTriangle, Phone, MessageCircle } from "lucide-react";

interface TimelineEvent {
  id: string;
  type: 'NOTE' | 'STATUS_CHANGE' | 'SYSTEM' | 'CREATION';
  content: string;
  createdAt: string;
  authorName?: string;
}

interface LeadTimelineProps {
  events: TimelineEvent[];
}

export function LeadTimeline({ events }: LeadTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-50">
        <Clock className="w-12 h-12 mb-2" />
        <p className="text-sm">Início da operação. Sem histórico.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full px-4 py-6">
      <div className="space-y-6">
        {events.map((event, idx) => {
          const isNote = event.type === 'NOTE';
          const isSystem = event.type === 'SYSTEM' || event.type === 'STATUS_CHANGE' || event.type === 'CREATION';

          return (
            <div key={event.id || idx} className={cn("flex w-full animate-in slide-in-from-bottom-2 duration-500", isNote ? "justify-end" : "justify-center")}>
              
              {/* SYSTEM / STATUS LOGS (CENTERED) */}
              {isSystem && (
                <div className="flex flex-col items-center text-center max-w-[80%]">
                  <div className="bg-slate-100 text-slate-500 text-[10px] uppercase font-bold px-3 py-1 rounded-full mb-1 border border-slate-200 shadow-sm flex items-center gap-1">
                    {event.type === 'CREATION' && <CheckCircle2 className="w-3 h-3" />}
                    {event.type === 'STATUS_CHANGE' && <FileText className="w-3 h-3" />}
                    {event.content}
                  </div>
                  <span className="text-[9px] text-slate-300 font-mono">
                    {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true, locale: ptBR })}
                  </span>
                </div>
              )}

              {/* USER NOTES (RIGHT ALIGNED BUBBLES) */}
              {isNote && (
                <div className="flex items-end gap-2 max-w-[85%] sm:max-w-[70%]">
                  <div className="flex flex-col items-end">
                    <div className="bg-indigo-600 text-white p-3 rounded-2xl rounded-tr-none shadow-md text-sm leading-relaxed">
                      {event.content}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 mr-1">
                      {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true, locale: ptBR })} • {event.authorName || 'Você'}
                    </span>
                  </div>
                  <Avatar className="h-6 w-6 border-2 border-white shadow-sm">
                    <AvatarFallback className="bg-indigo-100 text-indigo-700 text-[9px] font-bold">
                      YOU
                    </AvatarFallback>
                  </Avatar>
                </div>
              )}
            </div>
          );
        })}
        
        {/* Marcador de "Fim da Linha" */}
        <div className="flex justify-center pt-4 pb-2">
           <div className="h-1 w-1 rounded-full bg-slate-300 mx-1" />
           <div className="h-1 w-1 rounded-full bg-slate-300 mx-1" />
           <div className="h-1 w-1 rounded-full bg-slate-300 mx-1" />
        </div>
      </div>
    </ScrollArea>
  );
}
