import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, MessageSquare, BarChart3, Settings as SettingsIcon, Rocket, Activity, Megaphone, Inbox, Shield } from "lucide-react";
import Exercito from "./prospeccao/Exercito";
import Campanhas from "./prospeccao/Campanhas";
import Mensagens from "./prospeccao/Mensagens";
import Conversas from "./prospeccao/Conversas";
import Respostas from "./prospeccao/Respostas";
import Analytics from "./prospeccao/Analytics";
import Configuracoes from "./prospeccao/Configuracoes";
import Monitor from "./prospeccao/Monitor";
import SaudeChips from "./prospeccao/SaudeChips";

export function Prospeccao() {
  const [activeTab, setActiveTab] = useState("exercito");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative">
        <div className="absolute inset-0 bg-green-500/5 blur-3xl rounded-full pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-xl bg-green-900/40 border border-green-500/30">
              <Rocket className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h2 className="text-2xl md:text-3xl font-black text-white tracking-wider uppercase">
                Exército de IAs Prospectoras
              </h2>
              <p className="text-gray-500 text-sm">Sistema autônomo de prospecção com inteligência artificial</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-slate-900/80 border border-gray-700/50 p-1 gap-1 rounded-xl backdrop-blur-sm grid grid-cols-9">
          <TabsTrigger
            value="exercito"
            className="flex items-center gap-2 py-2.5 px-3 rounded-lg data-[state=active]:bg-green-900/60 data-[state=active]:text-green-200 data-[state=active]:border-green-500/50 border border-transparent"
          >
            <Bot className="w-4 h-4" />
            <span className="hidden md:inline font-semibold">Exército</span>
          </TabsTrigger>

          <TabsTrigger
            value="campanhas"
            className="flex items-center gap-2 py-2.5 px-3 rounded-lg data-[state=active]:bg-blue-900/60 data-[state=active]:text-blue-200 data-[state=active]:border-blue-500/50 border border-transparent"
          >
            <Rocket className="w-4 h-4" />
            <span className="hidden md:inline font-semibold">Campanhas</span>
          </TabsTrigger>

          <TabsTrigger
            value="mensagens"
            className="flex items-center gap-2 py-2.5 px-3 rounded-lg data-[state=active]:bg-pink-900/60 data-[state=active]:text-pink-200 data-[state=active]:border-pink-500/50 border border-transparent"
          >
            <Megaphone className="w-4 h-4" />
            <span className="hidden md:inline font-semibold">Mensagens</span>
          </TabsTrigger>

          <TabsTrigger
            value="conversas"
            className="flex items-center gap-2 py-2.5 px-3 rounded-lg data-[state=active]:bg-purple-900/60 data-[state=active]:text-purple-200 data-[state=active]:border-purple-500/50 border border-transparent"
          >
            <MessageSquare className="w-4 h-4" />
            <span className="hidden md:inline font-semibold">Conversas</span>
          </TabsTrigger>

          <TabsTrigger
            value="respostas"
            className="flex items-center gap-2 py-2.5 px-3 rounded-lg data-[state=active]:bg-orange-900/60 data-[state=active]:text-orange-200 data-[state=active]:border-orange-500/50 border border-transparent"
          >
            <Inbox className="w-4 h-4" />
            <span className="hidden md:inline font-semibold">Respostas</span>
          </TabsTrigger>

          <TabsTrigger
            value="analytics"
            className="flex items-center gap-2 py-2.5 px-3 rounded-lg data-[state=active]:bg-amber-900/60 data-[state=active]:text-amber-200 data-[state=active]:border-amber-500/50 border border-transparent"
          >
            <BarChart3 className="w-4 h-4" />
            <span className="hidden md:inline font-semibold">Analytics</span>
          </TabsTrigger>

          <TabsTrigger
            value="config"
            className="flex items-center gap-2 py-2.5 px-3 rounded-lg data-[state=active]:bg-gray-900/60 data-[state=active]:text-gray-200 data-[state=active]:border-gray-500/50 border border-transparent"
          >
            <SettingsIcon className="w-4 h-4" />
            <span className="hidden md:inline font-semibold">Config</span>
          </TabsTrigger>

          <TabsTrigger
            value="saude"
            className="flex items-center gap-2 py-2.5 px-3 rounded-lg data-[state=active]:bg-teal-900/60 data-[state=active]:text-teal-200 data-[state=active]:border-teal-500/50 border border-transparent"
          >
            <Shield className="w-4 h-4" />
            <span className="hidden md:inline font-semibold">Saúde</span>
          </TabsTrigger>

          <TabsTrigger
            value="monitor"
            className="flex items-center gap-2 py-2.5 px-3 rounded-lg data-[state=active]:bg-cyan-900/60 data-[state=active]:text-cyan-200 data-[state=active]:border-cyan-500/50 border border-transparent"
          >
            <Activity className="w-4 h-4" />
            <span className="hidden md:inline font-semibold">Monitor</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="exercito" className="mt-6">
          <Exercito />
        </TabsContent>

        <TabsContent value="campanhas" className="mt-6">
          <Campanhas />
        </TabsContent>

        <TabsContent value="mensagens" className="mt-6">
          <Mensagens />
        </TabsContent>

        <TabsContent value="conversas" className="mt-6">
          <Conversas />
        </TabsContent>

        <TabsContent value="respostas" className="mt-6">
          <Respostas />
        </TabsContent>

        <TabsContent value="analytics" className="mt-6">
          <Analytics />
        </TabsContent>

        <TabsContent value="config" className="mt-6">
          <Configuracoes />
        </TabsContent>

        <TabsContent value="saude" className="mt-6">
          <SaudeChips />
        </TabsContent>

        <TabsContent value="monitor" className="mt-6">
          <Monitor />
        </TabsContent>
      </Tabs>
    </div>
  );
}