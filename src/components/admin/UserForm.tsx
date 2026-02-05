import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { User, UserRole } from "@/types/user";
import { Save, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchManagers } from "@/integrations/supabase/profiles";

interface UserFormProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  userToEdit?: User | null;
  onSave: (user: User) => void;
  isSaving: boolean;
}

const roles: UserRole[] = ['SUPERINTENDENT', 'MANAGER', 'BROKER'];

const UserForm = ({ isOpen, onOpenChange, userToEdit, onSave, isSaving }: UserFormProps) => {
  const [formData, setFormData] = useState<Partial<User>>({});
  
  const { data: managers = [], isLoading: isLoadingManagers } = useQuery<User[]>({
    queryKey: ['managers'],
    queryFn: fetchManagers,
  });

  useEffect(() => {
    if (userToEdit) {
      setFormData(userToEdit);
    } else {
      // When creating a new user (which is currently only possible via the Edge Function/Auth Admin API), 
      // we still initialize the form fields, but we rely on the ID being present for updates.
      setFormData({
        id: userToEdit?.id || "", // ID must be present for update
        name: userToEdit?.name || "",
        email: userToEdit?.email || "",
        role: userToEdit?.role || "BROKER",
        managerId: userToEdit?.managerId || null,
        leadAssignmentEnabled: userToEdit?.leadAssignmentEnabled || false,
      });
    }
  }, [userToEdit, isOpen]);

  const handleChange = (field: keyof User, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // We only allow updates to existing users via this form in the current setup.
    if (!formData.id) return; 

    if (formData.name && formData.email && formData.role) {
      const user: User = {
        ...formData,
        id: formData.id,
        name: formData.name,
        email: formData.email,
        role: formData.role as UserRole,
        managerId: formData.role === 'BROKER' || formData.role === 'MANAGER' ? formData.managerId || null : null,
        leadAssignmentEnabled: formData.role === 'BROKER' ? !!formData.leadAssignmentEnabled : false,
      } as User;
      onSave(user);
      // Note: Closing the sheet is handled by UserManagement onSuccess callback, 
      // but since we are only updating, we can close it here optimistically.
      // However, for better UX, let's let the parent handle closing on success.
    }
  };

  const isBroker = formData.role === 'BROKER';
  const isManagerOrBroker = formData.role === 'MANAGER' || formData.role === 'BROKER';
  const isEditing = !!userToEdit;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md bg-white p-6">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-2xl font-bold text-indigo-700">
            {isEditing ? "Editar Usuário" : "Novo Usuário"}
          </SheetTitle>
          <SheetDescription className="text-gray-600">
            Preencha os dados para {isEditing ? "atualizar" : "criar"} um usuário no sistema.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Nome Completo</Label>
            {/* Name and Email are read-only here as they are managed by Supabase Auth/Profile creation */}
            <Input id="name" value={formData.name || ""} readOnly disabled={isEditing} className={isEditing ? "bg-gray-100" : ""} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={formData.email || ""} readOnly disabled={isEditing} className={isEditing ? "bg-gray-100" : ""} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Função</Label>
            <Select value={formData.role || "BROKER"} onValueChange={(value) => handleChange("role", value as UserRole)} disabled={isSaving}>
              <SelectTrigger id="role"><SelectValue placeholder="Selecione a função" /></SelectTrigger>
              <SelectContent>
                {roles.map(role => (
                  <SelectItem key={role} value={role}>{role.charAt(0) + role.slice(1).toLowerCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isManagerOrBroker && (
            <div className="space-y-2">
              <Label htmlFor="manager">Gerente Responsável</Label>
              <Select 
                value={formData.managerId || "none"} 
                onValueChange={(value) => handleChange("managerId", value === "none" ? null : value)}
                disabled={isLoadingManagers || isSaving}
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
                disabled={isSaving}
              />
            </div>
          )}

          <Button type="submit" className="w-full bg-indigo-600" disabled={isSaving || !isEditing}>
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {isSaving ? "Salvando..." : (isEditing ? "Salvar Alterações" : "Criar Usuário (Apenas Edição)")}
          </Button>
          {!isEditing && <p className="text-xs text-center text-red-500 mt-2">A criação de novos usuários deve ser feita via Supabase Auth Admin API ou Edge Function.</p>}
        </form>
      </SheetContent>
    </Sheet>
  );
};

export default UserForm;