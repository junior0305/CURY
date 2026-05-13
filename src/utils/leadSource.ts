import type { LeadSource } from "@/types/lead";

export interface SourceConfig {
  emoji: string;
  label: string;
  shortLabel: string;
  badgeClass: string;
  tooltip: string;
}

const NORMALIZE: Record<string, string> = {
  facebook_make:    'facebook_make',
  cold_pool:        'cold_pool',
  prospecting:      'cold_pool',
  broker_manual:    'broker_manual',
  manager_manual:   'manager_manual',
  secretaria_manual:'secretaria_manual',
  bulk_import:      'bulk_import',
};

export const SOURCE_CONFIG: Record<string, SourceConfig> = {
  facebook_make: {
    emoji: "🎯",
    label: "Funil",
    shortLabel: "🎯 Funil",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    tooltip: "Lead chegou via Facebook → Make",
  },
  cold_pool: {
    emoji: "🎣",
    label: "Prospecção",
    shortLabel: "🎣 Prospecção",
    badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    tooltip: "Lead capturado por prospecção ativa do corretor",
  },
  broker_manual: {
    emoji: "✋",
    label: "Indicação",
    shortLabel: "✋ Indicação",
    badgeClass: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    tooltip: "Cadastrado pelo corretor (indicação própria)",
  },
  manager_manual: {
    emoji: "👔",
    label: "Manager",
    shortLabel: "👔 Manager",
    badgeClass: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    tooltip: "Atribuído manualmente pelo gerente",
  },
  secretaria_manual: {
    emoji: "📋",
    label: "Secretaria",
    shortLabel: "📋 Secretaria",
    badgeClass: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    tooltip: "Cadastrado pela secretária",
  },
  bulk_import: {
    emoji: "📦",
    label: "Importação",
    shortLabel: "📦 Importação",
    badgeClass: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    tooltip: "Importado em massa via planilha",
  },
};

export function getSourceConfig(source: LeadSource): SourceConfig | null {
  if (!source) return null;
  const key = NORMALIZE[source] || source;
  return SOURCE_CONFIG[key] || null;
}
