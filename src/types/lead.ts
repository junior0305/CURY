export type LeadStatus = 'NEW' | 'IN_PROGRESS' | 'VISIT_SCHEDULED' | 'DOCS_REQUESTED' | 'CONCLUDED' | 'EXCLUDED' | 'ABANDONED';

export type ExclusionReason = 'WRONG_NUMBER' | 'NO_INTEREST' | 'NO_PROFILE' | 'NO_CONTACT' | null;

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
  lastLeadResponseAt: string | null;
  exclusionReason: ExclusionReason;
}