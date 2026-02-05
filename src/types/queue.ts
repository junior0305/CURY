export interface DistributionQueue {
  id: string;
  name: string;
  matchValue: string;
  matchField: 'titulo' | 'tag';
  participantIds: string[];
  isActive: boolean;
  lastAssignedIndex: number;
}