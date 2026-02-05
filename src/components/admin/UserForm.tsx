"use client";

import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { User, UserRole } from "@/types/user";
import { Save, Loader2, UserPlus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchManagers } from "@/integrations/supabase/profiles";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  
  const { data: managers = [], isLoading: isLoadingManagers } = useQuery<User[]>({
    queryKey: ['managers'],
    queryFn: fetchManagers,
  });

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
            managerId: formData.managerId
          }
        });

        // The invoke error might be a network error or a non-2xx response
        if (invokeError) {
          // Try to parse the error message from the response if it's a JSON error
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
        console.error("Creation error:", err);
        toast.error(`Falha ao criar: ${err.message}`);
      } finally {
        setCreating(false);
      }
    }
  };

  const isBroker = formData.role === 'BROKER';
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
            {isEditing 
              ? "Atualize as permissões do membro do time." 
              : "Cadastre um novo membro. A senha deve ter no mínimo 6 caracteres."}
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
            <Label htmlFor="email">Email</Label>
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
              <Label htmlFor="password">Senha Temporária</Label>
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
            <Label htmlFor="role">Função</Label>
            <Select 
              value={formData.role || "BROKER"} 
              onValueChange={(value) => handleChange("role", value as UserRole)} 
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

          {(formData.role === 'MANAGER' || formData.role === 'BROKER') && (
            <div className="space-y-2">
              <Label htmlFor="manager">Gerente Responsável</Label>
              <Select 
                value={formData.managerId || "none"} 
                onValueChange={(value) => handleChange("managerId", value === "none" ? null : value)}
                disabled={isLoadingManagers || busy}
              >
                <SelectTrigger id="manager">
                  <SelectValue placeholder="Nenhum (Superintendente)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum (Superintendente)</SelectItem>
                  {managers.map(manager => (
                    <SelectItem key={manager.id} value={manager.id}>{manager.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isBroker && (
            <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-xl border border-indigo-200">
              <Label htmlFor="lead-assignment" className="flex flex-col space-y-1">
                <span className="text-base font-medium">Receber Leads Automaticamente</span>
                <span className="text-sm text-gray-500">Habilita o sorteio para este corretor.</span>
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