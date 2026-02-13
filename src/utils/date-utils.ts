import { formatDistanceToNow, differenceInMinutes, isFuture, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Formata uma data para exibição relativa (ex: "há 5 minutos", "Agora")
 * Lida robustamente com problemas de fuso horário onde o servidor pode estar "no futuro"
 */
export const safeFormatDistanceToNow = (dateStr: string | Date | null | undefined): string => {
  if (!dateStr) return "";

  const date = new Date(dateStr);
  const now = new Date();
  
  // Validação básica
  if (!isValid(date)) return "";

  // Se a data for no futuro (erro de relógio do servidor ou fuso), mostra "Agora"
  if (isFuture(date)) {
    return "Agora";
  }

  const diffInMinutes = Math.abs(differenceInMinutes(now, date));

  // Se for menos de 1 minuto, mostra "Agora" para sensação de tempo real
  if (diffInMinutes < 1) {
    return "Agora";
  }

  return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
};

/**
 * Retorna uma versão curta do tempo (ex: "5m", "2h", "1d") para listas compactas
 */
export const formatShortTime = (dateStr: string | Date | null | undefined): string => {
  if (!dateStr) return "";
  
  const date = new Date(dateStr);
  if (!isValid(date)) return "";

  const now = new Date();
  const diffMinutes = differenceInMinutes(now, date);

  if (diffMinutes < 1) return "Agora";
  if (diffMinutes < 60) return `${diffMinutes}m`;
  
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return `${hours}h`;
  
  const days = Math.floor(hours / 24);
  return `${days}d`;
};
