// Funil MCMV:
// NEW → IN_PROGRESS → NEGOTIATING → VISIT_SCHEDULED → VISITA_REALIZADA → DOCS_REQUESTED → CONCLUDED
// Desvios: FOLLOW_UP_AUTO (bot assume após 3 tentativas), REACTIVATED (lead respondeu ao bot → volta ao corretor)
// Em qualquer etapa pode ir para ABANDONED (Perdido) com lost_reason obrigatório
// EXCLUDED = uso administrativo

export type LeadStatus =
  | 'NEW'               // Novo — chegou, aguardando primeiro contato
  | 'IN_PROGRESS'       // Em Atendimento — contato feito, qualificando
  | 'NEGOTIATING'       // Negociando — corretor marcou como em negociação ativa
  | 'VISIT_SCHEDULED'   // Visita Agendada — plantão marcado
  | 'VISITA_REALIZADA'  // Visita Realizada — lead compareceu ao plantão
  | 'DOCS_REQUESTED'    // Docs Enviados — documentação entregue para análise
  | 'CONCLUDED'         // Fechado — venda concluída 🎉
  | 'FOLLOW_UP_AUTO'    // Follow-up automático — bot assumiu após 3 tentativas sem resposta
  | 'REACTIVATED'       // Reativado — lead respondeu ao bot, voltou para o corretor com prioridade
  | 'ABANDONED'         // Perdido — com motivo obrigatório (lost_reason)
  | 'EXCLUDED';         // Excluído — uso administrativo

export type LostReason =
  | 'RENDA_FORA_FAIXA'    // Renda acima ou abaixo da faixa MCMV
  | 'JA_TEM_IMOVEL'       // Já possui imóvel no nome
  | 'JA_USOU_PROGRAMA'    // Já utilizou benefício MCMV anteriormente
  | 'FGTS_INSUFICIENTE'   // FGTS insuficiente para entrada
  | 'REPROVADO_CREDITO'   // Reprovado na análise de crédito da Caixa
  | 'NAO_COMPARECEU'      // Agendou visita e não compareceu, sem retorno
  | 'FOI_CONCORRENTE'     // Foi para concorrente
  | 'DESISTIU'            // Desistiu / mudou de plano
  | 'SEM_RETORNO'         // Sem retorno após múltiplos contatos
  | null;

// Mantido para retrocompatibilidade com campos antigos de exclusão
export type ExclusionReason = 'WRONG_NUMBER' | 'NO_INTEREST' | 'NO_PROFILE' | 'NO_CONTACT' | null;

export type TipoTrabalho = 'CLT' | 'AUTONOMO' | 'FUNCIONARIO_PUBLICO' | null;

export type FaixaMCMV = 'FAIXA_1' | 'FAIXA_2' | 'FAIXA_3' | 'FORA' | null;

export interface MCMVQualification {
  id: string;
  leadId: string;
  rendaFamiliar: string | null;
  faixaMcmv: FaixaMCMV;
  fgtsDisponivel: string | null;
  temImovel: boolean | null;
  jaUsouMcmv: boolean | null;
  tipoTrabalho: TipoTrabalho;
  qualificado: boolean | null;
  naoQualificaMotivo: string | null;
  preenchidoPor: string | null;
  createdAt: string;
  updatedAt: string;
}

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
  lastBrokerWhatsappAt: string | null;
  exclusionReason: ExclusionReason;
  // Campos MCMV
  rendaDeclarada: string | null;       // Vem do formulário Facebook (opcional)
  tipoTrabalho: TipoTrabalho;          // CLT | AUTONOMO | FUNCIONARIO_PUBLICO (opcional)
  product: string | null;              // Produto/empreendimento (vem do Make como 'produto'/'product')
  lostReason: LostReason;              // Motivo de perda ao ir para ABANDONED
  visitaConfirmada: boolean | null;    // Lead confirmou presença antes da visita
  // Ciclo de vida — adicionados em 2026-04
  contactAttempts: number;             // Tentativas de contato sem resposta
  lastAttemptAt: string | null;        // Última tentativa de contato
  negotiatingSince: string | null;     // Quando entrou em NEGOTIATING (alerta 5 dias)
  followupStartedAt: string | null;    // Quando entrou em FOLLOW_UP_AUTO
  originalBrokerId: string | null;     // Corretor original antes de redistribuição
  redistributionCount: number;         // Quantas vezes foi redistribuído
  reactivatedAt: string | null;        // Quando o lead respondeu ao bot e foi reativado
  pauseAutoMessages: boolean;          // Corretor pausou envios automáticos — está em conversa ativa
}

// Labels para exibição na UI
export const STATUS_LABEL: Record<LeadStatus, string> = {
  NEW:              'Novo',
  IN_PROGRESS:      'Em Atendimento',
  NEGOTIATING:      'Negociando',
  VISIT_SCHEDULED:  'Visita Agendada',
  VISITA_REALIZADA: 'Visita Realizada',
  DOCS_REQUESTED:   'Docs Enviados',
  CONCLUDED:        'Fechado',
  FOLLOW_UP_AUTO:   'Follow-up Auto',
  REACTIVATED:      'Reativado',
  ABANDONED:        'Perdido',
  EXCLUDED:         'Excluído',
};

export const LOST_REASON_LABEL: Record<NonNullable<LostReason>, string> = {
  RENDA_FORA_FAIXA:   'Renda fora da faixa',
  JA_TEM_IMOVEL:      'Já tem imóvel no nome',
  JA_USOU_PROGRAMA:   'Já usou o programa antes',
  FGTS_INSUFICIENTE:  'FGTS insuficiente',
  REPROVADO_CREDITO:  'Reprovado na análise de crédito',
  NAO_COMPARECEU:     'Não compareceu à visita',
  FOI_CONCORRENTE:    'Foi para concorrente',
  DESISTIU:           'Desistiu / mudou de plano',
  SEM_RETORNO:        'Sem retorno após contatos',
};

export const TIPO_TRABALHO_LABEL: Record<NonNullable<TipoTrabalho>, string> = {
  CLT:                'CLT',
  AUTONOMO:           'Autônomo',
  FUNCIONARIO_PUBLICO:'Func. Público',
};

// Faixas de renda MCMV (2024)
export const FAIXA_MCMV: Record<NonNullable<FaixaMCMV>, { label: string; max: number; color: string }> = {
  FAIXA_1: { label: 'Faixa 1', max: 2640,  color: 'text-emerald-400' },
  FAIXA_2: { label: 'Faixa 2', max: 4400,  color: 'text-sky-400' },
  FAIXA_3: { label: 'Faixa 3', max: 8000,  color: 'text-indigo-400' },
  FORA:    { label: 'Fora da faixa', max: 0, color: 'text-red-400' },
};

// Progressão do funil para o corretor
export const NEXT_STATUS: Partial<Record<LeadStatus, { status: LeadStatus; label: string }>> = {
  NEW:              { status: 'IN_PROGRESS',      label: 'Iniciar atendimento' },
  IN_PROGRESS:      { status: 'VISIT_SCHEDULED',  label: 'Agendar visita' },
  NEGOTIATING:      { status: 'VISIT_SCHEDULED',  label: 'Agendar visita' },
  REACTIVATED:      { status: 'IN_PROGRESS',      label: 'Retomar atendimento' },
  VISIT_SCHEDULED:  { status: 'VISITA_REALIZADA', label: 'Confirmar comparecimento' },
  VISITA_REALIZADA: { status: 'DOCS_REQUESTED',   label: 'Docs recebidos' },
  DOCS_REQUESTED:   { status: 'CONCLUDED',        label: 'Fechar venda 🎉' },
};
