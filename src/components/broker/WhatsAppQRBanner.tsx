import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Smartphone, RefreshCw, CheckCircle2, WifiOff, Wifi } from "lucide-react";

// QR do WhatsApp expira em ~60s. O servidor pode levar até ~30s pra gerar,
// então atualizamos a cada 45s e NUNCA apagamos o QR atual durante o refresh
// (o QR antigo continua na tela até o novo chegar — evita o "congelado/branco").
const QR_REFRESH_INTERVAL_S = 45;

export function WhatsAppQRBanner() {
  const { user } = useAuth();
  const [botInstanceId, setBotInstanceId] = useState<string | null>(null);
  const [instanceName, setInstanceName] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [firstLoad, setFirstLoad] = useState(true);     // só mostra spinner grande na 1ª vez
  const [refreshing, setRefreshing] = useState(false);  // refresh em background (QR antigo continua)
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [justConnected, setJustConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(QR_REFRESH_INTERVAL_S);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLoadingRef = useRef(false);

  // 1. Busca bot_instance_id + instance_name do perfil
  useEffect(() => {
    if (!user?.id) return;
    supabase.from("profiles").select("bot_instance_id").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        if (!data?.bot_instance_id) { setIsConnected(null); return; }
        setBotInstanceId(data.bot_instance_id);
        supabase.from("bot_instances").select("status, instance_name").eq("id", data.bot_instance_id).maybeSingle()
          .then(({ data: bot }) => {
            if (bot) { setInstanceName(bot.instance_name); setIsConnected(bot.status === "open"); }
            else setIsConnected(false);
          });
      });
  }, [user?.id]);

  // 2. Realtime: escuta status do chip
  useEffect(() => {
    if (!botInstanceId) return;
    const channel = supabase
      .channel(`bot_status_${botInstanceId}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "bot_instances", filter: `id=eq.${botInstanceId}` },
        (payload) => {
          const connected = payload.new?.status === "open";
          setIsConnected(connected);
          if (connected) { setJustConnected(true); }
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [botInstanceId]);

  // 3. Polling de status (10s) enquanto o modal está aberto
  useEffect(() => {
    if (!open || !botInstanceId || justConnected) return;
    pollRef.current = setInterval(async () => {
      const { data } = await supabase.from("bot_instances").select("status").eq("id", botInstanceId).maybeSingle();
      if (data?.status === "open") {
        setIsConnected(true); setJustConnected(true);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [open, botInstanceId, justConnected]);

  // 5. Busca QR (mantém o QR atual visível durante o refresh)
  const fetchQR = useCallback(async (isManual = false) => {
    if (!botInstanceId || isLoadingRef.current) return;
    isLoadingRef.current = true;
    setError(null);
    setJustConnected(false);
    // NÃO apaga qrBase64 aqui — o QR antigo fica na tela até o novo chegar
    if (isManual || !qrBase64) setFirstLoad(qrBase64 ? false : true);
    setRefreshing(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("get-whatsapp-qr", {
        body: { botInstanceId, forceQR: isManual },
      });
      if (fnError) throw new Error(fnError.message);

      if (data?.connected) {
        setIsConnected(true); setJustConnected(true); setQrBase64(null);
      } else if (data?.base64) {
        setQrBase64(data.base64);
        setCountdown(QR_REFRESH_INTERVAL_S);
      } else if (data?.error_detail || data?.error) {
        if (!qrBase64) setError(data.error_detail || `Erro: ${data.error}`);
      } else if (!qrBase64) {
        setError("Não consegui gerar o QR agora. O servidor pode estar lento — toque em Tentar de novo.");
      }
    } catch (e: any) {
      if (!qrBase64) setError(e.message || "Erro ao buscar QR. Tente de novo em alguns segundos.");
    } finally {
      setFirstLoad(false);
      setRefreshing(false);
      isLoadingRef.current = false;
    }
  }, [botInstanceId, qrBase64]);

  // 4. Countdown de auto-refresh (sem apagar o QR durante a troca)
  useEffect(() => {
    if (!open || !qrBase64 || justConnected) {
      if (countdownRef.current) clearInterval(countdownRef.current);
      return;
    }
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { fetchQR(false); return QR_REFRESH_INTERVAL_S; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, qrBase64, justConnected]);

  useEffect(() => () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const handleOpen = () => {
    setOpen(true); setQrBase64(null); setError(null); setFirstLoad(true); setJustConnected(false);
    fetchQR(false);
  };

  const handleClose = () => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setOpen(false); setQrBase64(null); setError(null); setJustConnected(false);
    setCountdown(QR_REFRESH_INTERVAL_S);
  };

  if (isConnected === true) return null;

  if (!botInstanceId) {
    return (
      <div className="mx-4 mt-3 rounded-xl border border-amber-500/40 bg-amber-950/40 px-4 py-3 flex items-center gap-2.5">
        <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-amber-300">Sem chip do WhatsApp configurado</p>
          <p className="text-xs text-amber-400/80">
            Você ainda não tem um chip vinculado. Peça pro seu gerente atribuir um chip pra você no Admin.
          </p>
        </div>
      </div>
    );
  }

  if (isConnected === null) return null;

  return (
    <>
      <button
        onClick={handleOpen}
        className="w-[calc(100%-2rem)] mx-4 mt-3 rounded-xl border-2 border-red-500/60 bg-red-950/50 px-4 py-3 flex items-center justify-between gap-3 hover:bg-red-900/60 transition group cursor-pointer"
        style={{ boxShadow: "0 0 18px rgba(239,68,68,0.25)" }}
      >
        <div className="flex items-center gap-3 text-left">
          <div className="w-10 h-10 rounded-xl bg-red-500/30 border border-red-400/50 flex items-center justify-center shrink-0">
            <WifiOff className="w-5 h-5 text-red-300" />
          </div>
          <div>
            <p className="text-sm font-black text-red-200 uppercase tracking-wider">WhatsApp desconectado</p>
            <p className="text-xs text-red-300/90 mt-0.5">
              {instanceName ? `Chip "${instanceName}" offline · ` : ""}
              <span className="font-bold underline">Clique aqui pra reconectar</span>
            </p>
          </div>
        </div>
        <Button size="lg" asChild className="shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-wider gap-2 pointer-events-none">
          <span><Smartphone className="w-4 h-4" />Reconectar</span>
        </Button>
      </button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-green-400" />
              Conectar WhatsApp{instanceName ? ` — ${instanceName}` : ""}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-sm">
              No celular: WhatsApp → <b>Aparelhos conectados</b> → <b>Conectar aparelho</b> → aponte para o QR abaixo.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-2">
            {/* Conectado */}
            {justConnected && (
              <div className="flex flex-col items-center gap-3 py-6">
                <CheckCircle2 className="w-14 h-14 text-emerald-400" />
                <p className="text-base font-bold text-emerald-300">WhatsApp conectado!</p>
                <p className="text-xs text-slate-400 text-center">Seu chip está ativo e pronto pra enviar.</p>
                <Button onClick={handleClose} className="mt-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm">Fechar</Button>
              </div>
            )}

            {/* Primeira carga (servidor pode levar até 30s) */}
            {!justConnected && firstLoad && !qrBase64 && (
              <div className="flex flex-col items-center gap-3 py-8 text-slate-400">
                <RefreshCw className="w-7 h-7 animate-spin text-emerald-400" />
                <p className="text-sm font-semibold text-slate-300">Preparando seu QR Code…</p>
                <p className="text-xs text-slate-500 text-center max-w-[15rem]">
                  O servidor pode levar até <b>30 segundos</b>. Pode deixar essa tela aberta.
                </p>
              </div>
            )}

            {/* QR disponível (continua visível mesmo durante refresh) */}
            {!justConnected && qrBase64 && (
              <>
                <div className="relative rounded-xl overflow-hidden border-4 border-white shadow-xl">
                  {refreshing && (
                    <div className="absolute top-1 right-1 z-10 bg-black/60 rounded-full p-1">
                      <RefreshCw className="w-3.5 h-3.5 text-white animate-spin" />
                    </div>
                  )}
                  <img src={qrBase64} alt="QR Code WhatsApp" className="w-60 h-60 object-contain" />
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <p className="text-xs text-slate-400">Aguardando você ler o QR…</p>
                  <span className="text-slate-600 text-xs">·</span>
                  <button onClick={() => fetchQR(true)} className="text-xs text-amber-400 hover:text-amber-300 underline">
                    Gerar novo
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 text-center max-w-[16rem]">
                  Não fecha sozinho: assim que você ler, a tela confirma a conexão automaticamente.
                </p>
              </>
            )}

            {/* Erro (só quando não há QR pra mostrar) */}
            {!justConnected && !qrBase64 && !firstLoad && error && (
              <div className="flex flex-col items-center gap-3 py-4">
                <WifiOff className="w-8 h-8 text-red-400" />
                <p className="text-sm text-red-400 text-center max-w-[16rem]">{error}</p>
                <Button size="sm" onClick={() => fetchQR(true)} variant="outline" className="border-slate-600 text-slate-300 gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" />Tentar de novo
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
