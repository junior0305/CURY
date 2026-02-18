"use client";

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

  const fetchUserRole = async (userId: string, email?: string) => {
    try {
      console.log("Fetching role for user:", userId, email ?? "(no email)");
      // First try to find profile by the auth user id
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error("Error selecting profile by id:", error);
        throw error;
      }

      if (data && data.role) {
        console.log("Role found by id:", data.role);
        setRole(data.role);
        return;
      }

      // If not found by id, try to find a profile by email and copy it to the correct id
      if (email) {
        const { data: byEmail, error: errByEmail } = await supabase
          .from('profiles')
          .select('*')
          .eq('email', email)
          .maybeSingle();

        if (errByEmail) {
          console.error("Error selecting profile by email:", errByEmail);
          throw errByEmail;
        }

        if (byEmail) {
          console.log("Profile found by email but not by id — creating/upserting profile with correct id to preserve role.");
          // Build payload copying relevant fields but using the real auth user id
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

          // Upsert to create a profile row matching the auth user id
          const { error: upsertError } = await supabase
            .from('profiles')
            .upsert(payload, { onConflict: 'id' });

          if (upsertError) {
            console.error("Error upserting profile to match auth id:", upsertError);
            // still proceed with role fallback
            setRole(byEmail.role || 'BROKER');
            return;
          }

          console.log("Upsert successful. Role set to:", payload.role);
          setRole(payload.role);
          return;
        }
      }

      // If nothing found, default to BROKER (conservative)
      console.log("No profile found for user; defaulting to BROKER");
      setRole('BROKER');
    } catch (e) {
      console.error("Error fetching role:", e);
      setRole('BROKER');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session) {
        fetchUserRole(session.user.id, session.user.email ?? undefined);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth event:", event);
      setSession(session);
      setUser(session?.user ?? null);

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (session) {
          setLoading(true);
          fetchUserRole(session.user.id, session.user.email ?? undefined);
        }
      } else if (event === 'SIGNED_OUT') {
        setRole(null);
        setUser(null);
        setLoading(false);
      }
    });

    const handleAuthError = (e: any) => {
      console.warn("Auth error detected, signing out...", e.detail);
      supabase.auth.signOut().then(() => {
        window.location.href = '/login';
      });
    };

    window.addEventListener('supabase-auth-error', handleAuthError);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('supabase-auth-error', handleAuthError);
    };
  }, []);

  const signOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole(null);
    setLoading(false);
    navigate('/login', { replace: true });
  };

  return (
    <AuthContext.Provider value={{ session, user, role, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};