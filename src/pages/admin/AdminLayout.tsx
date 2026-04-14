import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users, DollarSign, LogOut, Crown,
  Gauge, Activity, BrainCircuit, Plug, ChevronRight,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useTheme } from "@/contexts/ThemeContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CompanySelector } from "@/components/CompanySelector";

import Cockpit      from "./Cockpit";
import Tropas       from "./Tropas";
import Equipes      from "./Equipes";
import Economia     from "./Economia";
import Metas        from "./Metas";
import Regras       from "./Regras";
import Logs         from "./Logs";
import Rework       from "./Rework";
import Webhooks     from "./Webhooks";
import Premios      from "./Premios";
import IaBuilder    from "./IaBuilder";
import SaudeLeads   from "./SaudeLeads";
import { Prospeccao } from "./Prospeccao";
import AudioSettings from "@/components/admin/AudioSettings";
import SistemaControl from "@/components/admin/SistemaControl";
import Agentes from "./Agentes";
import LeadDistribution from "@/components/admin/LeadDistribution";
import Inteligencia from "./Inteligencia";
import CentralIA from "./CentralIA";

// ─── Grupos principais ────────────────────────────────────────────────────────

const GROUPS = [
  {
    value: "cockpit",
    label: "Cockpit",
    icon: Gauge,
    roles: ["ADMIN", "SUPERINTENDENT", "MANAGER"],
    single: true,
  },
  {
    value: "equipe",
    label: "Equipe",
    icon: Users,
    roles: ["ADMIN", "SUPERINTENDENT", "MANAGER"],
    subtabs: [
      { value: "tropas",  label: "Tropas",  roles: ["ADMIN", "SUPERINTENDENT", "MANAGER"] },
      { value: "equipes", label: "Equipes", roles: ["ADMIN", "SUPERINTENDENT", "MANAGER"] },
    ],
  },
  {
    value: "pipeline",
    label: "Pipeline",
    icon: Activity,
    roles: ["ADMIN", "SUPERINTENDENT", "MANAGER"],
    subtabs: [
      { value: "saude-leads", label: "Saúde",  roles: ["ADMIN", "SUPERINTENDENT", "MANAGER"] },
      { value: "filas",       label: "Filas",  roles: ["ADMIN", "SUPERINTENDENT"] },
      { value: "rework",      label: "Rework", roles: ["ADMIN", "SUPERINTENDENT"] },
      { value: "logs",        label: "Logs",   roles: ["ADMIN", "SUPERINTENDENT", "MANAGER"] },
    ],
  },
  {
    value: "ia",
    label: "Central IA",
    icon: BrainCircuit,
    roles: ["ADMIN", "SUPERINTENDENT"],
    subtabs: [
      { value: "ia-builder", label: "IA Builder",  roles: ["ADMIN", "SUPERINTENDENT"] },
      { value: "agentes",    label: "Agentes",     roles: ["ADMIN", "SUPERINTENDENT"] },
      { value: "prospeccao", label: "Prospecção",  roles: ["ADMIN", "SUPERINTENDENT"] },
      { value: "central-ia", label: "Central IA",  roles: ["ADMIN", "SUPERINTENDENT"] },
    ],
  },
  {
    value: "inteligencia",
    label: "Inteligência",
    icon: BrainCircuit,
    roles: ["ADMIN", "SUPERINTENDENT"],
    single: true,
  },
  {
    value: "integracoes",
    label: "Integrações",
    icon: Plug,
    roles: ["ADMIN", "SUPERINTENDENT"],
    subtabs: [
      { value: "webhooks", label: "Webhooks",     roles: ["ADMIN", "SUPERINTENDENT"] },
      { value: "sons",     label: "Arena Sonora", roles: ["ADMIN", "SUPERINTENDENT"] },
      { value: "monitor",  label: "Sistema",      roles: ["ADMIN", "SUPERINTENDENT"] },
    ],
  },
  {
    value: "financeiro",
    label: "Financeiro",
    icon: DollarSign,
    roles: ["ADMIN", "SUPERINTENDENT"],
    subtabs: [
      { value: "metas",    label: "Metas",    roles: ["ADMIN", "SUPERINTENDENT"] },
      { value: "economia", label: "Economia", roles: ["ADMIN", "SUPERINTENDENT"] },
      { value: "premios",  label: "Prêmios",  roles: ["ADMIN", "SUPERINTENDENT"] },
      { value: "regras",   label: "Regras",   roles: ["ADMIN", "SUPERINTENDENT"] },
    ],
  },
] as const;

