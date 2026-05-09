// WhatsAppQuickButton — ícone clicável SEMPRE visível no header do broker.
// Cor varia por status do bot. Click abre o mesmo modal de QR/info do
// WhatsAppQRBanner pra broker forçar reconexão mesmo quando status diz "open".

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MessageCircle, Smartphone, RefreshCw, CheckCircle2, WifiOff, Wifi, AlertCircle } from "lucide-react";

const QR_REFRESH_INTERVAL_S = 28;

type ChipStatus = "open" | "connecting" | "offline" | "no_chip" | "loading";

const STATUS_STYLE: Record<ChipStatus, { color: string; bg: string; ring: string; label: string; pulse: boolean }> = {
  open:       { color: "#10B981", bg: "rgba(16,185,129,0.12)",  ring: "rgba(16,185,129,0.40)",  label: "WhatsApp conectado",  pulse: false },
  connecting: { color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  ring: "rgba(245,158,11,0.40)",  label: "Conectando…",          pulse: true  },
  offline:    { color: "#EF4444", bg: "rgba(239,68,68,0.15)",   ring: "rgba(239,68,68,0.50)",   label: "WhatsApp desconectado", pulse: true  },
  no_chip:    { color: "#9CA3AF", bg: "rgba(156,163,175,0.12)", ring: "rgba(156,163,175,0.40)", label: "Sem chip vinculado",    pulse: false },
  loading:    { color: "#64748B", bg: "rgba(100,116,139,0.10)", ring: "rgba(100,116,139,0.30)", label: "Verificando…",          pulse: false },
};

