import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';
import { ShieldCheck, Info } from 'lucide-react';

const Login = () => {
  const { session, role, loading } = useAuth();
  const navigate = useNavigate();

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
          <p className="text-gray-500 text-center mt-2">
            Área de Acesso Restrito
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
                email_label: 'E-mail',
                password_label: 'Senha',
                button_label: 'Entrar',
                loading_button_label: 'Entrando...',
                link_text: 'Já tem uma conta? Entre',
              },
              sign_up: {
                email_label: 'E-mail',
                password_label: 'Defina uma senha',
                button_label: 'Criar Conta Mestre',
                loading_button_label: 'Criando...',
                link_text: 'Não tem conta? Clique aqui para criar',
              },
            },
          }}
        />

        <div className="mt-8 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
          <div className="flex items-center gap-2 mb-2 text-indigo-700 font-semibold text-sm">
            <Info className="w-4 h-4" />
            <span>Acesso Mestre:</span>
          </div>
          <p className="text-xs text-indigo-800 leading-relaxed">
            Para acessar como Superintendente, use a aba <b>"Sign Up"</b> para cadastrar o e-mail <b>alice@crm.com</b> com a senha <b>admin123</b>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;