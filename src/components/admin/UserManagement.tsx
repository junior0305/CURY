import { useState } from "react";
import { getMockUsers, updateMockUsers } from "@/data/mock-users";
import { User, UserRole } from "@/types/user";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlusCircle, Edit, CheckCircle, XCircle } from "lucide-react";
import UserForm from "./UserForm";
import { useToast } from "@/components/ui/use-toast";

const roleColors: Record<UserRole, string> = {
  SUPERINTENDENT: "bg-red-500 hover:bg-red-600",
  MANAGER: "bg-indigo-600 hover:bg-indigo-700",
  BROKER: "bg-green-600 hover:bg-green-700",
};

const UserManagement = () => {
  const [users, setUsers] = useState(getMockUsers());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  const { toast } = useToast();

  const handleSaveUser = (user: User) => {
    const isNew = !users.find(u => u.id === user.id);
    
    // Update mock data (in a real app, this would be an API call)
    updateMockUsers(user);
    setUsers(getMockUsers()); // Re-fetch updated list

    toast({
      title: isNew ? "Usuário Criado" : "Usuário Atualizado",
      description: `O usuário ${user.name} foi ${isNew ? "criado" : "atualizado"} com sucesso.`,
      variant: "default",
    });
  };

  const handleEdit = (user: User) => {
    setUserToEdit(user);
    setIsFormOpen(true);
  };

  const handleNewUser = () => {
    setUserToEdit(null);
    setIsFormOpen(true);
  };

  const getManagerName = (managerId: string | null) => {
    if (!managerId) return "-";
    const manager = users.find(u => u.id === managerId);
    return manager ? manager.name.split(' ')[0] : "Desconhecido";
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <p className="text-gray-600">
            Visualize e gerencie todos os usuários do sistema.
          </p>
          <Button 
            onClick={handleNewUser}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-md transition-all"
          >
            <PlusCircle className="w-4 h-4 mr-2" />
            Novo Usuário
          </Button>
        </div>

        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead className="w-[200px] text-indigo-700 font-semibold">Nome</TableHead>
                <TableHead className="text-indigo-700 font-semibold">Email</TableHead>
                <TableHead className="text-indigo-700 font-semibold">Função</TableHead>
                <TableHead className="text-indigo-700 font-semibold">Gerente</TableHead>
                <TableHead className="text-indigo-700 font-semibold text-center">Receber Leads</TableHead>
                <TableHead className="text-indigo-700 font-semibold text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} className="hover:bg-indigo-50/50 transition-colors">
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="text-gray-600">{user.email}</TableCell>
                  <TableCell>
                    <Badge className={`text-white ${roleColors[user.role]} rounded-full px-3 py-1 font-medium`}>
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-gray-600">
                    {getManagerName(user.managerId)}
                  </TableCell>
                  <TableCell className="text-center">
                    {user.role === 'BROKER' ? (
                      <div className="flex items-center justify-center">
                        {user.leadAssignmentEnabled ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-500" />
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-indigo-600 hover:text-indigo-800"
                      onClick={() => handleEdit(user)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      <UserForm
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        userToEdit={userToEdit}
        onSave={handleSaveUser}
      />
    </>
  );
};

export default UserManagement;
