import { supabase } from "./client";
import { User, UserRole, Team } from "@/types/user";

// Função auxiliar para mapear o perfil do banco para o tipo User do frontend
const mapProfileToUser = (profile: any): User => ({
  id: profile.id,
  name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email || 'Usuário Sem Nome',
  email: profile.email || 'E-mail não disponível',
  phone: profile.phone || '',
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

  if (error) {
    if ((error as any).code === 'PGRST303' || (error as any).message?.includes('JWT')) {
      window.dispatchEvent(new CustomEvent('supabase-auth-error', { detail: error }));
    }
    throw error;
  }
  return (profiles || []).map(profile => mapProfileToUser(profile));
};

export const fetchTeams = async (): Promise<(Team & { memberCount?: number })[]> => {
  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('*')
    .order('name', { ascending: true });

  if (teamsError) {
    if ((teamsError as any).code === 'PGRST303' || (teamsError as any).message?.includes('JWT')) {
      window.dispatchEvent(new CustomEvent('supabase-auth-error', { detail: teamsError }));
    }
    throw teamsError;
  }

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('team_id');

  if (profilesError) throw profilesError;

  return (teams || []).map(team => ({
    ...team,
    memberCount: (profiles || []).filter(p => p.team_id === team.id).length
  }));
};

export const fetchManagers = async (): Promise<User[]> => {
  console.log("Starting fetchManagers query...");
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*');

  if (error) {
    console.error("fetchManagers Database Error:", error);
    if ((error as any).code === 'PGRST303' || (error as any).message?.includes('JWT')) {
      window.dispatchEvent(new CustomEvent('supabase-auth-error', { detail: error }));
    }
    throw error;
  }

  console.log("Profiles raw from DB:", profiles);

  // Mapeamos e depois filtramos manualmente para garantir que nada seja perdido por causa de case-sensitive no banco
  const allUsers = (profiles || []).map(profile => mapProfileToUser(profile));
  
  const managers = allUsers.filter(u => 
    u.role === 'SUPERINTENDENT' || 
    u.role === 'MANAGER' || 
    u.role === 'ADMIN'
  );

  console.log("Managers filtered in frontend:", managers.length, managers);
  return managers;
};

export const updateProfile = async (user: User) => {
  const { id, name, role, managerId, teamId, leadAssignmentEnabled, phone } = user;

  const names = name.trim().split(/\s+/);
  const firstName = names[0];
  const lastName = names.slice(1).join(" ");

  const updatePayload = {
    first_name: firstName,
    last_name: lastName,
    role: role,
    phone: phone || null, // Garante que o telefone seja enviado
    manager_id: (managerId === 'none' || !managerId) ? null : managerId,
    team_id: (teamId === 'none' || !teamId) ? null : teamId,
    lead_assignment_enabled: leadAssignmentEnabled,
    updated_at: new Date().toISOString(),
  };

  console.log("Updating profile with payload:", updatePayload);

  const { error } = await supabase
    .from('profiles')
    .update(updatePayload)
    .eq('id', id);

  if (error) {
    console.error("Profile update error:", error);
    throw error;
  }
};