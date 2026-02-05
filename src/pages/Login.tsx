import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';
import { ShieldCheck, Info } from 'lucide-react';

const Login = () => {
  const { session, role } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (session && role) {
      if (role === 'SUPERINTENDENT' || role === 'MANAGER') {
        navigate('/admin');
      } else {
        navigate('/'); 
      }
    }
  }, [session, role, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-2xl border border-indigo-50">
        <div className="flex flex-col items-center mb-8">
          <div className="p-3 bg-indigo-600 rounded-xl mb-4">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Acesso Restrito</h1>
          <p className="text-gray-500 text-center mt-2">
            Faça login para gerenciar seus leads e equipe.
          </p>
        </div>

        <Auth
          supabaseClient={supabase}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: '#4f46e5',
                  brandAccent: '#4338ca',
                },
              },
            },
          }}
          providers={[]}
          localization={{
            variables: {
              sign_in: {
                email_label: 'Email',
                password_label: 'Senha',
                button_label: 'Entrar',
              },
            },
          }}
        />

        <div className="mt-8 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
          <div className="flex items-center gap-2 mb-2 text-indigo-700 font-semibold text-sm">
            <Info className="w-4 h-4" />
            <span>Credenciais de Teste:</span>
          </div>
          <div className="space-y-1 text-xs text-gray-600">
            <p><b>Super:</b> alice@crm.com / admin123</p>
            <p><b>Gerente:</b> bob@crm.com / admin123</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;