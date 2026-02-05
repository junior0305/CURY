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
      queryClient.invalidateQueries({ queryKey: ['managers'] });
      setIsFormOpen(false);
      toast({ title: "Sucesso", description: `Dados atualizados.` });
    },
    onError: (err: any) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  });

  const isSuper = currentUser.role === 'SUPERINTENDENT';

  const visibleUsers = useMemo(() => {
    if (isSuper) return users;
    return users.filter(u => u.id === currentUser.id || u.managerId === currentUser.id);
  }, [users, currentUser, isSuper]);

  const handleSaveUser = (user: User) => {
    if (userToEdit) {
      updateMutation.mutate(user);
    } else {
      // Creation is handled inside UserForm via Edge Function, 
      // but it calls this callback on success to refresh the list.
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['managers'] });
    }
  };

  const handleEdit = (user: User) => {
    if (!isSuper && user.id !== currentUser.id && user.role !== 'BROKER') {
      toast({ title: "Acesso Negado", description: "Somente administradores podem editar este nível.", variant: "destructive" });
      return;
    }
    setUserToEdit(user);
    setIsFormOpen(true);
  };

  const handleNewUser = () => {
    setUserToEdit(null);
    setIsFormOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-40">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Membros do Time</h2>
          <p className="text-sm text-gray-500">{isSuper ? "Todos os usuários cadastrados." : "Corretores sob sua gestão."}</p>
        </div>
        <Button onClick={handleNewUser} className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-100">
          <PlusCircle className="w-4 h-4 mr-2" /> Novo Usuário
        </Button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white">
        <Table>
          <TableHeader className="bg-gray-50/50">
            <TableRow>
              <TableHead className="font-bold">Nome</TableHead>
              <TableHead className="font-bold">Função</TableHead>
              <TableHead className="text-center font-bold">Status Fila</TableHead>
              <TableHead className="text-right font-bold">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-gray-400">
                  Nenhum membro encontrado.
                </TableCell>
              </TableRow>
            ) : (
              visibleUsers.map((user) => (
                <TableRow key={user.id} className="hover:bg-gray-50/50 transition-colors">
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span className="flex items-center gap-2">
                        {user.name} 
                        {user.id === currentUser.id && <Badge variant="secondary" className="text-[10px]">VOCÊ</Badge>}
                      </span>
                      <span className="text-[11px] text-gray-400 font-normal">{user.email}</span>
                    </div>
                  </TableCell>
                  <TableCell><Badge className={`${roleColors[user.role]} text-white border-none shadow-sm`}>{user.role}</Badge></TableCell>
                  <TableCell className="text-center">
                    {user.role === 'BROKER' ? (
                      user.leadAssignmentEnabled 
                        ? <CheckCircle className="w-5 h-5 text-green-500 mx-auto" /> 
                        : <XCircle className="w-5 h-5 text-red-400 mx-auto" />
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleEdit(user)} 
                      disabled={updateMutation.isPending}
                      className="hover:bg-indigo-50 hover:text-indigo-600 rounded-full"
                    >
                      {(!isSuper && user.id !== currentUser.id && user.role !== 'BROKER') ? <Lock className="w-4 h-4 text-gray-300" /> : <Edit className="w-4 h-4" />}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
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