"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, RefreshCw, Wifi, WifiOff, CheckCircle2, Smartphone, AlertTriangle, Clock } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/integrations/supabase/client";

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Rajdhani:wght@500;600;700&display=swap');
  .gk-display { font-family:'Orbitron',monospace; letter-spacing:0.05em; }
  .gk-ui { font-family:'Rajdhani',sans-serif; }
  @keyframes gkPulse {
    0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(0,212,255,.4);}
    50%{opacity:.8;box-shadow:0 0 0 12px rgba(0,212,255,0);}
  }
  @keyframes gkSpin {
    to { transform: rotate(360deg); }
  }
  @keyframes gkFadeIn {
    from{opacity:0;transform:translateY(12px);}
    to{opacity:1;transform:translateY(0);}
  }
  @keyframes gkConnected {
    0%{transform:scale(.8);opacity:0;}
    60%{transform:scale(1.15);}
    100%{transform:scale(1);opacity:1;}
  }
  @keyframes gkDot {
    0%,80%,100%{transform:scale(0);opacity:0;}
    40%{transform:scale(1);opacity:1;}
  }
  .gk-pulse { animation: gkPulse 2s ease-in-out infinite; }
  .gk-fadein { animation: gkFadeIn .4s ease both; }
  .gk-connected-icon { animation: gkConnected .5s ease both; }
  .gk-dot1 { animation: gkDot 1.4s ease-in-out infinite; }
  .gk-dot2 { animation: gkDot 1.4s ease-in-out .2s infinite; }
  .gk-dot3 { animation: gkDot 1.4s ease-in-out .4s infinite; }
  .gk-hex {
    background-color:#080B14;
    background-image:
      radial-gradient(ellipse 80% 50% at 50% -20%,rgba(0,212,255,.06) 0%,transparent 60%),
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='48'%3E%3Cpolygon points='28,2 54,16 54,44 28,58 2,44 2,16' fill='none' stroke='%2300D4FF' stroke-width='0.3' opacity='0.08'/%3E%3C/svg%3E");
    background-size:auto,56px 48px;
  }
