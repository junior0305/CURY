import { MadeWithDyad } from "@/components/made-with-dyad";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { LayoutDashboard, ShieldAlert, CheckCircle, LogIn, Search, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";

const Index = () => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [diagInfo, setDiagInfo] = useState<{exists: boolean, role: string} | null>(null);

  const setupAdmin = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-admin', {
        body: { email: 'junior@crmpro.com', password: 'admin123', role: 'SUPERINTENDENT' }
      });
      
      if (error) throw error;
      
      if (data?.success) {
        toast.success(data.message);
        setStatus('success');
        checkSystem(); // Re-testar após configurar
      } else {
        throw new Error(data?.error || "Erro na Edge Function");
      }
    } catch (err: any) {
      toast.error(`Falha na sincronização: ${err.message}`);
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const checkSystem = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('email', 'junior@crmpro.com')
        .maybeSingle();
      
      if (error) throw error;
      setDiagInfo({ exists: !!data, role: data?.role || 'N/A' });
    } catch (e) {
      console.error(e);
      setDiagInfo({ exists: false, role: 'Erro' });
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="text-center bg-white p-10 rounded-3xl shadow-2xl border border-indigo-100 max-w-lg w-full">
        <h1 className="text-5xl font-extrabold text-gray-900 mb-6">
          Portal <span className="text-indigo-600">CRM</span>
        </h1>
        
        <div className="flex flex-col gap-4">
          <Link to="/login">
            <Button className="w-full bg-indigo-600 py-6 text-lg hover:bg-indigo-700 shadow-lg shadow-indigo-100">
              <LogIn className="w-6 h-6 mr-3" />
              Entrar no Sistema
            </Button>
          </Link>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <Button 
              variant="outline" 
              onClick={setupAdmin} 
              disabled={loading}
              className="border-indigo-200 text-indigo-600 hover:bg-indigo-50"
            >
              <ShieldAlert className="w-4 h-4 mr-2" />
              {loading ? "Sincronizando..." : "Resetar Admin"}
            </Button>

            <Button 
              variant="ghost" 
              onClick={checkSystem}
              className="text-gray-500 hover:bg-gray-100"
            >
              <Search className="w-4 h-4 mr-2" />
              Testar Sistema
            </Button>
          </div>

          {diagInfo && (
            <div className={`mt-6 p-4 rounded-xl text-left border ${diagInfo.exists ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
              <p className="text-xs font-bold uppercase text-gray-400 mb-2">Diagnóstico de Acesso:</p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Usuário na Tabela Profile:</span>
                {diagInfo.exists ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                )}
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm font-medium text-gray-700">Cargo Detectado:</span>
                <span className="text-sm font-bold text-indigo-600">{diagInfo.role}</span>
              </div>
              {!diagInfo.exists && (
                <p className="text-[10px] text-amber-600 mt-2 font-medium">
                  * Clique em "Resetar Admin" para criar o perfil obrigatório.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      <MadeWithDyad />
    </div>
  );
};

export default Index;