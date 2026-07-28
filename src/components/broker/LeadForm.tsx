import { useState } from "react";
import { SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface LeadFormProps {
  onOpenChange: (open: boolean) => void;
  brokerId: string;
  managerId: string | null;
  initialName?: string;
  initialPhone?: string;
}

const LeadForm = ({ onOpenChange, brokerId, managerId, initialName, initialPhone }: LeadFormProps) => {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: initialName || "", email: "", phone: initialPhone || "", tag: "" });

  const handleChange = (field: string, value: string) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  // Normaliza telefone: remove (), espaços, dash, dot. Adiciona 55 se faltando.
  function normalizePhone(raw: string): string {
    let digits = (raw || "").replace(/\D/g, "");
    if (!digits) return "";
    // Remove zeros à esquerda
    digits = digits.replace(/^0+/, "");
    // Se não começa com 55 e tem 10 ou 11 dígitos, é número BR sem prefixo
    if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith("55")) {
      digits = "55" + digits;
    }
    return digits;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { name, phone, email, tag } = formData;

    // Validações com mensagens claras
    if (!name?.trim()) { toast.error("⚠️ Nome é obrigatório"); return; }
    const phoneClean = normalizePhone(phone);
    if (!phoneClean) { toast.error("⚠️ Telefone é obrigatório"); return; }
    if (phoneClean.length < 12 || phoneClean.length > 13) {
      toast.error(`⚠️ Telefone inválido (${phoneClean.length} dígitos). Esperado: 55 + DDD + número (12 ou 13 dígitos).`);
      return;
    }

    setLoading(true);
    const nowIso = new Date().toISOString();
    let logStatus: "success" | "failed" = "failed";
    let logError = "";

    try {
      const { data: insertedLead, error } = await supabase.from("leads").insert({
        name: name.trim(),
        phone: phoneClean,
        email: email?.trim() || null,
        tag: tag?.trim() || null,
        status: "IN_PROGRESS",
        broker_id: brokerId,
        manager_id: managerId,
        created_at: nowIso,
        last_interaction_at: nowIso,
        notes: `Criado manualmente pelo corretor`,
        contact_attempts: 1,
        source: "broker_manual",
      }).select("id").single();

      if (error) {
        logError = error.message;
        // Erros comuns traduzidos
        if (error.message.includes("row-level security")) {
          toast.error("❌ Sem permissão pra criar lead. Avisa o admin.");
        } else if (error.message.includes("duplicate")) {
          toast.error("❌ Esse telefone já existe no sistema.");
        } else {
          toast.error("❌ Erro: " + error.message);
        }
        return;
      }

      logStatus = "success";
      toast.success("✅ Lead criado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["dashboardLeads"] });
      onOpenChange(false);
      setFormData({ name: "", email: "", phone: "", tag: "" });
    } catch (error: any) {
      logError = error?.message || String(error);
      toast.error("❌ Falha inesperada: " + logError);
    } finally {
      // Log auditável SEMPRE — sucesso ou erro — pra debug futuro
      try {
        await supabase.from("automation_logs").insert({
          entity_type: "lead_form_manual",
          entity_id: null,
          status: logStatus,
          message_sent: `nome="${name}", phone="${phone}" → "${phoneClean}", broker=${brokerId}`,
          recipient_phone: phoneClean,
          error_message: logError || null,
        });
      } catch { /* nunca bloqueia UI */ }
      setLoading(false);
    }
  };

  return (
    <SheetContent side="right" className="sm:max-w-md bg-slate-900 border-gray-700 p-6 overflow-y-auto">
      <SheetHeader className="mb-6">
        <SheetTitle className="text-2xl font-bold text-white">Novo Lead Manual</SheetTitle>
        <SheetDescription className="text-gray-500">
          Cadastre leads de indicações ou contatos próprios.
        </SheetDescription>
      </SheetHeader>

      <form onSubmit={handleSubmit} className="space-y-5">
        {[
          { field: "name",  label: "Nome Completo *",       type: "text",  placeholder: "João da Silva" },
          { field: "phone", label: "Telefone (WhatsApp) *", type: "tel",   placeholder: "(11) 99999-9999" },
          { field: "email", label: "Email",                 type: "email", placeholder: "joao@email.com" },
          { field: "tag",   label: "Tag / Origem",          type: "text",  placeholder: "Ex: Indicação João, Feirão" },
        ].map(({ field, label, type, placeholder }) => (
          <div key={field} className="space-y-1.5">
            <Label className="text-gray-400 text-xs font-bold uppercase tracking-wider">{label}</Label>
            <Input
              type={type}
              placeholder={placeholder}
              value={(formData as any)[field]}
              onChange={e => handleChange(field, e.target.value)}
              disabled={loading}
              className="bg-slate-800 border-gray-600 text-white placeholder-gray-600 focus:border-indigo-500 focus:ring-indigo-500/20 h-11 rounded-xl"
            />
          </div>
        ))}

        <Button type="submit"
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black h-12 rounded-xl shadow-lg shadow-indigo-900/40 mt-2"
          disabled={loading}>
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          <Save className="w-4 h-4 mr-2" /> Salvar Lead
        </Button>
      </form>
    </SheetContent>
  );
};

export default LeadForm;
