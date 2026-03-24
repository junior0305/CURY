import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { safeFormatDistanceToNow } from "@/utils/date-utils";
import { FileText, CheckCircle2, Clock, Bot, User } from "lucide-react";

interface TimelineEvent {
  id: string;
  type: 'NOTE' | 'STATUS_CHANGE' | 'SYSTEM' | 'CREATION' | 'IA_OUT' | 'IA_IN';
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
      <div className="space-y-4">
        {events.map((event, idx) => {
          const isNote      = event.type === 'NOTE';
          const isSystem    = event.type === 'SYSTEM' || event.type === 'STATUS_CHANGE' || event.type === 'CREATION';
          const isIaOut     = event.type === 'IA_OUT';
          const isIaIn      = event.type === 'IA_IN';

          return (
            <div key={event.id || idx} className={cn(
              "flex w-full animate-in slide-in-from-bottom-2 duration-300",
              (isNote || isIaOut) ? "justify-end" : isIaIn ? "justify-start" : "justify-center"
            )}>

              {/* SYSTEM / STATUS LOGS (centralizado) */}
              {isSystem && (
                <div className="flex flex-col items-center text-center max-w-[80%]">
                  <div className="bg-slate-100 text-slate-500 text-[10px] uppercase font-bold px-3 py-1 rounded-full mb-1 border border-slate-200 shadow-sm flex items-center gap-1">
                    {event.type === 'CREATION'     && <CheckCircle2 className="w-3 h-3" />}
                    {event.type === 'STATUS_CHANGE' && <FileText className="w-3 h-3" />}
                    {event.content}
                  </div>
                  <span className="text-[9px] text-slate-300 font-mono">
                    {safeFormatDistanceToNow(event.createdAt)}
                  </span>
                </div>
              )}

              {/* NOTA INTERNA DO CORRETOR (direita, índigo) */}
              {isNote && (
                <div className="flex items-end gap-2 max-w-[85%] sm:max-w-[70%]">
                  <div className="flex flex-col items-end">
                    <div className="relative">
                      <span className="absolute -top-4 right-0 text-[9px] text-slate-400 font-bold uppercase tracking-wide">
                        nota interna
                      </span>
                    </div>
                    <div className="bg-indigo-600 text-white p-3 rounded-2xl rounded-tr-none shadow-md text-sm leading-relaxed mt-3">
                      {event.content}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 mr-1">
                      {safeFormatDistanceToNow(event.createdAt)} • {event.authorName || 'Você'}
                    </span>
                  </div>
                  <Avatar className="h-6 w-6 border-2 border-white shadow-sm shrink-0">
                    <AvatarFallback className="bg-indigo-100 text-indigo-700 text-[9px] font-bold">
                      <User className="w-3 h-3" />
                    </AvatarFallback>
                  </Avatar>
                </div>
              )}

              {/* MENSAGEM DA IA (direita, âmbar) */}
              {isIaOut && (
                <div className="flex items-end gap-2 max-w-[85%] sm:max-w-[72%]">
                  <div className="flex flex-col items-end">
                    <div className="relative">
                      <span className="absolute -top-4 right-0 text-[9px] text-amber-500 font-bold uppercase tracking-wide flex items-center gap-1">
                        <Bot className="w-2.5 h-2.5" /> IA
                      </span>
                    </div>
                    <div className="bg-amber-600/90 text-white p-3 rounded-2xl rounded-tr-none shadow-md text-sm leading-relaxed mt-3">
                      {event.content}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 mr-1">
                      {safeFormatDistanceToNow(event.createdAt)}
                    </span>
                  </div>
                  <Avatar className="h-6 w-6 border-2 border-amber-500/40 shadow-sm shrink-0">
                    <AvatarFallback className="bg-amber-900/60 text-amber-300 text-[9px]">
                      <Bot className="w-3 h-3" />
                    </AvatarFallback>
                  </Avatar>
                </div>
              )}

              {/* RESPOSTA DO LEAD (esquerda, verde) */}
              {isIaIn && (
                <div className="flex items-end gap-2 max-w-[85%] sm:max-w-[72%]">
                  <Avatar className="h-6 w-6 border-2 border-emerald-500/40 shadow-sm shrink-0">
                    <AvatarFallback className="bg-emerald-900/60 text-emerald-300 text-[9px]">
                      <User className="w-3 h-3" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start">
                    <div className="relative">
                      <span className="absolute -top-4 left-0 text-[9px] text-emerald-500 font-bold uppercase tracking-wide">
                        lead respondeu
                      </span>
                    </div>
                    <div className="bg-emerald-800/70 text-white p-3 rounded-2xl rounded-tl-none shadow-md text-sm leading-relaxed mt-3">
                      {event.content}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 ml-1">
                      {safeFormatDistanceToNow(event.createdAt)}
                    </span>
                  </div>
                </div>
              )}

            </div>
          );
        })}

        <div className="flex justify-center pt-4 pb-2">
          <div className="h-1 w-1 rounded-full bg-slate-300 mx-1" />
          <div className="h-1 w-1 rounded-full bg-slate-300 mx-1" />
          <div className="h-1 w-1 rounded-full bg-slate-300 mx-1" />
        </div>
      </div>
    </ScrollArea>
  );
}
