import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Shield,
  Plus,
  Pencil,
  Trash2,
  Users,
  Crown,
  Sword,
  Search,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  team_id: string | null;
}

interface Team {
  id: string;
  name: string;
  manager_id: string | null;
  created_at: string;
  manager?: Profile | null;
  members?: Profile[];
}

// ─── Cores temáticas por índice ───────────────────────────────────────────────
const TEAM_COLORS = [
  { border: "border-red-500/40", badge: "bg-red-900/40 text-red-300 border-red-500/30", glow: "shadow-red-900/20" },
  { border: "border-blue-500/40", badge: "bg-blue-900/40 text-blue-300 border-blue-500/30", glow: "shadow-blue-900/20" },
  { border: "border-yellow-500/40", badge: "bg-yellow-900/40 text-yellow-300 border-yellow-500/30", glow: "shadow-yellow-900/20" },
  { border: "border-purple-500/40", badge: "bg-purple-900/40 text-purple-300 border-purple-500/30", glow: "shadow-purple-900/20" },
  { border: "border-green-500/40", badge: "bg-green-900/40 text-green-300 border-green-500/30", glow: "shadow-green-900/20" },
  { border: "border-orange-500/40", badge: "bg-orange-900/40 text-orange-300 border-orange-500/30", glow: "shadow-orange-900/20" },
];

const getColor = (index: number) => TEAM_COLORS[index % TEAM_COLORS.length];

// ─── Componente Principal ──────────────────────────────────────────────────────

