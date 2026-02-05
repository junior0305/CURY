import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';
import { ShieldCheck, Info, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const Login = () => {
  const { session, role, loading } = useAuth();
  const navigate = useNavigate();
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && session && role) {
      if (role === 'SUPERINTENDENT' || role === 'MANAGER') {
        navigate('/admin');
      } else {
        navigate('/'); 
      }
    }
  }, [session, role, loading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-2xl border border-indigo-50">
        <div className="flex flex-col items-center mb-8">
          <div className="p-3 bg-indigo-600 rounded-xl mb-4">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Portal CRM</h1>
          <p className="text-gray-500 text-center mt-2">Área de Acesso Restrito</p>
        </div>

        <Auth
          supabaseClient={supabase}
          appearance={{
            theme: ThemeSupa,
            variables: { default: { colors: { brand: '#4f46e5', brandAccent: '#4338ca' } } },
          }}
          providers={[]}
        />
      </div>
    </div>
  );
};

export default Login;