// TopNav — barra horizontal de atalhos no painel v2.
// 5 modos: Cockpit · Campanhas · Coach · Liga · Análise
// Highlight do modo ativo. Mobile: scroll horizontal.

import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { LayoutDashboard, Send, Trophy, GraduationCap, BarChart3, Snowflake } from "lucide-react";
import { useTone, type Tone } from "@/components/manager-v2/palette";

// O tom é declarado por NOME, não por hex: o hex certo depende do tema e sai do
// palette.ts. No claro, "accent" é o azul da marca — o Cockpit puxa a identidade.
const ITEMS: { to: string; label: string; icon: any; tone: Tone }[] = [
  { to: "/manager",          label: "Cockpit",   icon: LayoutDashboard, tone: "accent" },
  { to: "/manager/pool",     label: "Pool",      icon: Snowflake,       tone: "sky"    },
  { to: "/manager/campanha", label: "Campanhas", icon: Send,            tone: "good"   },
  { to: "/manager/coach",    label: "Coach",     icon: GraduationCap,   tone: "info"   },
  { to: "/manager/liga",     label: "Liga",      icon: Trophy,          tone: "warn"   },
  { to: "/manager/analise",  label: "Análise",   icon: BarChart3,       tone: "pink"   },
];

export default function TopNav() {
  const { pathname } = useLocation();
  const tone = useTone();

  // Cockpit é "ativo" só quando exatamente /manager
  function isActive(to: string) {
    if (to === "/manager") return pathname === "/manager";
    return pathname.startsWith(to);
  }

  return (
    <nav className="px-4 sm:px-6 pt-3">
      <div className="flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {ITEMS.map((it) => {
          const Icon = it.icon;
          const active = isActive(it.to);
          const color = tone(it.tone);
          return (
            <Link key={it.to} to={it.to} className="shrink-0">
              <motion.div
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm font-bold transition-all"
                style={{
                  background: active
                    ? `linear-gradient(135deg, ${color}1F, var(--crm-card))`
                    : "var(--crm-card-soft)",
                  borderColor: active ? `${color}80` : "var(--crm-border)",
                  color: active ? color : "var(--crm-text-muted)",
                  // No escuro a elevação do item ativo vem de glow; no claro, de
                  // uma sombra colorida rasa — glow sobre branco vira borrão.
                  boxShadow: active ? `0 1px 2px ${color}20, 0 6px 16px ${color}22` : "none",
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{it.label}</span>
              </motion.div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
