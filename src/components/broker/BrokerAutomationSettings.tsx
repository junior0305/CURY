import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Settings2, Bot, Repeat } from "lucide-react";
import { toast } from "sonner";

type AutomationSettings = {
  welcome_enabled?: boolean;
  follow_up_enabled?: boolean;
  ai_assist_enabled?: boolean;
};

export function BrokerAutomationSettings({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<AutomationSettings>({
    follow_up_enabled: true,
    ai_assist_enabled: false,
  });

  useEffect(() => {
    if (!open || !userId) return;
    supabase
      .from("profiles")
      .select("automation_settings")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        const s = (data?.automation_settings || {}) as AutomationSettings;
        setSettings({
          welcome_enabled: s.welcome_enabled ?? true,
          follow_up_enabled: s.follow_up_enabled ?? true,
          ai_assist_enabled: s.ai_assist_enabled === true,
        });
      });
  }, [open, userId]);

  async function update(key: "follow_up_enabled" | "ai_assist_enabled", value: boolean) {
    setLoading(true);
    const next = { ...settings, [key]: value };
    setSettings(next);
    const { error } = await supabase
      .from("profiles")
      .update({
        automation_settings: {
          welcome_enabled: settings.welcome_enabled ?? true,
          follow_up_enabled: next.follow_up_enabled ?? true,
          ai_assist_enabled: next.ai_assist_enabled === true,
        },
      })
      .eq("id", userId);
    setLoading(false);
    if (error) {
      toast.error("Erro ao salvar configuração");
      setSettings(settings);
    } else {
      toast.success(value ? "Automação ligada" : "Automação desligada");
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          title="Minhas automações"
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)" }}
        >
          <Settings2 className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md bg-slate-950 border-slate-800 text-slate-100">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-slate-100 flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-cyan-400" />
            Minhas Automações
          </SheetTitle>
        </SheetHeader>

        <p className="text-xs text-slate-400 mb-5 leading-relaxed">
          Controle quais automações o sistema executa para os seus leads. A saudação inicial
          (primeiro "olá") é sempre enviada e não pode ser desligada aqui — fale com seu gerente
          se precisar mudar isso.
        </p>

        <div className="space-y-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-violet-500/10 border border-violet-500/30 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-100">IA conversa sozinha</div>
                  <div className="text-xs text-slate-400 mt-0.5 leading-snug">
                    A IA responde os leads automaticamente quando você não responde a tempo.
                    Desligue se preferir conduzir todas as conversas manualmente.
                  </div>
                </div>
              </div>
              <Switch
                checked={settings.ai_assist_enabled !== false}
                disabled={loading}
                onCheckedChange={(v) => update("ai_assist_enabled", v)}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shrink-0">
                  <Repeat className="w-4 h-4 text-cyan-400" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-100">Follow-up automático</div>
                  <div className="text-xs text-slate-400 mt-0.5 leading-snug">
                    O sistema dispara mensagens de retorno em leads parados. Desligue se você
                    prefere fazer todos os follow-ups você mesmo.
                  </div>
                </div>
              </div>
              <Switch
                checked={settings.follow_up_enabled !== false}
                disabled={loading}
                onCheckedChange={(v) => update("follow_up_enabled", v)}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-800/60 bg-slate-900/20 p-4 opacity-70">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <span className="text-emerald-400 text-sm">👋</span>
              </div>
              <div>
                <div className="text-sm font-bold text-slate-300">Saudação inicial</div>
                <div className="text-xs text-slate-500 mt-0.5 leading-snug">
                  Sempre enviada. Garante que todo lead novo recebe um "olá" rápido. Apenas seu
                  gerente pode desligar.
                </div>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
