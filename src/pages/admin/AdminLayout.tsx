import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Users, DollarSign, Settings, FileText, RefreshCw, Webhook, Crown, LogOut, Gift, Bot, Target, UserCog, HeartPulse } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Tropas from "./Tropas";
import Equipes from "./Equipes";
import Economia from "./Economia";
import Regras from "./Regras";
import Logs from "./Logs";
import Rework from "./Rework";
import Webhooks from "./Webhooks";
import Premios from "./Premios";
import IaBuilder from "./IaBuilder";  // SEM chaves!
import SaudeLeads from "./SaudeLeads";
import { Prospeccao } from "./Prospeccao";
import UserManagement from "@/pages/UserManagement";

// ─── Definição de todas as abas e quem pode ver cada uma ──────────────────────
const ALL_TABS = [

  {
    value: "tropas",
    label: "Tropas",
    icon: Users,
    color: "red",
    roles: ["ADMIN", "SUPERINTENDENT", "MANAGER"],
  },

  {
    value: "equipes",
    label: "Equipes",
    icon: Shield,
    color: "blue",
    roles: ["ADMIN", "SUPERINTENDENT", "MANAGER"],
  },

  {
    value: "economia",
    label: "Economia",
    icon: DollarSign,
    color: "yellow",
    roles: ["ADMIN", "SUPERINTENDENT"],
  },

  {
    value: "regras",
    label: "Regras",
    icon: Settings,
    color: "purple",
    roles: ["ADMIN", "SUPERINTENDENT"],
  },

  {
    value: "logs",
    label: "Logs",
    icon: FileText,
    color: "green",
    roles: ["ADMIN", "SUPERINTENDENT", "MANAGER"],
  },

  {
    value: "rework",
    label: "Rework",
    icon: RefreshCw,
    color: "orange",
    roles: ["ADMIN", "SUPERINTENDENT"],
  },

  {
    value: "webhooks",
    label: "Webhooks",
    icon: Webhook,
    color: "indigo",
    roles: ["ADMIN", "SUPERINTENDENT"],
  },

  {
    value: "prospeccao",
    label: "Prospecção",
    icon: Target,
    color: "green",
    roles: ["ADMIN", "SUPERINTENDENT"],
  },

  {
    value: "ia-builder",
    label: "IA Builder",
    icon: Bot,
    color: "indigo",
    roles: ["ADMIN", "SUPERINTENDENT"],
  },

  {
    value: "premios",
    label: "Prêmios",
    icon: Gift,
    color: "pink",
    roles: ["ADMIN", "SUPERINTENDENT"],
  },

  {
    value: "saude-leads",
    label: "Saúde",
    icon: HeartPulse,
    color: "rose",
    roles: ["ADMIN", "SUPERINTENDENT", "MANAGER"],
  },

];

const COLOR_MAP: Record<string, string> = {
  rose:   "data-[state=active]:bg-rose-900/60   data-[state=active]:text-rose-200   data-[state=active]:border-rose-500/50",
  red:    "data-[state=active]:bg-red-900/60    data-[state=active]:text-red-200    data-[state=active]:border-red-500/50",
  blue:   "data-[state=active]:bg-blue-900/60   data-[state=active]:text-blue-200   data-[state=active]:border-blue-500/50",
  yellow: "data-[state=active]:bg-yellow-900/60 data-[state=active]:text-yellow-200 data-[state=active]:border-yellow-500/50",
  purple: "data-[state=active]:bg-purple-900/60 data-[state=active]:text-purple-200 data-[state=active]:border-purple-500/50",
  green:  "data-[state=active]:bg-green-900/60  data-[state=active]:text-green-200  data-[state=active]:border-green-500/50",
  orange: "data-[state=active]:bg-orange-900/60 data-[state=active]:text-orange-200 data-[state=active]:border-orange-500/50",
  indigo: "data-[state=active]:bg-indigo-900/60 data-[state=active]:text-indigo-200 data-[state=active]:border-indigo-500/50",
  pink:   "data-[state=active]:bg-pink-900/60   data-[state=active]:text-pink-200   data-[state=active]:border-pink-500/50",
};

const ICON_COLOR_MAP: Record<string, string> = {
  red: "text-red-400", blue: "text-blue-400", yellow: "text-yellow-400",
  purple: "text-purple-400", green: "text-green-400", orange: "text-orange-400",
  indigo: "text-indigo-400", pink: "text-pink-400", rose: "text-rose-400",
};

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  ADMIN:          { label: "General",         color: "bg-yellow-900/50 text-yellow-300 border-yellow-500/40" },
  SUPERINTENDENT: { label: "Superintendente", color: "bg-yellow-900/50 text-yellow-300 border-yellow-500/40" },
  MANAGER:        { label: "Capitão",         color: "bg-blue-900/50   text-blue-300   border-blue-500/40"   },
};