type GroupValue = typeof GROUPS[number]["value"];

// ─── SubTabs helper ───────────────────────────────────────────────────────────

function SubTabs({
  activeSub, onChangeSub, items, role, children,
}: {
  activeSub: string;
  onChangeSub: (v: string) => void;
  items: { v: string; l: string; roles: string[] }[];
  role: string;
  children: React.ReactNode;
}) {
  const { t } = useTheme();
  const visible = items.filter(s => s.roles.includes(role));
  return (
    <Tabs value={activeSub} onValueChange={onChangeSub}>
      <TabsList
        className="h-auto p-1 gap-1 rounded-xl mb-4 w-auto inline-flex"
        style={{ background: t.navSurface, border: `1px solid ${t.navBorder}` }}
      >
        {visible.map(s => (
          <TabsTrigger
            key={s.v}
            value={s.v}
            className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
            style={{ color: activeSub === s.v ? t.text : t.textMuted }}
          >
            {s.l}
          </TabsTrigger>
        ))}
      </TabsList>
      {children}
    </Tabs>
  );
}

// ─── Labels de role ───────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, { label: string }> = {
  ADMIN:          { label: "Admin" },
  SUPERINTENDENT: { label: "Superintendente" },
  MANAGER:        { label: "Gerente" },
};

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function AdminLayout() {
  const { role, user, signOut } = useAuth();
  const { t } = useTheme();
  const normalizedRole = role?.toUpperCase() ?? "";

  const visibleGroups = GROUPS.filter(g => g.roles.includes(normalizedRole));
  const [activeGroup, setActiveGroup] = useState<string>(visibleGroups[0]?.value ?? "cockpit");

  const defaultSub = (gv: string) => {
    const g = GROUPS.find(g => g.value === gv);
    if (!g || "single" in g) return gv;
    if (!("subtabs" in g)) return gv;
    return g.subtabs.find(s => s.roles.includes(normalizedRole))?.value ?? g.subtabs[0].value;
  };

  const [activeSub, setActiveSub] = useState<string>(defaultSub(visibleGroups[0]?.value ?? "cockpit"));

  const handleGroupChange = (val: string) => {
    setActiveGroup(val);
    setActiveSub(defaultSub(val));
  };

  useEffect(() => {
    if (!visibleGroups.find(g => g.value === activeGroup)) {
      const first = visibleGroups[0]?.value ?? "cockpit";
      setActiveGroup(first);
      setActiveSub(defaultSub(first));
    }
  }, [normalizedRole]);

  const roleInfo = ROLE_LABELS[normalizedRole];

  return (
    <div
      className="crm-themed min-h-screen p-4 md:p-6"
      style={{ background: t.navBg, color: t.text }}
    >
      {/* ── Grade sutil de fundo (efeito HUD) ─────────────────────────────── */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(${t.gridLine} 1px, transparent 1px),
            linear-gradient(90deg, ${t.gridLine} 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
          zIndex: 0,
        }}
      />

      <div className="relative" style={{ zIndex: 1 }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="mb-6">
          {/* Glow ambiente */}
          <div
            className="absolute pointer-events-none"
            style={{
              top: -40,
              left: -40,
              width: 500,
              height: 200,
              background: "radial-gradient(ellipse, rgba(0,102,255,0.12) 0%, transparent 70%)",
            }}
          />

          <div className="relative flex items-center justify-between gap-4 flex-wrap">
            {/* Logo + nome */}
            <div className="flex items-center gap-4">
              <img
                src="/comandra-logo.png"
                alt="Comandra"
                className="h-20 w-20 object-contain"
                style={{ filter: "drop-shadow(0 0 12px rgba(0,170,255,0.7))" }}
              />
              <div>
                <h1
                  className="text-2xl md:text-3xl font-black tracking-[0.18em] uppercase"
                  style={{
                    color: t.text,
                    textShadow: "0 0 20px rgba(0,170,255,0.5), 0 0 40px rgba(0,102,255,0.3)",
                    fontFamily: "'Segoe UI', system-ui, sans-serif",
                  }}
                >
                  COMANDRA
                </h1>
                <p
                  className="text-xs tracking-[0.3em] uppercase font-medium mt-0.5"
                  style={{ color: "#00aaff", opacity: 0.8 }}
                >
                  SISTEMA DE COMANDO
                </p>
              </div>
            </div>

            {/* Direita: seletor + usuário + sair */}
            <div className="flex items-center gap-3">
              <ThemeToggle />
              {normalizedRole === "SUPERINTENDENT" && <CompanySelector compact />}
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold" style={{ color: t.text }}>{user?.email}</p>
                {roleInfo && (
                  <Badge
                    className="text-xs border mt-0.5"
                    style={{
                      background: "rgba(0,102,255,0.15)",
                      borderColor: "rgba(0,170,255,0.35)",
                      color: "#00aaff",
                    }}
                  >
                    <Crown className="w-3 h-3 mr-1" />
                    {roleInfo.label}
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={signOut}
                className="gap-1.5"
                style={{ color: "#8899bb" }}
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline text-xs">Sair</span>
              </Button>
            </div>
          </div>

          {/* Aviso de gerente */}
          {normalizedRole === "MANAGER" && (
            <div
              className="mt-4 flex items-center gap-2 rounded-lg px-4 py-2.5"
              style={{
                background: "rgba(0,102,255,0.08)",
                border: "1px solid rgba(0,170,255,0.2)",
              }}
            >
              <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "#00aaff" }} />
              <p className="text-sm" style={{ color: "#00aaff" }}>
                Visualizando apenas os dados da <strong>sua equipe</strong>.
              </p>
            </div>
          )}

          {/* Linha divisora com scan */}
          <div className="mt-5 relative h-px overflow-visible">
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(90deg, transparent 0%, #0066ff 20%, #00e5ff 50%, #0066ff 80%, transparent 100%)",
                boxShadow: "0 0 8px rgba(0,229,255,0.6)",
              }}
            />
          </div>
        </div>

        {/* ── Navegação principal ──────────────────────────────────────────── */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {visibleGroups.map(({ value, label, icon: Icon }, idx) => {
            const isActive = activeGroup === value;
            return (
              <motion.button
                key={value}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => handleGroupChange(value)}
                className="relative flex items-center gap-2 px-4 py-2.5 rounded-xl border font-bold text-sm transition-all duration-200"
                style={isActive ? {
                  background: "linear-gradient(135deg, #0044cc 0%, #0066ff 60%, #00aaff 100%)",
                  borderColor: "rgba(0,212,255,0.5)",
                  color: "#ffffff",
                  boxShadow: "0 0 20px rgba(0,170,255,0.4), inset 0 1px 0 rgba(255,255,255,0.12)",
                } : {
                  background: "rgba(8,11,20,0.8)",
                  borderColor: "rgba(30,41,59,0.8)",
                  color: "#475569",
                }}
              >
                <Icon className="w-4 h-4" style={{ color: isActive ? "#00D4FF" : "#334155" }} />
                <span className="uppercase tracking-wider text-xs">{label}</span>
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full"
                    style={{ background: "#00D4FF", boxShadow: "0 0 8px #00D4FF" }}
                  />
                )}
              </motion.button>
            );
          })}
        </div>

        {/* ── Conteúdo com sub-abas ────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeGroup}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
        {activeGroup === "cockpit" && <Cockpit />}

        {activeGroup === "equipe" && (
          <SubTabs activeSub={activeSub} onChangeSub={setActiveSub} items={[
            { v: "tropas",  l: "Tropas",  roles: ["ADMIN","SUPERINTENDENT","MANAGER"] },
            { v: "equipes", l: "Equipes", roles: ["ADMIN","SUPERINTENDENT","MANAGER"] },
          ]} role={normalizedRole}>
            <TabsContent value="tropas"><Tropas /></TabsContent>
            <TabsContent value="equipes"><Equipes /></TabsContent>
          </SubTabs>
        )}

        {activeGroup === "pipeline" && (
          <SubTabs activeSub={activeSub} onChangeSub={setActiveSub} items={[
            { v: "saude-leads", l: "Saúde",  roles: ["ADMIN","SUPERINTENDENT","MANAGER"] },
            { v: "filas",       l: "Filas",  roles: ["ADMIN","SUPERINTENDENT"] },
            { v: "rework",      l: "Rework", roles: ["ADMIN","SUPERINTENDENT"] },
            { v: "logs",        l: "Logs",   roles: ["ADMIN","SUPERINTENDENT","MANAGER"] },
          ]} role={normalizedRole}>
            <TabsContent value="saude-leads" className="p-0"><SaudeLeads /></TabsContent>
            <TabsContent value="filas" className="p-4"><LeadDistribution /></TabsContent>
            <TabsContent value="rework"><Rework /></TabsContent>
            <TabsContent value="logs"><Logs /></TabsContent>
          </SubTabs>
        )}

        {activeGroup === "ia" && (
          <SubTabs activeSub={activeSub} onChangeSub={setActiveSub} items={[
            { v: "ia-builder", l: "IA Builder",  roles: ["ADMIN","SUPERINTENDENT"] },
            { v: "agentes",    l: "Agentes",     roles: ["ADMIN","SUPERINTENDENT"] },
            { v: "prospeccao", l: "Prospecção",  roles: ["ADMIN","SUPERINTENDENT"] },
            { v: "central-ia", l: "Central IA",  roles: ["ADMIN","SUPERINTENDENT"] },
          ]} role={normalizedRole}>
            <TabsContent value="ia-builder" className="p-6"><IaBuilder /></TabsContent>
            <TabsContent value="agentes" className="p-6"><Agentes /></TabsContent>
            <TabsContent value="prospeccao" className="p-6"><Prospeccao /></TabsContent>
            <TabsContent value="central-ia" className="p-6"><CentralIA /></TabsContent>
          </SubTabs>
        )}

        {activeGroup === "inteligencia" && <Inteligencia />}

        {activeGroup === "integracoes" && (
          <SubTabs activeSub={activeSub} onChangeSub={setActiveSub} items={[
            { v: "webhooks", l: "Webhooks",     roles: ["ADMIN","SUPERINTENDENT"] },
            { v: "sons",     l: "Arena Sonora", roles: ["ADMIN","SUPERINTENDENT"] },
            { v: "monitor",  l: "Sistema",      roles: ["ADMIN","SUPERINTENDENT"] },
          ]} role={normalizedRole}>
            <TabsContent value="webhooks"><Webhooks /></TabsContent>
            <TabsContent value="sons" className="p-6"><AudioSettings /></TabsContent>
            <TabsContent value="monitor" className="p-6"><SistemaControl /></TabsContent>
          </SubTabs>
        )}

        {activeGroup === "financeiro" && (
          <SubTabs activeSub={activeSub} onChangeSub={setActiveSub} items={[
            { v: "metas",    l: "Metas",    roles: ["ADMIN","SUPERINTENDENT"] },
            { v: "economia", l: "Economia", roles: ["ADMIN","SUPERINTENDENT"] },
            { v: "premios",  l: "Prêmios",  roles: ["ADMIN","SUPERINTENDENT"] },
            { v: "regras",   l: "Regras",   roles: ["ADMIN","SUPERINTENDENT"] },
          ]} role={normalizedRole}>
            <TabsContent value="metas" className="p-0"><Metas /></TabsContent>
            <TabsContent value="economia"><Economia /></TabsContent>
            <TabsContent value="premios"><Premios /></TabsContent>
            <TabsContent value="regras"><Regras /></TabsContent>
          </SubTabs>
        )}
          </motion.div>
        </AnimatePresence>

      </div>

      {/* ── CSS global para sub-abas ativas ─────────────────────────────────── */}
      <style>{`
        [data-radix-collection-item][data-state="active"] {
          background: linear-gradient(135deg, #0044aa 0%, #0066ff 100%) !important;
          color: #ffffff !important;
          box-shadow: 0 0 12px rgba(0, 102, 255, 0.4) !important;
        }
      `}</style>
    </div>
  );
}
