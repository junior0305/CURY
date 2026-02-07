import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Loader2, UserCircle, PlusCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent } from "@/components/ui/sheet";
import LeadForm from "@/components/broker/LeadForm";
import LeadList from "@/components/broker/LeadList";
import LeadDetail from "@/components/broker/LeadDetail";

const Dashboard = () => {
  const { user, role, loading, signOut } = useAuth();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
      </div>
    );
  }

  const userName = user?.email || 'Corretor';

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-md p-4 border-b border-indigo-100">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-extrabold text-indigo-600">CRM Guia</h1>
          <div className="flex items-center gap-4">
            <Sheet open={isFormOpen} onOpenChange={setIsFormOpen}>
              <SheetTrigger asChild>
                <Button className="bg-green-600 hover:bg-green-700 shadow-lg shadow-green-100">
                  <PlusCircle className="w-4 h-4 mr-2" /> Novo Lead Manual
                </Button>
              </SheetTrigger>
              <LeadForm onOpenChange={setIsFormOpen} brokerId={user?.id || ''} managerId={user?.user_metadata?.manager_id || null} />
            </Sheet>
            
            <div className="flex items-center gap-2 text-gray-600">
              <UserCircle className="w-6 h-6 text-indigo-400" />
              <span className="font-medium text-sm hidden sm:inline">{userName}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={signOut} title="Sair">
              <LogOut className="w-5 h-5 text-gray-400 hover:text-red-500" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-8 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Coluna 1: Lista de Leads (O que fazer agora) */}
          <div className="lg:col-span-1">
            <LeadList 
              selectedLeadId={selectedLeadId} 
              onSelectLead={setSelectedLeadId} 
              currentUserRole={role || 'BROKER'}
            />
          </div>

          {/* Coluna 2: Detalhe do Lead e Fluxo de Cadência */}
          <div className="lg:col-span-2">
            <LeadDetail 
              leadId={selectedLeadId} 
              onLeadUpdated={() => setSelectedLeadId(null)} // Fecha o detalhe após atualização
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;