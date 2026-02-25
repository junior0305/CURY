import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronDown, ChevronRight, Plus, Shield, Users, Swords, Target } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface Profile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  team_id: string | null;
  manager_id: string | null;
  lead_assignment_enabled: boolean;
  phone: string | null;
}

interface Team {
  id: string;
  name: string;
}

export default function Tropas() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [expandedManagers, setExpandedManagers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    phone: "",
    role: "BROKER",
    teamId: "",
    managerId: ""
  });
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data: profilesData } = await supabase.from("profiles").select("*").order("role", { ascending: false });
      const { data: teamsData } = await supabase.from("teams").select("*").order("name");
      setProfiles(profilesData || []);
      setTeams(teamsData || []);
      setLoading(false);
    } catch (error) {
      console.error("Erro:", error);
      setLoading(false);
    }
  };

  const toggleManager = (managerId: string) => {
    const newExpanded = new Set(expandedManagers);
    if (newExpanded.has(managerId)) {
      newExpanded.delete(managerId);
    } else {
      newExpanded.add(managerId);
    }
    setExpandedManagers(newExpanded);
  };

  const handleCreateUser = async () => {
    try {
      const session = await supabase.auth.getSession();
      const response = await fetch(`${supabase.supabaseUrl}/functions/v1/create-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.data.session?.access_token}`
        },
        body: JSON.stringify({
          email: newUser.email,
          password: newUser.password,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          phone: newUser.phone,
          role: newUser.role,
          teamId: newUser.teamId || null,
          managerId: newUser.managerId || null
        })
      });

      const result = await response.json();

      if (response.ok) {
        toast({ title: "✅ Sucesso!", description: `${newUser.firstName} foi recrutado!` });
        setCreateUserOpen(false);
        setNewUser({ email: "", password: "", firstName: "", lastName: "", phone: "", role: "BROKER", teamId: "", managerId: "" });
        loadData();
      } else {
        toast({ title: "❌ Erro", description: result.error || result.details || "Falha ao criar", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "❌ Erro", description: "Falha no servidor", variant: "destructive" });
    }
  };

  const generals = profiles.filter(p => ["ADMIN", "SUPERINTENDENT"].includes(p.role));
  const managers = profiles.filter(p => p.role === "MANAGER");
  const orphanSoldiers = profiles.filter(p => p.role === "BROKER" && !p.manager_id);
  const getSoldiersByManager = (managerId: string) => profiles.filter(p => p.role === "BROKER" && p.manager_id === managerId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-white text-2xl font-black animate-pulse">⚔️ CARREGANDO TROPAS...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Topbar */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <Users className="w-7 h-7 text-red-400" />
            Hierarquia de Tropas
          </h2>
          <p className="text-gray-500 text-sm mt-1">{profiles.length} combatentes no total</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => navigate("/command-center")}
            variant="outline"
            className="border-purple-500/50 text-purple-400 hover:bg-purple-900/20"
          >
            <Target className="w-4 h-4 mr-2" />
            Centro de Comando
          </Button>
          <Button
            onClick={() => setCreateUserOpen(true)}
            className="bg-red-600 hover:bg-red-500 font-bold gap-2"
          >
            <Plus className="w-4 h-4" />
            Recrutar
          </Button>
        </div>
      </div>

      {/* Modal Recrutamento */}
      <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
        <DialogContent className="bg-slate-900 border-2 border-red-500 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white text-2xl font-black">🎖️ Recrutar Guerreiro</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 p-4">
            <div>
              <label className="text-white text-sm mb-2 block">Email *</label>
              <Input
                placeholder="email@exemplo.com"
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                className="bg-slate-800 text-white border-gray-600"
              />
            </div>
            <div>
              <label className="text-white text-sm mb-2 block">Senha *</label>
              <Input
                placeholder="Senha forte"
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                className="bg-slate-800 text-white border-gray-600"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-white text-sm mb-2 block">Nome *</label>
                <Input
                  placeholder="Nome"
                  value={newUser.firstName}
                  onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })}
                  className="bg-slate-800 text-white border-gray-600"
                />
              </div>
              <div>
                <label className="text-white text-sm mb-2 block">Sobrenome *</label>
                <Input
                  placeholder="Sobrenome"
                  value={newUser.lastName}
                  onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
                  className="bg-slate-800 text-white border-gray-600"
                />
              </div>
            </div>
            <div>
              <label className="text-white text-sm mb-2 block">Telefone</label>
              <Input
                placeholder="(00) 00000-0000"
                value={newUser.phone}
                onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                className="bg-slate-800 text-white border-gray-600"
              />
            </div>
            <div>
              <label className="text-white text-sm mb-2 block">Patente *</label>
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value, managerId: "", teamId: "" })}
                className="w-full bg-slate-800 text-white border border-gray-600 rounded-md p-2"
              >
                <option value="BROKER">⚔️ SOLDADO (Corretor)</option>
                <option value="MANAGER">🎖️ CAPITÃO (Gerente)</option>
                <option value="SUPERINTENDENT">👑 SUPERINTENDENTE</option>
                <option value="ADMIN">👑 GENERAL (Admin)</option>
              </select>
            </div>
            {teams.length > 0 && (newUser.role === "BROKER" || newUser.role === "MANAGER") && (
              <div>
                <label className="text-white text-sm mb-2 block">
                  Esquadrão (Equipe) {newUser.role === "BROKER" ? "*" : ""}
                </label>
                <select
                  value={newUser.teamId}
                  onChange={(e) => setNewUser({ ...newUser, teamId: e.target.value })}
                  className="w-full bg-slate-800 text-white border border-gray-600 rounded-md p-2"
                >
                  <option value="">Selecione uma equipe</option>
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}
            {newUser.role === "BROKER" && managers.length > 0 && (
              <div>
                <label className="text-white text-sm mb-2 block">Capitão (Gerente) *</label>
                <select
                  value={newUser.managerId}
                  onChange={(e) => setNewUser({ ...newUser, managerId: e.target.value })}
                  className="w-full bg-slate-800 text-white border border-gray-600 rounded-md p-2"
                >
                  <option value="">Selecione um capitão</option>
                  {managers.map(m => (
                    <option key={m.id} value={m.id}>🎖️ {m.first_name} {m.last_name}</option>
                  ))}
                </select>
              </div>
            )}
            {newUser.role === "MANAGER" && generals.filter(g => g.role === "SUPERINTENDENT").length > 0 && (
              <div>
                <label className="text-white text-sm mb-2 block">Superior (Superintendente)</label>
                <select
                  value={newUser.managerId}
                  onChange={(e) => setNewUser({ ...newUser, managerId: e.target.value })}
                  className="w-full bg-slate-800 text-white border border-gray-600 rounded-md p-2"
                >
                  <option value="">Sem superior direto</option>
                  {generals.filter(g => g.role === "SUPERINTENDENT").map(g => (
                    <option key={g.id} value={g.id}>👑 {g.first_name} {g.last_name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="pt-2">
              <Button
                onClick={handleCreateUser}
                className="w-full bg-red-600 hover:bg-red-500 font-bold"
                disabled={
                  !newUser.email ||
                  !newUser.password ||
                  !newUser.firstName ||
                  !newUser.lastName ||
                  (newUser.role === "BROKER" && !newUser.managerId) ||
                  (newUser.role === "BROKER" && !newUser.teamId)
                }
              >
                <Plus className="w-4 h-4 mr-2" />
                Recrutar Agora
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-2 border-yellow-500 bg-yellow-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-yellow-500" />
              Generais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black text-white">{generals.length}</div>
          </CardContent>
        </Card>
        <Card className="border-2 border-blue-500 bg-blue-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" />
              Capitães
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black text-white">{managers.length}</div>
          </CardContent>
        </Card>
        <Card className="border-2 border-green-500 bg-green-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-white flex items-center gap-2">
              <Swords className="w-5 h-5 text-green-500" />
              Soldados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black text-white">{profiles.filter(p => p.role === "BROKER").length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Generais */}
      {generals.length > 0 && (
        <Card className="border-2 border-yellow-500 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-white text-xl font-black flex items-center gap-2">
              <Shield className="w-6 h-6 text-yellow-500" />
              GENERAIS ({generals.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {generals.map(g => (
                <div key={g.id} className="flex items-center gap-3 p-4 rounded-lg border-2 border-yellow-500 bg-yellow-950/20">
                  <span className="text-3xl">👑</span>
                  <div>
                    <div className="text-white font-bold">{g.first_name} {g.last_name}</div>
                    <div className="text-sm text-yellow-400">{g.role === "SUPERINTENDENT" ? "SUPERINTENDENTE" : "GENERAL"}</div>
                    <div className="text-xs text-gray-500">{g.email}</div>
                    {g.phone && <div className="text-xs text-gray-500">{g.phone}</div>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Capitães */}
      {managers.length > 0 && (
        <Card className="border-2 border-blue-500 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-white text-xl font-black flex items-center gap-2">
              <Users className="w-6 h-6 text-blue-500" />
              CAPITÃES ({managers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {managers.map(m => {
                const soldiers = getSoldiersByManager(m.id);
                const isExpanded = expandedManagers.has(m.id);
                const superior = m.manager_id ? profiles.find(p => p.id === m.manager_id) : null;
                const team = m.team_id ? teams.find(t => t.id === m.team_id) : null;
                return (
                  <div key={m.id} className="border-2 border-blue-500 rounded-lg bg-blue-950/20">
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-blue-950/30"
                      onClick={() => toggleManager(m.id)}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <span className="text-3xl">🎖️</span>
                        <div className="flex-1">
                          <div className="text-white font-bold">{m.first_name} {m.last_name}</div>
                          <div className="text-sm text-blue-400">CAPITÃO</div>
                          <div className="text-xs text-gray-500">{m.email}</div>
                          {m.phone && <div className="text-xs text-gray-500">{m.phone}</div>}
                          {team && <div className="text-xs text-blue-300">Equipe: {team.name}</div>}
                          {superior && <div className="text-xs text-yellow-300">Superior: {superior.first_name} {superior.last_name}</div>}
                        </div>
                        <Badge variant="secondary">{soldiers.length} soldados</Badge>
                      </div>
                      <Button variant="ghost" size="sm" className="text-blue-400">
                        {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                      </Button>
                    </div>
                    {isExpanded && soldiers.length > 0 && (
                      <div className="border-t-2 border-blue-500 bg-slate-800/50 p-4 space-y-2">
                        {soldiers.map(s => {
                          const soldierTeam = s.team_id ? teams.find(t => t.id === s.team_id) : null;
                          return (
                            <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border border-green-600 bg-green-950/20">
                              <div className="flex items-center gap-3">
                                <span className="text-2xl">⚔️</span>
                                <div>
                                  <div className="text-white font-bold text-sm">{s.first_name} {s.last_name}</div>
                                  <div className="text-xs text-green-400">SOLDADO</div>
                                  <div className="text-xs text-gray-500">{s.email}</div>
                                  {s.phone && <div className="text-xs text-gray-500">{s.phone}</div>}
                                  {soldierTeam && <div className="text-xs text-green-300">Equipe: {soldierTeam.name}</div>}
                                </div>
                              </div>
                              <Badge variant={s.lead_assignment_enabled ? "default" : "secondary"} className="text-xs">
                                {s.lead_assignment_enabled ? "Ativo" : "Inativo"}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {isExpanded && soldiers.length === 0 && (
                      <div className="border-t-2 border-blue-500 bg-slate-800/50 p-4 text-center text-gray-400 text-sm">
                        Sem soldados
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Soldados sem capitão */}
      {orphanSoldiers.length > 0 && (
        <Card className="border-2 border-green-500 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-white text-xl font-black flex items-center gap-2">
              <Swords className="w-6 h-6 text-green-500" />
              SOLDADOS SEM CAPITÃO ({orphanSoldiers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {orphanSoldiers.map(s => {
                const team = s.team_id ? teams.find(t => t.id === s.team_id) : null;
                return (
                  <div key={s.id} className="flex items-center justify-between p-4 rounded-lg border-2 border-green-500 bg-green-950/20">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">⚔️</span>
                      <div>
                        <div className="text-white font-bold">{s.first_name} {s.last_name}</div>
                        <div className="text-sm text-green-400">SOLDADO</div>
                        <div className="text-xs text-gray-500">{s.email}</div>
                        {s.phone && <div className="text-xs text-gray-500">{s.phone}</div>}
                        {team && <div className="text-xs text-green-300">Equipe: {team.name}</div>}
                      </div>
                    </div>
                    <Badge variant={s.lead_assignment_enabled ? "default" : "secondary"}>
                      {s.lead_assignment_enabled ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
