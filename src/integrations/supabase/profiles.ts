import { supabase } from "./client";
import { User, UserRole, Team } from "@/types/user";

// Função auxiliar para mapear o perfil do banco para o tipo User do frontend
const mapProfileToUser = (profile: any): User => ({
  id: profile.id,
  name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email || 'Usuário Sem Nome',
  email: profile.email || 'E-mail não disponível', // Note: Pode vir nulo se a coluna não existir
  role: (profile.role as UserRole) || 'BROKER',
  managerId: profile.manager_id,
  teamId: profile.team_id,
  leadAssignmentEnabled: !!profile.lead_assignment_enabled,
});

export const fetchProfiles = async (): Promise<User[]> => {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .order('role', { ascending: false });

  if (error) throw error;
  return (profiles || []).map(profile => mapProfileToUser(profile));
};

export const fetchTeams = async (): Promise<Team[]> => {
  const { data: teams, error } = await supabase
    .from('teams')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;
  return teams || [];
};

export const fetchManagers = async (): Promise<User[]> => {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .in('role', ['SUPERINTENDENT', 'MANAGER']);

  if (error) throw error;
  return (profiles || []).map(profile => mapProfileToUser(profile));
};

export const updateProfile = async (user: User) => {
  const { id, name, role, managerId, teamId, leadAssignmentEnabled } = user;

  const names = name.trim().split(/\s+/);
  const firstName = names[0];
  const lastName = names.slice(1).join(" ");

  const updatePayload = {
    first_name: firstName,
    last_name: lastName,
    role: role,
    manager_id: (managerId === 'none' || !managerId) ? null : managerId,
    team_id: (teamId === 'none' || !teamId) ? null : teamId,
    lead_assignment_enabled: leadAssignmentEnabled,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('profiles')
    .update(updatePayload)
    .eq('id', id);

  if (error) throw error;
};