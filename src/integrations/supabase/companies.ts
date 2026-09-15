// Um ambiente só: São Paulo.
//
// São José dos Campos saiu de operação. Ficava aqui como segunda opção e era o
// PADRÃO de quem nunca escolheu — navegador novo, cache limpo, usuário novo
// caíam num banco morto e achavam que o Comandra não funcionava.
//
// A forma de dicionário continua porque o resto do código consulta por id, e
// porque um dia pode haver outra praça. O que mudou é que a lista tem um item
// e o padrão não depende de escolha de ninguém.

export const COMPANIES = {
  sp: {
    id: 'sp',
    name: 'São Paulo',
    shortName: 'SP',
    color: 'emerald',
    // Migrado da Supabase paga para a stack self-hosted no VPS (13/09/2026).
    // Fica num CAMINHO do domínio, não em subdomínio: o Traefik roteia
    // /supabase por PathPrefix e remove o prefixo antes do gateway.
    url: 'https://comandra.com.br/supabase',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5MjYzNDE2LCJleHAiOjIxMDQ2MjM0MTZ9.Ohs3PVk283wk0ozzjiaZkzxGiqyECdY4i02nxInmvao',
  },
} as const;

export type CompanyId = keyof typeof COMPANIES;

const STORAGE_KEY = 'arena_company';

export function getSelectedCompanyId(): CompanyId {
  // Quem tem 'sjc' guardado do tempo em que havia duas praças cai aqui e é
  // devolvido para 'sp' sem precisar limpar nada no navegador.
  const stored = localStorage.getItem(STORAGE_KEY) as CompanyId | null;
  return stored && COMPANIES[stored] ? stored : 'sp';
}

export function setSelectedCompany(id: CompanyId) {
  const locked = localStorage.getItem('arena_company_locked') as CompanyId | null;
  if (locked && COMPANIES[locked]) return;
  localStorage.setItem(STORAGE_KEY, id);
  window.location.reload();
}

export function getSelectedCompany() {
  return COMPANIES[getSelectedCompanyId()];
}

/** Há mais de uma praça para escolher? Hoje não — o seletor some sozinho. */
export const TEM_ESCOLHA = Object.keys(COMPANIES).length > 1;
