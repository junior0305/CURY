"use client";

import { useState, useEffect, useMemo } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { User, UserRole, Team } from "@/types/user";
import { Save, Loader2, UserPlus, Shield, Users, RefreshCw, Phone } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchManagers, fetchTeams } from "@/integrations/supabase/profiles";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

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
  const queryClient = useQueryClient();
  
  const { data: allManagers = [], isLoading: isLoadingManagers } = useQuery<User[]>({
    queryKey: ['managers'],
    queryFn: fetchManagers,
  });

  const { data: teams = [], isLoading: isLoadingTeams } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: fetchTeams,
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
      console.log("Loading user to edit:", userToEdit);
      setFormData({ 
        ...userToEdit,
        phone: userToEdit.phone || "" 
      });
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
        body: {
          action: 'update-password',
          userId: userToEdit.id,
          password: formData.password
        }
      });

      if (error) throw error;
      toast.success("Senha alterada com sucesso!");
      setFormData(prev => ({ ...prev, password: "" }));
    } catch (err: any) {
      toast.error(`Erro ao alterar senha: ${err.message}`);
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
        toast.error("Preencha todos os campos obrigatórios.");
        return;
      }

      setCreating(true);
      try {
        const names = (formData.name || "").trim().split(/\s+/);
        const firstName = names[0];
        const lastName = names.slice(1).join(" ");

        const { data, error } = await supabase.functions.invoke('create-user', {
          body: {
            email: formData.email,
            password: formData.password,
            firstName,
            lastName,
            phone: formData.phone || null,
            role: formData.role,
            managerId: formData.managerId === "none" ? null : formData.managerId,
            teamId: formData.teamId === "none" ? null : formData.teamId,
            leadAssignmentEnabled: formData.leadAssignmentEnabled
          }
        });

        if (error) throw new Error(error.message || "Erro de conexão com o servidor.");
        if (data?.error) throw new Error(data.error);

        toast.success("Usuário criado com sucesso!");
        onSave(data.user as User);
        onOpenChange(false);
      } catch (err: any) {
        toast.error(`Falha: ${err.message}`);
      } finally {
        setCreating(false);
      }
    }
  };

  const isBroker = formData.role === 'BROKER';
  const needsManager = formData.role === 'MANAGER' || formData.role === 'BROKER';
  const isEditing = !!userToEdit;
  const busy = isSaving || creating;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md bg-white p-6 overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-2xl font-bold text-indigo-700 flex items-center gap-2">
            {isEditing ? "Editar Usuário" : <><UserPlus className="w-6 h-6" /> Novo Usuário</>}
          </SheetTitle>
          <SheetDescription className="text-gray-600">
            Configure as permissões e a hierarquia do membro.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label>Nome Completo</Label>
            <Input 
              value={formData.name || ""} 
              onChange={(e) => handleChange("name", e.target.value)}
              disabled={busy} 
              placeholder="Ex: João Silva"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Email Corporativo</Label>
            <Input 
              type="email" 
              value={formData.email || ""} 
              onChange={(e) => handleChange("email", e.target.value)}
              disabled={isEditing || busy} 
              placeholder="email@exemplo.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-indigo-700 font-bold">
              <Phone className="w-4 h-4" /> Telefone (WhatsApp)
            </Label>
            <Input 
              type="tel" 
              value={formData.phone || ""} 
              onChange={(e) => handleChange("phone", e.target.value)}
              disabled={busy} 
              placeholder="(00) 00000-0000"
              className="border-indigo-100 focus:border-indigo-500"
            />
          </div>

          {isEditing ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
              <Label className="text-amber-800 font-bold">Alterar Senha do Usuário</Label>
              <div className="flex gap-2">
                <Input 
                  type="password" 
                  placeholder="Nova senha" 
                  value={formData.password || ""} 
                  onChange={(e) => handleChange("password", e.target.value)}
                  className="bg-white"
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleResetPassword}
                  disabled={resettingPassword}
                  className="border-amber-600 text-amber-600 hover:bg-amber-100"
                >
                  {resettingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : "Alterar"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Senha Inicial</Label>
              <Input 
                type="password" 
                value={formData.password || ""} 
                onChange={(e) => handleChange("password", e.target.value)}
                disabled={busy} 
                placeholder="Mínimo 6 caracteres"
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Função</Label>
            <Select 
              value={formData.role || "BROKER"} 
              onValueChange={(value) => handleChange("role", value as UserRole)} 
              disabled={busy}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {roles.map(role => (
                  <SelectItem key={role} value={role}>{role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Equipe</Label>
            <Select 
              value={formData.teamId || "none"} 
              onValueChange={(value) => handleChange("teamId", value === "none" ? null : value)}
              disabled={isLoadingTeams || busy}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a equipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem Equipe</SelectItem>
                {teams.map(team => (
                  <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsManager && (
            <div className="space-y-2">
              <Label>Gestor Responsável</Label>
              <Select 
                value={formData.managerId || "none"} 
                onValueChange={(value) => handleChange("managerId", value === "none" ? null : value)}
                disabled={isLoadingManagers || busy}
              >
                <SelectTrigger><SelectValue placeholder="Selecione o gestor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {filteredManagers.map(manager => (
                    <SelectItem key={manager.id} value={manager.id}>
                      {manager.name} ({manager.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isBroker && (
            <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-xl border border-indigo-200">
              <Label className="flex flex-col space-y-1">
                <span className="font-bold">Habilitar Fila de Leads</span>
              </Label>
              <Switch 
                checked={!!formData.leadAssignmentEnabled} 
                onCheckedChange={(checked) => handleChange("leadAssignmentEnabled", checked)} 
                disabled={busy}
              />
            </div>
          )}

          <Button type="submit" className="w-full bg-indigo-600 h-12 text-lg font-bold" disabled={busy}>
            {busy ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
            {isEditing ? "Salvar Alterações" : "Criar Usuário"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
};

export default UserForm;