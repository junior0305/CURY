import { Sun, Moon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/contexts/ThemeContext";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { mode, toggle, t } = useTheme();
  const isDark = mode === "dark";

  return (
    <button
      onClick={toggle}
      title={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      className="relative flex items-center gap-1.5 rounded-xl transition-all duration-200 select-none"
      style={{
        background: t.glass,
        border: `1px solid ${t.border}`,
        padding: compact ? "6px 10px" : "7px 14px",
        boxShadow: isDark ? "0 0 12px rgba(0,212,255,0.08)" : "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.span
            key="moon"
            initial={{ rotate: -30, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 30, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="flex items-center"
          >
            <Moon className="w-3.5 h-3.5" style={{ color: "#00D4FF" }} />
          </motion.span>
        ) : (
          <motion.span
            key="sun"
            initial={{ rotate: 30, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: -30, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="flex items-center"
          >
            <Sun className="w-3.5 h-3.5" style={{ color: "#F59E0B" }} />
          </motion.span>
        )}
      </AnimatePresence>

      {!compact && (
        <span
          className="text-[10px] font-black uppercase tracking-widest"
          style={{ color: t.textMuted }}
        >
          {isDark ? "Dark" : "Light"}
        </span>
      )}

      {/* pill indicator */}
      <div
        className="w-7 h-3.5 rounded-full relative transition-all duration-300"
        style={{
          background: isDark ? "rgba(0,212,255,0.15)" : "rgba(245,158,11,0.15)",
          border: `1px solid ${isDark ? "rgba(0,212,255,0.3)" : "rgba(245,158,11,0.3)"}`,
        }}
      >
        <motion.div
          layout
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
          className="absolute top-0.5 w-2.5 h-2.5 rounded-full"
          style={{
            left: isDark ? "2px" : "calc(100% - 12px)",
            background: isDark ? "#00D4FF" : "#F59E0B",
            boxShadow: isDark ? "0 0 6px #00D4FF" : "0 0 6px #F59E0B",
          }}
        />
      </div>
    </button>
  );
}
