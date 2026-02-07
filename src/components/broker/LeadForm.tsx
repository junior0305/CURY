import { useState } from "react";
import { SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createManualLead } from "@/integrations/supabase/leads";
import { toast } from "sonner";

interface LeadFormProps {
  onOpenChange: (open: boolean) => void;
  brokerId: string;
  managerId: string | null;
}

const LeadForm = ({ onOpenChange, brokerId, managerId }: LeadFormProps) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    tag: "",
  });

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const createLeadMutation = useMutation({
    mutationFn: (data: typeof formData) => createManualLead({
      ...data,
      brokerId,
      managerId,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboardLeads'] });
      toast.success("Lead manual criado com sucesso! Ele já está na sua lista de atendimento.");
      onOpenChange(false);
      setFormData({ name: "", email: "", phone: "", tag: "" });
    },
    onError: (err: any) => {
      toast.error(`Falha ao criar lead: ${err.message}`);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      toast.error("Nome e Telefone são obrigatórios.");
      return;
    }
    createLeadMutation.mutate(formData);
  };

  const isSaving = createLeadMutation.isPending;

  return (
    <SheetContent side="right" className="sm:max-w-md bg-white p-6 overflow-y-auto">
      <SheetHeader className="mb-6">
        <SheetTitle className="text-2xl font-bold text-green-700">Novo Lead Manual</SheetTitle>
        <SheetDescription>Cadastre leads de indicações ou contatos próprios.</SheetDescription>
      </SheetHeader>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label>Nome Completo *</Label>
          <Input value={formData.name} onChange={(e) => handleChange("name", e.target.value)} disabled={isSaving} required />
        </div>

        <div className="space-y-2">
          <Label>Telefone (WhatsApp) *</Label>
          <Input type="tel" value={formData.phone} onChange={(e) => handleChange("phone", e.target.value)} disabled={isSaving} required />
        </div>

        <div className="space-y-2">
          <Label>Email</Label>
          <Input type="email" value={formData.email} onChange={(e) => handleChange("email", e.target.value)} disabled={isSaving} />
        </div>

        <div className="space-y-2">
          <Label>Tag / Origem</Label>
          <Input placeholder="Ex: Indicação João, Feirão" value={formData.tag} onChange={(e) => handleChange("tag", e.target.value)} disabled={isSaving} />
        </div>

        <Button type="submit" className="w-full bg-green-600 hover:bg-green-700" disabled={isSaving}>
          {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          <Save className="w-4 h-4 mr-2" /> Salvar Lead
        </Button>
      </form>
    </SheetContent>
  );
};

export default LeadForm;