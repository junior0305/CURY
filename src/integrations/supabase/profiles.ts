import { supabase } from "./client";
import { User, UserRole } from "@/types/user";

// Helper function to map DB profile to frontend User type
const mapProfileToUser = (profile: any, authUser: any): User => ({
  id: profile.id,
  name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || authUser?.email || 'N/A',
  email: authUser?.email || 'N/A',
  role: profile.role as UserRole,
  managerId: profile.manager_id,
  leadAssignmentEnabled: profile.lead_assignment_enabled,
});

// Fetches all profiles visible to the current user (based on RLS)
export const fetchProfiles = async (): Promise<User[]> => {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    throw new Error("User not authenticated.");
  }
  const authUser = authData.user;

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*, auth_users:id(email)') // Fetch email from auth.users table (aliased by FK)
    .order('role', { ascending: false })
    .order('first_name', { ascending: true });

  if (error) throw error;

  return profiles.map(profile => {
    const userEmail = Array.isArray(profile.auth_users) && profile.auth_users.length > 0
      ? profile.auth_users[0].email
      : authUser.email; // Fallback if join fails or user is fetching self

    return mapProfileToUser(profile, { email: userEmail });
  });
};

// Fetches all users who have the 'MANAGER' role
export const fetchManagers = async (): Promise<User[]> => {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*, auth_users:id(email)')
    .eq('role', 'MANAGER');

  if (error) throw error;

  return profiles.map(profile => {
    const userEmail = Array.isArray(profile.auth_users) && profile.auth_users.length > 0
      ? profile.auth_users[0].email
      : 'N/A';

    return mapProfileToUser(profile, { email: userEmail });
  });
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