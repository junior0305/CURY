import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { User, UserRole } from "@/types/user";
import { getManagers, getMockUsers } from "@/data/mock-users";
import { Save } from "lucide-react";

interface UserFormProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  userToEdit?: User | null;
  onSave: (user: User) => void;
}

const roles: UserRole[] = ['SUPERINTENDENT', 'MANAGER', 'BROKER'];

const UserForm = ({ isOpen, onOpenChange, userToEdit, onSave }: UserFormProps) => {
  const [formData, setFormData] = useState<Partial<User>>({});
  const managers = getManagers();

  useEffect(() => {
    if (userToEdit) {
      setFormData(userToEdit);
    } else {
      setFormData({
        id: Date.now().toString(), // Mock ID generation
        name: "",
        email: "",
        role: "BROKER",
        managerId: null,
        leadAssignmentEnabled: false,
      });
    }
  }, [userToEdit, isOpen]);

  const handleChange = (field: keyof User, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name && formData.email && formData.role) {
      // Simple validation and type casting for mock save
      const user: User = {
        ...formData,
        id: formData.id || Date.now().toString(),
        role: formData.role as UserRole,
        managerId: formData.role === 'BROKER' || formData.role === 'MANAGER' ? formData.managerId || null : null,
        leadAssignmentEnabled: formData.role === 'BROKER' ? !!formData.leadAssignmentEnabled : false,
      } as User;
      onSave(user);
      onOpenChange(false);
    }
  };

  const isBroker = formData.role === 'BROKER';
  const isManagerOrBroker = formData.role === 'MANAGER' || formData.role === 'BROKER';

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md bg-white p-6">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-2xl font-bold text-indigo-700">
            {userToEdit ? "Editar Usuário" : "Novo Usuário"}
          </SheetTitle>
          <SheetDescription className="text-gray-600">
            Preencha os dados para {userToEdit ? "atualizar" : "criar"} um usuário no sistema.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Nome Completo</Label>
            <Input
              id="name"
              value={formData.name || ""}
              onChange={(e) => handleChange("name", e.target.value)}
              required
              className="rounded-lg"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email || ""}
              onChange={(e) => handleChange("email", e.target.value)}
              required
              className="rounded-lg"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Função</Label>
            <Select
              value={formData.role || "BROKER"}
              onValueChange={(value) => handleChange("role", value as UserRole)}
              required
            >
              <SelectTrigger id="role" className="rounded-lg">
                <SelectValue placeholder="Selecione a função" />
              </SelectTrigger>
              <SelectContent>
                {roles.map(role => (
                  <SelectItem key={role} value={role}>
                    {role.charAt(0) + role.slice(1).toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isManagerOrBroker && (
            <div className="space-y-2">
              <Label htmlFor="manager">Gerente Responsável</Label>
              <Select
                value={formData.managerId || ""}
                onValueChange={(value) => handleChange("managerId", value || null)}
              >
                <SelectTrigger id="manager" className="rounded-lg">
                  <SelectValue placeholder="Nenhum (Superintendente)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nenhum (Superintendente)</SelectItem>
                  {managers.map(manager => (
                    <SelectItem key={manager.id} value={manager.id}>
                      {manager.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isBroker && (
            <div className="flex items-center justify-between p-4 bg-indigo-50 rounded-xl border border-indigo-200">
              <Label htmlFor="lead-assignment" className="flex flex-col space-y-1">
                <span className="text-base font-medium">Receber Leads Automaticamente</span>
                <span className="text-sm text-gray-500">
                  Define se este corretor entrará na fila de distribuição de leads.
                </span>
              </Label>
              <Switch
                id="lead-assignment"
                checked={!!formData.leadAssignmentEnabled}
                onCheckedChange={(checked) => handleChange("leadAssignmentEnabled", checked)}
                className="data-[state=checked]:bg-indigo-600"
              />
            </div>
          )}

          <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-md transition-all">
            <Save className="w-4 h-4 mr-2" />
            Salvar Usuário
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
};

export default UserForm;
