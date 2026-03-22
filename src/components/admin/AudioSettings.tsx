import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Volume2, VolumeX, Trophy, Zap, Crown, Bell, Music } from "lucide-react";
import { useAudioArena } from "@/hooks/use-audio-arena";
import { toast } from "sonner";

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

export default function AudioSettings() {
  const { playSound } = useAudioArena();
  const [muted, setMuted] = useState(localStorage.getItem("crm_audio_muted") === "true");

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStorage.setItem("crm_audio_muted", String(next));
    toast.info(next ? "Sons desativados." : "Sons ativados!");
  };

  const handleTest = (key: (typeof SOUNDS)[number]["key"]) => {
    if (muted) {
      toast.warning("Áudio está no mudo. Ative primeiro.");
      return;
    }
    playSound(key);
    toast.success("Tocando...");
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
            <p className="text-sm text-slate-500 font-medium">Sons sintetizados — sem necessidade de arquivos.</p>
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
        {SOUNDS.map(({ key, label, description, icon: Icon, color, bg, btnClass }) => (
          <Card key={key} className="p-5 border-none shadow-xl rounded-3xl bg-white ring-1 ring-slate-100">
            <div className="flex items-center gap-4 mb-4">
              <div className={`h-11 w-11 ${bg} ${color} rounded-2xl flex items-center justify-center`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">{label}</h3>
                <p className="text-xs text-slate-400">{description}</p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => handleTest(key)}
              className={`w-full text-xs font-bold ${btnClass}`}
            >
              <Volume2 className="h-3.5 w-3.5 mr-1.5" /> Testar Som
            </Button>
          </Card>
        ))}
      </div>

      <Card className="p-4 bg-slate-900 border-none rounded-2xl">
        <p className="text-xs text-slate-400 leading-relaxed">
          Os sons são gerados diretamente pelo navegador via <strong className="text-white">Web Audio API</strong> — sem arquivos MP3, sem falhas de carregamento. O botão mudo afeta apenas o dispositivo atual e é salvo localmente.
        </p>
      </Card>
    </div>
  );
}
