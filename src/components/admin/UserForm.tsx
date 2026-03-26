"use client";

import { useState, useEffect, useMemo } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { User, UserRole, Team } from "@/types/user";
import { Save, Loader2, UserPlus, Shield, Users, RefreshCw, Phone, Mail, Lock, Briefcase, Zap, Bot } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchManagers, fetchTeams } from "@/integrations/supabase/profiles";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface UserFormProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  userToEdit?: User | null;
  onSave: (user: User) => void;
  isSaving: boolean;
}

const roles: UserRole[] = ['SUPERINTENDENT', 'MANAGER', 'BROKER', 'ADMIN'];

const UserForm = ({ isOpen, onOpenChange, userToEdit, onSave, isSaving }: UserFormProps) => {
  const [formData, setFormData] = useState<Partial<User & { password?: string }>>({});
  const [creating, setCreating] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  
  const { data: allManagers = [], isLoading: isLoadingManagers } = useQuery<User[]>({
    queryKey: ['managers'],
    queryFn: fetchManagers,
  });

  const { data: teams = [], isLoading: isLoadingTeams } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: fetchTeams,
  });

  const { data: botInstances = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['bot_instances'],
    queryFn: async () => {
      const { data } = await supabase.from('bot_instances').select('id, name').order('name');
      return data || [];
    },
  });

  const filteredManagers = useMemo(() => {
    if (formData.role === 'MANAGER') {
      return allManagers.filter(m => m.role === 'SUPERINTENDENT' || m.role === 'ADMIN');
    }
    if (formData.role === 'BROKER') {
      return allManagers;
    }
    return [];
  }, [allManagers, formData.role]);

  useEffect(() => {
    if (userToEdit) {
      setFormData({ ...userToEdit, phone: userToEdit.phone || "" });
    } else {
      setFormData({
        name: "",
        email: "",
        phone: "",
        password: "",
        role: "BROKER",
        managerId: null,
        teamId: null,
        leadAssignmentEnabled: false,
        botInstanceId: null,
      });
    }
  }, [userToEdit, isOpen]);

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleResetPassword = async () => {
    if (!userToEdit || !formData.password) {
      toast.error("Digite a nova senha no campo de senha.");
      return;
    }
    setResettingPassword(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: { action: 'update-password', userId: userToEdit.id, password: formData.password }
      });
      if (error) throw error;
      toast.success("Senha alterada com sucesso!");
      setFormData(prev => ({ ...prev, password: "" }));
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setResettingPassword(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userToEdit) {
      onSave(formData as User);
    } else {
      if (!formData.email || !formData.password || !formData.name) {
        toast.error("Preencha os campos obrigatórios.");
        return;
      }
      setCreating(true);
      try {
        const names = (formData.name || "").trim().split(/\s+/);
        const { data, error } = await supabase.functions.invoke('create-user', {
          body: {
            email: formData.email,
            password: formData.password,
            firstName: names[0],
            lastName: names.slice(1).join(" "),
            phone: formData.phone || null,
            role: formData.role,
            managerId: formData.managerId === "none" ? null : formData.managerId,
            teamId: formData.teamId === "none" ? null : formData.teamId,
            leadAssignmentEnabled: formData.leadAssignmentEnabled,
            botInstanceId: formData.botInstanceId === "none" ? null : formData.botInstanceId
          }
        });
        if (error) throw error;
        toast.success("Usuário criado!");
        onSave(data.user as User);
        onOpenChange(false);
      } catch (err: any) {
        toast.error(`Falha na Edge Function: ${err.message}. Verifique se a função está implantada.`);
      } finally {
        setCreating(false);
      }
    }
  };

  const isEditing = !!userToEdit;
  const busy = isSaving || creating;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md bg-slate-50 p-0 overflow-hidden border-l-0 shadow-2xl">
        <div className="h-full flex flex-col">
          {/* Header Estilizado */}
          <div className="bg-white p-8 border-b border-slate-100">
            <div className="h-14 w-14 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mb-4 shadow-lg shadow-indigo-200">
              {isEditing ? <RefreshCw className="w-7 h-7" /> : <UserPlus className="w-7 h-7" />}
            </div>
            <SheetTitle className="text-2xl font-black text-slate-900 tracking-tight uppercase italic">
              {isEditing ? "Ajustar Perfil" : "Recrutar Agente"}
            </SheetTitle>
            <SheetDescription className="text-slate-500 font-medium mt-1">
              {isEditing ? "Atualize as credenciais e permissões do membro." : "Cadastre um novo membro na arena de vendas."}
            </SheetDescription>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
            {/* Seção: Identificação */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <Shield className="w-3 h-3" /> Identificação de Combate
              </h3>
              
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-700">Nome Completo</Label>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input 
                      value={formData.name || ""} 
                      onChange={(e) => handleChange("name", e.target.value)}
                      className="pl-10 h-12 rounded-xl border-slate-200 bg-white focus:ring-indigo-500"
                      placeholder="Ex: John Wick"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-700">E-mail de Acesso</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input 
                      type="email"
                      value={formData.email || ""} 
                      onChange={(e) => handleChange("email", e.target.value)}
                      disabled={isEditing}
                      className="pl-10 h-12 rounded-xl border-slate-200 bg-white focus:ring-indigo-500"
                      placeholder="agente@empresa.com"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-700">WhatsApp (Com DDD)</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input 
                      type="tel"
                      value={formData.phone || ""} 
                      onChange={(e) => handleChange("phone", e.target.value)}
                      className="pl-10 h-12 rounded-xl border-slate-200 bg-white focus:ring-indigo-500"
                      placeholder="11999999999"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Seção: Hierarquia */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <Briefcase className="w-3 h-3" /> Patente e Pelotão
              </h3>
              
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-700">Função (Role)</Label>
                  <Select value={formData.role || "BROKER"} onValueChange={(v) => handleChange("role", v)}>
                    <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-none shadow-2xl">
                      {roles.map(r => <SelectItem key={r} value={r} className="font-bold">{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-700">Equipe</Label>
                  <Select value={formData.teamId || "none"} onValueChange={(v) => handleChange("teamId", v === "none" ? null : v)}>
                    <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-white">
                      <SelectValue placeholder="Selecione a equipe" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-none shadow-2xl">
                      <SelectItem value="none">Sem Equipe</SelectItem>
                      {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {(formData.role === 'BROKER' || formData.role === 'MANAGER') && (
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5 text-slate-400" /> Instância WhatsApp
                    </Label>
                    <Select value={formData.botInstanceId || "none"} onValueChange={(v) => handleChange("botInstanceId", v === "none" ? null : v)}>
                      <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-white">
                        <SelectValue placeholder="Nenhuma instância" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-none shadow-2xl">
                        <SelectItem value="none">Nenhuma</SelectItem>
                        {botInstances.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {(formData.role === 'BROKER' || formData.role === 'MANAGER') && (
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-700">Gestor Direto</Label>
                    <Select value={formData.managerId || "none"} onValueChange={(v) => handleChange("managerId", v === "none" ? null : v)}>
                      <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-white">
                        <SelectValue placeholder="Selecione o gestor" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-none shadow-2xl">
                        <SelectItem value="none">Nenhum</SelectItem>
                        {filteredManagers.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            {/* Seção: Segurança / Senha */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <Lock className="w-3 h-3" /> Segurança
              </h3>
              
              <div className={cn("p-5 rounded-2xl border", isEditing ? "bg-amber-50 border-amber-100" : "bg-white border-slate-200")}>
                <Label className={cn("text-xs font-bold mb-2 block", isEditing ? "text-amber-800" : "text-slate-700")}>
                  {isEditing ? "Redefinir Senha" : "Senha de Acesso"}
                </Label>
                <div className="flex gap-2">
                  <Input 
                    type="password"
                    value={formData.password || ""} 
                    onChange={(e) => handleChange("password", e.target.value)}
                    className="h-11 rounded-xl border-slate-200 bg-white"
                    placeholder={isEditing ? "Nova senha" : "Mínimo 6 caracteres"}
                  />
                  {isEditing && (
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={handleResetPassword}
                      disabled={resettingPassword || !formData.password}
                      className="h-11 rounded-xl border-amber-200 text-amber-700 hover:bg-amber-100 font-bold"
                    >
                      {resettingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : "Alterar"}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Fila de Leads */}
            {formData.role === 'BROKER' && (
              <div className="p-6 bg-indigo-600 rounded-[2rem] text-white shadow-xl shadow-indigo-100 flex items-center justify-between group">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                    <span className="font-black uppercase tracking-tighter italic">Fila Ativa</span>
                  </div>
                  <p className="text-[10px] text-indigo-100 font-medium">Receber leads automaticamente?</p>
                </div>
                <Switch 
                  checked={!!formData.leadAssignmentEnabled} 
                  onCheckedChange={(v) => handleChange("leadAssignmentEnabled", v)}
                  className="data-[state=checked]:bg-emerald-400"
                />
              </div>
            )}
          </form>

          {/* Footer Fixo */}
          <div className="p-8 bg-white border-t border-slate-100">
            <Button 
              onClick={handleSubmit}
              disabled={busy}
              className="w-full h-14 rounded-2xl bg-slate-900 hover:bg-black text-white font-black text-lg shadow-xl transition-all active:scale-95"
            >
              {busy ? <Loader2 className="w-6 h-6 mr-2 animate-spin" /> : <Save className="w-6 h-6 mr-2" />}
              {isEditing ? "SALVAR ALTERAÇÕES" : "CONFIRMAR RECRUTAMENTO"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default UserForm;