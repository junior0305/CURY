import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Webhook, Copy, Check, Plus, Pencil, Trash2,
  ExternalLink, Info, RefreshCw, Eye, EyeOff,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Integration {
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
}

const SUPABASE_URL = "https://dcimeuefnhaiemrfiklj.supabase.co";

const PRESET_INTEGRATIONS = [
  { key: "make_webhook_url", label: "Make (Integromat)", description: "URL do webhook no Make para receber leads", placeholder: "https://hook.eu1.make.com/..." },
  { key: "n8n_webhook_url", label: "N8N", description: "URL do webhook N8N para receber leads", placeholder: "https://seu-n8n.com/webhook/..." },
  { key: "zapier_webhook_url", label: "Zapier", description: "URL do webhook Zapier para receber leads", placeholder: "https://hooks.zapier.com/hooks/..." },
  { key: "custom_webhook_secret", label: "Chave Secreta (Bearer Token)", description: "Token para autenticar chamadas ao webhook de entrada", placeholder: "seu-token-secreto" },
];

export default function Webhooks() {
  const { toast } = useToast();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editKey, setEditKey] = useState<Integration | null>(null);
  const [formKey, setFormKey] = useState("");
  const [formValue, setFormValue] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set(["custom_webhook_secret"]));

  const incomingWebhookUrl = `${SUPABASE_URL}/functions/v1/receive-lead`;

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase.from("system_integrations").select("*").order("key");
    setIntegrations(data || []);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
    toast({ title: "Copiado!" });
  };

  const handleSave = async () => {
    if (!formKey.trim() || !formValue.trim()) return toast({ title: "Preencha todos os campos", variant: "destructive" });
    setSaving(true);
    const { error } = await supabase.from("system_integrations").upsert({
      key: formKey.trim().toLowerCase().replace(/\s+/g, "_"),
      value: formValue.trim(),
      description: formDesc.trim() || null,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) return toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    toast({ title: "✅ Integração salva!" });
    setModalOpen(false);
    loadData();
  };

  const handleDelete = async (key: string) => {
    await supabase.from("system_integrations").delete().eq("key", key);
    toast({ title: "🗑️ Integração removida." });
    loadData();
  };

  const openEdit = (i: Integration) => {
    setEditKey(i); setFormKey(i.key); setFormValue(i.value); setFormDesc(i.description || ""); setModalOpen(true);
  };

  const openCreate = () => {
    setEditKey(null); setFormKey(""); setFormValue(""); setFormDesc(""); setModalOpen(true);
  };

  const toggleHidden = (key: string) => {
    setHidden(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };

  const getPreset = (key: string) => PRESET_INTEGRATIONS.find(p => p.key === key);

  // Merge presets with saved integrations
  const allKeys = [
    ...PRESET_INTEGRATIONS.map(p => p.key),
    ...integrations.filter(i => !PRESET_INTEGRATIONS.find(p => p.key === i.key)).map(i => i.key),
  ];

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <Webhook className="w-10 h-10 text-indigo-400 animate-pulse" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <Webhook className="w-7 h-7 text-indigo-400" />
            Webhooks & Integrações
          </h2>
          <p className="text-gray-500 text-sm mt-1">Configure as integrações com Make, N8N, Zapier e outros</p>
        </div>
        <Button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-500 font-bold gap-2">
          <Plus className="w-4 h-4" /> Nova Integração
        </Button>
      </div>

      {/* Webhook de entrada */}
      <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Info className="w-4 h-4 text-indigo-400" />
          <h3 className="text-indigo-300 font-bold text-sm uppercase tracking-wider">Webhook de Entrada (Receber Leads)</h3>
        </div>
        <p className="text-gray-400 text-sm">Use esta URL no Make/N8N/Zapier para enviar leads ao sistema. O payload deve conter os campos do lead.</p>
        <div className="flex items-center gap-2 bg-slate-900/60 rounded-lg px-4 py-3 border border-indigo-500/20">
          <code className="flex-1 text-indigo-200 text-sm font-mono break-all">{incomingWebhookUrl}</code>
          <Button size="sm" variant="ghost" onClick={() => copyToClipboard(incomingWebhookUrl, "incoming")}
            className="h-8 w-8 p-0 text-indigo-400 hover:text-white hover:bg-indigo-900/40 shrink-0">
            {copied === "incoming" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </Button>
        </div>
        <div className="bg-slate-900/40 rounded-lg p-3 font-mono text-xs text-gray-400 border border-gray-700/50">
          <p className="text-gray-500 mb-2">// Exemplo de payload JSON:</p>
          <pre>{`{
  "name": "João Silva",
  "phone": "11999999999",
  "email": "joao@email.com",
  "tag": "produto-a",       // usado para match de fila
  "source": "facebook",
  "campaign": "black-friday"
}`}</pre>
        </div>
      </div>

      {/* Integrações */}
      <div className="space-y-3">
        <h3 className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Configurações Salvas</h3>

        {allKeys.map(key => {
          const saved = integrations.find(i => i.key === key);
          const preset = getPreset(key);
          const isHidden = hidden.has(key);
          const isSensitive = key.includes("secret") || key.includes("token") || key.includes("password");

          return (
            <div key={key} className={`border rounded-xl p-4 transition-all ${saved ? "border-indigo-500/30 bg-slate-800/40" : "border-gray-700/30 bg-slate-900/20 opacity-60"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-white font-bold text-sm">{preset?.label || key}</span>
                    {saved ? (
                      <Badge className="bg-green-900/40 text-green-300 border-green-500/30 text-xs">Configurado</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Não configurado</Badge>
                    )}
                  </div>
                  {preset?.description && <p className="text-xs text-gray-500 mb-2">{preset.description}</p>}
                  {saved && (
                    <div className="flex items-center gap-2 bg-slate-900/60 rounded-lg px-3 py-2 border border-gray-700/30">
                      <code className="flex-1 text-sm font-mono text-gray-300 truncate">
                        {isSensitive && isHidden ? "•".repeat(Math.min(saved.value.length, 32)) : saved.value}
                      </code>
                      <div className="flex items-center gap-1 shrink-0">
                        {isSensitive && (
                          <Button size="sm" variant="ghost" onClick={() => toggleHidden(key)}
                            className="h-7 w-7 p-0 text-gray-500 hover:text-gray-300">
                            {isHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => copyToClipboard(saved.value, key)}
                          className="h-7 w-7 p-0 text-gray-500 hover:text-white">
                          {copied === key ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {saved ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(saved)}
                        className="h-8 w-8 p-0 text-gray-400 hover:text-white hover:bg-slate-700">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(key)}
                        className="h-8 w-8 p-0 text-gray-400 hover:text-red-400 hover:bg-red-900/20">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" onClick={() => {
                      setEditKey(null);
                      setFormKey(key);
                      setFormValue("");
                      setFormDesc(preset?.description || "");
                      setModalOpen(true);
                    }} className="bg-indigo-600/30 hover:bg-indigo-600/60 text-indigo-300 text-xs h-8 px-3">
                      Configurar
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Integrações customizadas */}
      {integrations.filter(i => !PRESET_INTEGRATIONS.find(p => p.key === i.key)).length > 0 && (
        <div className="space-y-3">
          <h3 className="text-gray-400 text-xs uppercase tracking-wider font-semibold">Personalizadas</h3>
          {integrations.filter(i => !PRESET_INTEGRATIONS.find(p => p.key === i.key)).map(i => (
            <div key={i.key} className="border border-gray-700/40 bg-slate-800/30 rounded-xl p-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-white font-mono text-sm">{i.key}</p>
                {i.description && <p className="text-gray-500 text-xs mt-0.5">{i.description}</p>}
                <code className="text-xs text-gray-400 truncate block mt-1">{i.value}</code>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => openEdit(i)} className="h-8 w-8 p-0 text-gray-400 hover:text-white"><Pencil className="w-4 h-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => handleDelete(i.key)} className="h-8 w-8 p-0 text-gray-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-slate-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-black flex items-center gap-2">
              <Webhook className="w-5 h-5 text-indigo-400" />
              {editKey ? "Editar Integração" : "Nova Integração"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-gray-400 text-xs uppercase tracking-wider">Chave (key)</Label>
              <Input value={formKey} onChange={e => setFormKey(e.target.value)} placeholder="ex: minha_integracao"
                className="bg-slate-800 border-gray-600 text-white font-mono" disabled={!!editKey} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-400 text-xs uppercase tracking-wider">Valor</Label>
              <Input value={formValue} onChange={e => setFormValue(e.target.value)} placeholder="URL ou token"
                className="bg-slate-800 border-gray-600 text-white" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-400 text-xs uppercase tracking-wider">Descrição (opcional)</Label>
              <Input value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Para que serve essa integração"
                className="bg-slate-800 border-gray-600 text-white" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setModalOpen(false)} className="flex-1 border-gray-600 text-gray-300 hover:bg-slate-800">Cancelar</Button>
              <Button onClick={handleSave} disabled={saving} className="flex-1 bg-indigo-600 hover:bg-indigo-500 font-bold">
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
