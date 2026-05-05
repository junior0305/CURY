"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { COMPANIES, getSelectedCompanyId } from '@/integrations/supabase/companies';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: string | null;
  loading: boolean;
  mustChangePassword: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // helper to keep debug info on window for inspection
  const setAuthDebug = (payload: any) => {
    try {
      (window as any).__authDebug = {
        ...( (window as any).__authDebug || {} ),
        ...payload
      };
    } catch (e) {
      // ignore in non-browser env
    }
  };

  const fetchUserRole = async (userId: string, email?: string) => {
    try {
      console.log("[AuthProvider] fetchUserRole start", { userId, email });
      setAuthDebug({ lastFetchStartedAt: new Date().toISOString(), authId: userId, email });

      // First try to find profile row by auth user id
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error("[AuthProvider] Error selecting profile by id:", error);
        throw error;
      }

      if (data && data.role) {
        console.log("[AuthProvider] Role found by id:", data.role);
        setRole(data.role);
        setMustChangePassword(!!data.must_change_password);
        setAuthDebug({ profileRow: data, role: data.role, resolvedBy: 'id' });
        // Trava a empresa para não-superintendentes:
        // Salva a empresa autenticada — o CompanySelector só muda para SUPERINTENDENT
        if (data.role !== 'SUPERINTENDENT') {
          const currentCompany = getSelectedCompanyId();
          localStorage.setItem('arena_company_locked', currentCompany);
          // Se por algum motivo o localStorage tiver uma empresa diferente da autenticada,
          // força de volta para a empresa correta e recarrega
          const supabaseUrl = (supabase as any).supabaseUrl as string ?? '';
          const detectedId = Object.keys(COMPANIES).find(id =>
            supabaseUrl.includes((COMPANIES as any)[id].url.replace('https://', ''))
          );
          if (detectedId && detectedId !== currentCompany) {
            console.log(`[AuthProvider] arena_company incorreto (${currentCompany}), corrigindo para ${detectedId}`);
            localStorage.setItem('arena_company', detectedId);
            window.location.reload();
          }
        }
        return;
      }

      if (email) {
        const { data: byEmail, error: errByEmail } = await supabase
          .from('profiles')
          .select('*')
          .eq('email', email)
          .maybeSingle();

        if (errByEmail) {
          console.error("[AuthProvider] Error selecting profile by email:", errByEmail);
          throw errByEmail;
        }

        if (byEmail) {
          console.log("[AuthProvider] Profile found by email (will upsert to auth id):", byEmail);
          const payload: any = {
            id: userId,
            first_name: byEmail.first_name || null,
            last_name: byEmail.last_name || null,
            email: email,
            phone: byEmail.phone || null,
            role: byEmail.role || 'BROKER',
            manager_id: byEmail.manager_id || null,
            team_id: byEmail.team_id || null,
            lead_assignment_enabled: byEmail.lead_assignment_enabled ?? false,
            updated_at: new Date().toISOString(),
          };

          const { error: upsertError } = await supabase
            .from('profiles')
            .upsert(payload, { onConflict: 'id' });

          if (upsertError) {
            console.error("[AuthProvider] Upsert profile error:", upsertError);
            setRole(byEmail.role || 'BROKER');
            setAuthDebug({ profileRow: byEmail, role: byEmail.role, resolvedBy: 'email-no-upsert' });
            return;
          }

          console.log("[AuthProvider] Upsert successful. Role set to:", payload.role);
          setRole(payload.role);
          setMustChangePassword(!!byEmail.must_change_password);
          setAuthDebug({ profileRow: payload, role: payload.role, resolvedBy: 'email-upsert' });
          return;
        }
      }

      console.log("[AuthProvider] No profile found for user; defaulting to BROKER");
      setRole('BROKER');
      setAuthDebug({ profileRow: null, role: 'BROKER', resolvedBy: 'default' });
    } catch (e) {
      console.error("[AuthProvider] Error fetching role:", e);
      setRole('BROKER');
      setAuthDebug({ error: (e as any)?.message ?? String(e), role: 'BROKER', resolvedBy: 'error' });
    } finally {
      setLoading(false);
      setAuthDebug({ lastFetchEndedAt: new Date().toISOString() });
    }
  };

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setAuthDebug({ sessionId: session?.user?.id ?? null });

      if (session) {
        // Ensure we explicitly mark loading true while resolving role
        setLoading(true);
        fetchUserRole(session.user.id, session.user.email ?? undefined);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[AuthProvider] onAuthStateChange:", event);
      setSession(session);
      setUser(session?.user ?? null);
      setAuthDebug({ lastAuthEvent: event, sessionId: session?.user?.id ?? null });

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session) {
          setLoading(true);
          fetchUserRole(session.user.id, session.user.email ?? undefined);
        }
      } else if (event === 'USER_UPDATED') {
        // Atualização de dados do usuário (ex: troca de senha) — não mostra loading screen.
        // Apenas re-lê o profile para atualizar mustChangePassword sem travar a UI.
        if (session) {
          fetchUserRole(session.user.id, session.user.email ?? undefined);
        }
      } else if (event === 'SIGNED_OUT') {
        setRole(null);
        setUser(null);
        setMustChangePassword(false);
        localStorage.removeItem('arena_company_locked'); // libera troca de empresa no próximo login
        queryClient.clear(); // Limpa cache — impede que próximo usuário veja dados do anterior
        setLoading(false);
        setAuthDebug({ sessionId: null, role: null });
      }
    });

    const handleAuthError = (e: any) => {
      console.warn("[AuthProvider] supabase-auth-error event detected", e.detail);
      supabase.auth.signOut().then(() => {
        window.location.href = '/login';
      });
    };

    window.addEventListener('supabase-auth-error', handleAuthError);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('supabase-auth-error', handleAuthError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime: listen for changes on the current user's profiles row and keep role in sync.
  useEffect(() => {
    let profileChannel: any = null;
    if (session?.user?.id) {
      try {
        profileChannel = supabase
          .channel(`public:profiles:id=eq.${session.user.id}`)
          .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${session.user.id}`
          }, (payload: any) => {
            console.log("[AuthProvider] realtime profile payload:", payload);
            const newRole = payload.new?.role ?? payload.record?.role ?? null;
            if (newRole) {
              if (newRole !== role) {
                console.log(`[AuthProvider] role updated via realtime: ${newRole}`);
                setRole(newRole);
                setAuthDebug({ realtimeRoleUpdateAt: new Date().toISOString(), role: newRole });
              } else {
                // still update to be safe (keeps state consistent)
                setRole(newRole);
              }
            }
          })
          .subscribe();
      } catch (err) {
        console.warn("[AuthProvider] realtime subscription failed:", err);
      }
    }

    return () => {
      try {
        if (profileChannel) {
          supabase.removeChannel(profileChannel);
        }
      } catch (e) {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  // Redirect based on role changes to ensure the UI navigates to the correct area
  useEffect(() => {
    if (!loading && session && role) {
      const path = window.location.pathname;
      // Nunca redireciona quem está trocando senha obrigatória — o ProtectedRoute já cuida disso
      if (path === '/force-password-change') return;
      try {
        if (role === 'ADMIN' || role === 'SUPERINTENDENT') {
          if (path !== '/admin' && path !== '/command-center' && path !== '/user-management') {
            navigate('/admin', { replace: true });
          }
        } else if (role === 'MANAGER') {
          // Whitelist: /manager (v1) + tudo dentro de /manager (v2 + subtelas)
          if (path !== '/manager' && !path.startsWith('/manager')) {
            navigate('/manager', { replace: true });
          }
        } else {
          // BROKER e outros -> dashboard
          if (path !== '/dashboard' && path !== '/dashboard-wolf') {
            navigate('/dashboard', { replace: true });
          }
        }
      } catch (e) {
        console.warn("[AuthProvider] navigate failed:", e);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, loading, session, mustChangePassword]); // mustChangePassword nas deps garante navegação quando a flag é limpa

  const signOut = async () => {
    setLoading(true);
    queryClient.clear(); // Limpa cache antes de sair — garante que próximo usuário começa do zero
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole(null);
    setLoading(false);
    setAuthDebug({ sessionId: null, role: null });
    navigate('/login', { replace: true });
  };

  // Keep window debug updated whenever role/session change
  useEffect(() => {
    setAuthDebug({
      sessionId: session?.user?.id ?? null,
      role,
      userEmail: user?.email ?? null,
      lastUpdated: new Date().toISOString()
    });
  }, [session, role, user]);

  return (
    <AuthContext.Provider value={{ session, user, role, loading, mustChangePassword, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};