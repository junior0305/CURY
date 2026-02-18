"use client";

import React, { useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const AuthDebug: React.FC = () => {
  const { session, user, role, loading } = useAuth();
  const [promoting, setPromoting] = useState(false);

  const promote = async (targetRole: "SUPERINTENDENT" | "ADMIN") => {
    if (!session?.user?.id) {
      toast.error("Nenhuma sessão encontrada.");
      return;
    }

    if (!confirm(`Confirmar promoção do usuário ${user?.email} para ${targetRole}?`)) return;

    try {
      setPromoting(true);
      const { data, error } = await supabase.functions.invoke("set-admin-role", {
        body: {
          userId: session.user.id,
          role: targetRole
        }
      });

      if (error) {
        console.error("[AuthDebug] set-admin-role error:", error);
        toast.error("Falha ao promover: " + (error.message || String(error)));
        return;
      }

      if ((data as any)?.error) {
        toast.error("Erro: " + (data as any).error);
        return;
      }

      toast.success(`Usuário promovido para ${targetRole}. Recarregando...`);
      // Forçar recarga para que AuthProvider re-fetch role
      setTimeout(() => window.location.reload(), 900);
    } catch (err: any) {
      console.error("[AuthDebug] Exception:", err);
      toast.error("Erro inesperado: " + (err.message || String(err)));
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div aria-hidden className="fixed z-50 right-4 bottom-4 pointer-events-auto">
      <div className="text-xs font-mono bg-white/95 backdrop-blur-md border border-slate-200 rounded-lg shadow-lg p-3 w-80 max-w-[90vw]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold text-slate-700">AUTH DEBUG</span>
          <span className="text-[10px] text-slate-400">{loading ? "loading..." : "ready"}</span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500">session.user.id</span>
            <span className="text-[11px] text-slate-900 truncate">{session?.user?.id ?? "—"}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500">profile.role</span>
            <span className="text-[11px] font-bold text-indigo-600">{role ?? "—"}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500">user.email</span>
            <span className="text-[11px] text-slate-900 truncate">{user?.email ?? "—"}</span>
          </div>

          <div className="pt-2">
            <div className="text-[10px] text-slate-400">window.__authDebug</div>
            <pre className="text-[10px] text-slate-700 bg-slate-50 rounded-md p-2 mt-1 max-h-24 overflow-auto">
{JSON.stringify((window as any).__authDebug ?? {}, null, 0)}
            </pre>
          </div>

          <div className="pt-3 flex gap-2">
            <button
              onClick={() => promote("SUPERINTENDENT")}
              disabled={promoting || !session?.user?.id}
              className="flex-1 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[12px] disabled:opacity-60"
            >
              {promoting ? "Aguarde..." : "Promover → SUPERINTENDENT"}
            </button>
            <button
              onClick={() => promote("ADMIN")}
              disabled={promoting || !session?.user?.id}
              className="flex-1 h-9 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-[12px] disabled:opacity-60"
            >
              {promoting ? "Aguarde..." : "Promover → ADMIN"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthDebug;