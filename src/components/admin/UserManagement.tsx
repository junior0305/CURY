import { useState, useMemo } from "react";
import { getMockUsers, updateMockUsers } from "@/data/mock-users";
import { User, UserRole } from "@/types/user";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlusCircle, Edit, CheckCircle, XCircle, Lock } from "lucide-react";
import UserForm from "./UserForm";
import { useToast } from "@/components/ui/use-toast";

const roleColors: Record<UserRole, string> = {
  SUPERINTENDENT: "bg-red-500 hover:bg-red-600",
  MANAGER: "bg-indigo-600 hover:bg-indigo-700",
  BROKER: "bg-green-600 hover:bg-green-700",
};

interface UserManagementProps {
  currentUser: User;
}

const UserManagement = ({ currentUser }: UserManagementProps) => {
  const [users, setUsers] = useState(getMockUsers());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  const { toast } = useToast();

  const isSuper = currentUser.role === 'SUPERINTENDENT';

  // Filtra os usuários que podem ser vistos/editados
  const visibleUsers = useMemo(() => {
    if (isSuper) return users;
    // O Gerente vê apenas ele mesmo e seus corretores
    return users.filter(u => u.id === currentUser.id || u.managerId === currentUser.id);
  }, [users, currentUser, isSuper]);

  const handleSaveUser = (user: User) => {
    updateMockUsers(user);
    setUsers([...getMockUsers()]);
    toast({
      title: "Sucesso",
      description: `Usuário ${user.name} atualizado.`,
    });
  };

  const handleEdit = (user: User) => {
    // Segurança: Gerente não pode editar outro gerente ou superintendente
    if (!isSuper && user.id !== currentUser.id && user.role !== 'BROKER') {
      toast({
        title: "Acesso Negado",
        description: "Você só pode editar corretores da sua equipe.",
        variant: "destructive"
      });
      return;
    }
    setUserToEdit(user);
    setIsFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-gray-600">
          {isSuper ? "Gerencie todos os membros da organização." : "Gerencie os corretores do seu time."}
        </p>
        <Button onClick={() => { setUserToEdit(null); setIsFormOpen(true); }} className="bg-indigo-600">
          <PlusCircle className="w-4 h-4 mr-2" />
          Novo Membro
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
                  {user.name}
                  {user.id === currentUser.id && <Badge className="ml-2 bg-gray-100 text-gray-500 border-none">Você</Badge>}
                </TableCell>
                <TableCell>
                  <Badge className={`${roleColors[user.role]} text-white border-none`}>{user.role}</Badge>
                </TableCell>
                <TableCell className="text-center">
                  {user.role === 'BROKER' && (
                    user.leadAssignmentEnabled ? <CheckCircle className="w-5 h-5 text-green-500 mx-auto" /> : <XCircle className="w-5 h-5 text-red-500 mx-auto" />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(user)}>
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
        currentUser={currentUser}
      />
    </div>
  );
};

export default UserManagement;