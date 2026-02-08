export type UserRole = 'SUPERINTENDENT' | 'MANAGER' | 'BROKER' | 'ADMIN';

export interface Team {
  id: string;
  name: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string; // Telefone para contato e WhatsApp
  role: UserRole;
  managerId: string | null;
  teamId: string | null;
  leadAssignmentEnabled: boolean;
}