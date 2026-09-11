// Paleta do painel v2 — as cores que precisam sobreviver aos DOIS temas.
//
// O problema: os hexadecimais espalhados pelos componentes (#06B6D4, #EF4444,
// #A78BFA…) foram escolhidos pra BRILHAR sobre #080B14. Sobre branco eles ficam
// entre 1.5:1 e 2.5:1 — o significado da cor continua certo, mas o texto some.
// O que muda entre um tema e o outro não é o MATIZ, é a LUMINOSIDADE: no escuro
// a cor tem que ser clara, no claro tem que ser escura.
//
// Por que não var(--tokens) aqui: estes hexes são concatenados com alfa em
// template string (`${color}20`, `${color}80`). `var(--x)20` não é cor válida.
// Então a tradução tem que acontecer em JS, e o valor tem que continuar sendo
// um hex de 6 dígitos.
//
// Classes Tailwind (text-cyan-300, bg-emerald-500/10…) NÃO passam por aqui —
// essas o globals.css já remapeia no tema claro.

import { useTheme, type ThemeMode } from "@/contexts/ThemeContext";

/** dark → light. A chave é o hex que já está escrito no componente. */
const LIGHT_OF: Record<string, string> = {
  // ação / marca — no claro toda a família ciano converge pro azul da marca
  "#06B6D4": "#1D4ED8",
  "#00D4FF": "#1D4ED8",
  "#3B82F6": "#1D4ED8",
  "#22D3EE": "#0369A1",
  "#38BDF8": "#0369A1",
  "#0EA5E9": "#0369A1",
  // bom
  "#10B981": "#047857",
  "#34D399": "#047857",
  // atenção
  "#F59E0B": "#B45309",
  "#FBBF24": "#A16207",
  "#F97316": "#C2410C",
  // risco
  "#EF4444": "#BE123C",
  "#F43F5E": "#BE123C",
  // secundário / neutro
  "#A78BFA": "#6D28D9",
  "#7C3AED": "#6D28D9",
  "#F472B6": "#BE185D",
  "#94A3B8": "#5C6E92",
  "#71717A": "#5C6E92",
};

/** Traduz um hex calibrado pro escuro na versão legível do tema atual. */
export function adaptHex(hex: string, mode: ThemeMode): string {
  if (mode === "dark") return hex;
  return LIGHT_OF[hex.toUpperCase()] ?? hex;
}

/**
 * Devolve `hex("#06B6D4")` já ciente do tema.
 * Chamar este hook também INSCREVE o componente no contexto de tema — sem isso
 * ele não re-renderiza quando a pessoa troca de tema e fica com a cor velha.
 */
export function useHex() {
  const { mode } = useTheme();
  return (hex: string) => adaptHex(hex, mode);
}

/** Tons nomeados, pra código novo que não quer decorar hex. */
const TONES = {
  accent: "#06B6D4",
  sky:    "#38BDF8",
  good:   "#10B981",
  info:   "#A78BFA",
  warn:   "#F59E0B",
  pink:   "#F472B6",
  bad:    "#EF4444",
  mute:   "#94A3B8",
} as const;

export type Tone = keyof typeof TONES;

export function useTone() {
  const { mode } = useTheme();
  return (tone: Tone) => adaptHex(TONES[tone], mode);
}
