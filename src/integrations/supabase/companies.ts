// Cada empresa tem o seu Comandra: site e banco separados, mesmo código.
// Quem decide a empresa é o ENDEREÇO do site (comandra.com.br = Econ, planoego.comandra.com.br = Plano e
// Plano Go), não uma escolha de quem usa. A porta de entrada por domínio do login está em ./instancias.ts.
//
// A anonKey é pública por natureza (vai no navegador de todo mundo); o que protege os dados é o RLS.

export const COMPANIES = {
  sp: {
    id: 'sp',
    name: 'Econ',
    shortName: 'SP',
    color: 'emerald',
    host: 'comandra.com.br',
    /** final do login de quem é desta empresa: nome@comandra */
    dominio: 'comandra',
    /** telas de admin só para o ADMIN (diretor e super não entram)? */
    adminSoAdmin: false,
    // Migrado da Supabase paga para a stack self-hosted no VPS (13/09/2026).
    // Fica num CAMINHO do domínio, não em subdomínio: o Traefik roteia
    // /supabase por PathPrefix e remove o prefixo antes do gateway.
    url: 'https://comandra.com.br/supabase',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5MjYzNDE2LCJleHAiOjIxMDQ2MjM0MTZ9.Ohs3PVk283wk0ozzjiaZkzxGiqyECdY4i02nxInmvao',
  },
  planoego: {
    id: 'planoego',
    name: 'Plano e Plano Go',
    shortName: 'PPG',
    color: 'emerald',
    host: 'planoego.comandra.com.br',
    dominio: 'planoeplanogo',
    adminSoAdmin: true,
    // Stack própria no Portainer (planoego), banco separado do Econ (14/10/2026).
    url: 'https://planoego.comandra.com.br/supabase',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkxOTgwMDUyLCJleHAiOjIxMDczNDAwNTJ9.VaccLx0XwssRWR2feQGheFcF1473Syqhl0-7SIT3MLI',
  },
} as const;

export type CompanyId = keyof typeof COMPANIES;

/** A empresa deste site, pelo endereço. Fora dos endereços conhecidos (localhost, preview) = Econ. */
export function getSelectedCompanyId(): CompanyId {
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const achada = (Object.keys(COMPANIES) as CompanyId[]).find((id) => COMPANIES[id].host === host);
  return achada ?? 'sp';
}

/** Sem efeito: a empresa vem do endereço do site. Fica para quem ainda chama. */
export function setSelectedCompany(_id: CompanyId) {}

export function getSelectedCompany() {
  return COMPANIES[getSelectedCompanyId()];
}

/** Final do login desta empresa (nome@<dominio>). */
export const DOMINIO_LOGIN: string = getSelectedCompany().dominio;

/** Nesta empresa as telas de admin são só do ADMIN (um só, que não é o diretor). */
export const ADMIN_SO_ADMIN: boolean = getSelectedCompany().adminSoAdmin;

/** Seletor de empresa na tela: nunca (cada empresa tem o seu site). */
export const TEM_ESCOLHA = false;
