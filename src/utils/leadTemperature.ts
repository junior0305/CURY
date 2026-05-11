import type { LeadTemperature } from "@/types/lead";

export interface TemperatureConfig {
  emoji: string;
  label: string;
  shortLabel: string;
  badgeClass: string;
  cardBorder: string;
  textColor: string;
  dotColor: string;
}

export const TEMPERATURE_CONFIG: Record<NonNullable<LeadTemperature>, TemperatureConfig> = {
  quente: {
    emoji: "🔥",
    label: "Quente",
    shortLabel: "🔥 Quente",
    badgeClass: "bg-red-500/20 text-red-300 border-red-500/40",
    cardBorder: "border-red-500/40",
    textColor: "text-red-300",
    dotColor: "bg-red-400",
  },
  morno: {
    emoji: "🌤️",
    label: "Morno",
    shortLabel: "🌤️ Morno",
    badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    cardBorder: "border-amber-500/40",
    textColor: "text-amber-300",
    dotColor: "bg-amber-400",
  },
  frio: {
    emoji: "❄️",
    label: "Frio",
    shortLabel: "❄️ Frio",
    badgeClass: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    cardBorder: "border-sky-500/30",
    textColor: "text-sky-300",
    dotColor: "bg-sky-400",
  },
};

export function getTemperatureConfig(temp: LeadTemperature): TemperatureConfig | null {
  if (!temp) return null;
  return TEMPERATURE_CONFIG[temp];
}

export function temperatureSortKey(temp: LeadTemperature): number {
  if (temp === "quente") return 0;
  if (temp === "morno") return 1;
  if (temp === "frio") return 2;
  return 3;
}
