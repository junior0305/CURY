import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchProfile = async (currentUser: User) => {
    try {
      console.log("[AuthProvider] Iniciando busca de perfil para:", currentUser.id);
      
      // Tenta buscar no banco com um limite de tempo (timeout manual)
      const profilePromise = supabase
        .from('profiles')
        .select('role')
        .eq('id', currentUser.id)
        .maybeSingle();

      // Fallback imediato: Verificar se a role já está nos metadados do usuário
      const metadataRole = currentUser.user_metadata?.role;
      if (metadataRole) {
        console.log("[AuthProvider] Role encontrada nos metadados:", metadataRole);
        setRole(metadataRole);
      }

      const { data, error } = await profilePromise;
      
      if (error) {
        console.warn("[AuthProvider] Erro ao buscar perfil no DB, mantendo metadados:", error.message);
      } else if (data?.role) {
        console.log("[AuthProvider] Role confirmada pelo banco de dados:", data.role);
        setRole(data.role);
      } else if (!metadataRole) {
        console.warn("[AuthProvider] Nenhuma role encontrada em lugar nenhum. Definindo padrão.");
        setRole('BROKER');
      }
    } catch (err) {
      console.error("[AuthProvider] Erro crítico na busca de perfil:", err);
      if (!role) setRole('BROKER');
    } finally {
      // Pequeno delay para garantir que o React processou a mudança de estado da role
      setTimeout(() => setLoading(false), 100);
    }
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user);
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        
        if (initialSession?.user) {
          await fetchProfile(initialSession.user);
        } else {
          setLoading(false);
        }
      } catch (e) {
        console.error("[AuthProvider] Erro na inicialização:", e);
        setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      console.log("[AuthProvider] Evento de Autenticação:", event);
      setSession(currentSession);
      const currentUser = currentSession?.user ?? null;
      setUser(currentUser);
      
      if (currentUser && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        setLoading(true);
        await fetchProfile(currentUser);
      } else if (event === 'SIGNED_OUT') {
        setRole(null);
        setLoading(false);
        navigate('/login');
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const signOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user, role, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};