"use client";

import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, Check, AlertCircle } from "lucide-react";

export default function BootstrapAdmin() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success?: boolean; message?: string; error?: string; details?: any } | null>(null);

  const FUNCTION_NAME = "create-admin";
  const directUrl = `https://dcimeuefnhaiemrfiklj.supabase.co/functions/v1/${FUNCTION_NAME}`;

  const createAdmin = async () => {
    if (!confirm("Criar usuário admin@admin.com with password admin123? This is irreversible. Proceed?")) return;
    setLoading(true);
    setResult(null);

    const payload = {
      email: "admin@admin.com",
      password: "admin123",
      role: "SUPERINTENDENT"
    };

    try {
      // 1) Primary attempt: supabase.functions.invoke
      const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body: payload });

      if (error) {
        // If supabase client returned an error, capture and attempt fallback
        console.error("supabase.functions.invoke error:", error);
        setResult({ error: "Invoke error", details: { message: error.message, code: (error as any).code } });
        toast.error("Falha ao chamar create-admin via supabase.functions.invoke. Tentando fallback...");
      } else if ((data as any)?.error) {
        console.error("function returned error payload:", data);
        setResult({ error: "Function returned error", details: data });
        toast.error("A função retornou erro; tentando fallback...");
      } else {
        toast.success("Admin criado com sucesso via invoke.");
        setResult({ success: true, message: "Usuário admin@admin.com criado via invoke." });
        return;
      }

      // 2) Fallback: direct fetch to the edge function URL
      try {
        const resp = await fetch(directUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const text = await resp.text().catch(() => null);
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch (e) {
          json = text;
        }

        if (!resp.ok) {
          console.error("Direct fetch error", resp.status, json || text);
          setResult({
            error: `Fetch failed with status ${resp.status}`,
            details: { status: resp.status, body: json ?? text }
          });
          toast.error("Fallback falhou: veja detalhes abaixo.");
        } else if (json && (json as any).error) {
          setResult({ error: "Function returned error payload", details: json });
          toast.error("Fallback retornou payload de erro.");
        } else {
          toast.success("Admin criado com sucesso via fallback fetch.");
          setResult({ success: true, message: "Usuário admin@admin.com criado via fallback.", details: json ?? text });
        }
      } catch (fetchErr: any) {
        console.error("Fallback fetch exception:", fetchErr);
        setResult({ error: "Fallback fetch exception", details: fetchErr?.message || String(fetchErr) });
        toast.error("Fallback fetch falhou; verifique console e resposta mostrada.");
      }
    } catch (err: any) {
      console.error("Unexpected error in createAdmin:", err);
      setResult({ error: err?.message || String(err), details: err });
      toast.error("Erro inesperado ao criar admin. Veja detalhes abaixo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-md p-8">
        <h1 className="text-2xl font-black mb-2">Bootstrap Admin</h1>
        <p className="text-sm text-slate-500 mb-6">
          Invokes the server-side create-admin edge function to create admin@admin.com / admin123.
          If invocation fails, the page will show detailed diagnostics and attempt a direct HTTP fallback to the function URL.
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

          <div className="p-3 rounded-md bg-slate-50 border border-slate-100">
            <p className="text-xs text-slate-500 mb-2">Diagnostics</p>
            <div className="text-[12px] text-slate-700">
              <div><strong>Invoke name:</strong> {FUNCTION_NAME}</div>
              <div><strong>Direct URL:</strong> <span className="font-mono text-xs break-all">{directUrl}</span></div>
            </div>
          </div>

          {result && (
            <div className={`p-3 rounded-md ${result.success ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-rose-50 border border-rose-200 text-rose-700"}`}>
              {result.success ? (
                <div className="flex items-start gap-3">
                  <Check className="w-5 h-5 mt-1" />
                  <div>
                    <div className="font-bold">{result.message}</div>
                    {result.details && <pre className="mt-2 text-xs bg-white/60 rounded p-2 max-h-40 overflow-auto">{JSON.stringify(result.details, null, 2)}</pre>}
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 mt-1" />
                  <div>
                    <div className="font-bold">Erro: {result.error}</div>
                    {result.details && <pre className="mt-2 text-xs bg-white/60 rounded p-2 max-h-40 overflow-auto">{JSON.stringify(result.details, null, 2)}</pre>}
                    <p className="text-xs text-slate-500 mt-2">Possíveis causas: função não implantada, CORS, ou falta de configuração do serviço na sua conta Supabase.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 text-xs text-slate-400">
          Tip: after success, remove or secure this route to avoid leaving an open admin-creation endpoint.
        </div>
      </div>
    </div>
  );
}