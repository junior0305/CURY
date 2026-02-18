"use client";

import React from "react";
import { useAuth } from "@/components/AuthProvider";

const AuthDebug: React.FC = () => {
  const { session, user, role, loading } = useAuth();

  return (
    <div aria-hidden className="fixed z-50 right-4 bottom-4 pointer-events-auto">
      <div className="text-xs font-mono bg-white/95 backdrop-blur-md border border-slate-200 rounded-lg shadow-lg p-3 w-80 max-w-[90vw]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold text-slate-700">AUTH DEBUG</span>
          <span className="text-[10px] text-slate-400">{loading ? "loading..." : "ready"}</span>
        </div>

        <div className="space-y-1">
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
            <pre className="text-[10px] text-slate-700 bg-slate-50 rounded-md p-2 mt-1 max-h-28 overflow-auto">
{JSON.stringify((window as any).__authDebug ?? {}, null, 0)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthDebug;