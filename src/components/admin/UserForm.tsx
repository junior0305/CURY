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
    console.log("Filtering managers for role:", formData.role, "Total managers available:", allManagers.length);
    if (formData.role === 'MANAGER') {
      // Managers report to Superintendents
      const supers = allManagers.filter(m => m.role === 'SUPERINTENDENT');
      console.log("Found Superintendents for Manager:", supers.length);
      return supers;
    }
    if (formData.role === 'BROKER') {
      // Brokers usually report to Managers, but can report to Superintendents
      console.log("Returning all managers for Broker");
      return allManagers;
    }
    return [];
  }, [allManagers, formData.role]);

  useEffect(() => {
    if (userToEdit) {
      setFormData({ ...userToEdit });
    } else {
      setFormData({
        name: "",
        email: "",
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
            managerId: formData.managerId === "none" ? null : formData.managerId,
            teamId: formData.teamId === "none" ? null : formData.teamId
          }
        });

        if (invokeError) throw new Error(invokeError.message || "Erro no servidor");
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
          <SheetTitle className="text-2xl font-bold text-indigo-700">
            {isEditing ? "Editar Usuário" : "Novo Usuário"}
          </SheetTitle>
          <SheetDescription>Configure os dados do membro do time.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label>Nome Completo</Label>
            <Input 
              value={formData.name || ""} 
              onChange={(e) => handleChange("name", e.target.value)}
              disabled={busy} 
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
              required
            />
          </div>

          {!isEditing && (
            <div className="space-y-2">
              <Label>Senha Inicial</Label>
              <Input 
                type="password" 
                value={formData.password || ""} 
                onChange={(e) => handleChange("password", e.target.value)}
                disabled={busy} 
                required
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Equipe</Label>
            <Select
              value={formData.teamId || "none"}
              onValueChange={(value) => handleChange("teamId", value)}
              disabled={busy}
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

          <div className="space-y-2">
            <Label>Função</Label>
            <Select 
              value={formData.role || "BROKER"} 
              onValueChange={(value) => {
                const newRole = value as UserRole;
                console.log("Changing role to:", newRole);
                handleChange("role", newRole);
                // We keep the managerId if it's still valid, or reset if not
              }} 
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

          {needsManager && (
            <div className="space-y-2">
              <Label>Gestor Responsável</Label>
              <Select 
                value={formData.managerId || "none"} 
                onValueChange={(value) => {
                  console.log("Selecting managerId:", value);
                  handleChange("managerId", value);
                }}
                disabled={busy || isLoadingManagers}
              >
                <SelectTrigger><SelectValue placeholder="Selecione o gestor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum (Direto)</SelectItem>
                  {filteredManagers.map(manager => (
                    <SelectItem key={manager.id} value={manager.id}>
                      {manager.name} ({manager.role === 'SUPERINTENDENT' ? 'Super' : 'Gerente'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-slate-400">
                {filteredManagers.length === 0 
                  ? "Nenhum gestor compatível encontrado." 
                  : `${filteredManagers.length} gestores disponíveis.`}
              </p>
            </div>
          )}

          {isBroker && (
            <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-xl border border-indigo-200">
              <Label className="flex flex-col space-y-1">
                <span>Habilitar Fila de Leads</span>
              </Label>
              <Switch 
                checked={!!formData.leadAssignmentEnabled} 
                onCheckedChange={(checked) => handleChange("leadAssignmentEnabled", checked)} 
                disabled={busy}
              />
            </div>
          )}

          <Button type="submit" className="w-full bg-indigo-600" disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEditing ? "Salvar Alterações" : "Criar Usuário"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
};

export default UserForm;