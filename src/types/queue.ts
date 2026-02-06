export interface DistributionQueue {
  id: string;
  name: string;
  matchValue: string;
  matchField: 'titulo' | 'tag';
  teamIds: string[]; // IDs das equipes participantes
  isActive: boolean;
  lastAssignedIndex: number;
}
