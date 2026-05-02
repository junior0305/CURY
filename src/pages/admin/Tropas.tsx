import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Users, Plus, Pencil, Trash2, Phone, Mail, Shield, Bot, MessageSquare, RefreshCw, Smartphone, Settings, Bell, Save, UserCheck, Building, Eye, EyeOff, KeyRound, AlertTriangle, CheckCircle2, Clock, Send, Search, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Profile {
  id: string;
  email: string;
  first_name: string | null;
  full_name: string | null;
  phone: string | null;
  role: string;
  is_active: boolean;
  team_id: string | null;
  manager_id: string | null;
  lead_assignment_enabled: boolean;
  evolution_instance: string | null;
  qualification_ai_enabled: boolean;
  bot_instance_id: string | null;
  automation_settings: {
    welcome_enabled: boolean;
    follow_up_enabled: boolean;
    ai_assist_enabled: boolean;
  };
  created_at: string;
  bot_instances?: BotInstance;
  teams?: Team;
  managers?: Profile;
}

interface BotInstance {
  id: string;
  name: string;
  phone: string;
  instance_name: string;
  status: string;
}

interface Team {
  id: string;
  name: string;
}

type Tab = "users" | "bots" | "settings";

export default function Tropas() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<Profile[]>([]);
  const [bots, setBots] = useState<BotInstance[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [managers, setManagers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [botModalOpen, setBotModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<Profile | null>(null);
  
  const [userSearch, setUserSearch] = useState("");
  const [filterTeamId, setFilterTeamId] = useState<string>("all");

  const notifyManagers_init = true;
  const [notifyManagers, setNotifyManagers] = useState(true);
  const [notifyBrokers, setNotifyBrokers] = useState(true);
  const [supBotId, setSupBotId] = useState<string>("");
  const [staleHours, setStaleHours] = useState<number>(24);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testingSupNotif, setTestingSupNotif] = useState(false);
  const [testingBrokerNotif, setTestingBrokerNotif] = useState(false);
  const [runningManagerNotif, setRunningManagerNotif] = useState(false);
  const [runningBrokerNotif, setRunningBrokerNotif] = useState(false);
  
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    first_name: "",
    full_name: "",
    phone: "",
    role: "broker",
    is_active: true,
    team_id: null as string | null,
    manager_id: null as string | null,
    lead_assignment_enabled: false,
    evolution_instance: "",
    qualification_ai_enabled: false,
    bot_instance_id: null as string | null,
    automation_settings: {
      welcome_enabled: false,
      follow_up_enabled: true,
      ai_assist_enabled: true,
    },
  });
  const [showPassword, setShowPassword] = useState(false);

  const [botFormData, setBotFormData] = useState({
    name: "",
    phone: "",
    evolution_api_url: "https://api.ape77.com.br",
    evolution_api_key: "",
    instance_name: "",
    status: "active",
  });

  const loadUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*, bot_instances!bot_instance_id(*), teams:team_id(id, name), managers:profiles!manager_id(id, email, first_name, full_name)")
      .order("email", { ascending: true });
    
    if (error) {
      toast({ title: "Erro ao carregar usuários", description: error.message, variant: "destructive" });
    } else {
      setUsers(data || []);
    }
    setLoading(false);
  };

  const loadBots = async () => {
    const { data } = await supabase.from("bot_instances").select("*").order("name");
    if (data) setBots(data);
  };

  const loadTeams = async () => {
    const { data } = await supabase.from("teams").select("id, name").order("name");
    if (data) setTeams(data);
  };

  const loadManagers = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, email, first_name, full_name")
      .in("role", ["MANAGER", "ADMIN", "SUPERINTENDENT"])
      .eq("is_active", true)
      .order("email");
    if (data) setManagers(data);
  };

  const loadSystemSettings = async () => {
    const { data: supBot } = await supabase.from("system_settings").select("value").eq("key", "superintendent_bot_instance_id").maybeSingle();
    if (supBot?.value) setSupBotId(supBot.value);

    const { data: managerSetting } = await supabase.from("system_settings").select("value").eq("key", "notify_managers_enabled").maybeSingle();
    if (managerSetting?.value !== undefined) setNotifyManagers(managerSetting.value);

    const { data: brokerSetting } = await supabase.from("system_settings").select("value").eq("key", "notify_brokers_enabled").maybeSingle();
    if (brokerSetting?.value !== undefined) setNotifyBrokers(brokerSetting.value);

    const { data: staleSetting } = await supabase.from("system_settings").select("value").eq("key", "manager_notify_stale_hours").maybeSingle();
    if (staleSetting?.value) setStaleHours(Number(staleSetting.value));
  };

  useEffect(() => {
    loadUsers();
    loadBots();
    loadTeams();
    loadManagers();
    loadSystemSettings();
  }, []);

  const handleSaveUser = async () => {
    if (!formData.email.trim()) {
      toast({ title: "Email obrigatório", variant: "destructive" });
      return;
    }
    if (!editUser && !formData.password.trim()) {
      toast({ title: "Senha obrigatória para novo usuário", variant: "destructive" });
      return;
    }
    if (formData.password && formData.password.length < 6) {
      toast({ title: "Senha deve ter no mínimo 6 caracteres", variant: "destructive" });
      return;
    }

    try {
      if (editUser) {
        const { error } = await supabase.from("profiles").update({
          first_name: formData.first_name,
          full_name: formData.full_name,
          phone: formData.phone,
          role: formData.role,
          is_active: formData.is_active,
          team_id: formData.team_id,
          manager_id: formData.manager_id,
          lead_assignment_enabled: formData.lead_assignment_enabled,
          evolution_instance: formData.evolution_instance,
          qualification_ai_enabled: formData.qualification_ai_enabled,
          bot_instance_id: formData.bot_instance_id,
          automation_settings: formData.automation_settings,
        }).eq("id", editUser.id);
        if (error) throw error;

        // Alterar senha se preenchida
        if (formData.password.trim()) {
          const { data: pwData, error: pwError } = await supabase.functions.invoke('create-user', {
            body: { action: 'update-password', userId: editUser.id, password: formData.password },
          });
          if (pwError) {
            let msg = pwError.message;
            try {
              const body = await (pwError as any).context?.json?.();
              if (body?.error) msg = body.error;
            } catch {}
            throw new Error(msg);
          }
          if (pwData?.error) throw new Error(pwData.error);
        }

        toast({ title: "✅ Usuário atualizado!" });

      } else {
        const { data, error } = await supabase.functions.invoke('create-user', {
          body: {
            email: formData.email,
            password: formData.password,
            firstName: formData.first_name,
            lastName: formData.last_name,
            role: formData.role,
            teamId: formData.team_id,
            managerId: formData.manager_id,
            phone: formData.phone,
          }
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        if (data?.user?.id) {
          await supabase.from("profiles").update({
            full_name: formData.full_name,
            lead_assignment_enabled: formData.lead_assignment_enabled,
            evolution_instance: formData.evolution_instance,
            qualification_ai_enabled: formData.qualification_ai_enabled,
            bot_instance_id: formData.bot_instance_id,
            automation_settings: formData.automation_settings,
          }).eq("id", data.user.id);
        }

        toast({ title: "✅ Usuário criado!" });
      }

      setModalOpen(false);
      resetForm();
      loadUsers();
    } catch (error: any) {
      toast({ title: "❌ Erro ao salvar", description: error.message, variant: "destructive" });
    }
  };

  const handleSaveBot = async () => {
    if (!botFormData.name || !botFormData.phone || !botFormData.instance_name) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }

    try {
      const { error } = await supabase.from("bot_instances").insert({
        name: botFormData.name,
        phone: botFormData.phone,
        evolution_api_url: botFormData.evolution_api_url,
        evolution_api_key: botFormData.evolution_api_key,
        instance_name: botFormData.instance_name,
        status: botFormData.status,
        health_score: 100,
        persona_name: botFormData.name,
        persona_style: "casual",
        daily_limit: 200,
        weight: 10,
        priority: 5,
      });
      
      if (error) throw error;
      toast({ title: "✅ Bot cadastrado!" });
      setBotModalOpen(false);
      resetBotForm();
      loadBots();
    } catch (error: any) {
      toast({ title: "❌ Erro ao cadastrar bot", description: error.message, variant: "destructive" });
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await supabase.from("system_settings").upsert({ key: "superintendent_bot_instance_id", value: supBotId, description: "Instância WhatsApp do Superintendente para notificar managers" }, { onConflict: "key" });
      await supabase.from("system_settings").upsert({ key: "notify_managers_enabled", value: notifyManagers, description: "Ativar notificações do Superintendente para managers" }, { onConflict: "key" });
      await supabase.from("system_settings").upsert({ key: "notify_brokers_enabled", value: notifyBrokers, description: "Ativar notificações dos managers para corretores" }, { onConflict: "key" });
      await supabase.from("system_settings").upsert({ key: "manager_notify_stale_hours", value: staleHours, description: "Horas de inatividade para incluir lead no resumo do manager" }, { onConflict: "key" });
      toast({ title: "✅ Configurações salvas!" });
    } catch (error: any) {
      toast({ title: "❌ Erro ao salvar", description: error.message, variant: "destructive" });
    } finally {
      setSavingSettings(false);
    }
  };

  const testSupNotification = async () => {
    if (!supBotId) {
      toast({ title: "⚠️ Configure a instância do Superintendente primeiro", variant: "destructive" });
      return;
    }
    setTestingSupNotif(true);
    try {
      const { data: bot } = await supabase.from("bot_instances").select("phone").eq("id", supBotId).single();
      if (!bot?.phone) throw new Error("Instância sem telefone configurado");
      const { error } = await supabase.functions.invoke("send_whatsapp_message", {
        body: { botId: supBotId, phone: bot.phone, message: "🧪 *Teste — Canal Superintendente → Managers*\n\nSe você recebeu esta mensagem, o canal está funcionando. ✅" },
      });
      if (error) throw error;
      toast({ title: "✅ Teste enviado!", description: `Verifique o WhatsApp ${bot.phone}` });
    } catch (error: any) {
      toast({ title: "❌ Erro no teste", description: error.message, variant: "destructive" });
    } finally {
      setTestingSupNotif(false);
    }
  };

  const runManagerNotification = async () => {
    setRunningManagerNotif(true);
    try {
      const { data, error } = await supabase.functions.invoke("notify-managers", { body: {} });
      if (error) throw error;
      const processed = data?.processed ?? 0;
      toast({ title: `✅ Resumo enviado para ${processed} manager(s)` });
    } catch (error: any) {
      toast({ title: "❌ Erro ao disparar resumo", description: error.message, variant: "destructive" });
    } finally {
      setRunningManagerNotif(false);
    }
  };

  const runBrokerNotification = async () => {
    setRunningBrokerNotif(true);
    try {
      const { data, error } = await supabase.functions.invoke("notify-brokers", { body: {} });
      if (error) throw error;
      const processed = data?.processed ?? 0;
      toast({ title: `✅ Avisos enviados para ${processed} corretor(es)` });
    } catch (error: any) {
      toast({ title: "❌ Erro ao notificar corretores", description: error.message, variant: "destructive" });
    } finally {
      setRunningBrokerNotif(false);
    }
  };

  const testBrokerNotification = async () => {
    const managersWithBot = users.filter(u => u.role === 'MANAGER' && u.bot_instance_id);
    if (!managersWithBot.length) {
      toast({ title: "⚠️ Nenhum manager com instância configurada", variant: "destructive" });
      return;
    }
    setTestingBrokerNotif(true);
    try {
      const mgr = managersWithBot[0];
      if (!mgr.bot_instance_id || !mgr.phone) throw new Error("Manager sem bot ou telefone");
      const { error } = await supabase.functions.invoke("send_whatsapp_message", {
        body: { botId: mgr.bot_instance_id, phone: mgr.phone, message: `🧪 *Teste — Canal Manager → Corretores*\n\nOlá ${mgr.first_name}! Canal funcionando. ✅` },
      });
      if (error) throw error;
      toast({ title: "✅ Teste enviado!", description: `Para ${mgr.first_name} (${mgr.phone})` });
    } catch (error: any) {
      toast({ title: "❌ Erro no teste", description: error.message, variant: "destructive" });
    } finally {
      setTestingBrokerNotif(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Desativar este usuário?")) return;
    const { error } = await supabase.from("profiles").update({ is_active: false }).eq("id", id);
    if (error) {
      toast({ title: "Erro ao desativar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "🗑️ Usuário desativado" });
      loadUsers();
    }
  };

  const resetForm = () => {
    setFormData({
      email: "", password: "", first_name: "", full_name: "", phone: "", role: "broker", is_active: true,
      team_id: null, manager_id: null, lead_assignment_enabled: false, evolution_instance: "",
      qualification_ai_enabled: false, bot_instance_id: null,
      automation_settings: { welcome_enabled: false, follow_up_enabled: true, ai_assist_enabled: true },
    });
    setShowPassword(false);
    setEditUser(null);
  };

  const resetBotForm = () => {
    setBotFormData({ name: "", phone: "", evolution_api_url: "https://api.ape77.com.br", evolution_api_key: "", instance_name: "", status: "active" });
  };

  const openEdit = (user: Profile) => {
    setEditUser(user);
    setFormData({
      email: user.email, password: "", first_name: user.first_name || "", full_name: user.full_name || "", phone: user.phone || "",
      role: user.role, is_active: user.is_active, team_id: user.team_id, manager_id: user.manager_id,
      lead_assignment_enabled: user.lead_assignment_enabled, evolution_instance: user.evolution_instance || "",
      qualification_ai_enabled: user.qualification_ai_enabled, bot_instance_id: user.bot_instance_id,
      automation_settings: user.automation_settings || { welcome_enabled: false, follow_up_enabled: true, ai_assist_enabled: true },
    });
    setShowPassword(false);
    setModalOpen(true);
  };

  // Usuários filtrados por busca e equipe
  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase();
    return users.filter(u => {
      if (!u.is_active) return false;
      if (filterTeamId === "none" && u.team_id !== null) return false;
      if (filterTeamId !== "all" && filterTeamId !== "none" && u.team_id !== filterTeamId) return false;
      if (q) {
        const name = `${u.first_name ?? ""} ${u.full_name ?? ""} ${u.email}`.toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    });
  }, [users, userSearch, filterTeamId]);

  const openCreate = () => {
    resetForm();
    setModalOpen(true);
  };

  const getRoleBadge = (role: string) => {
    const styles = {
      ADMIN: { bg: "bg-red-900/40", text: "text-red-300", border: "border-red-500/30", label: "Admin" },
      SUPERINTENDENT: { bg: "bg-purple-900/40", text: "text-purple-300", border: "border-purple-500/30", label: "Super" },
      MANAGER: { bg: "bg-blue-900/40", text: "text-blue-300", border: "border-blue-500/30", label: "Manager" },
      BROKER: { bg: "bg-green-900/40", text: "text-green-300", border: "border-green-500/30", label: "Corretor" },
      user: { bg: "bg-gray-900/40", text: "text-gray-400", border: "border-gray-500/30", label: "Usuário" },
    };
    const style = styles[role as keyof typeof styles] || styles.user;
    return <Badge className={`${style.bg} ${style.text} border ${style.border}`}>{style.label}</Badge>;
  };
  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <RefreshCw className="w-10 h-10 text-blue-400 animate-pulse" />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-black text-white">Gerenciar Usuários e Sistema</h3>
          <p className="text-sm text-gray-500">Configure corretores, bots e notificações</p>
        </div>
        {tab === "users" && (
          <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-500 font-bold gap-2">
            <Plus className="w-4 h-4" />
            Novo Usuário
          </Button>
        )}
        {tab === "bots" && (
          <Button onClick={() => setBotModalOpen(true)} variant="outline" className="border-purple-500/30 text-purple-400 hover:bg-purple-900/20 gap-2">
            <Smartphone className="w-4 h-4" />
            Cadastrar Bot
          </Button>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setTab("users")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === "users" ? "bg-blue-900/40 text-blue-300 border border-blue-500/30" : "text-gray-500 hover:text-gray-300 border border-transparent"}`}>
          <Users className="w-4 h-4" /> Usuários
          <span className="text-xs bg-slate-700 rounded px-1.5">{users.filter(u => u.is_active).length}</span>
        </button>
        <button onClick={() => setTab("bots")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === "bots" ? "bg-purple-900/40 text-purple-300 border border-purple-500/30" : "text-gray-500 hover:text-gray-300 border border-transparent"}`}>
          <Bot className="w-4 h-4" /> Bots
          <span className="text-xs bg-slate-700 rounded px-1.5">{bots.filter(b => !['paused','blocked'].includes(b.status)).length}</span>
        </button>
        <button onClick={() => setTab("settings")} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === "settings" ? "bg-green-900/40 text-green-300 border border-green-500/30" : "text-gray-500 hover:text-gray-300 border border-transparent"}`}>
          <Settings className="w-4 h-4" /> Configurações
        </button>
      </div>

      {tab === "users" ? (
        <div className="space-y-4">
          {/* Barra de busca + filtro por equipe */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="Buscar por nome ou e-mail..."
                className="pl-9 bg-slate-800 border-gray-700 text-white placeholder:text-gray-500 h-9"
              />
              {userSearch && (
                <button onClick={() => setUserSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => setFilterTeamId("all")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${filterTeamId === "all" ? "bg-blue-900/50 text-blue-300 border-blue-500/40" : "bg-slate-800 text-gray-400 border-gray-700 hover:text-gray-300"}`}
              >
                Todas ({users.filter(u => u.is_active).length})
              </button>
              {teams.map(t => {
                const count = users.filter(u => u.is_active && u.team_id === t.id).length;
                return (
                  <button
                    key={t.id}
                    onClick={() => setFilterTeamId(filterTeamId === t.id ? "all" : t.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${filterTeamId === t.id ? "bg-orange-900/50 text-orange-300 border-orange-500/40" : "bg-slate-800 text-gray-400 border-gray-700 hover:text-gray-300"}`}
                  >
                    {t.name} ({count})
                  </button>
                );
              })}
              <button
                onClick={() => setFilterTeamId("none")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${filterTeamId === "none" ? "bg-slate-700 text-gray-200 border-gray-500" : "bg-slate-800 text-gray-500 border-gray-700 hover:text-gray-300"}`}
              >
                Sem equipe ({users.filter(u => u.is_active && !u.team_id).length})
              </button>
            </div>
            <span className="text-xs text-gray-500 ml-1">{filteredUsers.length} encontrado{filteredUsers.length !== 1 ? "s" : ""}</span>
          </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredUsers.map(user => (
            <Card key={user.id} className="border-2 border-gray-700/50 bg-slate-800/40 hover:border-blue-500/50 transition-all">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-5 h-5 text-blue-400 shrink-0" />
                      <h4 className="text-white font-bold text-base truncate">{user.first_name || user.full_name || user.email}</h4>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {getRoleBadge(user.role)}
                      {user.team_id && user.teams && (
                        <Badge className="bg-orange-900/40 text-orange-300 border-orange-500/30 text-xs">
                          <Building className="w-3 h-3 mr-1" />
                          {user.teams.name}
                        </Badge>
                      )}
                      {user.bot_instance_id && (
                        <Badge className="bg-purple-900/40 text-purple-300 border-purple-500/30 text-xs">
                          <Bot className="w-3 h-3 mr-1" />
                          Bot
                        </Badge>
                      )}
                      {user.lead_assignment_enabled && (
                        <Badge className="bg-green-900/40 text-green-300 border-green-500/30 text-xs">
                          <UserCheck className="w-3 h-3 mr-1" />
                          Auto
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 text-gray-400">
                    <Mail className="w-3.5 h-3.5" />
                    <span className="text-white truncate">{user.email}</span>
                  </div>
                  {user.phone && (
                    <div className="flex items-center gap-2 text-gray-400">
                      <Phone className="w-3.5 h-3.5" />
                      <span className="text-white">{user.phone}</span>
                    </div>
                  )}
                  {user.manager_id && user.managers && (
                    <div className="flex items-center gap-2 text-gray-400">
                      <Shield className="w-3.5 h-3.5" />
                      <span className="text-white text-xs">Manager: {user.managers.first_name || user.managers.email}</span>
                    </div>
                  )}
                </div>

                {user.role === 'broker' && (
                  <div className="pt-2 border-t border-gray-700/50">
                    <div className="text-xs font-bold text-gray-400 mb-2">Status:</div>
                    <div className="space-y-1.5 text-xs">
                      {user.qualification_ai_enabled && (
                        <div className="flex items-center gap-1">
                          <Bot className="w-3 h-3 text-purple-400" />
                          <span className="text-purple-300">IA Autônoma</span>
                        </div>
                      )}
                      {user.automation_settings?.welcome_enabled && (
                        <div className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3 text-green-400" />
                          <span className="text-green-300">Boas-vindas ativo</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button onClick={() => openEdit(user)} variant="outline" size="sm" className="flex-1 border-gray-600 text-gray-300 hover:bg-slate-700">
                    <Pencil className="w-3.5 h-3.5 mr-1" />
                    Editar
                  </Button>
                  <Button onClick={() => handleDelete(user.id)} variant="outline" size="sm" className="border-red-500/30 text-red-400 hover:bg-red-900/20">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        </div>
      ) : tab === "bots" ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {bots.filter(b => !['paused','blocked'].includes(b.status)).map(bot => (
            <Card key={bot.id} className="border-2 border-gray-700/50 bg-slate-800/40 hover:border-purple-500/50 transition-all">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-purple-400" />
                  <h4 className="text-white font-bold">{bot.name}</h4>
                  <Badge className="bg-purple-900/40 text-purple-300 border-purple-500/30 text-xs ml-auto">{bot.instance_name}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Telefone:</span>
                    <span className="text-white font-mono">{bot.phone}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-6">

          {/* ── CANAL 1: Superintendente → Managers ── */}
          <Card className="border-2 border-blue-500/30 bg-slate-800/40">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Bell className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <h4 className="text-white font-bold text-sm">Superintendente → Managers</h4>
                    <p className="text-gray-400 text-xs">Resumo diário de leads parados por equipe</p>
                  </div>
                </div>
                <Switch checked={notifyManagers} onCheckedChange={setNotifyManagers} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-gray-400 text-xs uppercase mb-2 block">Instância do Superintendente (remetente)</Label>
                <Select value={supBotId} onValueChange={setSupBotId}>
                  <SelectTrigger className="bg-slate-900 border-gray-600 text-white">
                    <SelectValue placeholder="Escolha a instância Junior" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-gray-600">
                    {bots.map(bot => (
                      <SelectItem key={bot.id} value={bot.id}>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${bot.status === 'active' ? 'bg-green-400' : 'bg-red-400'}`} />
                          {bot.name} ({bot.phone})
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-gray-400 text-xs uppercase mb-2 block">Leads parados há mais de (horas)</Label>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={staleHours}
                  onChange={e => setStaleHours(Number(e.target.value))}
                  className="w-24 bg-slate-900 border border-gray-600 text-white rounded-md px-3 py-2 text-sm"
                />
              </div>

              {/* Tabela de roteamento: Manager → instância do manager (destinatários) */}
              <div>
                <Label className="text-gray-400 text-xs uppercase mb-2 block">Destinatários (managers da equipe)</Label>
                <div className="rounded-lg border border-gray-700/50 overflow-hidden">
                  {users.filter(u => u.role === 'MANAGER').length === 0 ? (
                    <div className="p-3 text-gray-500 text-xs text-center">Nenhum manager cadastrado</div>
                  ) : (
                    users.filter(u => u.role === 'MANAGER').map(mgr => (
                      <div key={mgr.id} className="flex items-center justify-between px-3 py-2 border-b border-gray-700/30 last:border-0">
                        <div className="flex items-center gap-2">
                          <Users className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-white text-sm">{mgr.first_name || mgr.email}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {mgr.phone ? (
                            <span className="text-gray-400 text-xs">{mgr.phone}</span>
                          ) : (
                            <Badge className="bg-red-900/40 text-red-400 border-red-500/30 text-xs flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Sem telefone
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={testSupNotification} disabled={testingSupNotif || !supBotId} variant="outline" size="sm" className="border-blue-500/30 text-blue-400 hover:bg-blue-900/20">
                  {testingSupNotif ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                  Testar canal
                </Button>
                <Button onClick={runManagerNotification} disabled={runningManagerNotif || !notifyManagers} size="sm" className="bg-blue-600 hover:bg-blue-500">
                  {runningManagerNotif ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Bell className="w-3.5 h-3.5 mr-1" />}
                  Disparar agora
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ── CANAL 2: Manager → Corretores ── */}
          <Card className="border-2 border-green-500/30 bg-slate-800/40">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                    <Bell className="w-4 h-4 text-green-400" />
                  </div>
                  <div>
                    <h4 className="text-white font-bold text-sm">Manager → Corretores</h4>
                    <p className="text-gray-400 text-xs">Novo lead atribuído e alertas de acompanhamento</p>
                  </div>
                </div>
                <Switch checked={notifyBrokers} onCheckedChange={setNotifyBrokers} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Tabela de roteamento: Manager → bot próprio → corretores */}
              <div>
                <Label className="text-gray-400 text-xs uppercase mb-2 block">Roteamento por equipe</Label>
                <div className="rounded-lg border border-gray-700/50 overflow-hidden">
                  {users.filter(u => u.role === 'MANAGER').length === 0 ? (
                    <div className="p-3 text-gray-500 text-xs text-center">Nenhum manager cadastrado</div>
                  ) : (
                    users.filter(u => u.role === 'MANAGER').map(mgr => {
                      const brokerCount = users.filter(u => u.role === 'BROKER' && u.manager_id === mgr.id).length;
                      const hasBot = !!mgr.bot_instance_id;
                      return (
                        <div key={mgr.id} className="flex items-center justify-between px-3 py-2.5 border-b border-gray-700/30 last:border-0">
                          <div className="flex items-center gap-2 flex-1">
                            <Users className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span className="text-white text-sm">{mgr.first_name || mgr.email}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {hasBot ? (
                              <Badge className="bg-green-900/40 text-green-400 border-green-500/30 text-xs flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> {mgr.bot_instances?.name || 'Bot OK'}
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-900/40 text-amber-400 border-amber-500/30 text-xs flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Sem instância
                              </Badge>
                            )}
                            <span className="text-gray-500 text-xs">{brokerCount} corretor{brokerCount !== 1 ? 'es' : ''}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <p className="text-gray-500 text-xs mt-1.5">Configure a instância de cada manager em Usuários → editar perfil.</p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={testBrokerNotification} disabled={testingBrokerNotif} variant="outline" size="sm" className="border-green-500/30 text-green-400 hover:bg-green-900/20">
                  {testingBrokerNotif ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                  Testar canal
                </Button>
                <Button onClick={runBrokerNotification} disabled={runningBrokerNotif} size="sm" className="bg-green-600 hover:bg-green-500">
                  {runningBrokerNotif ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Bell className="w-3.5 h-3.5 mr-1" />}
                  Disparar para corretores
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ── Botão salvar global ── */}
          <Button onClick={handleSaveSettings} disabled={savingSettings} className="w-full bg-slate-700 hover:bg-slate-600 border border-slate-600">
            {savingSettings ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar configurações
          </Button>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-slate-900 border-blue-500 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-2">
              <Users className="w-6 h-6 text-blue-400" />
              {editUser ? "Editar Usuário" : "Novo Usuário"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400 text-xs uppercase">Nome *</Label>
                <Input value={formData.first_name} onChange={e => setFormData({ ...formData, first_name: e.target.value })} placeholder="João" className="bg-slate-800 border-gray-600 text-white" />
              </div>
              <div>
                <Label className="text-gray-400 text-xs uppercase">Email *</Label>
                <Input value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} disabled={!!editUser} placeholder="joao@email.com" className="bg-slate-800 border-gray-600 text-white" />
              </div>
            </div>

            <div>
              <Label className="text-gray-400 text-xs uppercase flex items-center gap-1">
                <KeyRound className="w-3 h-3" />
                {editUser ? "Nova Senha (deixe em branco para não alterar)" : "Senha *"}
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  placeholder={editUser ? "Digite para alterar a senha..." : "Mínimo 6 caracteres"}
                  className="bg-slate-800 border-gray-600 text-white pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400 text-xs uppercase">Telefone</Label>
                <Input value={formData.phone || ""} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="11999999999" className="bg-slate-800 border-gray-600 text-white" />
              </div>
              <div>
                <Label className="text-gray-400 text-xs uppercase">Função</Label>
                <Select value={formData.role} onValueChange={value => setFormData({ ...formData, role: value })}>
                  <SelectTrigger className="bg-slate-800 border-gray-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-gray-600">
  <SelectItem value="ADMIN">Admin</SelectItem>
  <SelectItem value="SUPERINTENDENT">Super</SelectItem>
  <SelectItem value="MANAGER">Manager</SelectItem>
  <SelectItem value="BROKER">Corretor</SelectItem>
</SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400 text-xs uppercase">Equipe</Label>
                <Select value={formData.team_id || "none"} onValueChange={value => setFormData({ ...formData, team_id: value === "none" ? null : value })}>
                  <SelectTrigger className="bg-slate-800 border-gray-600 text-white">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-gray-600">
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {teams.map(team => (
                      <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-400 text-xs uppercase">Manager</Label>
                <Select value={formData.manager_id || "none"} onValueChange={value => setFormData({ ...formData, manager_id: value === "none" ? null : value })}>
                  <SelectTrigger className="bg-slate-800 border-gray-600 text-white">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-gray-600">
                    <SelectItem value="none">Nenhum</SelectItem>
                    {managers.map(mgr => (
                      <SelectItem key={mgr.id} value={mgr.id}>{mgr.first_name || mgr.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(formData.role === 'BROKER' || formData.role === 'MANAGER') && (
              <>
                <div>
                  <Label className="text-gray-400 text-xs uppercase">Bot/Instância</Label>
                  <Select value={formData.bot_instance_id || "none"} onValueChange={value => setFormData({ ...formData, bot_instance_id: value === "none" ? null : value })}>
                    <SelectTrigger className="bg-slate-800 border-gray-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-gray-600">
                      <SelectItem value="none">Nenhum</SelectItem>
                      {bots.map(bot => (
                        <SelectItem key={bot.id} value={bot.id}>{bot.name} ({bot.phone})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-gray-400 text-xs uppercase">Nome da Instância Evolution</Label>
                  <Input value={formData.evolution_instance} onChange={e => setFormData({ ...formData, evolution_instance: e.target.value })} placeholder="ex: joao_silva" className="bg-slate-800 border-gray-600 text-white" />
                  <p className="text-xs text-gray-500 mt-1">Nome exato da instância no Evolution API</p>
                </div>

                <div className="border-2 border-purple-500/30 bg-purple-950/20 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">Recebe Leads Automaticamente</div>
                      <div className="text-xs text-gray-400">Sistema distribui leads para este corretor</div>
                    </div>
                    <Switch checked={formData.lead_assignment_enabled} onCheckedChange={checked => setFormData({ ...formData, lead_assignment_enabled: checked })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white">IA Atende Sozinha</div>
                      <div className="text-xs text-gray-400">IA responde sem precisar do corretor</div>
                    </div>
                    <Switch checked={formData.qualification_ai_enabled} onCheckedChange={checked => setFormData({ ...formData, qualification_ai_enabled: checked })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-white">Boas-vindas</div>
                    <Switch checked={formData.automation_settings.welcome_enabled} onCheckedChange={checked => setFormData({ ...formData, automation_settings: { ...formData.automation_settings, welcome_enabled: checked } })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-white">Follow-up</div>
                    <Switch checked={formData.automation_settings.follow_up_enabled} onCheckedChange={checked => setFormData({ ...formData, automation_settings: { ...formData.automation_settings, follow_up_enabled: checked } })} />
                  </div>
                </div>
              </>
            )}

            <div className="flex items-center gap-2">
              <Switch checked={formData.is_active} onCheckedChange={checked => setFormData({ ...formData, is_active: checked })} />
              <Label className="text-gray-300">Usuário ativo</Label>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={() => setModalOpen(false)} variant="outline" className="flex-1 border-gray-600">Cancelar</Button>
              <Button onClick={handleSaveUser} className="flex-1 bg-blue-600">{editUser ? "Salvar" : "Criar"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={botModalOpen} onOpenChange={setBotModalOpen}>
        <DialogContent className="bg-slate-900 border-purple-500 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-2">
              <Smartphone className="w-6 h-6 text-purple-400" />
              Cadastrar Bot
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400 text-xs uppercase">Nome</Label>
                <Input value={botFormData.name} onChange={e => setBotFormData({ ...botFormData, name: e.target.value })} placeholder="Dudu" className="bg-slate-800 border-gray-600 text-white" />
              </div>
              <div>
                <Label className="text-gray-400 text-xs uppercase">Telefone</Label>
                <Input value={botFormData.phone} onChange={e => setBotFormData({ ...botFormData, phone: e.target.value })} placeholder="5511999999999" className="bg-slate-800 border-gray-600 text-white" />
              </div>
            </div>
            <div>
              <Label className="text-gray-400 text-xs uppercase">Nome da Instância</Label>
              <Input value={botFormData.instance_name} onChange={e => setBotFormData({ ...botFormData, instance_name: e.target.value })} placeholder="Dudu" className="bg-slate-800 border-gray-600 text-white" />
              <p className="text-xs text-gray-500 mt-1">Nome exato da instância no Evolution API</p>
            </div>
            <div>
              <Label className="text-gray-400 text-xs uppercase">API Key Evolution</Label>
              <Input value={botFormData.evolution_api_key} onChange={e => setBotFormData({ ...botFormData, evolution_api_key: e.target.value })} type="password" placeholder="sua-api-key" className="bg-slate-800 border-gray-600 text-white" />
            </div>
            <div className="bg-blue-900/20 border border-blue-500/30 rounded p-3 text-xs text-blue-300">
              ℹ️ <strong>Webhook URL:</strong> Configure no Evolution API:
              <code className="block mt-1 bg-slate-900/60 p-2 rounded text-xs">
                https://dcimeuefnhaiemrfiklj.supabase.co/functions/v1/webhook_receiver
              </code>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={() => setBotModalOpen(false)} variant="outline" className="flex-1 border-gray-600">Cancelar</Button>
              <Button onClick={handleSaveBot} className="flex-1 bg-purple-600">Cadastrar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
