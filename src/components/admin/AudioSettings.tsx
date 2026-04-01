import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Volume2, VolumeX, Trophy, Zap, Crown, Bell, Music, Upload, Trash2, Loader2 } from "lucide-react";
import { useAudioArena, CUSTOM_SOUND_KEY } from "@/hooks/use-audio-arena";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type SoundKey = "SALE" | "OVERTAKE" | "NEW_LEAD" | "NOTIFICATION";

const SOUNDS = [
  {
    key: "SALE" as const,
    label: "Som de Venda",
    description: "Toca no mural quando uma venda é aprovada.",
    icon: Trophy,
    color: "text-emerald-600",
    bg: "bg-emerald-100",
    btnClass: "bg-emerald-600 hover:bg-emerald-500 text-white",
  },
  {
    key: "OVERTAKE" as const,
    label: "Som de Ultrapassagem",
    description: "Toca quando a liderança do ranking muda.",
    icon: Crown,
    color: "text-indigo-600",
    bg: "bg-indigo-100",
    btnClass: "bg-indigo-600 hover:bg-indigo-500 text-white",
  },
  {
    key: "NEW_LEAD" as const,
    label: "Som de Novo Lead",
    description: "Toca quando um lead entra na fila do corretor.",
    icon: Zap,
    color: "text-sky-600",
    bg: "bg-sky-100",
    btnClass: "bg-sky-600 hover:bg-sky-500 text-white",
  },
  {
    key: "NOTIFICATION" as const,
    label: "Som de Notificação",
    description: "Toca em alertas gerais do sistema.",
    icon: Bell,
    color: "text-amber-600",
    bg: "bg-amber-100",
    btnClass: "bg-amber-600 hover:bg-amber-500 text-white",
  },
];

const STORAGE_BUCKET = "audio-settings";
const SETTING_PREFIX = "custom_sound_";

export default function AudioSettings() {
  const { playSound } = useAudioArena();
  const [muted, setMuted] = useState(localStorage.getItem("crm_audio_muted") === "true");
  const [customUrls, setCustomUrls] = useState<Partial<Record<SoundKey, string>>>({});
  const [uploading, setUploading] = useState<Partial<Record<SoundKey, boolean>>>({});
  const fileInputRefs = useRef<Partial<Record<SoundKey, HTMLInputElement | null>>>({});

  // Carrega URLs customizadas do banco e sincroniza com localStorage
  useEffect(() => {
    const keys = SOUNDS.map((s) => `${SETTING_PREFIX}${s.key}`);
    supabase
      .from("system_settings")
      .select("key, value")
      .in("key", keys)
      .then(({ data }) => {
        if (!data) return;
        const map: Partial<Record<SoundKey, string>> = {};
        data.forEach((row: any) => {
          const soundKey = row.key.replace(SETTING_PREFIX, "") as SoundKey;
          if (row.value) {
            map[soundKey] = row.value;
            localStorage.setItem(CUSTOM_SOUND_KEY(soundKey), row.value);
          }
        });
        setCustomUrls(map);
      });
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStorage.setItem("crm_audio_muted", String(next));
    toast.info(next ? "Sons desativados." : "Sons ativados!");
  };

  const handleTest = (key: SoundKey) => {
    if (muted) {
      toast.warning("Áudio está no mudo. Ative primeiro.");
      return;
    }
    playSound(key);
    toast.success("Tocando...");
  };

  const handleUpload = async (key: SoundKey, file: File) => {
    if (!file.type.startsWith("audio/")) {
      toast.error("Selecione um arquivo de áudio (MP3, WAV, OGG).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 5MB.");
      return;
    }

    setUploading((prev) => ({ ...prev, [key]: true }));
    try {
      const ext = file.name.split(".").pop() || "mp3";
      const path = `sounds/${key.toLowerCase()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      // Adiciona cache-buster para forçar novo download após substituição do arquivo
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      // Salva URL no system_settings
      await supabase.from("system_settings").upsert(
        { key: `${SETTING_PREFIX}${key}`, value: publicUrl },
        { onConflict: "key" }
      );

      // Atualiza localStorage e estado
      localStorage.setItem(CUSTOM_SOUND_KEY(key), publicUrl);
      setCustomUrls((prev) => ({ ...prev, [key]: publicUrl }));
      toast.success("Som personalizado salvo!");
    } catch (e: any) {
      toast.error("Erro ao fazer upload: " + e.message);
    } finally {
      setUploading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleRemove = async (key: SoundKey) => {
    try {
      await supabase
        .from("system_settings")
        .delete()
        .eq("key", `${SETTING_PREFIX}${key}`);

      localStorage.removeItem(CUSTOM_SOUND_KEY(key));
      setCustomUrls((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      toast.success("Som personalizado removido. Voltando ao som padrão.");
    } catch (e: any) {
      toast.error("Erro ao remover: " + e.message);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl">
            <Music className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Arena Sonora</h2>
            <p className="text-sm text-slate-500 font-medium">Sons padrão sintetizados — faça upload de MP3 para personalizar.</p>
          </div>
        </div>
        <Button
          onClick={toggleMute}
          variant="outline"
          className={muted ? "border-red-300 text-red-600 hover:bg-red-50" : "border-emerald-300 text-emerald-600 hover:bg-emerald-50"}
        >
          {muted ? <VolumeX className="h-4 w-4 mr-2" /> : <Volume2 className="h-4 w-4 mr-2" />}
          {muted ? "Som desativado" : "Som ativado"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SOUNDS.map(({ key, label, description, icon: Icon, color, bg, btnClass }) => {
          const hasCustom = !!customUrls[key];
          const isUploading = !!uploading[key];

          return (
            <Card key={key} className="p-5 border-none shadow-xl rounded-3xl bg-white ring-1 ring-slate-100">
              <div className="flex items-center gap-4 mb-4">
                <div className={`h-11 w-11 ${bg} ${color} rounded-2xl flex items-center justify-center`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-900 text-sm">{label}</h3>
                  <p className="text-xs text-slate-400">{description}</p>
                  {hasCustom && (
                    <span className="inline-flex items-center gap-1 mt-1 text-xs text-emerald-600 font-medium">
                      <Music className="h-3 w-3" /> MP3 personalizado
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleTest(key)}
                  className={`flex-1 text-xs font-bold ${btnClass}`}
                >
                  <Volume2 className="h-3.5 w-3.5 mr-1.5" /> Testar
                </Button>

                {/* Upload MP3 */}
                <input
                  ref={(el) => { fileInputRefs.current[key] = el; }}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(key, file);
                    e.target.value = "";
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isUploading}
                  onClick={() => fileInputRefs.current[key]?.click()}
                  className="text-xs border-slate-200"
                  title="Upload MP3 personalizado"
                >
                  {isUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                </Button>

                {hasCustom && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRemove(key)}
                    className="text-xs border-red-200 text-red-500 hover:bg-red-50"
                    title="Remover MP3 personalizado"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="p-4 bg-slate-900 border-none rounded-2xl">
        <p className="text-xs text-slate-400 leading-relaxed">
          Sons padrão gerados via <strong className="text-white">Web Audio API</strong>. Para personalizar, clique em <strong className="text-white">Upload</strong> (ícone <span className="text-white">↑</span>) e selecione um arquivo MP3, WAV ou OGG (máx. 5MB). O som personalizado é salvo na nuvem e carregado automaticamente em todos os dispositivos.
        </p>
      </Card>
    </div>
  );
}
