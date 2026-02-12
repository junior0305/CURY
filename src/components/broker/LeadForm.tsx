import { useState } from "react";
import { SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createManualLead } from "@/integrations/supabase/leads";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    tag: "",
  });

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { name, phone, email, tag } = formData;

    try {
      if (!name || !phone) {
        toast.error("Nome e Telefone são obrigatórios.");
        return;
      }

      // CORREÇÃO: Usar data UTC (new Date().toISOString()) para garantir que "Agora" seja 0h de atraso
      // e não 13h devido a fuso horário.
      const nowIso = new Date().toISOString();

      const { error } = await supabase.from('leads').insert({
        name,
        phone,
        email,
        tag: tag,
        status: 'NEW',
        broker_id: brokerId,
        manager_id: managerId,
        created_at: nowIso,
        last_interaction_at: nowIso, // Sincronizado perfeitamente
        notes: `Criado manualmente por ${brokerId ? 'Corretor' : 'Gestor'}`
      });

      if (error) throw error;

      toast.success("Lead criado com sucesso! 🚀");
      queryClient.invalidateQueries({ queryKey: ['dashboardLeads'] });
      onOpenChange(false);
      setFormData({ name: "", email: "", phone: "", tag: "" });
    } catch (error: any) {
      console.error("Erro ao criar lead:", error);
      toast.error("Erro ao criar lead: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SheetContent side="right" className="sm:max-w-md bg-white p-6 overflow-y-auto">
      <SheetHeader className="mb-6">
        <SheetTitle className="text-2xl font-bold text-green-700">Novo Lead Manual</SheetTitle>
        <SheetDescription>Cadastre leads de indicações ou contatos próprios.</SheetDescription>
      </SheetHeader>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label>Nome Completo *</Label>
          <Input value={formData.name} onChange={(e) => handleChange("name", e.target.value)} disabled={loading} required />
        </div>

        <div className="space-y-2">
          <Label>Telefone (WhatsApp) *</Label>
          <Input type="tel" value={formData.phone} onChange={(e) => handleChange("phone", e.target.value)} disabled={loading} required />
        </div>

        <div className="space-y-2">
          <Label>Email</Label>
          <Input type="email" value={formData.email} onChange={(e) => handleChange("email", e.target.value)} disabled={loading} />
        </div>

        <div className="space-y-2">
          <Label>Tag / Origem</Label>
          <Input placeholder="Ex: Indicação João, Feirão" value={formData.tag} onChange={(e) => handleChange("tag", e.target.value)} disabled={loading} />
        </div>

        <Button type="submit" className="w-full bg-green-600 hover:bg-green-700" disabled={loading}>
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          <Save className="w-4 h-4 mr-2" /> Salvar Lead
        </Button>
      </form>
    </SheetContent>
  );
};

export default LeadForm;