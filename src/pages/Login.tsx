import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';
import { CompanySelector } from '@/components/CompanySelector';
import { Swords, Shield, Target } from "lucide-react";

function Login() {
  const navigate = useNavigate();
  const { session } = useAuth();

  useEffect(() => {
    if (session) {
      navigate('/dashboard');
    }
  }, [session, navigate]);

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background de Guerra Tática */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900 via-slate-900 to-black" />
        <div className="grid grid-cols-12 gap-4 h-full w-full p-10 opacity-20">
           {Array.from({ length: 48 }).map((_, i) => (
             <div key={i} className="border border-indigo-500/30 rounded-sm" />
           ))}
        </div>
      </div>

      <div className="max-w-md w-full bg-slate-800/50 backdrop-blur-xl border border-white/10 rounded-[2rem] p-8 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-500">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="h-20 w-20 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-[0_0_40px_-10px_rgba(79,70,229,0.6)] mb-6 rotate-3 hover:rotate-0 transition-transform duration-500">
            <Swords className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tighter uppercase italic">
            Arena de Vendas
          </h1>
          <p className="text-indigo-300 font-medium mt-2 text-sm">
            Entre no campo de batalha e domine o mercado.
          </p>
        </div>

        <CompanySelector />

        <div className="bg-white rounded-2xl p-1">
          <Auth
            supabaseClient={supabase}
            providers={[]} // Removemos providers sociais para focar no email corporativo
            appearance={{
              theme: ThemeSupa,
              variables: {
                default: {
                  colors: {
                    brand: '#4F46E5',
                    brandAccent: '#4338ca',
                  },
                  radii: {
                    borderRadiusButton: '12px',
                    inputBorderRadius: '12px',
                  }
                }
              },
              className: {
                button: 'font-bold uppercase tracking-wide text-xs',
                label: 'font-bold text-slate-600 text-xs uppercase'
              }
            }}
            theme="light"
            localization={{
              variables: {
                sign_in: {
                  email_label: 'Email Corporativo',
                  password_label: 'Senha de Acesso',
                  button_label: 'Entrar no QG',
                }
              }
            }}
          />
        </div>
        
        <div className="mt-8 flex justify-center gap-4 text-slate-500 text-[10px] font-bold uppercase tracking-widest">
          <div className="flex items-center gap-1"><Shield className="h-3 w-3" /> Seguro</div>
          <div className="flex items-center gap-1"><Target className="h-3 w-3" /> Focado</div>
        </div>
      </div>
    </div>
  );
}

export default Login;