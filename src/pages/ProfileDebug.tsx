"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ProfileDebug() {
  const { session, user, loading } = useAuth();
  const [profile, setProfile] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const FUNCTION_NAME = "set-admin-role";
  const directUrl = `https://dcimeuefnhaiemrfiklj.supabase.co/functions/v1/${FUNCTION_NAME}`;

  const fetchProfile = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (error) {
        console.error("fetchProfile error:", error);
        toast.error("Erro ao buscar profile: " + error.message);
        return;
      }
      setProfile(data || null);
    } catch (err: any) {
      console.error("fetchProfile exception:", err);
      toast.error("Erro inesperado: " + (err.message || String(err)));
    }
  };

  useEffect(() => {
    if (!loading) fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const runSetAdminRole = async () => {
    if (!user?.id) {
      toast.error("Nenhuma sessão encontrada.");
      return;
    }

    setBusy(true);
    setProfile(null);

    const payload = { userId: user.id, role: "SUPERINTENDENT" };

    try {
      // 1) invoke via supabase client
      const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body: payload });
      if (error) {
        console.warn("invoke error:", error);
      } else {
        console.log("invoke data:", data);
      }

      // 2) fallback direct fetch to surface CORS/network errors
      let fetchResult: any = null;
      try {
        const resp = await fetch(directUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const text = await resp.text().catch(() => null);
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) { json = text; }
        fetchResult = { status: resp.status, ok: resp.ok, body: json ?? text };
      } catch (fetchErr: any) {
        fetchResult = { exception: fetchErr.message || String(fetchErr) };
      }

      // Wait a bit for DB replication
      await new Promise((r) => setTimeout(r, 800));

      await fetchProfile();

      toast.success("Invocation attempted; see results below.");
      console.log("invoke_response:", { data, error, fetchResult });
      setProfile((p: any) => ({ ...p, __lastInvoke: { data, error: error ? (error as any).message : null, fetchResult } }));
    } catch (err: any) {
      console.error("runSetAdminRole exception:", err);
      toast.error("Erro: " + (err.message || String(err)));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 bg-slate-50">
      <div className="max-w-3xl mx-auto bg-white p-6 rounded-2xl shadow">
        <h2 className="text-lg font-bold mb-2">Profile Debug</h2>
        <p className="text-sm text-slate-500 mb-4">Shows the profiles row for the currently authenticated user and allows re-invoking set-admin-role.</p>

        <div className="mb-4">
          <div className="text-xs text-slate-400">Session User ID</div>
          <div className="font-mono font-bold">{session?.user?.id ?? "—"}</div>
        </div>

        <div className="mb-4">
          <div className="text-xs text-slate-400">Session Email</div>
          <div className="font-mono">{session?.user?.email ?? "—"}</div>
        </div>

        <div className="mb-4">
          <Button onClick={fetchProfile} className="mr-2">Refresh profile</Button>
          <Button onClick={runSetAdminRole} disabled={busy} className="bg-indigo-600 hover:bg-indigo-700">
            {busy ? "Running..." : "Run set-admin-role (invoke+fetch fallback)"}
          </Button>
        </div>

        <div className="mt-4">
          <h3 className="text-sm font-bold mb-2">Profile row</h3>
          <pre className="bg-slate-100 p-3 rounded text-xs max-h-72 overflow-auto">
            {profile ? JSON.stringify(profile, null, 2) : "No profile row found for this user."}
          </pre>
        </div>

        <div className="mt-4 text-xs text-slate-400">
          Direct function URL: <span className="font-mono break-all">{directUrl}</span>
        </div>
      </div>
    </div>
  );
}