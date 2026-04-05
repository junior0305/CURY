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
  // Backgrounds
  bg:             "#EEF2F7",
  bgAlt:          "#E4EAF3",
  surface:        "#FFFFFF",
  surfaceAlpha:   "rgba(255,255,255,0.95)",
  glass:          "rgba(255,255,255,0.7)",
  glassHover:     "rgba(255,255,255,0.9)",

  // Borders
  border:         "rgba(15,23,42,0.08)",
  borderMid:      "rgba(15,23,42,0.12)",
  borderStrong:   "rgba(15,23,42,0.20)",

  // Text
  text:           "#0F172A",
  textMuted:      "#475569",
  textSubtle:     "#94A3B8",

  // Decorative
  gridLine:       "rgba(0,102,255,0.04)",
  headerGlow:     "rgba(0,102,255,0.07)",
  scanOpacity:    "0",

  // Admin nav
  navBg:          "linear-gradient(135deg, #E4EAF3 0%, #EEF2F7 100%)",
  navSurface:     "rgba(255,255,255,0.95)",
  navBorder:      "rgba(15,23,42,0.1)",
};

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
}

const ThemeContext = createContext<ThemeContextType>({
  mode: "dark",
  t: DARK,
  toggle: () => {},
});

// ─── Provider ──────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [mode, setMode] = useState<ThemeMode>(() => {
    return (localStorage.getItem("crm-theme") as ThemeMode) ?? "dark";
  });

  // Apply to <html>
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode);
    document.body.style.background = mode === "dark" ? "#080B14" : "#EEF2F7";
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
          setMode(data.theme_preference as ThemeMode);
        }
      });
  }, [user?.id]);

  const toggle = () => {
    const next: ThemeMode = mode === "dark" ? "light" : "dark";
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

  return (
    <ThemeContext.Provider value={{ mode, t: mode === "dark" ? DARK : LIGHT, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useTheme() {
  return useContext(ThemeContext);
}
