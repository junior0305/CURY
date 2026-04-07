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
    url: 'https://vaghxnypfphhxiobnhpk.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhZ2h4bnlwZnBoaHhpb2JuaHBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMjY3MzUsImV4cCI6MjA4ODYwMjczNX0.eYpXthPp2QBg140SeoF5saARdEtAfW_c1-5S2PBlRwo',
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
