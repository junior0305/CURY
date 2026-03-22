import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Shield, Users, DollarSign, Settings, FileText, RefreshCw,
  Webhook, Crown, LogOut, Gift, Bot, Target, HeartPulse,
  Gauge, Activity, Zap,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import Cockpit      from "./Cockpit";
import Tropas       from "./Tropas";
import Equipes      from "./Equipes";
import Economia     from "./Economia";
import Regras       from "./Regras";
import Logs         from "./Logs";
import Rework       from "./Rework";
import Webhooks     from "./Webhooks";
import Premios      from "./Premios";
import IaBuilder    from "./IaBuilder";
import SaudeLeads   from "./SaudeLeads";
import { Prospeccao } from "./Prospeccao";

// ─── Grupos principais ────────────────────────────────────────────────────────

const GROUPS = [
  {
    value: "cockpit",
    label: "Cockpit",
    icon: Gauge,
    color: "indigo",
    roles: ["ADMIN", "SUPERINTENDENT", "MANAGER"],
    single: true,
  },
  {
    value: "equipe",
    label: "Equipe",
    icon: Users,
    color: "blue",
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
    color: "rose",
    roles: ["ADMIN", "SUPERINTENDENT", "MANAGER"],
    subtabs: [
      { value: "saude-leads", label: "Saúde",  roles: ["ADMIN", "SUPERINTENDENT", "MANAGER"] },
      { value: "rework",      label: "Rework", roles: ["ADMIN", "SUPERINTENDENT"] },
      { value: "logs",        label: "Logs",   roles: ["ADMIN", "SUPERINTENDENT", "MANAGER"] },
    ],
  },
  {
    value: "automacao",
    label: "Automação",
    icon: Zap,
    color: "amber",
    roles: ["ADMIN", "SUPERINTENDENT"],
    subtabs: [
      { value: "webhooks",   label: "Webhooks",   roles: ["ADMIN", "SUPERINTENDENT"] },
      { value: "ia-builder", label: "IA Builder", roles: ["ADMIN", "SUPERINTENDENT"] },
      { value: "prospeccao", label: "Prospecção", roles: ["ADMIN", "SUPERINTENDENT"] },
    ],
  },
  {
    value: "financeiro",
    label: "Financeiro",
    icon: DollarSign,
    color: "emerald",
    roles: ["ADMIN", "SUPERINTENDENT"],
    subtabs: [
      { value: "economia", label: "Economia", roles: ["ADMIN", "SUPERINTENDENT"] },
      { value: "premios",  label: "Prêmios",  roles: ["ADMIN", "SUPERINTENDENT"] },
      { value: "regras",   label: "Regras",   roles: ["ADMIN", "SUPERINTENDENT"] },
    ],
  },
] as const;

type GroupValue = typeof GROUPS[number]["value"];

// ─── Estilos por cor ──────────────────────────────────────────────────────────

const GROUP_COLORS: Record<string, { active: string; icon: string; sub: string }> = {
  indigo:  { active: "data-[state=active]:bg-indigo-600  data-[state=active]:text-white  data-[state=active]:shadow-lg data-[state=active]:shadow-indigo-900/40",  icon: "text-indigo-400",  sub: "bg-indigo-600 text-white" },
  blue:    { active: "data-[state=active]:bg-blue-600    data-[state=active]:text-white  data-[state=active]:shadow-lg data-[state=active]:shadow-blue-900/40",    icon: "text-blue-400",    sub: "bg-blue-600 text-white" },
  rose:    { active: "data-[state=active]:bg-rose-600    data-[state=active]:text-white  data-[state=active]:shadow-lg data-[state=active]:shadow-rose-900/40",    icon: "text-rose-400",    sub: "bg-rose-600 text-white" },
  amber:   { active: "data-[state=active]:bg-amber-600   data-[state=active]:text-white  data-[state=active]:shadow-lg data-[state=active]:shadow-amber-900/40",   icon: "text-amber-400",   sub: "bg-amber-600 text-white" },
  emerald: { active: "data-[state=active]:bg-emerald-600 data-[state=active]:text-white  data-[state=active]:shadow-lg data-[state=active]:shadow-emerald-900/40", icon: "text-emerald-400", sub: "bg-emerald-600 text-white" },
};

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  ADMIN:          { label: "General",         color: "bg-yellow-900/50 text-yellow-300 border-yellow-500/40" },
  SUPERINTENDENT: { label: "Superintendente", color: "bg-yellow-900/50 text-yellow-300 border-yellow-500/40" },
  MANAGER:        { label: "Capitão",         color: "bg-blue-900/50 text-blue-300 border-blue-500/40" },
};

