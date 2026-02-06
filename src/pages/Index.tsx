import { MadeWithDyad } from "@/components/made-with-dyad";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { LayoutDashboard, ShieldAlert, CheckCircle, LogIn } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";

const Index = () => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const setupAdmin = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-admin', {
        body: { email: 'junior@crmpro.com', password: 'admin123', role: 'SUPERINTENDENT' }
      });
      
      if (error) throw error;
      
      if (data?.success) {
        toast.success(data.message || "Configuração aplicada!");
        setStatus('success');
      } else {
        throw new Error(data?.error || "Erro desconhecido");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(`Erro: ${err.message}`);
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="text-center bg-white p-10 rounded-3xl shadow-2xl border border-indigo-100 max-w-lg w-full">
        <h1 className="text-5xl font-extrabold text-gray-900 mb-6">
          Portal <span className="text-indigo-600">CRM</span>
        </h1>
        
        <div className="flex flex-col gap-4">
          {status === 'success' ? (
            <>
              <div className="bg-green-50 p-4 rounded-xl border border-green-100 mb-4">
                <p className="text-green-700 font-medium flex items-center justify-center gap-2">
                  <CheckCircle className="w-5 h-5" /> Acesso Liberado!
                </p>
                <p className="text-xs text-green-600 mt-1">E-mail: junior@crmpro.com | Senha: admin123</p>
              </div>
              <Link to="/login">
                <Button className="w-full bg-indigo-600 py-6 text-lg hover:bg-indigo-700">
                  <LogIn className="w-6 h-6 mr-3" />
                  Ir para Login
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Link to="/admin">
                <Button className="w-full bg-slate-900 py-6 text-lg hover:bg-black">
                  <LayoutDashboard className="w-6 h-6 mr-3" />
                  Acessar Dashboard
                </Button>
              </Link>
              
              <Button 
                variant="outline" 
                onClick={setupAdmin} 
                disabled={loading}
                className="border-indigo-200 text-indigo-600 hover:bg-indigo-50"
              >
                <ShieldAlert className="w-4 h-4 mr-2" />
                {loading ? "Sincronizando..." : "Restaurar Acesso Admin"}
              </Button>
            </>
          )}
        </div>
      </div>
      <MadeWithDyad />
    </div>
  );
};

export default Index;