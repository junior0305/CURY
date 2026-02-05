import { supabase } from "./client";
import { User, UserRole } from "@/types/user";

// Helper function to map DB profile to frontend User type
const mapProfileToUser = (profile: any): User => ({
  id: profile.id,
  name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email || 'N/A',
  email: profile.email || 'N/A',
  role: profile.role as UserRole,
  managerId: profile.manager_id,
  leadAssignmentEnabled: profile.lead_assignment_enabled,
});

// Fetches all profiles visible to the current user (based on RLS)
export const fetchProfiles = async (): Promise<User[]> => {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .order('role', { ascending: false })
    .order('first_name', { ascending: true });

  if (error) throw error;

  return profiles.map(profile => mapProfileToUser(profile));
};

// Fetches all users who can act as managers (SUPERINTENDENT and MANAGER roles)
export const fetchManagers = async (): Promise<User[]> => {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .in('role', ['SUPERINTENDENT', 'MANAGER']);

  if (error) throw error;

  return profiles.map(profile => mapProfileToUser(profile));
};

// Updates an existing profile
export const updateProfile = async (user: Partial<User>) => {
  const { id, role, managerId, leadAssignmentEnabled } = user;

  const updatePayload = {
    role: role,
    manager_id: managerId,
    lead_assignment_enabled: leadAssignmentEnabled,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('profiles')
    .update(updatePayload)
    .eq('id', id);

  if (error) throw error;
};