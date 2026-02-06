import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';
import { ShieldCheck, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
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
            variables: { 
              default: { 
                colors: { 
                  brand: '#4f46e5', 
                  brandAccent: '#4338ca' 
                } 
              } 
            },
          }}
          localization={{
            variables: {
              sign_in: {
                email_label: 'E-mail',
                password_label: 'Senha',
                button_label: 'Entrar',
                loading_button_label: 'Entrando...',
                email_input_placeholder: 'Seu e-mail corporativo',
                password_input_placeholder: 'Sua senha',
              }
            }
          }}
          providers={[]}
        />
        
        <div className="mt-6 flex justify-center">
          <Link to="/">
            <Button variant="ghost" size="sm" className="text-gray-400 hover:text-indigo-600">
              <ChevronLeft className="w-4 h-4 mr-1" /> Voltar ao Início
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;