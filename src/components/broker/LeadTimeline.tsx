import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { safeFormatDistanceToNow } from "@/utils/date-utils";
import { FileText, CheckCircle2, Clock, Bot, User, ChevronDown, ChevronUp } from "lucide-react";

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

function EventRow({ event, idx }: { event: TimelineEvent; idx: number }) {
  const isNote   = event.type === 'NOTE';
  const isSystem = event.type === 'SYSTEM' || event.type === 'STATUS_CHANGE' || event.type === 'CREATION';
  const isIaOut  = event.type === 'IA_OUT';
  const isIaIn   = event.type === 'IA_IN';

  return (
    <div className={cn(
      "flex w-full animate-in slide-in-from-bottom-2 duration-300",
      (isNote || isIaOut) ? "justify-end" : isIaIn ? "justify-start" : "justify-center"
    )}>

      {/* SYSTEM / STATUS */}
      {isSystem && (
        <div className="flex flex-col items-center text-center max-w-[80%]">
          <div className="bg-slate-100 text-slate-500 text-[10px] uppercase font-bold px-3 py-1 rounded-full mb-1 border border-slate-200 shadow-sm flex items-center gap-1">
            {event.type === 'CREATION'      && <CheckCircle2 className="w-3 h-3" />}
            {event.type === 'STATUS_CHANGE' && <FileText className="w-3 h-3" />}
            {event.content}
          </div>
          <span className="text-[9px] text-slate-300 font-mono">
            {safeFormatDistanceToNow(event.createdAt)}
          </span>
        </div>
      )}

      {/* NOTA INTERNA DO CORRETOR */}
      {isNote && (
        <div className="flex items-end gap-2 max-w-[85%] sm:max-w-[70%]">
          <div className="flex flex-col items-end">
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mb-1">nota interna</span>
            <div className="bg-indigo-600 text-white p-3 rounded-2xl rounded-tr-none shadow-md text-sm leading-relaxed">
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

      {/* MENSAGEM DA IA */}
      {isIaOut && (
        <div className="flex items-end gap-2 max-w-[85%] sm:max-w-[72%]">
          <div className="flex flex-col items-end">
            <span className="text-[9px] text-amber-500 font-bold uppercase tracking-wide flex items-center gap-1 mb-1">
              <Bot className="w-2.5 h-2.5" /> IA
            </span>
            <div className="bg-amber-600/90 text-white p-3 rounded-2xl rounded-tr-none shadow-md text-sm leading-relaxed">
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

      {/* RESPOSTA DO LEAD */}
      {isIaIn && (
        <div className="flex items-end gap-2 max-w-[85%] sm:max-w-[72%]">
          <Avatar className="h-6 w-6 border-2 border-emerald-500/40 shadow-sm shrink-0">
            <AvatarFallback className="bg-emerald-900/60 text-emerald-300 text-[9px]">
              <User className="w-3 h-3" />
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col items-start">
            <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-wide mb-1">lead respondeu</span>
            <div className="bg-emerald-800/70 text-white p-3 rounded-2xl rounded-tl-none shadow-md text-sm leading-relaxed">
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
}

export function LeadTimeline({ events }: LeadTimelineProps) {
  const [expanded, setExpanded] = useState(false);

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-50">
        <Clock className="w-12 h-12 mb-2" />
        <p className="text-sm">Início da operação. Sem histórico.</p>
      </div>
    );
  }

  const lastEvent = events[events.length - 1];
  const previousCount = events.length - 1;

  return (
    <ScrollArea className="h-full px-4 py-4">
      <div className="space-y-3">

        {/* Botão para expandir histórico anterior */}
        {previousCount > 0 && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-full flex items-center justify-center gap-2 text-[10px] font-bold text-gray-600 hover:text-gray-400 py-2 border border-dashed border-gray-700/40 rounded-xl hover:border-gray-600/60 transition-all"
          >
            {expanded
              ? <><ChevronUp className="w-3 h-3" /> Recolher histórico</>
              : <><ChevronDown className="w-3 h-3" /> {previousCount} interação{previousCount > 1 ? "ões" : ""} anterior{previousCount > 1 ? "es" : ""}</>
            }
          </button>
        )}

        {/* Histórico expandido */}
        {expanded && (
          <div className="space-y-4 pb-2">
            {events.slice(0, -1).map((event, idx) => (
              <EventRow key={event.id || idx} event={event} idx={idx} />
            ))}
            <div className="border-t border-gray-700/30 pt-1" />
          </div>
        )}

        {/* Última interação — sempre visível */}
        <div className="space-y-1">
          <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest text-center">
            Última interação
          </p>
          <EventRow key={lastEvent.id} event={lastEvent} idx={events.length - 1} />
        </div>

      </div>
    </ScrollArea>
  );
}
