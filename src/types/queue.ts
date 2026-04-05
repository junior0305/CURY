export interface DistributionQueue {
  id: string;
  name: string;
  matchValue: string;
  matchField: 'titulo' | 'tag';
  teamIds: string[]; // IDs das equipes participantes
  isActive: boolean;
  lastAssignedIndex: number;
  lockAfterAssignment: boolean; // leads desta fila não são redistribuídos
  region?: string | null;       // Ex: "Jaguaré", "Zona Oeste"
  canal?: string | null;        // Ex: "Facebook", "Google", "Indicação"
}
