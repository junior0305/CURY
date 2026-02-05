import { getMockUsers } from "@/data/mock-users";
import { UserRole } from "@/types/user";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlusCircle, Edit, CheckCircle, XCircle } from "lucide-react";

const roleColors: Record<UserRole, string> = {
  SUPERINTENDENT: "bg-red-500 hover:bg-red-600",
  MANAGER: "bg-indigo-600 hover:bg-indigo-700",
  BROKER: "bg-green-600 hover:bg-green-700",
};

const UserManagement = () => {
  const users = getMockUsers();

  const getManagerName = (managerId: string | null) => {
    if (!managerId) return "-";
    const manager = users.find(u => u.id === managerId);
    return manager ? manager.name.split(' ')[0] : "Desconhecido";
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-gray-600">
          Visualize e gerencie todos os usuários do sistema.
        </p>
        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-md transition-all">
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
                  <Button variant="ghost" size="sm" className="text-indigo-600 hover:text-indigo-800">
                    <Edit className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default UserManagement;
