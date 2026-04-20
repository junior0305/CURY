import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Smartphone, RefreshCw, CheckCircle2, WifiOff, Wifi } from "lucide-react";

// QR expira em ~30s — auto-refresh a cada 28s
const QR_REFRESH_INTERVAL_S = 28;

export function WhatsAppQRBanner() {
  const { user } = useAuth();
  const [botInstanceId, setBotInstanceId] = useState<string | null>(null);
  const [instanceName, setInstanceName] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
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
  const isLoadingRef = useRef(false); // guard contra chamadas sobrepostas

  // 1. Busca bot_instance_id + instance_name do perfil do corretor
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("profiles")
      .select("bot_instance_id")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data?.bot_instance_id) {
          setIsConnected(null);
          return;
        }
        setBotInstanceId(data.bot_instance_id);

        supabase
          .from("bot_instances")
          .select("status, instance_name")
          .eq("id", data.bot_instance_id)
          .maybeSingle()
          .then(({ data: bot }) => {
            if (bot) {
              setInstanceName(bot.instance_name);
              setIsConnected(bot.status === "open");
            } else {
              setIsConnected(false);
            }
          });
      });
  }, [user?.id]);

  // 2. Realtime: escuta mudanças no bot_instances
  useEffect(() => {
    if (!botInstanceId) return;

    const channel = supabase
      .channel(`bot_status_${botInstanceId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bot_instances", filter: `id=eq.${botInstanceId}` },
        (payload) => {
          const newStatus = payload.new?.status;
          const connected = newStatus === "open";
          setIsConnected(connected);
          if (connected) {
            setJustConnected(true);
            setOpen(false);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [botInstanceId]);

  // 3. Polling de status (5s) enquanto modal aberto
  useEffect(() => {
    if (!open || !botInstanceId || justConnected) return;

    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from("bot_instances")
        .select("status")
        .eq("id", botInstanceId)
        .maybeSingle();

      if (data?.status === "open") {
        setIsConnected(true);
        setJustConnected(true);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 5000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open, botInstanceId, justConnected]);

  // 4. Countdown de auto-refresh do QR
  useEffect(() => {
    if (!open || !qrBase64 || loading || justConnected || connecting) {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (loading) setCountdown(QR_REFRESH_INTERVAL_S);
      return;
    }

    setCountdown(QR_REFRESH_INTERVAL_S);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          fetchQR(); // auto-refresh quando expira
          return QR_REFRESH_INTERVAL_S;
        }
        return prev - 1;
      });
    }, 1000);

    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, qrBase64, loading, justConnected, connecting]);

  // 5. Busca QR via Edge Function (com guard anti-overlap)
  const fetchQR = useCallback(async (forceQR = false) => {
    if (!botInstanceId) return;
    if (isLoadingRef.current) return; // evita chamadas sobrepostas
    isLoadingRef.current = true;

    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    setLoading(true);
    setError(null);
    setQrBase64(null);
    setConnecting(false);
    setJustConnected(false);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("get-whatsapp-qr", {
        body: { botInstanceId, forceQR },
      });
      if (fnError) throw new Error(fnError.message);

      if (data?.connected) {
        setIsConnected(true);
        setJustConnected(true);
      } else if (data?.base64) {
        setQrBase64(data.base64);
      } else if (data?.connecting) {
        setConnecting(true);
        retryTimerRef.current = setTimeout(() => fetchQR(true), 4000);
      } else if (data?.error) {
        setError(data.error_detail || `Erro: ${data.error}`);
      } else {
        setError("QR code não disponível. A instância pode estar inicializando — tente em alguns segundos.");
      }
    } catch (e: any) {
      setError(e.message || "Erro ao buscar QR code. Verifique se a instância está ativa no Evolution.");
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }, [botInstanceId]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const handleOpen = () => {
    setOpen(true);
    fetchQR();
  };

  const handleClose = () => {
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setOpen(false);
    setQrBase64(null);
    setConnecting(false);
    setJustConnected(false);
    setError(null);
    setCountdown(QR_REFRESH_INTERVAL_S);
  };

  // Determina cor do countdown
  const countdownColor = countdown <= 8 ? "text-red-400" : countdown <= 15 ? "text-amber-400" : "text-slate-500";

  // Não exibe: sem chip configurado, ainda carregando, ou já conectado
  if (!botInstanceId || isConnected === null || isConnected === true) return null;

  return (
    <>
      {/* Banner de alerta */}
      <div className="mx-4 mt-3 rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <WifiOff className="w-4 h-4 text-red-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-300">WhatsApp desconectado</p>
            <p className="text-xs text-red-400/80">
              {instanceName ? `Instância "${instanceName}" offline.` : "Seu chip não está conectado."}{" "}
              Escaneie o QR para reconectar.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={handleOpen}
          className="shrink-0 bg-red-600 hover:bg-red-500 text-white text-xs gap-1.5"
        >
          <Smartphone className="w-3.5 h-3.5" />
          Conectar
        </Button>
      </div>

      {/* Modal com QR */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-green-400" />
              Conectar WhatsApp{instanceName ? ` — ${instanceName}` : ""}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-sm">
              Abra o WhatsApp no celular → Menu → Aparelhos conectados → Conectar aparelho
            </DialogDescription>
          </DialogHeader>

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
                <p className="text-xs text-slate-400 text-center">
                  Aguarde a confirmação da conexão. Isso pode levar alguns segundos.
                </p>
                <p className="text-[10px] text-slate-600">Verificando automaticamente...</p>
              </div>
            )}

            {!loading && justConnected && (
              <div className="flex flex-col items-center gap-3 py-6">
                <CheckCircle2 className="w-14 h-14 text-emerald-400" />
                <p className="text-base font-bold text-emerald-300">WhatsApp conectado!</p>
                <p className="text-xs text-slate-400 text-center">
                  Seu chip está ativo e pronto para enviar mensagens.
                </p>
                <Button onClick={handleClose} className="mt-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm">
                  Fechar
                </Button>
              </div>
            )}

            {!loading && !justConnected && !connecting && qrBase64 && (
              <>
                <div className="relative rounded-xl overflow-hidden border-4 border-white shadow-xl">
                  {/* Overlay quando prestes a expirar */}
                  {countdown <= 5 && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60">
                      <RefreshCw className="w-6 h-6 text-white animate-spin" />
                    </div>
                  )}
                  <img src={qrBase64} alt="QR Code WhatsApp" className="w-56 h-56 object-contain" />
                </div>

                {/* Countdown */}
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${countdown <= 8 ? "bg-red-400" : countdown <= 15 ? "bg-amber-400" : "bg-slate-500"}`} />
                  <p className={`text-xs ${countdownColor}`}>
                    Novo QR em {countdown}s
                  </p>
                  <span className="text-slate-600 text-xs">·</span>
                  <button onClick={() => fetchQR()} className="text-xs text-amber-400 hover:text-amber-300 underline">
                    Gerar agora
                  </button>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-blue-400">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Aguardando leitura do QR...
                </div>
              </>
            )}

            {!loading && !justConnected && !connecting && error && (
              <div className="flex flex-col items-center gap-3 py-4">
                <p className="text-sm text-red-400 text-center">{error}</p>
                <Button size="sm" onClick={() => fetchQR()} variant="outline" className="border-slate-600 text-slate-300 gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" />
                  Tentar novamente
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
