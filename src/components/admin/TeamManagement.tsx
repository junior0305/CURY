import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlusCircle, Trash2, Loader2, Users, Save } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchTeams } from "@/integrations/supabase/profiles";
import { Team } from "@/types/user";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/AuthProvider"; // Import useAuth

const TeamManagement = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { signOut } = useAuth(); // Use signOut from AuthContext
  const [newTeamName, setNewTeamName] = useState("");

  const { data: teams = [], isLoading } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: fetchTeams,
  });

  const handleSupabaseError = (error: any) => {
    const errorMessage = error.message || "Ocorreu um erro desconhecido.";
    
    if (errorMessage.includes('JWT expired') || errorMessage.includes('Invalid JWT')) {
      toast({ title: "Sessão Expirada", description: "Sua sessão expirou. Por favor, faça login novamente.", variant: "destructive" });
      signOut(); // Force logout and redirect
    } else {
      toast({ title: "Erro", description: `Falha na operação: ${errorMessage}`, variant: "destructive" });
    }
  };

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
      toast({ title: "Sucesso", description: "Equipe criada com sucesso." });
    },
    onError: handleSupabaseError
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('teams')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast({ title: "Sucesso", description: "Equipe removida." });
    },
    onError: handleSupabaseError
  });

  const handleCreateTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTeamName.trim()) {
      createTeamMutation.mutate(newTeamName.trim());
    }
  };

  const handleDeleteTeam = (id: string) => {
    if (window.confirm("Tem certeza que deseja excluir esta equipe?")) {
      deleteTeamMutation.mutate(id);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-1 shadow-md border-none h-fit">
        <CardHeader>
          <CardTitle className="text-indigo-700 flex items-center gap-2"><PlusCircle className="w-5 h-5" /> Criar Nova Equipe</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateTeam} className="space-y-4">
            <Input 
              placeholder="Nome da Equipe (Ex: Zona Sul)" 
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
          <CardTitle className="text-gray-900 flex items-center gap-2"><Users className="w-5 h-5" /> Equipes Cadastradas</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center h-40"><Loader2 className="w-8 h-8 text-indigo-600 animate-spin" /></div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
              <Table>
                <TableHeader className="bg-gray-50/50">
                  <TableRow>
                    <TableHead className="font-bold">Nome</TableHead>
                    <TableHead className="font-bold">Membros</TableHead>
                    <TableHead className="text-right font-bold">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teams.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="h-24 text-center text-gray-400">
                        Nenhuma equipe cadastrada.
                      </TableCell>
                    </TableRow>
                  ) : (
                    teams.map((team) => (
                      <TableRow key={team.id} className="hover:bg-gray-50/50 transition-colors">
                        <TableCell className="font-medium">{team.name}</TableCell>
                        <TableCell className="text-sm text-gray-500">0 Corretores</TableCell> {/* Placeholder for member count */}
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleDeleteTeam(team.id)} 
                            disabled={deleteTeamMutation.isPending}
                            className="hover:bg-red-50 hover:text-red-600 rounded-full"
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