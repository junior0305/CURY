import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider";
import { toast } from "sonner";
import { MessageSquare, Plus, Sparkles, Copy, Star, Trash2, Send, Loader2 } from "lucide-react";

interface BrokerTemplate {
  id: string;
  title: string;
  body: string;
  tags: string[];
  ai_generated: boolean;
  use_count: number;
  responded_count: number;
  is_favorite: boolean;
  last_used_at: string | null;
  created_at: string;
}

interface Suggestion {
  title: string;
  body: string;
  reasoning: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Se fornecido, mostra botão "Enviar para este lead" que dispara send_whatsapp_message */
  leadContext?: { id: string; name: string; phone: string; botInstanceId: string | null } | null;
  /** Modo da IA quando o usuário pede sugestão */
  aiMode?: "general" | "contextual" | "optimize";
}

export function MyMessagesSheet({ open, onOpenChange, leadContext, aiMode = "general" }: Props) {
  const { user } = useAuth();
  const brokerId = user?.id;

  const [templates, setTemplates] = useState<BrokerTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BrokerTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<{ title: string; body: string }>({ title: "", body: "" });
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [remainingAi, setRemainingAi] = useState<number | null>(null);

  // Carrega templates
  const loadTemplates = async () => {
    if (!brokerId) return;
    setLoading(true);
    const { data } = await supabase
      .from("broker_message_templates")
      .select("*")
      .eq("broker_id", brokerId)
      .eq("is_active", true)
      .order("is_favorite", { ascending: false })
      .order("use_count", { ascending: false });
    setTemplates((data ?? []) as BrokerTemplate[]);
    setLoading(false);
  };

  useEffect(() => { if (open) loadTemplates(); }, [open, brokerId]);

  // Cria/edita
  const save = async () => {
    if (!brokerId || !draft.title.trim() || !draft.body.trim()) return;
    if (editing) {
      const { error } = await supabase.from("broker_message_templates")
        .update({ title: draft.title, body: draft.body })
        .eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Mensagem atualizada");
    } else {
      const { error } = await supabase.from("broker_message_templates")
        .insert({ broker_id: brokerId, title: draft.title, body: draft.body });
      if (error) { toast.error(error.message); return; }
      toast.success("Mensagem criada");
    }
    setEditing(null); setCreating(false); setDraft({ title: "", body: "" });
    loadTemplates();
  };

  const toggleFavorite = async (t: BrokerTemplate) => {
    await supabase.from("broker_message_templates").update({ is_favorite: !t.is_favorite }).eq("id", t.id);
    loadTemplates();
  };

  const remove = async (t: BrokerTemplate) => {
    if (!confirm(`Apagar "${t.title}"?`)) return;
    await supabase.from("broker_message_templates").update({ is_active: false }).eq("id", t.id);
    toast.success("Mensagem apagada");
    loadTemplates();
  };

  const copyToClipboard = async (t: BrokerTemplate) => {
    const text = leadContext
      ? t.body.replace(/\{nome\}/gi, leadContext.name).replace(/\{broker\}/gi, user?.email?.split("@")[0] || "")
      : t.body;
    await navigator.clipboard.writeText(text);
    await supabase.rpc("mark_broker_template_used", { p_template_id: t.id });
    toast.success("Copiado para a área de transferência");
    loadTemplates();
  };

  const sendToLead = async (t: BrokerTemplate) => {
    if (!leadContext) return;
    if (!leadContext.botInstanceId) { toast.error("Você não tem chip vinculado"); return; }
    const text = t.body.replace(/\{nome\}/gi, leadContext.name).replace(/\{broker\}/gi, user?.email?.split("@")[0] || "");
    const { data } = await supabase.functions.invoke("send_whatsapp_message", {
      body: { botId: leadContext.botInstanceId, phone: leadContext.phone, message: text, send_source: "broker_manual" },
    });
    if (data?.success) {
      await supabase.rpc("mark_broker_template_used", { p_template_id: t.id });
      toast.success("Mensagem enviada");
      onOpenChange(false);
      loadTemplates();
    } else {
      toast.error("Falha ao enviar: " + (data?.error || data?.skipped || "erro desconhecido"));
    }
  };

  const requestAiSuggestions = async () => {
    if (!brokerId) return;
    setSuggesting(true); setSuggestions([]);
    const body: any = { broker_id: brokerId, mode: aiMode };
    if (aiMode === "contextual" && leadContext) body.lead_id = leadContext.id;
    const { data, error } = await supabase.functions.invoke("broker-message-suggest", { body });
    setSuggesting(false);
    if (error || data?.error) {
      toast.error(data?.message || data?.error || "Falha ao gerar sugestões");
      return;
    }
    setSuggestions(data?.suggestions || []);
    setRemainingAi(data?.remaining_today ?? null);
  };

  const saveSuggestion = async (s: Suggestion) => {
    if (!brokerId) return;
    const { error } = await supabase.from("broker_message_templates").insert({
      broker_id: brokerId, title: s.title, body: s.body, ai_generated: true,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Sugestão salva na sua biblioteca");
    setSuggestions(prev => prev.filter(x => x.body !== s.body));
    loadTemplates();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto bg-slate-950 border-slate-800">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-white">
            <MessageSquare className="w-5 h-5 text-cyan-400" /> Minhas mensagens
            <span className="text-xs text-slate-500 font-normal ml-auto">{templates.length}/20</span>
          </SheetTitle>
        </SheetHeader>

        <div className="flex gap-2 mt-4">
          <Button size="sm" onClick={() => { setCreating(true); setEditing(null); setDraft({ title: "", body: "" }); }}
            disabled={templates.length >= 20}>
            <Plus className="w-4 h-4 mr-1" /> Nova
          </Button>
          <Button size="sm" variant="outline" onClick={requestAiSuggestions} disabled={suggesting}>
            {suggesting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1 text-amber-300" />}
            Sugerir com IA {remainingAi !== null && <span className="ml-1 text-xs text-slate-500">({remainingAi} hoje)</span>}
          </Button>
        </div>

        {/* Form de criação/edição */}
        {(creating || editing) && (
          <div className="mt-4 p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
            <Input placeholder="Título da mensagem" value={draft.title}
              onChange={e => setDraft({ ...draft, title: e.target.value })} maxLength={60} />
            <Textarea placeholder="Texto (use {nome} pra interpolar o nome do lead)"
              value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })}
              className="min-h-[100px]" maxLength={500} />
            <div className="flex gap-2">
              <Button size="sm" onClick={save} className="bg-cyan-600 hover:bg-cyan-700">
                {editing ? "Salvar" : "Criar"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setEditing(null); }}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* Sugestões IA */}
        {suggestions.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs uppercase tracking-wider text-amber-300 font-bold flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Sugestões da IA — clique pra salvar
            </p>
            {suggestions.map((s, i) => (
              <div key={i} className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/30">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-sm font-bold text-amber-200">{s.title}</p>
                    <p className="text-xs text-slate-300 whitespace-pre-line mt-1">{s.body}</p>
                    <p className="text-[10px] text-slate-500 italic mt-1">técnica: {s.reasoning}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => saveSuggestion(s)}>
                    <Plus className="w-3 h-3 mr-1" /> Salvar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Lista de templates */}
        <div className="mt-4 space-y-2">
          {loading ? (
            <p className="text-sm text-slate-500">Carregando...</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-slate-500">Você ainda não tem mensagens. Crie uma ou peça sugestões à IA.</p>
          ) : templates.map(t => (
            <div key={t.id} className="p-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-cyan-500/40 transition-all">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-white truncate">{t.title}</p>
                    {t.is_favorite && <Star className="w-3 h-3 text-amber-400 fill-amber-400" />}
                    {t.ai_generated && <Badge variant="outline" className="text-[9px] bg-amber-500/10 border-amber-500/30 text-amber-300 px-1">IA</Badge>}
                  </div>
                  <p className="text-xs text-slate-400 whitespace-pre-line mt-1">{t.body}</p>
                  {t.use_count > 0 && (
                    <p className="text-[10px] text-slate-600 mt-1">usada {t.use_count}× · respostas {t.responded_count}</p>
                  )}
                </div>
              </div>
              <div className="flex gap-1 mt-2">
                {leadContext && (
                  <Button size="sm" variant="default" className="bg-emerald-600 hover:bg-emerald-700 h-7 text-xs"
                    onClick={() => sendToLead(t)}>
                    <Send className="w-3 h-3 mr-1" /> Enviar
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copyToClipboard(t)}>
                  <Copy className="w-3 h-3 mr-1" /> Copiar
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => toggleFavorite(t)}>
                  <Star className={`w-3 h-3 ${t.is_favorite ? "text-amber-400 fill-amber-400" : "text-slate-500"}`} />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setEditing(t); setDraft({ title: t.title, body: t.body }); setCreating(false); }}>
                  <span className="text-xs text-slate-400">Editar</span>
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 ml-auto" onClick={() => remove(t)}>
                  <Trash2 className="w-3 h-3 text-rose-400" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
