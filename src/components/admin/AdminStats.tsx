import { Card, CardContent } from "@/components/ui/card";
import { Users, Zap, CheckCircle, TrendingUp } from "lucide-react";
import { getMockUsers } from "@/data/mock-users";
import { User } from "@/types/user";

interface AdminStatsProps {
  currentUser: User;
}

const AdminStats = ({ currentUser }: AdminStatsProps) => {
  const allUsers = getMockUsers();
  const isSuper = currentUser.role === 'SUPERINTENDENT';

  const teamBrokers = allUsers.filter(u => 
    u.role === 'BROKER' && (isSuper || u.managerId === currentUser.id)
  );
  
  const activeInQueue = teamBrokers.filter(u => u.leadAssignmentEnabled).length;

  const stats = [
    { title: isSuper ? "Total de Corretores" : "Meus Corretores", value: teamBrokers.length, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
    { title: "Ativos na Fila", value: activeInQueue, icon: Zap, color: "text-amber-600", bg: "bg-amber-50" },
    { title: "Leads no Período", value: isSuper ? "142" : "38", icon: TrendingUp, color: "text-indigo-600", bg: "bg-indigo-50" },
    { title: "Conversão Team", value: isSuper ? "12%" : "14%", icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {stats.map((stat, index) => (
        <Card key={index} className="border-none shadow-sm overflow-hidden group hover:shadow-md transition-all">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">{stat.title}</p>
                <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
              </div>
              <div className={`p-3 rounded-xl ${stat.bg} ${stat.color} transition-transform group-hover:scale-110`}>
                <stat.icon className="w-6 h-6" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default AdminStats;