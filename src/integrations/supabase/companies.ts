export const COMPANIES = {
  sjc: {
    id: 'sjc',
    name: 'São José dos Campos',
    shortName: 'SJC',
    color: 'indigo',
    url: 'https://dcimeuefnhaiemrfiklj.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjaW1ldWVmbmhhaWVtcmZpa2xqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNzgyNzIsImV4cCI6MjA4Njk1NDI3Mn0.Y0DOXDbrPVzVw41f9oONjsz8ggwDYi3wZ71iPR0GCqs',
  },
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
  const stored = localStorage.getItem(STORAGE_KEY) as CompanyId | null;
  return stored && COMPANIES[stored] ? stored : 'sjc';
}

export function setSelectedCompany(id: CompanyId) {
  // Respeita o lock: se não-SUPERINTENDENT logou, a empresa fica travada
  const locked = localStorage.getItem('arena_company_locked') as CompanyId | null;
  if (locked && COMPANIES[locked]) {
    console.warn(`[CompanySelector] Troca bloqueada — usuário travado em "${locked}"`);
    return;
  }
  localStorage.setItem(STORAGE_KEY, id);
  window.location.reload();
}

export function getSelectedCompany() {
  return COMPANIES[getSelectedCompanyId()];
}
