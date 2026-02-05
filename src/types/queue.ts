export interface DistributionQueue {
  id: string;
  name: string;
  matchValue: string; // O valor que deve vir no 'titulo' ou 'tag' do JSON
  matchField: 'titulo' | 'tag'; // Onde procurar o valor
  participantIds: string[];
  isActive: boolean;
  lastAssignedIndex: number; // Para controle interno de quem foi o último
}