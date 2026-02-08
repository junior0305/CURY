import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Lead } from "@/types/lead";
import type { TaskType } from "@/types/task";
import { Sparkles, Wand2, Clock, Save, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTask } from "@/integrations/supabase/tasks";
import { toast } from "sonner";

const taskTypeMeta: Array<{ value: TaskType; label: string; hint: string }> = [
  { value: "FOLLOW_UP", label: "Retornar", hint: "Follow-up" },
  { value: "CALL", label: "Ligação", hint: "Telefone" },
  { value: "WHATSAPP_TEXT", label: "WhatsApp (texto)", hint: "Mensagem" },
  { value: "WHATSAPP_AUDIO", label: "WhatsApp (áudio)", hint: "Voz" },
  { value: "WHATSAPP_VIDEO", label: "WhatsApp (vídeo)", hint: "Vídeo" },
  { value: "SCHEDULE_VISIT", label: "Agendar visita", hint: "Decisão" },
  { value: "DOCS_REQUEST", label: "Pedir documentos", hint: "Reta final" },
];

function nowPlusMinutes(mins: number) {
  const d = new Date(Date.now() + mins * 60_000);
  // datetime-local expects local time string without seconds
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function aiSuggest({
  lead,
  type,
}: {
  lead?: Lead;
  type: TaskType;
}): { title: string; notes: string } {
  const name = lead?.name?.split(" ")[0] || "cliente";
  const tag = lead?.tag ? ` (${lead.tag})` : "";

  switch (type) {
    case "WHATSAPP_TEXT":
      return {
        title: `WhatsApp para ${name}${tag}`,
        notes:
          `Sugestão (texto):\n` +
          `"${name}, prometi te atualizar — posso te mandar agora 2 opções bem objetivas que combinam com você?"\n\n` +
          `Objetivo: provocar resposta com pergunta fechada.`,
      };
    case "WHATSAPP_AUDIO":
      return {
        title: `Áudio curto para ${name}${tag}`,
        notes:
          `Sugestão (áudio 20-30s):\n` +
          `1) Contexto rápido\n2) Uma opção\n3) Pergunta: "prefere ver hoje ou amanhã?"`,
      };
    case "WHATSAPP_VIDEO":
      return {
        title: `Vídeo (30s) para ${name}${tag}`,
        notes:
          `Sugestão (vídeo 30s):\n` +
          `Mostre 1 imóvel + 1 benefício + CTA: "posso agendar uma visita rápida?"`,
      };
    case "CALL":
      return {
        title: `Ligar para ${name}${tag}`,
        notes:
          `Roteiro: (1) confirmar interesse, (2) qual região/valor, (3) puxar decisão: visita ou documentos.`,
      };
    case "SCHEDULE_VISIT":
      return {
        title: `Agendar visita com ${name}${tag}`,
        notes:
          `Proposta: duas opções de horário. Ex: "Hoje 19:00 ou amanhã 17:30?"`,
      };
    case "DOCS_REQUEST":
      return {
        title: `Pedir documentos (${name})${tag}`,
        notes:
          `Objetivo: acelerar. Peça RG/CPF, comprovante de renda e residência. Explique que é para análise rápida.`,
      };
    default:
      return {
        title: `Retornar para ${name}${tag}`,
        notes: `Objetivo: manter cadência e puxar uma decisão (visita ou documentos).`,
      };
  }
}

export default function TaskForm({
  open,
  onOpenChange,
  userId,
  leads,
  defaultLeadId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  leads: Lead[];
  defaultLeadId?: string | null;
}) {
  const queryClient = useQueryClient();

  const [type, setType] = useState<TaskType>("FOLLOW_UP");
  const [leadId, setLeadId] = useState<string | null>(defaultLeadId ?? null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState<string>("");
  const [dueLocal, setDueLocal] = useState(() => nowPlusMinutes(60));

  useEffect(() => {
    if (open) {
      setLeadId(defaultLeadId ?? null);
      setDueLocal(nowPlusMinutes(60));
      setType("FOLLOW_UP");
      setTitle("");
      setNotes("");
    }
  }, [open, defaultLeadId]);

  const selectedLead = useMemo(() => leads.find((l) => l.id === leadId), [leads, leadId]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const dueAtIso = new Date(dueLocal).toISOString();
      return createTask({
        userId,
        leadId,
        type,
        title: title.trim(),
        notes: notes.trim() ? notes.trim() : null,
        dueAt: dueAtIso,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Tarefa criada — o dashboard vai te lembrar no horário.");
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast.error(`Falha ao criar tarefa: ${err.message}`);
    },
  });

  const canSave = title.trim().length > 0 && !!dueLocal;

  const applySuggestion = () => {
    const s = aiSuggest({ lead: selectedLead, type });
    if (!title.trim()) setTitle(s.title);
    setNotes((prev) => (prev.trim() ? prev : s.notes));
    toast.message("Sugestão aplicada", { description: "Ajuste o texto com sua voz antes de enviar." });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl rounded-3xl border-none bg-white/90 backdrop-blur shadow-[0_30px_80px_-50px_rgba(15,23,42,0.7)]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-indigo-600 text-white dashboard-tilt">
              <Sparkles className="h-4 w-4" />
            </span>
            Criar tarefa
          </DialogTitle>
          <DialogDescription className="text-slate-600">
            Agende retornos e ações — o sistema vai destacar quando estiver perto do horário.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as TaskType)}>
              <SelectTrigger className="rounded-2xl">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {taskTypeMeta.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-[11px] text-slate-500">
              {taskTypeMeta.find((t) => t.value === type)?.hint}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Quando</Label>
            <div className="relative">
              <Clock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="datetime-local"
                value={dueLocal}
                onChange={(e) => setDueLocal(e.target.value)}
                className="pl-9 rounded-2xl"
              />
            </div>
            <div className="text-[11px] text-slate-500">Ex.: amanhã 17:00 (retorno combinado)</div>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Título</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Retornar para Maria após 17:00"
              className="rounded-2xl"
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Vincular a um lead (opcional)</Label>
            <Select value={leadId ?? "none"} onValueChange={(v) => setLeadId(v === "none" ? null : v)}>
              <SelectTrigger className="rounded-2xl">
                <SelectValue placeholder="Selecione um lead" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem lead</SelectItem>
                {leads.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedLead && (
              <div className="text-[11px] text-slate-500">Tag: {selectedLead.tag || "—"}</div>
            )}
          </div>

          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label>Notas (opcional)</Label>
              <Button
                type="button"
                variant="outline"
                onClick={applySuggestion}
                className="rounded-2xl border-slate-200 bg-white hover:bg-slate-50"
              >
                <Wand2 className="h-4 w-4 mr-2" /> Sugestão IA
              </Button>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Ex: cliente pediu retorno depois do expediente. Usar pergunta fechada e puxar decisão (visita/documentos)."
            />
          </div>
        </div>

        <div className="mt-2 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="rounded-2xl"
            disabled={createMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={!canSave || createMutation.isPending}
            className="rounded-2xl bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Criar tarefa
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
