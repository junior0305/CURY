"use client";

import { useState, useEffect, useMemo } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { User, UserRole, Team } from "@/types/user";
import { Save, Loader2, UserPlus, Shield, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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

const roles: UserRole[] = ['SUPERINTENDENT', 'MANAGER', 'BROKER'];

const UserForm = ({ isOpen, onOpenChange, userToEdit, onSave, isSaving }: UserFormProps) => {
  const [formData, setFormData] = useState<Partial<User & { password?: string }>>({});
  const [creating, setCreating] = useState(false);
  
  const { data: allManagers = [], isLoading: isLoadingManagers } = useQuery<User[]>({
    queryKey: ['managers'],
    queryFn: fetchManagers,
  });

  const { data: teams = [], isLoading: isLoadingTeams } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: fetchTeams,
  });

  // Filter the managers list based on the role of the user being created/edited
  const filteredManagers = useMemo(() => {
    if (formData.role === 'MANAGER') {
      // Managers report to Superintendents
      return allManagers.filter(m => m.role === 'SUPERINTENDENT');
    }
    if (formData.role === 'BROKER') {
      // Brokers usually report to Managers, but can report to Superintendents in small teams
      return allManagers;
    }
    return [];
  }, [allManagers, formData.role]);

  useEffect(() => {
    if (userToEdit) {
      setFormData(userToEdit);
    } else {
      setFormData({
        name: "",
        email: "",
        password: "",
        role: "BROKER",
        managerId: null,
        leadAssignmentEnabled: false,
      });
    }
  }, [userToEdit, isOpen]);

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
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

        const { data, error: invokeError } = await supabase.functions.invoke('create-user', {
          body: {
            email: formData.email,
            password: formData.password,
            firstName,
            lastName,
            role: formData.role,
            managerId: formData.managerId,
            teamId: formData.teamId
          }
        });

        if (invokeError) {
          let errorMessage = "Erro na comunicação com o servidor.";
          try {
            const errorContext = await invokeError.context?.json();
            errorMessage = errorContext?.error || invokeError.message;
          } catch (e) {
            errorMessage = invokeError.message;
          }
          throw new Error(errorMessage);
        }

        if (data?.error) throw new Error(data.error);

        toast.success("Usuário criado com sucesso!");
        onSave(data.user as User);
        onOpenChange(false);
      } catch (err: any) {
        toast.error(`Falha ao criar: ${err.message}`);
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
            <Label htmlFor="name">Nome Completo</Label>
            <Input 
              id="name" 
              value={formData.name || ""} 
              onChange={(e) => handleChange("name", e.target.value)}
              disabled={isEditing || busy} 
              placeholder="Ex: João Silva"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Corporativo</Label>
            <Input 
              id="email" 
              type="email" 
              value={formData.email || ""} 
              onChange={(e) => handleChange("email", e.target.value)}
              disabled={isEditing || busy} 
              placeholder="email@exemplo.com"
              required
            />
          </div>

          {!isEditing && (
            <div className="space-y-2">
              <Label htmlFor="password">Senha Inicial</Label>
              <Input 
                id="password" 
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
            <Label htmlFor="team">Equipe</Label>
            <Select
              value={formData.teamId || "none"}
              onValueChange={(value) => handleChange("teamId", value === "none" ? null : value)}
              disabled={isLoadingTeams || busy}
            >
              <SelectTrigger id="team">
                <SelectValue placeholder="Selecione a equipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem Equipe</SelectItem>
                {teams.map(team => (
                  <SelectItem key={team.id} value={team.id}>
                    <div className="flex items-center gap-2">
                      <Users className="w-3 h-3 text-indigo-500" />
                      {team.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Função no Sistema</Label>
            <Select 
              value={formData.role || "BROKER"} 
              onValueChange={(value) => {
                handleChange("role", value as UserRole);
                // Reset manager selection when role changes to ensure validity
                handleChange("managerId", null);
              }} 
              disabled={busy}
            >
              <SelectTrigger id="role"><SelectValue placeholder="Selecione a função" /></SelectTrigger>
              <SelectContent>
                {roles.map(role => (
                  <SelectItem key={role} value={role}>{role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsManager && (
            <div className="space-y-2">
              <Label htmlFor="manager">Gestor Responsável</Label>
              <Select 
                value={formData.managerId || "none"} 
                onValueChange={(value) => handleChange("managerId", value === "none" ? null : value)}
                disabled={isLoadingManagers || busy}
              >
                <SelectTrigger id="manager">
                  <SelectValue placeholder="Selecione o gestor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {formData.role === 'MANAGER' ? "Nenhum (Direto ao Topo)" : "Nenhum (Reporta a Superintendente)"}
                  </SelectItem>
                  {filteredManagers.map(manager => (
                    <SelectItem key={manager.id} value={manager.id}>
                      <div className="flex items-center gap-2">
                        {manager.name}
                        <Badge variant="outline" className="text-[9px] font-normal uppercase py-0 h-4">
                          {manager.role}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filteredManagers.length === 0 && !isLoadingManagers && formData.role === 'MANAGER' && (
                <p className="text-[11px] text-amber-600 flex items-center gap-1 mt-1">
                  <Shield className="w-3 h-3" /> Nenhum Superintendente encontrado para atrelar este Gerente.
                </p>
              )}
            </div>
          )}

          {isBroker && (
            <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-xl border border-indigo-200">
              <Label htmlFor="lead-assignment" className="flex flex-col space-y-1">
                <span className="text-base font-medium">Habilitar Fila de Leads</span>
                <span className="text-sm text-gray-500">Permite que este corretor receba novos leads.</span>
              </Label>
              <Switch 
                id="lead-assignment" 
                checked={!!formData.leadAssignmentEnabled} 
                onCheckedChange={(checked) => handleChange("leadAssignmentEnabled", checked)} 
                disabled={busy}
              />
            </div>
          )}

          <Button type="submit" className="w-full bg-indigo-600 h-12 text-lg font-bold" disabled={busy}>
            {busy ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <Save className="w-5 h-5 mr-2" />
            )}
            {busy ? "Processando..." : (isEditing ? "Salvar Alterações" : "Criar Usuário")}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
};

export default UserForm;