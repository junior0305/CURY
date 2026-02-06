import { supabase } from "./client";
import { User, UserRole, Team } from "@/types/user";

// Helper function to map DB profile to frontend User type
const mapProfileToUser = (profile: any): User => ({
  id: profile.id,
  name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email || 'Usuário Sem Nome',
  email: profile.email || 'E-mail não disponível',
  role: (profile.role as UserRole) || 'BROKER',
  managerId: profile.manager_id,
  teamId: profile.team_id,
  leadAssignmentEnabled: !!profile.lead_assignment_enabled,
});

// Fetches all profiles visible to the current user (based on RLS)
export const fetchProfiles = async (): Promise<User[]> => {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .order('role', { ascending: false });

  if (error) {
    console.error("[fetchProfiles] Error:", error);
    throw error;
  }

  return (profiles || []).map(profile => mapProfileToUser(profile));
};

// Fetches all teams
export const fetchTeams = async (): Promise<Team[]> => {
  const { data: teams, error } = await supabase
    .from('teams')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;

  return teams || [];
};

// Fetches all users who can act as managers
export const fetchManagers = async (): Promise<User[]> => {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .in('role', ['SUPERINTENDENT', 'MANAGER']);

  if (error) throw error;

  return (profiles || []).map(profile => mapProfileToUser(profile));
};

// Updates an existing profile
export const updateProfile = async (user: Partial<User>) => {
  const { id, role, managerId, teamId, leadAssignmentEnabled } = user;

  const updatePayload = {
    role: role,
    manager_id: managerId === 'none' ? null : managerId,
    team_id: teamId === 'none' ? null : teamId,
    lead_assignment_enabled: leadAssignmentEnabled,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('profiles')
    .update(updatePayload)
    .eq('id', id);

  if (error) throw error;
};