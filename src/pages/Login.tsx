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
            Acesse sua conta ou cadastre-se para começar.
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
                email_label: 'Seu email',
                password_label: 'Sua senha',
                button_label: 'Entrar',
                loading_button_label: 'Entrando...',
                link_text: 'Já tem uma conta? Entre',
              },
              sign_up: {
                email_label: 'Endereço de email',
                password_label: 'Crie uma senha',
                button_label: 'Cadastrar novo usuário',
                loading_button_label: 'Cadastrando...',
                link_text: 'Não tem conta? Cadastre-se agora',
              },
            },
          }}
        />

        <div className="mt-8 p-4 bg-amber-50 rounded-xl border border-amber-100">
          <div className="flex items-center gap-2 mb-2 text-amber-700 font-semibold text-sm">
            <Info className="w-4 h-4" />
            <span>Importante:</span>
          </div>
          <p className="text-xs text-amber-800 leading-relaxed">
            Como este é um ambiente novo, você deve clicar em <b>"Sign Up"</b> (Cadastre-se) abaixo do botão de login para criar seu primeiro acesso.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;