`;

// Quantas tentativas sem QR antes de mostrar erro
const MAX_FAIL_COUNT = 4;

type GkStatus = "loading" | "no_instance" | "connected" | "disconnected" | "connecting" | "qr_error" | "success";

const SESSION_KEY = (userId: string) => `wha_ok_${userId}`;

// Tempo máximo em "connecting" antes de voltar para QR (ms)
const CONNECTING_TIMEOUT_MS = 45000;

function useBotStatus(userId: string | undefined, role: string | null) {
  const [botInstanceId, setBotInstanceId] = useState<string | null | "none">(null);
  const [status, setStatus] = useState<GkStatus>("loading");
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failCountRef = useRef(0);

  const shouldCheck = role === "BROKER" || role === "MANAGER";

  // Busca bot_instance_id uma vez
  useEffect(() => {
    if (!userId || !shouldCheck) {
      setStatus("connected");
      return;
    }
    if (sessionStorage.getItem(SESSION_KEY(userId)) === "1") {
      setStatus("connected");
      return;
    }
    supabase
      .from("profiles")
      .select("bot_instance_id")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        const id = data?.bot_instance_id ?? null;
        if (!id) {
          setBotInstanceId("none");
          setStatus("no_instance");
        } else {
          setBotInstanceId(id);
        }
      });
  }, [userId, shouldCheck]);

  const checkConnection = useCallback(async (showRefreshing = false) => {
    if (!botInstanceId || botInstanceId === "none") return;
    if (showRefreshing) {
      setRefreshing(true);
      failCountRef.current = 0; // reset ao forçar atualização manual
      setErrorDetail(null);
      setQrBase64(null);
    }
    try {
      const { data, error } = await supabase.functions.invoke("get-whatsapp-qr", {
        body: { botInstanceId },
      });

      if (error || !data) {
        failCountRef.current++;
        if (failCountRef.current >= MAX_FAIL_COUNT) {
          setStatus("qr_error");
          setErrorDetail("Não foi possível contatar o serviço WhatsApp. Verifique a conexão com a Evolution API.");
        }
        return;
      }

      // Conectado
      if (data.connected) {
        failCountRef.current = 0;
        if (userId) sessionStorage.setItem(SESSION_KEY(userId), "1");
        setStatus("success");
        if (intervalRef.current) clearInterval(intervalRef.current);
        setTimeout(() => setStatus("connected"), 2000);
        return;
      }

      // Estado transitório pós-scan — aguardar sem gerar novo QR
      if (data.connecting) {
        failCountRef.current = 0; // conectando não é falha
        setStatus("connecting");
        return;
      }

      // Erro específico da Evolution API
      if (data.error) {
        failCountRef.current++;
        if (failCountRef.current >= MAX_FAIL_COUNT) {
          setStatus("qr_error");
          setErrorDetail(data.error_detail || `Erro ao gerar QR: ${data.error}`);
        } else {
          setStatus("disconnected");
        }
        return;
      }

      // QR recebido com sucesso
      if (data.base64) {
        failCountRef.current = 0;
        setQrBase64(data.base64);
        setStatus("disconnected");
        if (userId) sessionStorage.removeItem(SESSION_KEY(userId));
        return;
      }

      // Resposta sem base64 e sem erro explícito — contar como falha
      failCountRef.current++;
      setStatus("disconnected"); // manter na tela de QR com spinner
      if (failCountRef.current >= MAX_FAIL_COUNT) {
        setStatus("qr_error");
        setErrorDetail("A instância WhatsApp não está gerando o QR Code. Verifique se o chip está configurado corretamente na Evolution API.");
      }

    } finally {
      if (showRefreshing) setRefreshing(false);
    }
  }, [botInstanceId, userId]);

  // Primeira verificação quando botInstanceId ficar disponível
  useEffect(() => {
    if (!botInstanceId || botInstanceId === "none") return;
    checkConnection();
  }, [botInstanceId, checkConnection]);

  // Polling a cada 3s enquanto desconectado ou em connecting
  useEffect(() => {
    const shouldPoll = status === "disconnected" || status === "connecting";
    if (!shouldPoll) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (connectingTimeoutRef.current) clearTimeout(connectingTimeoutRef.current);
      return;
    }

    // Se entrou em "connecting", inicia timeout de 45s para voltar ao QR
    if (status === "connecting") {
      if (!connectingTimeoutRef.current) {
        connectingTimeoutRef.current = setTimeout(() => {
          connectingTimeoutRef.current = null;
          setStatus("disconnected");
          setQrBase64(null);
        }, CONNECTING_TIMEOUT_MS);
      }
    } else {
      // Saiu de connecting — limpa timeout
      if (connectingTimeoutRef.current) {
        clearTimeout(connectingTimeoutRef.current);
        connectingTimeoutRef.current = null;
      }
    }

    intervalRef.current = setInterval(() => checkConnection(), 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status, checkConnection]);

  const resetAndRetry = useCallback(() => {
    failCountRef.current = 0;
    if (connectingTimeoutRef.current) {
      clearTimeout(connectingTimeoutRef.current);
      connectingTimeoutRef.current = null;
    }
    setErrorDetail(null);
    setQrBase64(null);
    setStatus("disconnected");
  }, []);

  return { status, qrBase64, errorDetail, refreshing, checkConnection, resetAndRetry };
}

// ── Loading ───────────────────────────────────────────────────────────────────
function GkLoading() {
  return (
    <div className="gk-hex gk-ui min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
    </div>
  );
}

// ── Success ───────────────────────────────────────────────────────────────────
function GkSuccess() {
  return (
    <div className="gk-hex gk-ui min-h-screen flex flex-col items-center justify-center gap-4">
      <CheckCircle2
        className="w-16 h-16 text-emerald-400 gk-connected-icon"
        style={{ filter: "drop-shadow(0 0 16px rgba(16,185,129,.7))" }}
      />
      <p className="gk-display text-base font-black text-white uppercase tracking-widest">
        WhatsApp Conectado!
      </p>
      <p className="text-slate-500 text-sm">Entrando no sistema...</p>
    </div>
  );
}

// ── Sem instância ─────────────────────────────────────────────────────────────
function GkNoInstance() {
  return (
    <div className="gk-hex gk-ui min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
      <WifiOff className="w-12 h-12 text-amber-400" />
      <p className="gk-display text-sm font-black text-white uppercase tracking-widest">
        Sem instância configurada
      </p>
      <p className="text-slate-400 text-sm max-w-xs">
        Sua conta não tem uma instância WhatsApp vinculada. Fale com o administrador.
      </p>
    </div>
  );
}

// ── Conectando (pós-scan) ─────────────────────────────────────────────────────
function GkConnecting() {
  const [secondsLeft, setSecondsLeft] = useState(Math.round(CONNECTING_TIMEOUT_MS / 1000));

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  return (
    <>
      <style>{STYLES}</style>
      <div className="gk-hex gk-ui min-h-screen flex flex-col items-center justify-center gap-6 p-6">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center gk-pulse"
          style={{ background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.3)" }}>
          <Wifi className="w-7 h-7 text-emerald-400" />
        </div>
        <div className="text-center">
          <p className="gk-display text-base font-black text-white uppercase tracking-widest mb-2">
            Conectando...
          </p>
          <p className="text-slate-400 text-sm">QR Code escaneado. Aguarde a confirmação.</p>
        </div>
        {/* Dots animados */}
        <div className="flex gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 gk-dot1" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 gk-dot2" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 gk-dot3" />
        </div>
        <p className="text-[10px] text-slate-600 uppercase tracking-widest">
          Estabelecendo sessão WhatsApp
        </p>
        {secondsLeft > 0 && (
          <p className="text-[10px] text-slate-700">
            Novo QR em {secondsLeft}s caso não conecte
          </p>
        )}
      </div>
    </>
  );
}

// ── Erro de QR ────────────────────────────────────────────────────────────────
function GkQRError({
  errorDetail,
  onRetry,
  refreshing,
}: {
  errorDetail: string | null;
  onRetry: () => void;
  refreshing: boolean;
}) {
  return (
    <>
      <style>{STYLES}</style>
      <div className="gk-hex gk-ui min-h-screen flex flex-col items-center justify-center gap-6 p-6 text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)" }}>
          <AlertTriangle className="w-7 h-7 text-red-400" />
        </div>
        <div>
          <p className="gk-display text-sm font-black text-white uppercase tracking-widest mb-2">
            Não foi possível gerar o QR
          </p>
          <p className="text-slate-400 text-sm max-w-xs mx-auto">
            {errorDetail || "Houve um problema ao conectar com o serviço WhatsApp."}
          </p>
        </div>
        <button
          onClick={onRetry}
          disabled={refreshing}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
          style={{
            background: "rgba(239,68,68,.1)",
            border: "1px solid rgba(239,68,68,.3)",
            color: refreshing ? "#475569" : "#F87171",
            cursor: refreshing ? "not-allowed" : "pointer",
          }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Tentar novamente
        </button>
        <p className="text-[10px] text-slate-600 max-w-xs">
          Se o problema persistir, contate o administrador para verificar a instância WhatsApp.
        </p>
      </div>
    </>
  );
}

// ── QR Code ───────────────────────────────────────────────────────────────────
function GkQRCode({
  qrBase64,
  refreshing,
  onRefresh,
}: {
  qrBase64: string | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <>
      <style>{STYLES}</style>
      <div className="gk-hex gk-ui min-h-screen flex flex-col items-center justify-center p-4">

        {/* Header */}
        <div className="flex flex-col items-center mb-8 gk-fadein">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 gk-pulse"
            style={{
              background: "rgba(0,212,255,.1)",
              border: "1px solid rgba(0,212,255,.3)",
            }}>
            <Smartphone className="w-7 h-7 text-cyan-400" />
          </div>
          <h1 className="gk-display text-base font-black text-white uppercase tracking-widest">
            Conectar WhatsApp
          </h1>
          <p className="text-[11px] text-slate-500 uppercase tracking-widest mt-1">
            Obrigatório para acessar o sistema
          </p>
        </div>

        {/* Card */}
        <div
          className="w-full max-w-sm rounded-2xl p-6 gk-fadein"
          style={{
            background: "rgba(8,14,28,0.96)",
            border: "1px solid rgba(0,212,255,.2)",
            boxShadow: "0 0 60px rgba(0,212,255,.05)",
            animationDelay: "0.1s",
          }}
        >
          {/* Status */}
          <div className="flex items-center gap-2 mb-5">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.25)" }}>
              <WifiOff className="w-3.5 h-3.5 text-red-400" />
              <span className="text-[11px] font-bold text-red-400 uppercase tracking-wider">
                Instância Desconectada
              </span>
            </div>
          </div>

          {/* QR Code area */}
          <div className="flex flex-col items-center gap-4">
            {qrBase64 ? (
              <div className="relative">
                <div className="absolute inset-0 rounded-xl"
                  style={{ boxShadow: "0 0 30px rgba(0,212,255,.15)", border: "1px solid rgba(0,212,255,.2)", borderRadius: "12px" }}
                />
                <img
                  src={qrBase64}
                  alt="QR Code WhatsApp"
                  className="w-52 h-52 rounded-xl relative z-10"
                  style={{ imageRendering: "pixelated" }}
                />
              </div>
            ) : (
              <div className="w-52 h-52 rounded-xl flex flex-col items-center justify-center gap-3"
                style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(0,212,255,.1)" }}>
                <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                <p className="text-[10px] text-slate-500">Gerando QR Code...</p>
              </div>
            )}

            {/* Instructions */}
            <div className="w-full space-y-2 mt-1">
              {[
                "Abra o WhatsApp no celular",
                'Toque em "Dispositivos Conectados"',
                "Aponte a câmera para o QR Code",
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-black"
                    style={{
                      background: "rgba(0,212,255,.15)",
                      border: "1px solid rgba(0,212,255,.3)",
                      color: "#00D4FF",
                    }}
                  >
                    {i + 1}
                  </div>
                  <span className="text-[12px] text-slate-400">{step}</span>
                </div>
              ))}
            </div>

            <div className="h-px w-full" style={{ background: "rgba(0,212,255,.1)" }} />

            {/* Refresh button */}
            <button
              onClick={() => onRefresh()}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
              style={{
                background: "rgba(0,212,255,.08)",
                border: "1px solid rgba(0,212,255,.2)",
                color: refreshing ? "#334155" : "#00D4FF",
                cursor: refreshing ? "not-allowed" : "pointer",
              }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Atualizando..." : "Novo QR Code"}
            </button>

            <p className="text-[10px] text-slate-600 text-center">
              O QR Code expira em ~30 segundos. O sistema detecta a conexão automaticamente.
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-[10px] text-slate-700 mt-6 uppercase tracking-widest">
          Comandra War Room — Conexão obrigatória
        </p>
      </div>
    </>
  );
}

// ── Main Gatekeeper ───────────────────────────────────────────────────────────
export function WhatsAppGatekeeper({ children }: { children: React.ReactNode }) {
  const { user, role, loading: authLoading } = useAuth();
  const { status, qrBase64, errorDetail, refreshing, checkConnection, resetAndRetry } = useBotStatus(
    user?.id,
    role
  );

  if (authLoading || status === "loading") return <GkLoading />;
  if (status === "success") return <GkSuccess />;
  if (status === "no_instance") return <GkNoInstance />;
  if (status === "connecting") return <GkConnecting />;
  if (status === "qr_error") return (
    <GkQRError
      errorDetail={errorDetail}
      onRetry={resetAndRetry}
      refreshing={refreshing}
    />
  );
  if (status === "disconnected") {
    return (
      <GkQRCode
        qrBase64={qrBase64}
        refreshing={refreshing}
        onRefresh={() => checkConnection(true)}
      />
    );
  }

  return <>{children}</>;
}
