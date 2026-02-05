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
        body: { 
          email: 'junior@crmpro.com', 
          password: 'admin123',
          role: 'SUPERINTENDENT'
        }
      });

      if (error) throw error;
      
      toast.success("Admin criado com sucesso!");
      setCreated(true);
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao criar admin ou usuário já existe.");
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
        <p className="text-xl text-gray-600 mb-8">
          Seu sistema de gestão de leads e equipe.
        </p>
        
        <div className="flex flex-col gap-4">
          <Link to="/admin">
            <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-lg px-8 py-6 rounded-xl shadow-lg transition-all transform hover:scale-[1.02]">
              <LayoutDashboard className="w-6 h-6 mr-3" />
              Acessar Área Admin
            </Button>
          </Link>

          {!created ? (
            <Button 
              variant="outline" 
              onClick={setupAdmin}
              disabled={loading}
              className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
            >
              <ShieldAlert className="w-4 h-4 mr-2" />
              {loading ? "Configurando..." : "Configuração Inicial (Criar Admin)"}
            </Button>
          ) : (
            <div className="flex items-center justify-center gap-2 text-green-600 font-medium p-2 bg-green-50 rounded-lg">
              <CheckCircle className="w-4 h-4" />
              Admin Junior criado!
            </div>
          )}
        </div>

        <div className="mt-6 p-4 bg-gray-50 rounded-lg text-left">
          <p className="text-xs text-gray-500 font-bold uppercase mb-1">Acesso Direto:</p>
          <p className="text-sm text-gray-700">User: <code className="bg-white px-1">junior@crmpro.com</code></p>
          <p className="text-sm text-gray-700">Pass: <code className="bg-white px-1">admin123</code></p>
        </div>
      </div>
      <MadeWithDyad />
    </div>
  );
};

export default Index;