export function WhatsAppQuickButton() {
  const { user } = useAuth();
  const [botInstanceId, setBotInstanceId] = useState<string | null>(null);
  const [instanceName, setInstanceName] = useState<string | null>(null);
  const [status, setStatus] = useState<ChipStatus>("loading");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [justConnected, setJustConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(QR_REFRESH_INTERVAL_S);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLoadingRef = useRef(false);

  // 1. Busca bot_instance_id + status
  useEffect(() => {
    if (!user?.id) return;
    supabase.from("profiles").select("bot_instance_id").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (!data?.bot_instance_id) { setStatus("no_chip"); return; }
      setBotInstanceId(data.bot_instance_id);
      supabase.from("bot_instances").select("status, instance_name").eq("id", data.bot_instance_id).maybeSingle().then(({ data: bot }) => {
        if (!bot) { setStatus("offline"); return; }
        setInstanceName(bot.instance_name);
        setStatus(bot.status === "open" ? "open" : bot.status === "connecting" ? "connecting" : "offline");
      });
    });
  }, [user?.id]);

  // 2. Realtime: escuta mudanças no bot_instances
  useEffect(() => {
    if (!botInstanceId) return;
    const channel = supabase.channel(`wa_quick_${botInstanceId}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "bot_instances", filter: `id=eq.${botInstanceId}` },
        (payload) => {
          const newStatus = payload.new?.status;
          if (newStatus === "open") {
            setStatus("open");
            setJustConnected(true);
            setOpen(false);
          } else if (newStatus === "connecting") setStatus("connecting");
          else setStatus("offline");
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [botInstanceId]);

  // 3. Polling 15s enquanto modal aberto e status != open
  useEffect(() => {
    if (!open || !botInstanceId || status === "open") return;
    pollRef.current = setInterval(async () => {
      const { data } = await supabase.from("bot_instances").select("status").eq("id", botInstanceId).maybeSingle();
      if (data?.status === "open") {
        setStatus("open"); setJustConnected(true);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 15000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open, botInstanceId, status]);

  // 4. Countdown auto-refresh QR
  useEffect(() => {
    if (!open || !qrBase64 || loading || justConnected || connecting) {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (loading) setCountdown(QR_REFRESH_INTERVAL_S);
      return;
    }
    setCountdown(QR_REFRESH_INTERVAL_S);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { fetchQR(); return QR_REFRESH_INTERVAL_S; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, qrBase64, loading, justConnected, connecting]);

  const fetchQR = useCallback(async (forceQR = false) => {
    if (!botInstanceId) return;
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    setLoading(true); setError(null); setQrBase64(null); setConnecting(false); setJustConnected(false);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("get-whatsapp-qr", {
        body: { botInstanceId, forceQR },
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.connected) { setStatus("open"); setJustConnected(true); }
      else if (data?.base64) setQrBase64(data.base64);
      else if (data?.connecting) {
        setConnecting(true);
        retryTimerRef.current = setTimeout(() => fetchQR(true), 4000);
      }
      else if (data?.error) setError(data.error_detail || `Erro: ${data.error}`);
      else setError("QR code não disponível. A instância pode estar inicializando.");
    } catch (e: any) {
      setError(e.message || "Erro ao buscar QR.");
    } finally {
      setLoading(false); isLoadingRef.current = false;
    }
  }, [botInstanceId]);

  useEffect(() => () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  function handleOpen() {
    setOpen(true);
    if (status !== "no_chip" && botInstanceId) fetchQR();
  }
  function handleClose() {
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setOpen(false); setQrBase64(null); setConnecting(false); setJustConnected(false); setError(null);
    setCountdown(QR_REFRESH_INTERVAL_S);
  }

  const s = STATUS_STYLE[status];
  const countdownColor = countdown <= 8 ? "text-red-400" : countdown <= 15 ? "text-amber-400" : "text-slate-500";

  return (
    <>
      <button
        onClick={handleOpen}
        title={s.label}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center transition hover:brightness-110"
        style={{ background: s.bg, border: `1px solid ${s.ring}` }}
      >
        <MessageCircle className="w-4 h-4" style={{ color: s.color }} />
        <span
          className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${s.pulse ? "animate-pulse" : ""}`}
          style={{ background: s.color, boxShadow: `0 0 6px ${s.color}` }}
        />
      </button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Smartphone className="w-4 h-4" style={{ color: s.color }} />
              {status === "no_chip" ? "Sem chip vinculado" : `WhatsApp${instanceName ? ` — ${instanceName}` : ""}`}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-sm">
              {status === "no_chip"
                ? "Você ainda não tem um chip atribuído. Peça pro seu gerente vincular um."
                : status === "open"
                  ? "Seu chip está conectado. Se algo está errado, gere um novo QR pra reconectar."
                  : "Abra o WhatsApp no celular → Menu → Aparelhos conectados → Conectar aparelho"}
            </DialogDescription>
          </DialogHeader>

          {status === "no_chip" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <AlertCircle className="w-12 h-12 text-amber-400" />
              <p className="text-sm text-amber-300 text-center font-bold">Avise seu gerente</p>
              <p className="text-xs text-slate-400 text-center">
                Sem chip configurado, você não recebe leads via WhatsApp e nem pode prospectar.
              </p>
            </div>
          )}

          {status !== "no_chip" && (
            <div className="flex flex-col items-center gap-4 py-2">
              {loading && (
                <div className="flex flex-col items-center gap-2 py-8 text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin" />
                  <p className="text-sm">Gerando QR code...</p>
                </div>
              )}

              {!loading && connecting && (
                <div className="flex flex-col items-center gap-3 py-6">
                  <Wifi className="w-10 h-10 text-emerald-400 animate-pulse" />
                  <p className="text-sm font-semibold text-emerald-300">QR escaneado! Conectando...</p>
                </div>
              )}

              {!loading && justConnected && (
                <div className="flex flex-col items-center gap-3 py-6">
                  <CheckCircle2 className="w-14 h-14 text-emerald-400" />
                  <p className="text-base font-bold text-emerald-300">WhatsApp conectado!</p>
                  <Button onClick={handleClose} className="mt-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm">Fechar</Button>
                </div>
              )}

              {!loading && !justConnected && !connecting && qrBase64 && (
                <>
                  <div className="relative rounded-xl overflow-hidden border-4 border-white shadow-xl">
                    {countdown <= 5 && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60">
                        <RefreshCw className="w-6 h-6 text-white animate-spin" />
                      </div>
                    )}
                    <img src={qrBase64} alt="QR Code WhatsApp" className="w-56 h-56 object-contain" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${countdown <= 8 ? "bg-red-400" : countdown <= 15 ? "bg-amber-400" : "bg-slate-500"}`} />
                    <p className={`text-xs ${countdownColor}`}>Novo QR em {countdown}s</p>
                    <span className="text-slate-600 text-xs">·</span>
                    <button onClick={() => fetchQR()} className="text-xs text-amber-400 hover:text-amber-300 underline">Gerar agora</button>
                  </div>
                </>
              )}

              {!loading && !justConnected && !connecting && error && (
                <div className="flex flex-col items-center gap-3 py-4">
                  <p className="text-sm text-red-400 text-center">{error}</p>
                  <Button size="sm" onClick={() => fetchQR()} variant="outline" className="border-slate-600 text-slate-300 gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
                  </Button>
                </div>
              )}

              {/* Status open: oferece forçar QR mesmo conectado */}
              {!loading && !justConnected && !connecting && !qrBase64 && !error && status === "open" && (
                <div className="flex flex-col items-center gap-3 py-6">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                  <p className="text-sm text-emerald-300 text-center font-bold">Conectado</p>
                  <Button size="sm" onClick={() => fetchQR(true)} variant="outline" className="border-amber-500/40 text-amber-300 gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5" /> Forçar reconexão (gerar novo QR)
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
