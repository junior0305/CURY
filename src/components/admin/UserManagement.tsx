import { useState, useMemo } from "react";
import { User, UserRole } from "@/types/user";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlusCircle, Edit, CheckCircle, XCircle, Lock, Loader2 } from "lucide-react";
import UserForm from "./UserForm";
import { useToast } from "@/components/ui/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchProfiles, updateProfile } from "@/integrations/supabase/profiles";

const roleColors: Record<UserRole, string> = {
  SUPERINTENDENT: "bg-red-500 hover:bg-red-600",
  MANAGER: "bg-indigo-600 hover:bg-indigo-700",
  BROKER: "bg-green-600 hover:bg-green-700",
};

interface UserManagementProps {
  currentUser: User;
}

const UserManagement = ({ currentUser }: UserManagementProps) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);

  const { data: users = [], isLoading, error } = useQuery<User[]>({
    queryKey: ['profiles'],
    queryFn: fetchProfiles,
  });

  const updateMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['managers'] }); // Managers list might change if role was updated
      setIsFormOpen(false); // Close form on success
      toast({ title: "Sucesso", description: `Usuário atualizado.` });
    },
    onError: (err) => {
      console.error("Error updating user:", err);
      toast({ title: "Erro", description: `Falha ao atualizar usuário: ${err.message}`, variant: "destructive" });
    }
  });

  const isSuper = currentUser.role === 'SUPERINTENDENT';

  // Filter users based on current user's role (although RLS should handle this, we filter for display consistency)
  const visibleUsers = useMemo(() => {
    if (isSuper) return users;
    // Managers see themselves and their team
    return users.filter(u => u.id === currentUser.id || u.managerId === currentUser.id);
  }, [users, currentUser, isSuper]);

  const handleSaveUser = (user: User) => {
    // Note: User creation is handled externally (via Edge Function/Auth Admin API).
    // This form only handles updates to existing profiles (role, managerId, leadAssignmentEnabled).
    updateMutation.mutate(user);
  };

  const handleEdit = (user: User) => {
    // Prevent non-Superintendents from editing roles/settings of other Managers
    if (!isSuper && user.id !== currentUser.id && user.role !== 'BROKER') {
      toast({ title: "Acesso Negado", description: "Acesso restrito.", variant: "destructive" });
      return;
    }
    setUserToEdit(user);
    setIsFormOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500 p-4">Erro ao carregar usuários: {error.message}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-gray-600">{isSuper ? "Gerencie todos os membros." : "Gerencie seu time."}</p>
        {/* Note: User creation is currently handled by the initial setup function or Supabase console. 
            We keep the button for future integration with a proper signup flow, but for now, it opens the form for editing. */}
        <Button onClick={() => { setUserToEdit(null); setIsFormOpen(true); }} className="bg-indigo-600">
          <PlusCircle className="w-4 h-4 mr-2" /> Novo Membro (Apenas Edição)
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Função</TableHead>
              <TableHead className="text-center">Leads</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  {user.name} {user.id === currentUser.id && <Badge variant="secondary" className="ml-2">Você</Badge>}
                </TableCell>
                <TableCell><Badge className={`${roleColors[user.role]} text-white border-none`}>{user.role}</Badge></TableCell>
                <TableCell className="text-center">
                  {user.role === 'BROKER' && (user.leadAssignmentEnabled ? <CheckCircle className="w-5 h-5 text-green-500 mx-auto" /> : <XCircle className="w-5 h-5 text-red-500 mx-auto" />)}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(user)} disabled={updateMutation.isPending}>
                    {(!isSuper && user.id !== currentUser.id && user.role !== 'BROKER') ? <Lock className="w-4 h-4 text-gray-300" /> : <Edit className="w-4 h-4" />}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <UserForm 
        isOpen={isFormOpen} 
        onOpenChange={setIsFormOpen} 
        userToEdit={userToEdit} 
        onSave={handleSaveUser} 
        isSaving={updateMutation.isPending}
      />
    </div>
  );
};

export default UserManagement;