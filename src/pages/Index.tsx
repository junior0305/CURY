import { MadeWithDyad } from "@/components/made-with-dyad";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { LayoutDashboard, ShieldAlert, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";

const Index = () => {
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(false);

  const setupAdmin = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-admin', {
        body: { email: 'junior@crmpro.com', password: 'admin123', role: 'SUPERINTENDENT' }
      });
      if (error) throw error;
      toast.success("Admin criado com sucesso!");
      setCreated(true);
    } catch (err: any) {
      toast.error("Erro ao criar admin.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="text-center bg-white p-10 rounded-2xl shadow-2xl border border-indigo-100 max-w-lg w-full">
        <h1 className="text-5xl font-extrabold text-gray-900 mb-4">
          Bem-vindo ao <span className="text-indigo-600">CRM</span>
        </h1>
        <div className="flex flex-col gap-4">
          <Link to="/admin">
            <Button className="w-full bg-indigo-600 py-6 text-lg">
              <LayoutDashboard className="w-6 h-6 mr-3" />
              Acessar Área Admin
            </Button>
          </Link>
          {!created && (
            <Button variant="outline" onClick={setupAdmin} disabled={loading}>
              <ShieldAlert className="w-4 h-4 mr-2" />
              {loading ? "Configurando..." : "Configuração Inicial"}
            </Button>
          )}
        </div>
      </div>
      <MadeWithDyad />
    </div>
  );
};

export default Index;