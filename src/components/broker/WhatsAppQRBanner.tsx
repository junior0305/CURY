import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Smartphone, RefreshCw, CheckCircle2, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function WhatsAppQRBanner() {
  const { user } = useAuth();
  const [botInstanceId, setBotInstanceId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean | null>(null); // null = ainda carregando
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [justConnected, setJustConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 1. Busca o bot_instance_id do perfil do corretor
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("profiles")
      .select("bot_instance_id")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.bot_instance_id) setBotInstanceId(data.bot_instance_id);
      });
  }, [user?.id]);

  // 2. Verifica status real da Evolution API (não apenas o DB)
  const checkConnection = useCallback(async (silent = true) => {
    if (!botInstanceId) return;
    try {
      const { data } = await supabase.functions.invoke("get-whatsapp-qr", {
        body: { botInstanceId },
      });
      const connected = !!data?.connected;
      setIsConnected(connected);

      // Atualiza DB para manter consistência
      if (connected) {
        await supabase
          .from("bot_instances")
          .update({ status: "open" })
          .eq("id", botInstanceId);
      }
    } catch {
      // Erro silencioso — não muda o estado atual
    }
  }, [botInstanceId]);

  // 3. Verifica ao montar e a cada 30s automaticamente
  useEffect(() => {
    if (!botInstanceId) return;

    checkConnection();

    intervalRef.current = setInterval(() => {
      checkConnection();
    }, 30000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [botInstanceId, checkConnection]);

  // 4. Polling rápido (5s) quando o modal está aberto e aguardando QR scan
  useEffect(() => {
    if (!open || !botInstanceId || justConnected) return;

    const poll = setInterval(async () => {
      const { data } = await supabase.functions.invoke("get-whatsapp-qr", {
        body: { botInstanceId },
      });
      if (data?.connected) {
        setIsConnected(true);
        setJustConnected(true);
        clearInterval(poll);
        await supabase
          .from("bot_instances")
          .update({ status: "open" })
          .eq("id", botInstanceId);
      }
    }, 5000);

    return () => clearInterval(poll);
  }, [open, botInstanceId, justConnected]);

  const fetchQR = useCallback(async () => {
    if (!botInstanceId) return;
    setLoading(true);
    setError(null);
    setQrBase64(null);
    setJustConnected(false);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("get-whatsapp-qr", {
        body: { botInstanceId },
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.connected) {
        setIsConnected(true);
        setJustConnected(true);
      } else if (data?.base64) {
        setQrBase64(data.base64);
      } else {
        setError("QR code não disponível. Tente novamente.");
      }
    } catch (e: any) {
      setError(e.message || "Erro ao buscar QR code");
    } finally {
      setLoading(false);
    }
  }, [botInstanceId]);

  const handleOpen = () => {
    setOpen(true);
    fetchQR();
  };

  const handleClose = () => {
    setOpen(false);
    setQrBase64(null);
    setJustConnected(false);
    setError(null);
    // Verifica status real imediatamente ao fechar (por se o usuário conectou e fechou rápido)
    checkConnection();
  };

  // Não exibe: sem bot configurado, ainda carregando, ou já conectado
  if (!botInstanceId || isConnected === null || isConnected === true) return null;

  return (
    <>
      {/* Banner de alerta */}
      <div className="mx-4 mt-3 rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <WifiOff className="w-4 h-4 text-red-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-300">WhatsApp desconectado</p>
            <p className="text-xs text-red-400/80">Seu bot não está enviando mensagens. Reconecte agora.</p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={handleOpen}
          className="shrink-0 bg-red-600 hover:bg-red-500 text-white text-xs gap-1.5"
        >
          <Smartphone className="w-3.5 h-3.5" />
          Reconectar
        </Button>
      </div>

      {/* Modal com QR */}
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-green-400" />
              Reconectar WhatsApp
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

            {!loading && justConnected && (
              <div className="flex flex-col items-center gap-3 py-6">
                <CheckCircle2 className="w-14 h-14 text-emerald-400" />
                <p className="text-base font-bold text-emerald-300">WhatsApp conectado!</p>
                <p className="text-xs text-slate-400 text-center">Seu bot está ativo e pronto para enviar mensagens.</p>
                <Button onClick={handleClose} className="mt-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm">
                  Fechar
                </Button>
              </div>
            )}

            {!loading && !justConnected && qrBase64 && (
              <>
                <div className="rounded-xl overflow-hidden border-4 border-white shadow-xl">
                  <img src={qrBase64} alt="QR Code WhatsApp" className="w-56 h-56 object-contain" />
                </div>
                <p className="text-xs text-slate-500 text-center">
                  QR válido por ~60 segundos.{" "}
                  <button onClick={fetchQR} className="text-amber-400 hover:text-amber-300 underline">
                    Gerar novo
                  </button>
                </p>
                <div className="flex items-center gap-1.5 text-xs text-blue-400">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Aguardando leitura do QR...
                </div>
              </>
            )}

            {!loading && !justConnected && error && (
              <div className="flex flex-col items-center gap-3 py-4">
                <p className="text-sm text-red-400 text-center">{error}</p>
                <Button size="sm" onClick={fetchQR} variant="outline" className="border-slate-600 text-slate-300 gap-1.5">
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
