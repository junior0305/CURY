export type LeadStatus = 'NEW' | 'CONTACTED' | 'NEGOTIATING' | 'CONCLUDED' | 'ABANDONED' | 'EXCLUDED';

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: LeadStatus;
  brokerId: string | null;
  managerId: string | null;
  tag: string;
  createdAt: string;
  lastInteractionAt: string;
}