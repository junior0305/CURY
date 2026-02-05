export interface DistributionQueue {
  id: string;
  name: string;
  tag: string; // A tag que vincula o lead do Make a esta fila
  participantIds: string[]; // IDs dos corretores que participam desta fila
  isActive: boolean;
}