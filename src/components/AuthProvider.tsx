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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const handleUserSession = async (currentSession: Session | null) => {
    if (!currentSession) {
      setSession(null);
      setUser(null);
      setRole(null);
      setLoading(false);
      return;
    }

    const currentUser = currentSession.user;
    setSession(currentSession);
    setUser(currentUser);

    // 1. Tenta pegar a role direto dos metadados (rápido/instantâneo)
    const metaRole = currentUser.user_metadata?.role;
    if (metaRole) {
      console.log("[AuthProvider] Role detectada via metadados:", metaRole);
      setRole(metaRole);
      setLoading(false); // Já libera o acesso aqui!
    }

    // 2. Busca no banco em segundo plano para confirmar/atualizar
    try {
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', currentUser.id)
        .maybeSingle();
      
      if (data?.role) {
        console.log("[AuthProvider] Role confirmada via DB:", data.role);
        setRole(data.role);
      } else if (!metaRole) {
        setRole('BROKER');
      }
    } catch (e) {
      console.error("[AuthProvider] Erro silencioso na busca de perfil:", e);
      if (!metaRole) setRole('BROKER');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Inicialização rápida
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleUserSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleUserSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <AuthContext.Provider value={{ session, user, role, loading, signOut }}>
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