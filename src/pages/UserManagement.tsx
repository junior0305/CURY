import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Users, Pencil, Trash2, AlertTriangle } from "lucide-react";

interface Profile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  evolution_instance: string | null;
  qualification_ai_enabled: boolean;
  lead_assignment_enabled: boolean;
  phone: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "👑 General",
  SUPERINTENDENT: "👑 Superintendente",
  MANAGER: "🎖️ Capitão",
  BROKER: "⚔️ Soldado",
};

export default function UserManagement() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [leadCounts, setLeadCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingUser, setDeletingUser] = useState<Profile | null>(null);
  const [redirectTo, setRedirectTo] = useState("");
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .order("role")
      .order("first_name");

    const { data: leads } = await supabase
      .from("leads")
      .select("broker_id")
      .not("broker_id", "is", null);

    if (profiles) setUsers(profiles);
    if (leads) {
      const map: Record<string, number> = {};
      leads.forEach((l: { broker_id: string }) => {
        map[l.broker_id] = (map[l.broker_id] || 0) + 1;
      });
      setLeadCounts(map);
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!editingUser) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: editingUser.first_name,
        last_name: editingUser.last_name,
        role: editingUser.role,
        evolution_instance: editingUser.evolution_instance,
        qualification_ai_enabled: editingUser.qualification_ai_enabled,
        lead_assignment_enabled: editingUser.lead_assignment_enabled,
        phone: editingUser.phone,
      })
      .eq("id", editingUser.id);
    setSaving(false);
    if (error) {
      toast({ title: "❌ Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "✅ Salvo!", description: "Usuário atualizado com sucesso." });
      setEditingUser(null);
      fetchData();
    }
  }

  async function handleDelete() {
    if (!deletingUser) return;
    const count = leadCounts[deletingUser.id] || 0;
    if (count > 0 && !redirectTo) {
      toast({ title: "⚠️ Atenção", description: "Selecione para quem redirecionar os leads.", variant: "destructive" });
      return;
    }
    setDeleting(true);
    if (count > 0 && redirectTo) {
      const { error } = await supabase
        .from("leads")
        .update({ broker_id: redirectTo })
        .eq("broker_id", deletingUser.id);
      if (error) {
        toast({ title: "❌ Erro ao redirecionar leads", description: error.message, variant: "destructive" });
        setDeleting(false);
        return;
      }
    }
    const { error } = await supabase.from("profiles").delete().eq("id", deletingUser.id);
    setDeleting(false);
    if (error) {
      toast({ title: "❌ Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "✅ Excluído!",
        description: count > 0
          ? `Usuário excluído e ${count} lead(s) redirecionado(s).`
          : "Usuário excluído com sucesso.",
      });
      setDeletingUser(null);
      setRedirectTo("");
      fetchData();
    }
  }

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      u.first_name?.toLowerCase().includes(q) ||
      u.last_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q)
    );
  });

  const otherUsers = users.filter((u) => u.id !== deletingUser?.id);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-900/20 to-slate-900 flex items-center justify-center">
        <div className="text-white text-2xl font-black animate-pulse">⚔️ CARREGANDO...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-900/20 to-slate-900 p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-4xl md:text-5xl font-black text-white mb-2 flex items-center gap-3">
          <Users className="w-10 h-10 text-red-500" />
          GESTÃO DE TROPAS
        </h1>
        <p className="text-gray-400">Edite, gerencie permissões ou exclua usuários</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {["ADMIN", "SUPERINTENDENT", "MANAGER", "BROKER"].map((role) => (
          <Card key={role} className="border-2 border-red-500/30 bg-slate-900/50">
            <CardContent className="pt-4 pb-3">
              <div className="text-3xl font-black text-white">
                {users.filter((u) => u.role === role).length}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{ROLE_LABELS[role]}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <Input
          placeholder="🔍 Buscar por nome, email ou cargo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-slate-800 text-white border-gray-600 placeholder:text-gray-500"
        />
      </div>

      {/* Table */}
      <Card className="border-2 border-red-500/30 bg-slate-900/50">
        <CardHeader>
          <CardTitle className="text-white text-xl font-black">
            TODAS AS TROPAS ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-3 px-3 text-gray-400 font-semibold">Usuário</th>
                  <th className="text-left py-3 px-3 text-gray-400 font-semibold">Cargo</th>
                  <th className="text-left py-3 px-3 text-gray-400 font-semibold">Instância</th>
                  <th className="text-left py-3 px-3 text-gray-400 font-semibold">Leads</th>
                  <th className="text-left py-3 px-3 text-gray-400 font-semibold">IA</th>
                  <th className="text-right py-3 px-3 text-gray-400 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => (
                  <tr key={user.id} className="border-b border-gray-800 hover:bg-slate-800/50 transition-colors">
                    <td className="py-4 px-3">
                      <div className="font-bold text-white">
                        {user.first_name} {user.last_name || ""}
                      </div>
                      <div className="text-xs text-gray-500">{user.email}</div>
                    </td>
                    <td className="py-4 px-3">
                      <span className="text-xs text-gray-300">{ROLE_LABELS[user.role] || user.role}</span>
                    </td>
                    <td className="py-4 px-3 text-gray-400 text-xs">
                      {user.evolution_instance || "—"}
                    </td>
                    <td className="py-4 px-3">
                      <Badge variant="secondary" className="bg-slate-700 text-white">
                        {leadCounts[user.id] || 0}
                      </Badge>
                    </td>
                    <td className="py-4 px-3">
                      <Badge
                        variant={user.qualification_ai_enabled ? "default" : "secondary"}
                        className={user.qualification_ai_enabled ? "bg-green-700 text-white" : "bg-slate-700 text-gray-400"}
                      >
                        {user.qualification_ai_enabled ? "Ativo" : "Off"}
                      </Badge>
                    </td>
                    <td className="py-4 px-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingUser({ ...user })}
                        className="text-blue-400 hover:text-blue-300 hover:bg-blue-950/30 mr-1"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setDeletingUser(user); setRedirectTo(""); }}
                        className="text-red-500 hover:text-red-400 hover:bg-red-950/30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-gray-500">
                      Nenhum usuário encontrado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modal Editar */}
      <Dialog open={!!editingUser} onOpenChange={(o) => !o && setEditingUser(null)}>
        <DialogContent className="bg-slate-900 border-2 border-blue-500 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white text-2xl font-black">✏️ Editar Usuário</DialogTitle>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4 p-2">
              <div className="text-xs text-gray-500">{editingUser.email}</div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white text-xs mb-1.5 block font-semibold">Nome</label>
                  <Input
                    value={editingUser.first_name || ""}
                    onChange={(e) => setEditingUser({ ...editingUser, first_name: e.target.value })}
                    className="bg-slate-800 text-white border-gray-600"
                  />
                </div>
                <div>
                  <label className="text-white text-xs mb-1.5 block font-semibold">Sobrenome</label>
                  <Input
                    value={editingUser.last_name || ""}
                    onChange={(e) => setEditingUser({ ...editingUser, last_name: e.target.value })}
                    className="bg-slate-800 text-white border-gray-600"
                  />
                </div>
              </div>

              <div>
                <label className="text-white text-xs mb-1.5 block font-semibold">Telefone</label>
                <Input
                  value={editingUser.phone || ""}
                  onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                  placeholder="5511999999999"
                  className="bg-slate-800 text-white border-gray-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white text-xs mb-1.5 block font-semibold">Cargo</label>
                  <select
                    value={editingUser.role}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                    className="w-full bg-slate-800 text-white border border-gray-600 rounded-md p-2 text-sm"
                  >
                    <option value="ADMIN">👑 General (Admin)</option>
                    <option value="SUPERINTENDENT">👑 Superintendente</option>
                    <option value="MANAGER">🎖️ Capitão (Gerente)</option>
                    <option value="BROKER">⚔️ Soldado (Corretor)</option>
                  </select>
                </div>
                <div>
                  <label className="text-white text-xs mb-1.5 block font-semibold">Instância Evolution</label>
                  <Input
                    value={editingUser.evolution_instance || ""}
                    onChange={(e) => setEditingUser({ ...editingUser, evolution_instance: e.target.value })}
                    placeholder="NomeInstancia"
                    className="bg-slate-800 text-white border-gray-600"
                  />
                </div>
              </div>

              <div className="flex gap-6 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingUser.qualification_ai_enabled}
                    onChange={(e) => setEditingUser({ ...editingUser, qualification_ai_enabled: e.target.checked })}
                    className="w-4 h-4 accent-blue-500"
                  />
                  <span className="text-sm text-gray-300">Qualificação IA</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingUser.lead_assignment_enabled}
                    onChange={(e) => setEditingUser({ ...editingUser, lead_assignment_enabled: e.target.checked })}
                    className="w-4 h-4 accent-blue-500"
                  />
                  <span className="text-sm text-gray-300">Receber leads</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={() => setEditingUser(null)} className="text-gray-400">
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                  {saving ? "Salvando..." : "Salvar alterações"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Excluir */}
      <Dialog open={!!deletingUser} onOpenChange={(o) => !o && setDeletingUser(null)}>
        <DialogContent className="bg-slate-900 border-2 border-red-500">
          <DialogHeader>
            <DialogTitle className="text-white text-2xl font-black">🗑️ Excluir Usuário</DialogTitle>
          </DialogHeader>
          {deletingUser && (
            <div className="p-2 space-y-4">
              <p className="text-gray-300 text-sm">
                Tem certeza que deseja excluir{" "}
                <span className="font-bold text-white">
                  {deletingUser.first_name} {deletingUser.last_name || ""}
                </span>
                ?
              </p>

              {(leadCounts[deletingUser.id] || 0) > 0 ? (
                <div className="p-4 bg-amber-950/40 border-2 border-amber-500 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                    <span className="text-amber-400 font-bold text-sm">
                      {leadCounts[deletingUser.id]} lead(s) precisam ser redirecionados!
                    </span>
                  </div>
                  <p className="text-xs text-amber-300 mb-3">
                    Selecione quem vai receber os leads deste usuário:
                  </p>
                  <select
                    value={redirectTo}
                    onChange={(e) => setRedirectTo(e.target.value)}
                    className="w-full bg-slate-800 text-white border border-amber-500 rounded-md p-2 text-sm"
                  >
                    <option value="">— Selecionar usuário —</option>
                    {otherUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {ROLE_LABELS[u.role] || u.role} — {u.first_name} {u.last_name || ""}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="text-xs text-gray-500">
                  Este usuário não possui leads vinculados.
                </p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => { setDeletingUser(null); setRedirectTo(""); }}
                  className="text-gray-400"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleDelete}
                  disabled={deleting || ((leadCounts[deletingUser.id] || 0) > 0 && !redirectTo)}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-40"
                >
                  {deleting ? "Excluindo..." : "Confirmar exclusão"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