// ─── SubTabs ─────────────────────────────────────────────────────────────────

function SubTabs({ group, role, subColor }: {
  group: typeof GROUPS[number];
  role: string;
  subColor: string;
}) {
  if ("single" in group && group.single) return null;
  if (!("subtabs" in group)) return null;

  const visibleSubs = group.subtabs.filter(s => s.roles.includes(role));
  if (visibleSubs.length <= 1) return null;

  return (
    <div className="flex gap-1 mb-4 flex-wrap">
      {visibleSubs.map(s => (
        <TabsTrigger
          key={s.value}
          value={s.value}
          className={cn(
            "px-4 py-1.5 rounded-lg text-xs font-bold border border-transparent text-gray-500 hover:text-gray-300 transition-all",
            `data-[state=active]:${subColor} data-[state=active]:border-white/10`
          )}
        >
          {s.label}
        </TabsTrigger>
      ))}
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function AdminLayout() {
  const { role, user, signOut } = useAuth();
  const normalizedRole = role?.toUpperCase() ?? "";

  const visibleGroups = GROUPS.filter(g => g.roles.includes(normalizedRole));
  const [activeGroup, setActiveGroup] = useState<string>(visibleGroups[0]?.value ?? "cockpit");

  // Sub-aba padrão por grupo
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

  const currentGroup = GROUPS.find(g => g.value === activeGroup);
  const groupColor = currentGroup ? GROUP_COLORS[currentGroup.color] : GROUP_COLORS.indigo;
  const roleInfo = ROLE_LABELS[normalizedRole];

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black p-4 md:p-6">

      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-6 relative">
        <div className="absolute inset-0 bg-red-500/5 blur-3xl rounded-full pointer-events-none" />
        <div className="relative flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-red-900/40 border border-red-500/30 shadow-lg shadow-red-900/20">
              <Shield className="w-8 h-8 text-red-400" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-white tracking-wider uppercase">
                Quartel General
              </h1>
              <p className="text-gray-500 text-xs tracking-widest uppercase mt-0.5">
                Sistema de Comando e Controle
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-white text-sm font-semibold">{user?.email}</p>
              {roleInfo && (
                <Badge className={`text-xs border mt-0.5 ${roleInfo.color}`}>
                  <Crown className="w-3 h-3 mr-1" />
                  {roleInfo.label}
                </Badge>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={signOut}
              className="text-gray-500 hover:text-red-400 hover:bg-red-900/20 gap-1.5">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline text-xs">Sair</span>
            </Button>
          </div>
        </div>

        {normalizedRole === "MANAGER" && (
          <div className="mt-4 flex items-center gap-2 bg-blue-900/20 border border-blue-500/20 rounded-lg px-4 py-2.5">
            <Shield className="w-4 h-4 text-blue-400 shrink-0" />
            <p className="text-blue-300 text-sm">
              Você está visualizando apenas os dados da <strong>sua equipe</strong>.
            </p>
          </div>
        )}

        <div className="mt-4 h-px bg-gradient-to-r from-red-500/50 via-gray-700 to-transparent" />
      </div>

      {/* ─── Navegação principal (5 grupos) ─────────────────────────────────── */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {visibleGroups.map(({ value, label, icon: Icon, color }) => {
          const c = GROUP_COLORS[color];
          const isActive = activeGroup === value;
          return (
            <button
              key={value}
              onClick={() => handleGroupChange(value)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl border font-bold text-sm transition-all",
                isActive
                  ? `bg-${color}-600 border-${color}-500/50 text-white shadow-lg`
                  : "bg-slate-800/60 border-gray-700/40 text-gray-500 hover:text-gray-300 hover:border-gray-600/60"
              )}
              style={isActive ? {
                backgroundColor: color === "indigo" ? "#4f46e5" : color === "blue" ? "#2563eb" : color === "rose" ? "#e11d48" : color === "amber" ? "#d97706" : "#059669",
                borderColor: "rgba(255,255,255,0.15)",
              } : {}}
            >
              <Icon className={cn("w-4 h-4", isActive ? "text-white" : c.icon)} />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden text-xs">{label}</span>
            </button>
          );
        })}
      </div>

      {/* ─── Conteúdo com sub-abas ───────────────────────────────────────────── */}
      {activeGroup === "cockpit" && <Cockpit />}

      {activeGroup === "equipe" && (
        <Tabs value={activeSub} onValueChange={setActiveSub}>
          <TabsList className="bg-slate-900/80 border border-gray-700/50 h-auto p-1 gap-1 rounded-xl mb-4 w-auto inline-flex">
            {["tropas","equipes"].filter(v => {
              const g = GROUPS.find(g => g.value === "equipe");
              if (!g || !("subtabs" in g)) return false;
              return g.subtabs.find(s => s.value === v)?.roles.includes(normalizedRole);
            }).map(v => (
              <TabsTrigger key={v} value={v}
                className="px-4 py-2 rounded-lg text-xs font-bold text-gray-500 data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all">
                {v === "tropas" ? "Tropas" : "Equipes"}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="tropas"><Tropas /></TabsContent>
          <TabsContent value="equipes"><Equipes /></TabsContent>
        </Tabs>
      )}

      {activeGroup === "pipeline" && (
        <Tabs value={activeSub} onValueChange={setActiveSub}>
          <TabsList className="bg-slate-900/80 border border-gray-700/50 h-auto p-1 gap-1 rounded-xl mb-4 w-auto inline-flex">
            {[
              { v: "saude-leads", l: "Saúde",  roles: ["ADMIN","SUPERINTENDENT","MANAGER"] },
              { v: "rework",      l: "Rework", roles: ["ADMIN","SUPERINTENDENT"] },
              { v: "logs",        l: "Logs",   roles: ["ADMIN","SUPERINTENDENT","MANAGER"] },
            ].filter(s => s.roles.includes(normalizedRole)).map(s => (
              <TabsTrigger key={s.v} value={s.v}
                className="px-4 py-2 rounded-lg text-xs font-bold text-gray-500 data-[state=active]:bg-rose-600 data-[state=active]:text-white transition-all">
                {s.l}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="saude-leads" className="p-0"><SaudeLeads /></TabsContent>
          <TabsContent value="rework"><Rework /></TabsContent>
          <TabsContent value="logs"><Logs /></TabsContent>
        </Tabs>
      )}

      {activeGroup === "automacao" && (
        <Tabs value={activeSub} onValueChange={setActiveSub}>
          <TabsList className="bg-slate-900/80 border border-gray-700/50 h-auto p-1 gap-1 rounded-xl mb-4 w-auto inline-flex">
            {[
              { v: "webhooks",   l: "Webhooks" },
              { v: "ia-builder", l: "IA Builder" },
              { v: "prospeccao", l: "Prospecção" },
            ].map(s => (
              <TabsTrigger key={s.v} value={s.v}
                className="px-4 py-2 rounded-lg text-xs font-bold text-gray-500 data-[state=active]:bg-amber-600 data-[state=active]:text-white transition-all">
                {s.l}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="webhooks"><Webhooks /></TabsContent>
          <TabsContent value="ia-builder" className="p-6"><IaBuilder /></TabsContent>
          <TabsContent value="prospeccao" className="p-6"><Prospeccao /></TabsContent>
        </Tabs>
      )}

      {activeGroup === "financeiro" && (
        <Tabs value={activeSub} onValueChange={setActiveSub}>
          <TabsList className="bg-slate-900/80 border border-gray-700/50 h-auto p-1 gap-1 rounded-xl mb-4 w-auto inline-flex">
            {[
              { v: "economia", l: "Economia" },
              { v: "premios",  l: "Prêmios" },
              { v: "regras",   l: "Regras" },
            ].map(s => (
              <TabsTrigger key={s.v} value={s.v}
                className="px-4 py-2 rounded-lg text-xs font-bold text-gray-500 data-[state=active]:bg-emerald-600 data-[state=active]:text-white transition-all">
                {s.l}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="economia"><Economia /></TabsContent>
          <TabsContent value="premios"><Premios /></TabsContent>
          <TabsContent value="regras"><Regras /></TabsContent>
        </Tabs>
      )}

    </div>
  );
}