export default function Equipes() {
  const { toast } = useToast();
  const [teams, setTeams] = useState<Team[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  // Modais
  const [createOpen, setCreateOpen] = useState(false);
  const [editTeam, setEditTeam] = useState<Team | null>(null);
  const [deleteTeam, setDeleteTeam] = useState<Team | null>(null);
  const [transferOpen, setTransferOpen] = useState<{ member: Profile; fromTeam: Team } | null>(null);

  // Form
  const [formName, setFormName] = useState("");
  const [formManagerId, setFormManagerId] = useState("none");
  const [saving, setSaving] = useState(false);

  // ─── Carregamento ────────────────────────────────────────────────────────────

  const loadData = async () => {
    setLoading(true);
    try {
      const [{ data: teamsData }, { data: profilesData }] = await Promise.all([
        supabase.from("teams").select("*").order("name"),
        supabase.from("profiles").select("id, full_name, email, role, team_id").order("full_name"),
      ]);

      const allProfiles: Profile[] = profilesData || [];
      const allTeams: Team[] = (teamsData || []).map((t) => ({
        ...t,
        manager: allProfiles.find((p) => p.id === t.manager_id) ?? null,
        members: allProfiles.filter((p) => p.team_id === t.id),
      }));

      setTeams(allTeams);
      setProfiles(allProfiles);
    } catch (err) {
      toast({ title: "Erro ao carregar dados", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!formName.trim()) return toast({ title: "Nome obrigatório", variant: "destructive" });
    setSaving(true);
    const { error } = await supabase.from("teams").insert({
      name: formName.trim(),
      manager_id: formManagerId === "none" ? null : formManagerId,
    });
    setSaving(false);
    if (error) return toast({ title: "Erro ao criar equipe", description: error.message, variant: "destructive" });
    toast({ title: "✅ Equipe criada com sucesso!" });
    setCreateOpen(false);
    resetForm();
    loadData();
  };

  const handleEdit = async () => {
    if (!editTeam || !formName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("teams").update({
      name: formName.trim(),
      manager_id: formManagerId === "none" ? null : formManagerId,
    }).eq("id", editTeam.id);
    setSaving(false);
    if (error) return toast({ title: "Erro ao editar equipe", description: error.message, variant: "destructive" });
    toast({ title: "✅ Equipe atualizada!" });
    setEditTeam(null);
    resetForm();
    loadData();
  };

  const handleDelete = async () => {
    if (!deleteTeam) return;
    // Remove membros da equipe antes de deletar
    await supabase.from("profiles").update({ team_id: null }).eq("team_id", deleteTeam.id);
    const { error } = await supabase.from("teams").delete().eq("id", deleteTeam.id);
    if (error) return toast({ title: "Erro ao excluir equipe", description: error.message, variant: "destructive" });
    toast({ title: "🗑️ Equipe removida." });
    setDeleteTeam(null);
    loadData();
  };

  const handleTransfer = async (newTeamId: string) => {
    if (!transferOpen) return;
    const { error } = await supabase.from("profiles").update({
      team_id: newTeamId === "none" ? null : newTeamId,
    }).eq("id", transferOpen.member.id);
    if (error) return toast({ title: "Erro na transferência", description: error.message, variant: "destructive" });
    toast({ title: `⚔️ ${transferOpen.member.full_name} transferido!` });
    setTransferOpen(null);
    loadData();
  };

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const resetForm = () => { setFormName(""); setFormManagerId("none"); };

  const openEdit = (team: Team) => {
    setEditTeam(team);
    setFormName(team.name);
    setFormManagerId(team.manager_id ?? "none");
  };

  const toggleExpand = (id: string) => {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Managers disponíveis = usuários com role manager/admin
  const eligibleManagers = profiles.filter((p) =>
    p.role === "manager" || p.role === "admin" || p.role === "superintendent"
  );

  const filteredTeams = teams.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.manager?.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  // Perfis sem equipe
  const orphanProfiles = profiles.filter((p) => !p.team_id);

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex flex-col items-center gap-4">
          <Shield className="w-12 h-12 text-blue-400 animate-pulse" />
          <p className="text-gray-400 text-sm tracking-widest uppercase">Carregando equipes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Topbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-wider uppercase flex items-center gap-2">
            <Shield className="w-7 h-7 text-blue-400" />
            Equipes de Combate
          </h2>
          <p className="text-gray-500 text-sm mt-1">{teams.length} equipe{teams.length !== 1 ? "s" : ""} ativa{teams.length !== 1 ? "s" : ""}</p>
        </div>
        <Button
          onClick={() => { resetForm(); setCreateOpen(true); }}
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold gap-2 shadow-lg shadow-blue-900/30"
        >
          <Plus className="w-4 h-4" />
          Nova Equipe
        </Button>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar equipe ou capitão..."
          className="pl-10 bg-slate-800/50 border-gray-700 text-white placeholder:text-gray-500 focus:border-blue-500/50"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Equipes", value: teams.length, icon: Shield, color: "text-blue-400" },
          { label: "Tropas", value: profiles.length, icon: Users, color: "text-green-400" },
          { label: "Sem equipe", value: orphanProfiles.length, icon: AlertTriangle, color: "text-yellow-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-slate-800/40 border border-gray-700/50 rounded-xl p-4 flex items-center gap-3">
            <Icon className={`w-8 h-8 ${color}`} />
            <div>
              <p className="text-2xl font-black text-white">{value}</p>
              <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Lista de equipes */}
      <div className="space-y-4">
        {filteredTeams.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhuma equipe encontrada.</p>
          </div>
        ) : (
          filteredTeams.map((team, index) => {
            const color = getColor(index);
            const expanded = expandedTeams.has(team.id);
            return (
              <div
                key={team.id}
                className={`bg-slate-800/40 border ${color.border} rounded-xl overflow-hidden shadow-lg ${color.glow} transition-all duration-200`}
              >
                {/* Header da equipe */}
                <div className="flex items-center justify-between p-4">
                  <button
                    onClick={() => toggleExpand(team.id)}
                    className="flex items-center gap-3 flex-1 text-left"
                  >
                    {expanded ? (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                    <div>
                      <h3 className="text-lg font-black text-white tracking-wide">{team.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        {team.manager ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${color.badge}`}>
                            <Crown className="w-3 h-3 inline mr-1" />
                            Cap. {team.manager.full_name}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-500 italic">Sem capitão</span>
                        )}
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {team.members?.length ?? 0} soldado{team.members?.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEdit(team)}
                      className="h-8 w-8 p-0 text-gray-400 hover:text-white hover:bg-slate-700"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteTeam(team)}
                      className="h-8 w-8 p-0 text-gray-400 hover:text-red-400 hover:bg-red-900/20"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Membros expandidos */}
                {expanded && (
                  <div className="border-t border-gray-700/50 p-4 space-y-2">
                    {!team.members || team.members.length === 0 ? (
                      <p className="text-gray-500 text-sm text-center py-4">Nenhum soldado nesta equipe.</p>
                    ) : (
                      team.members.map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center justify-between bg-slate-900/40 rounded-lg px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <Sword className="w-4 h-4 text-gray-500" />
                            <span className="text-white text-sm font-medium">{member.full_name || member.email}</span>
                            <span className="text-xs text-gray-500 capitalize">({member.role})</span>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setTransferOpen({ member, fromTeam: team })}
                            className="text-xs text-gray-400 hover:text-blue-300 hover:bg-blue-900/20 h-7 px-2"
                          >
                            Transferir
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Sem equipe */}
      {orphanProfiles.length > 0 && (
        <div className="bg-yellow-900/10 border border-yellow-500/20 rounded-xl p-4">
          <h3 className="text-yellow-400 font-bold text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Tropas sem equipe ({orphanProfiles.length})
          </h3>
          <div className="space-y-2">
            {orphanProfiles.map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-slate-900/40 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-yellow-500/60" />
                  <span className="text-white text-sm">{p.full_name || p.email}</span>
                  <span className="text-xs text-gray-500 capitalize">({p.role})</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setTransferOpen({ member: p, fromTeam: null as any })}
                  className="text-xs text-yellow-400 hover:text-yellow-300 hover:bg-yellow-900/20 h-7 px-2"
                >
                  Alocar
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Modal Criar ──────────────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-slate-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-black flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-400" />
              Nova Equipe
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-gray-400 text-xs uppercase tracking-wider">Nome da Equipe</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ex: Esquadrão Alpha"
                className="bg-slate-800 border-gray-600 text-white"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-400 text-xs uppercase tracking-wider">Capitão (opcional)</Label>
              <Select value={formManagerId} onValueChange={setFormManagerId}>
                <SelectTrigger className="bg-slate-800 border-gray-600 text-white">
                  <SelectValue placeholder="Selecionar capitão..." />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-gray-600">
                  <SelectItem value="none" className="text-gray-400">Sem capitão</SelectItem>
                  {eligibleManagers.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-white">
                      {m.full_name || m.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)} className="flex-1 border-gray-600 text-gray-300 hover:bg-slate-800">
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-500 font-bold">
                {saving ? "Criando..." : "Criar Equipe"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Modal Editar ─────────────────────────────────────────────────────── */}
      <Dialog open={!!editTeam} onOpenChange={(open) => !open && setEditTeam(null)}>
        <DialogContent className="bg-slate-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-black flex items-center gap-2">
              <Pencil className="w-5 h-5 text-yellow-400" />
              Editar Equipe
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-gray-400 text-xs uppercase tracking-wider">Nome da Equipe</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="bg-slate-800 border-gray-600 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-400 text-xs uppercase tracking-wider">Capitão</Label>
              <Select value={formManagerId} onValueChange={setFormManagerId}>
                <SelectTrigger className="bg-slate-800 border-gray-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-gray-600">
                  <SelectItem value="none" className="text-gray-400">Sem capitão</SelectItem>
                  {eligibleManagers.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-white">
                      {m.full_name || m.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditTeam(null)} className="flex-1 border-gray-600 text-gray-300 hover:bg-slate-800">
                Cancelar
              </Button>
              <Button onClick={handleEdit} disabled={saving} className="flex-1 bg-yellow-600 hover:bg-yellow-500 font-bold">
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Modal Deletar ────────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTeam} onOpenChange={(open) => !open && setDeleteTeam(null)}>
        <AlertDialogContent className="bg-slate-900 border-gray-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-400">
              <Trash2 className="w-5 h-5" />
              Excluir Equipe
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Tem certeza que quer excluir <strong className="text-white">{deleteTeam?.name}</strong>?
              Os {deleteTeam?.members?.length ?? 0} membros ficarão sem equipe.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-600 text-gray-300 hover:bg-slate-800">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-500 font-bold">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Modal Transferir ─────────────────────────────────────────────────── */}
      <Dialog open={!!transferOpen} onOpenChange={(open) => !open && setTransferOpen(null)}>
        <DialogContent className="bg-slate-900 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-black flex items-center gap-2">
              <Sword className="w-5 h-5 text-green-400" />
              Transferir Soldado
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-gray-400 text-sm">
              Transferindo <strong className="text-white">{transferOpen?.member.full_name}</strong> para:
            </p>
            <div className="space-y-2">
              <button
                onClick={() => handleTransfer("none")}
                className="w-full text-left px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-gray-600 text-yellow-400 text-sm font-medium transition-colors"
              >
                <AlertTriangle className="w-4 h-4 inline mr-2" />
                Remover de todas as equipes
              </button>
              {teams
                .filter((t) => t.id !== transferOpen?.fromTeam?.id)
                .map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleTransfer(t.id)}
                    className="w-full text-left px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-gray-600 text-white text-sm font-medium transition-colors"
                  >
                    <Shield className="w-4 h-4 inline mr-2 text-blue-400" />
                    {t.name}
                    {t.manager && (
                      <span className="text-gray-500 text-xs ml-2">• Cap. {t.manager.full_name}</span>
                    )}
                  </button>
                ))}
            </div>
            <Button
              variant="outline"
              onClick={() => setTransferOpen(null)}
              className="w-full border-gray-600 text-gray-300 hover:bg-slate-800"
            >
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
