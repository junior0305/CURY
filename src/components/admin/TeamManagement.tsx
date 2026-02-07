import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlusCircle, Trash2, Loader2, Users, Save, Users2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchTeams } from "@/integrations/supabase/profiles";
import { Team } from "@/types/user";
import { supabase } from "@/integrations/supabase/client";

const TeamManagement = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newTeamName, setNewTeamName] = useState("");

  const { data: teams = [], isLoading } = useQuery<(Team & { memberCount?: number })[]>({
    queryKey: ['teams'],
    queryFn: fetchTeams,
  });

  const createTeamMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from('teams')
        .insert([{ name }])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setNewTeamName("");
      toast({ title: "Equipe Criada", description: "Nova equipe disponível para vinculação." });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" })
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('teams').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast({ title: "Equipe Removida", description: "A equipe foi excluída." });
    },
    onError: (err: any) => toast({ title: "Erro", description: "Não é possível excluir equipes com membros ativos.", variant: "destructive" })
  });

  const handleCreateTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTeamName.trim()) createTeamMutation.mutate(newTeamName.trim());
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-1 shadow-md border-none h-fit">
        <CardHeader>
          <CardTitle className="text-indigo-700 flex items-center gap-2">
            <PlusCircle className="w-5 h-5" /> Nova Equipe
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateTeam} className="space-y-4">
            <Input 
              placeholder="Ex: Time Vendas Sul" 
              value={newTeamName} 
              onChange={(e) => setNewTeamName(e.target.value)} 
              disabled={createTeamMutation.isPending}
            />
            <Button type="submit" className="w-full bg-indigo-600" disabled={createTeamMutation.isPending || !newTeamName.trim()}>
              {createTeamMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar Equipe
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2 shadow-xl border-none">
        <CardHeader>
          <CardTitle className="text-gray-900 flex items-center gap-2">
            <Users2 className="w-5 h-5 text-indigo-500" /> Equipes Ativas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center h-40"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /></div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <Table>
                <TableHeader className="bg-gray-50/50">
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Membros</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teams.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center py-8 text-gray-400">Nenhuma equipe cadastrada.</TableCell></TableRow>
                  ) : (
                    teams.map((team) => (
                      <TableRow key={team.id} className="hover:bg-gray-50/50">
                        <TableCell className="font-bold text-gray-700">{team.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-gray-400" />
                            <span className="font-medium">{team.memberCount || 0}</span>
                            <span className="text-xs text-gray-400">membros</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => deleteTeamMutation.mutate(team.id)} 
                            disabled={deleteTeamMutation.isPending || (team.memberCount || 0) > 0}
                            className="hover:bg-red-50 hover:text-red-600 rounded-full"
                            title={team.memberCount && team.memberCount > 0 ? "Remova os membros antes de excluir" : ""}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TeamManagement;