import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";

// ─── Color Palettes ────────────────────────────────────────────────────────────

export const DARK: ThemeColors = {
  // Backgrounds
  bg:             "#080B14",
  bgAlt:          "#0B0F1A",
  surface:        "#0D1117",
  surfaceAlpha:   "rgba(13,17,26,0.85)",
  glass:          "rgba(255,255,255,0.04)",
  glassHover:     "rgba(255,255,255,0.07)",

  // Borders
  border:         "rgba(255,255,255,0.07)",
  borderMid:      "rgba(255,255,255,0.12)",
  borderStrong:   "rgba(255,255,255,0.18)",

  // Text
  text:           "#F1F5F9",
  textMuted:      "#64748B",
  textSubtle:     "#334155",

  // Decorative
  gridLine:       "rgba(0,102,255,0.03)",
  headerGlow:     "rgba(0,102,255,0.12)",
  scanOpacity:    "0.018",

  // Admin nav
  navBg:          "radial-gradient(ellipse at 15% 0%, #001040 0%, #050810 45%, #020508 100%)",
  navSurface:     "rgba(8,11,20,0.9)",
  navBorder:      "rgba(30,41,59,0.9)",
};

export const LIGHT: ThemeColors = {
  // Backgrounds — azul + branco. O fundo é um azul MUITO claro (não cinza, não
  // branco puro) e o card sobe pra branco. A hierarquia vem dessa subida.
  bg:             "#F2F6FC",
  bgAlt:          "#E7EEFA",
  surface:        "#FFFFFF",
  surfaceAlpha:   "rgba(255,255,255,0.94)",
  glass:          "rgba(255,255,255,0.74)",
  glassHover:     "rgba(37,99,235,0.07)",

  // Borders — azul-acinzentadas, nunca cinza neutro
  border:         "rgba(23,53,110,0.10)",
  borderMid:      "rgba(23,53,110,0.18)",
  borderStrong:   "rgba(23,53,110,0.28)",

  // Text — navy profundo, nunca preto puro
  text:           "#0B1B36",
  textMuted:      "#47597A",
  textSubtle:     "#5C6E92",

  // Decorative
  gridLine:       "rgba(37,99,235,0.045)",
  headerGlow:     "rgba(37,99,235,0.10)",
  scanOpacity:    "0",

  // Admin nav
  navBg:          "linear-gradient(180deg, #FFFFFF 0%, #EDF3FD 100%)",
  navSurface:     "rgba(255,255,255,0.96)",
  navBorder:      "rgba(23,53,110,0.10)",
};

/* Azul da marca no tema claro. #2563EB preenche (barra, dot, estado ativo) e
   #1D4ED8 escreve (texto e ícone em corpo pequeno, 7.0:1 no branco). */
export const BLUE = { fill: "#2563EB", ink: "#1D4ED8" } as const;

export interface ThemeColors {
  bg: string;
  bgAlt: string;
  surface: string;
  surfaceAlpha: string;
  glass: string;
  glassHover: string;
  border: string;
  borderMid: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  gridLine: string;
  headerGlow: string;
  scanOpacity: string;
  navBg: string;
  navSurface: string;
  navBorder: string;
}

export type ThemeMode = "dark" | "light";

// ─── Context ───────────────────────────────────────────────────────────────────

interface ThemeContextType {
  mode: ThemeMode;
  t: ThemeColors;
  toggle: () => void;
  /** Pede o tema claro como PADRÃO desta área — só vale enquanto a pessoa nunca
   *  escolheu tema na mão. Uma escolha explícita (toggle ou perfil) sempre ganha. */
  preferLight: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: "dark",
  t: DARK,
  toggle: () => {},
  preferLight: () => {},
});

/* "crm-theme" guarda o tema aplicado (escrito a cada render, inclusive o padrão).
   Por isso ele NÃO serve pra saber se a pessoa escolheu algo. Esta chave separada
   é gravada só quando há escolha real — no toggle ou vinda do perfil. */
const EXPLICIT_KEY = "crm-theme-explicit";

// ─── Provider ──────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [mode, setMode] = useState<ThemeMode>(() => {
    return (localStorage.getItem("crm-theme") as ThemeMode) ?? "dark";
  });

  // Apply to <html>
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode);
    document.body.style.background = mode === "dark" ? DARK.bg : LIGHT.bg;
    localStorage.setItem("crm-theme", mode);
  }, [mode]);

  // Sync from Supabase on load
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("profiles")
      .select("theme_preference")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.theme_preference && (data.theme_preference === "dark" || data.theme_preference === "light")) {
          localStorage.setItem(EXPLICIT_KEY, "1");
          setMode(data.theme_preference as ThemeMode);
        }
      });
  }, [user?.id]);

  const toggle = () => {
    const next: ThemeMode = mode === "dark" ? "light" : "dark";
    localStorage.setItem(EXPLICIT_KEY, "1");
    setMode(next);
    // Persist to profile (fire-and-forget)
    if (user?.id) {
      supabase
        .from("profiles")
        .update({ theme_preference: next })
        .eq("id", user.id)
        .then(() => {});
    }
  };

  const preferLight = React.useCallback(() => {
    if (localStorage.getItem(EXPLICIT_KEY) === "1") return;
    setMode("light");
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, t: mode === "dark" ? DARK : LIGHT, toggle, preferLight }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useTheme() {
  return useContext(ThemeContext);
}
