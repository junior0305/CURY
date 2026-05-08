// TopNav — barra horizontal de atalhos no painel v2.
// 5 modos: Cockpit · Campanhas · Coach · Liga · Análise
// Highlight do modo ativo. Mobile: scroll horizontal.

import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { LayoutDashboard, Send, Trophy, GraduationCap, BarChart3, Snowflake } from "lucide-react";

const ITEMS = [
  { to: "/manager",          label: "Cockpit",   icon: LayoutDashboard, color: "#06B6D4" },
  { to: "/manager/pool",     label: "Pool",      icon: Snowflake,       color: "#38BDF8" },
  { to: "/manager/campanha", label: "Campanhas", icon: Send,            color: "#10B981" },
  { to: "/manager/coach",    label: "Coach",     icon: GraduationCap,   color: "#A78BFA" },
  { to: "/manager/liga",     label: "Liga",      icon: Trophy,          color: "#F59E0B" },
  { to: "/manager/analise",  label: "Análise",   icon: BarChart3,       color: "#F472B6" },
];

export default function TopNav() {
  const { pathname } = useLocation();

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
          return (
            <Link key={it.to} to={it.to} className="shrink-0">
              <motion.div
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm font-bold transition-all"
                style={{
                  background: active
                    ? `linear-gradient(135deg, ${it.color}22, var(--crm-card))`
                    : "var(--crm-card-soft)",
                  borderColor: active ? `${it.color}80` : "rgba(63,63,70,0.5)",
                  color: active ? it.color : "rgb(161 161 170)",
                  boxShadow: active ? `0 0 16px ${it.color}30` : "none",
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
