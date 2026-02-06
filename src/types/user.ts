export type UserRole = 'SUPERINTENDENT' | 'MANAGER' | 'BROKER' | 'ADMIN';

export interface Team {
  id: string;
  name: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  managerId: string | null;
  teamId: string | null;
  leadAssignmentEnabled: boolean;
}