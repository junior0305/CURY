import { supabase } from "./client";
import { User, UserRole, Team } from "@/types/user";

// Helper function to map DB profile to frontend User type
const mapProfileToUser = (profile: any): User => ({
  id: profile.id,
  name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email || 'N/A',
  email: profile.email || 'N/A', // Use the email from the profiles table
  role: profile.role as UserRole,
  managerId: profile.manager_id,
  teamId: profile.team_id,
  leadAssignmentEnabled: profile.lead_assignment_enabled,
});

// Fetches all profiles visible to the current user (based on RLS)
export const fetchProfiles = async (): Promise<User[]> => {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*, email') // Ensure email is selected
    .order('role', { ascending: false })
    .order('first_name', { ascending: true });

  if (error) throw error;

  return profiles.map(profile => mapProfileToUser(profile));
};

// Fetches all teams
export const fetchTeams = async (): Promise<Team[]> => {
  const { data: teams, error } = await supabase
    .from('teams')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw error;

  return teams;
};

// Fetches all users who can act as managers (SUPERINTENDENT and MANAGER roles)
export const fetchManagers = async (): Promise<User[]> => {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*, email') // Ensure email is selected
    .in('role', ['SUPERINTENDENT', 'MANAGER']);

  if (error) throw error;

  return profiles.map(profile => mapProfileToUser(profile));
};

// Updates an existing profile
export const updateProfile = async (user: Partial<User>) => {
  const { id, role, managerId, teamId, leadAssignmentEnabled } = user;

  const updatePayload = {
    role: role,
    manager_id: managerId,
    team_id: teamId,
    lead_assignment_enabled: leadAssignmentEnabled,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('profiles')
    .update(updatePayload)
    .eq('id', id);

  if (error) throw error;
};