"use client";

import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, Check, AlertCircle } from "lucide-react";

export default function BootstrapAdmin() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success?: boolean; message?: string; error?: string } | null>(null);

  const createAdmin = async () => {
    if (!confirm("Criar usuário admin@admin.com with password admin123? This is irreversible. Proceed?")) return;
    setLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("create-admin", {
        body: {
          email: "admin@admin.com",
          password: "admin123",
          role: "SUPERINTENDENT"
        }
      });

      if (error) {
        console.error("invoke create-admin error:", error);
        toast.error("Falha ao chamar função: " + (error.message || String(error)));
        setResult({ error: error.message || String(error) });
      } else if ((data as any)?.error) {
        const errMsg = (data as any).error;
        toast.error("Erro da função: " + errMsg);
        setResult({ error: String(errMsg) });
      } else {
        toast.success("Admin criado com sucesso.");
        setResult({ success: true, message: "Usuário admin@admin.com criado. Tente login." });
      }
    } catch (err: any) {
      console.error("Exception create-admin:", err);
      toast.error("Erro inesperado: " + (err.message || String(err)));
      setResult({ error: err.message || String(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-md p-8">
        <h1 className="text-2xl font-black mb-2">Bootstrap Admin</h1>
        <p className="text-sm text-slate-500 mb-6">
          This page will invoke the server-side create-admin edge function to create an administrative user (admin@admin.com / admin123).
          Ensure your Supabase functions are deployed and the service role key is configured on your Supabase project.
        </p>

        <div className="space-y-4">
          <div className="flex gap-3">
            <Button onClick={createAdmin} className="bg-indigo-600" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              Create admin@admin.com
            </Button>
            <Button variant="ghost" onClick={() => {
              navigator.clipboard.writeText("admin@admin.com / admin123");
              toast.success("Credentials copied");
            }}>
              Copy creds
            </Button>
          </div>

          {result && (
            <div className={`p-3 rounded-md ${result.success ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-rose-50 border border-rose-200 text-rose-700"}`}>
              {result.success ? <div className="flex items-center gap-2"><Check className="w-4 h-4" /> <span>{result.message}</span></div> : <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4" /> <span>{result.error}</span></div>}
            </div>
          )}
        </div>

        <div className="mt-6 text-xs text-slate-400">
          Tip: remove or secure this route after use to avoid opening admin creation to anyone.
        </div>
      </div>
    </div>
  );
}