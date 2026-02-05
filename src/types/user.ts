export type UserRole = 'SUPERINTENDENT' | 'MANAGER' | 'BROKER';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  managerId: string | null;
  leadAssignmentEnabled: boolean;
}
