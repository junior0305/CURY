import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';
import { ShieldCheck } from 'lucide-react';

const Login = () => {
  const { session, role } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (session && role) {
      if (role === 'SUPERINTENDENT' || role === 'MANAGER') {
        navigate('/admin');
      } else {
        navigate('/'); // Corretores vão para a Home (ou dashboard de corretor)
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
      </div>
    </div>
  );
};

export default Login;