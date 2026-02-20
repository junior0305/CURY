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
}

const LeadForm = ({ onOpenChange, brokerId, managerId }: LeadFormProps) => {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", phone: "", tag: "" });

  const handleChange = (field: string, value: string) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { name, phone, email, tag } = formData;
    if (!name || !phone) { toast.error("Nome e Telefone são obrigatórios."); return; }
    setLoading(true);
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase.from("leads").insert({
        name, phone, email, tag,
        status: "NEW",
        broker_id: brokerId,
        manager_id: managerId,
        created_at: nowIso,
        last_interaction_at: nowIso,
        notes: `Criado manualmente`,
      });
      if (error) throw error;
      toast.success("Lead criado com sucesso! 🚀");
      queryClient.invalidateQueries({ queryKey: ["dashboardLeads"] });
      onOpenChange(false);
      setFormData({ name: "", email: "", phone: "", tag: "" });
    } catch (error: any) {
      toast.error("Erro ao criar lead: " + error.message);
    } finally {
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