// ─── Componente Principal ─────────────────────────────────────────────────────
export default function AdminLayout() {
  const { role, user, signOut } = useAuth();
  const normalizedRole = role?.toUpperCase() ?? "";

  const visibleTabs = ALL_TABS.filter(tab => tab.roles.includes(normalizedRole));

  const [activeTab, setActiveTab] = useState(visibleTabs[0]?.value ?? "tropas");

  useEffect(() => {
    if (!visibleTabs.find(t => t.value === activeTab)) {
      setActiveTab(visibleTabs[0]?.value ?? "tropas");
    }
  }, [normalizedRole]);

  const roleInfo = ROLE_LABELS[normalizedRole];
  const isManager = normalizedRole === "MANAGER";

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black p-4 md:p-6">

      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-8 relative">
        <div className="absolute inset-0 bg-red-500/5 blur-3xl rounded-full pointer-events-none" />
        <div className="relative flex items-center justify-between gap-4 flex-wrap">

          {/* Logo + título */}
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-red-900/40 border border-red-500/30 shadow-lg shadow-red-900/20">
              <Shield className="w-10 h-10 text-red-400" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-white tracking-wider uppercase">
                Quartel General
              </h1>
              <p className="text-gray-500 text-sm tracking-widest uppercase mt-1">
                Sistema de Comando e Controle
              </p>
            </div>
          </div>

          {/* Usuário logado + sign out */}
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
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="text-gray-500 hover:text-red-400 hover:bg-red-900/20 gap-1.5"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline text-xs">Sair</span>
            </Button>
          </div>
        </div>

        {/* Aviso de visão restrita para MANAGER */}
        {isManager && (
          <div className="mt-4 flex items-center gap-2 bg-blue-900/20 border border-blue-500/20 rounded-lg px-4 py-2.5">
            <Shield className="w-4 h-4 text-blue-400 shrink-0" />
            <p className="text-blue-300 text-sm">
              Você está visualizando apenas os dados da <strong>sua equipe</strong>.
            </p>
          </div>
        )}

        <div className="mt-4 h-px bg-gradient-to-r from-red-500/50 via-gray-700 to-transparent" />
      </div>

      {/* ─── Tabs ────────────────────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList
          className="bg-slate-900/80 border border-gray-700/50 mb-6 h-auto p-1 gap-1 rounded-xl backdrop-blur-sm w-full"
          style={{ display: "grid", gridTemplateColumns: `repeat(${visibleTabs.length}, minmax(0, 1fr))` }}
        >
          {visibleTabs.map(({ value, label, icon: Icon, color }) => (
            <TabsTrigger
              key={value}
              value={value}
              className={`flex flex-col md:flex-row items-center gap-1 md:gap-2 py-2.5 px-2 rounded-lg border border-transparent text-gray-500 hover:text-gray-300 transition-all duration-200 text-xs md:text-sm ${COLOR_MAP[color]}`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${activeTab === value ? ICON_COLOR_MAP[color] : ""}`} />
              <span className="hidden md:inline font-semibold tracking-wide">{label}</span>
              <span className="md:hidden font-semibold" style={{ fontSize: "10px" }}>{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {visibleTabs.find(t => t.value === "tropas")     && <TabsContent value="tropas">     <Tropas />     </TabsContent>}
        {visibleTabs.find(t => t.value === "equipes")    && <TabsContent value="equipes">    <Equipes />    </TabsContent>}
        {visibleTabs.find(t => t.value === "economia")   && <TabsContent value="economia">   <Economia />   </TabsContent>}
        {visibleTabs.find(t => t.value === "regras")     && <TabsContent value="regras">     <Regras />     </TabsContent>}
        {visibleTabs.find(t => t.value === "logs")       && <TabsContent value="logs">       <Logs />       </TabsContent>}
        {visibleTabs.find(t => t.value === "rework")     && <TabsContent value="rework">     <Rework />     </TabsContent>}
        {visibleTabs.find(t => t.value === "webhooks")   && <TabsContent value="webhooks">   <Webhooks />   </TabsContent>}
        {visibleTabs.find(t => t.value === "prospeccao") && <TabsContent value="prospeccao" className="p-6"><Prospeccao /></TabsContent>}
        {visibleTabs.find(t => t.value === "ia-builder") && <TabsContent value="ia-builder" className="p-6"><IaBuilder /></TabsContent>}
        {visibleTabs.find(t => t.value === "premios")      && <TabsContent value="premios">      <Premios />      </TabsContent>}
        {visibleTabs.find(t => t.value === "saude-leads") && <TabsContent value="saude-leads" className="p-0"><SaudeLeads /></TabsContent>}
      </Tabs>
    </div>
  );
}
