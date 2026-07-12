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
  | 'JA_COMPROU'          // Já comprou / fechou (com concorrente ou por fora)
  | 'JA_TEM_IMOVEL'       // Já possui imóvel no nome
  | 'JA_USOU_PROGRAMA'    // Já utilizou benefício MCMV anteriormente
  | 'BACEN'               // Restrição BACEN
  | 'SERASA'              // Restrição SERASA
  | 'RESTRICAO_CPF'       // Restrição no CPF
  | 'CADIN'               // CADIN (Cadastro Informativo de Créditos)
  | 'NAO_COMPARECEU'      // Agendou visita e não compareceu, sem retorno
  | 'FOI_CONCORRENTE'     // Foi para concorrente
  | 'DESISTIU'            // Desistiu / mudou de plano
  | 'SEM_RETORNO'         // Sem retorno após múltiplos contatos
  | 'NUMERO_ERRADO'       // Número de telefone inválido / não pertence ao lead
  | 'SEM_PERFIL'          // Lead não tem perfil pra MCMV (não atende critérios)
  | 'LOCALIZACAO'         // Não interessado pela localização do produto
  | 'CLIENTE_BLOQUEOU'    // Cliente bloqueou o WhatsApp do corretor
  | 'SEM_RETORNO_LONGO'   // Lead esfriou por 14+ dias em Conversando — voltou ao pool de prospecção
  | null;

// Mantido para retrocompatibilidade com campos antigos de exclusão
export type ExclusionReason = 'WRONG_NUMBER' | 'NO_INTEREST' | 'NO_PROFILE' | 'NO_CONTACT' | null;

export type TipoTrabalho = 'CLT' | 'AUTONOMO' | 'FUNCIONARIO_PUBLICO' | null;

export type FaixaMCMV = 'FAIXA_1' | 'FAIXA_2' | 'FAIXA_3' | 'FORA' | null;

// Temperatura comportamental (só populada em IN_PROGRESS — "Conversando")
// quente: respondeu <2h OU 5+ msgs em 7d
// morno:  respondeu 2-72h OU 1-4 msgs em 7d
// frio:   >72h sem resposta e <1 msg em 7d
export type LeadTemperature = 'quente' | 'morno' | 'frio' | null;

// Origem do lead — diferencia funil pago vs prospecção vs cadastros manuais.
// Resolve confusão do manager: 9 leads novos no painel não são todos do funil.
export type LeadSource =
  | 'facebook_make'      // Veio do funil pago (Facebook → Make → incoming-lead)
  | 'cold_pool'          // Prospecção ativa (cold_contact claimed → promovido)
  | 'broker_manual'      // Corretor cadastrou (LeadForm — indicação própria)
  | 'manager_manual'     // Manager atribuiu manualmente (NewLeadModal)
  | 'secretaria_manual'  // Secretaria cadastrou
  | 'bulk_import'        // Admin importou planilha
  | string               // Valores legados em SJC (TAUBAE, whatsapp, etc)
  | null;

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
  leadTemperature: LeadTemperature;    // Calculado pelo banco — só populado em IN_PROGRESS
  temperatureUpdatedAt: string | null; // Última atualização da temperatura
  source: LeadSource;                  // Origem: funil, prospecção, manual etc.
  // Rastro da Ana (SDR). No SJC ana_qualified_at pode não existir → vem null.
  anaContactedAt: string | null;       // Ana abordou o lead
  anaQualifiedAt: string | null;       // Ana QUALIFICOU o lead (🥇 ouro)
  handoffReason: HandoffReason;        // Por que caiu pro corretor
}

// Como o lead chegou ao corretor a partir da Ana:
// 'ana_gold' = a Ana qualificou (ouro puro) · 'ana_cold' = estourou 24h sem qualificar · null = não passou pela Ana
export type HandoffReason = 'ana_gold' | 'ana_cold' | null;

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
  JA_COMPROU:         'Já comprou',
  SEM_PERFIL:         'Sem perfil',
  JA_TEM_IMOVEL:      'Já tem imóvel no nome',
  JA_USOU_PROGRAMA:   'Já usou o programa antes',
  BACEN:              'BACEN',
  SERASA:             'SERASA',
  RESTRICAO_CPF:      'Restrição CPF',
  CADIN:              'CADIN',
  LOCALIZACAO:        'Localização',
  NAO_COMPARECEU:     'Não compareceu à visita',
  FOI_CONCORRENTE:    'Foi para concorrente',
  DESISTIU:           'Desistiu / mudou de plano',
  SEM_RETORNO:        'Sem retorno após contatos',
  NUMERO_ERRADO:      'Número errado / não é do lead',
  CLIENTE_BLOQUEOU:   'Cliente bloqueou o WhatsApp',
  SEM_RETORNO_LONGO:  '14+ dias frio — voltou pra prospecção',
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
