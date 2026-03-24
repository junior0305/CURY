import { COMPANIES, CompanyId, getSelectedCompanyId, setSelectedCompany } from '@/integrations/supabase/companies';
import { Building2 } from 'lucide-react';

interface CompanySelectorProps {
  /** Se true, renderiza como switcher compacto (para o header) */
  compact?: boolean;
}

export function CompanySelector({ compact = false }: CompanySelectorProps) {
  const selected = getSelectedCompanyId();

  if (compact) {
    return (
      <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
        {(Object.values(COMPANIES) as typeof COMPANIES[CompanyId][]).map((company) => (
          <button
            key={company.id}
            onClick={() => {
              if (company.id !== selected) setSelectedCompany(company.id as CompanyId);
            }}
            className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
              company.id === selected
                ? company.color === 'indigo'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-emerald-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {company.shortName}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3 justify-center">
        <Building2 className="w-4 h-4 text-indigo-400" />
        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Selecione a Unidade</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(Object.values(COMPANIES) as typeof COMPANIES[CompanyId][]).map((company) => (
          <button
            key={company.id}
            onClick={() => {
              if (company.id !== selected) setSelectedCompany(company.id as CompanyId);
            }}
            className={`p-4 rounded-xl border-2 transition-all text-left ${
              company.id === selected
                ? company.color === 'indigo'
                  ? 'border-indigo-500 bg-indigo-900/40'
                  : 'border-emerald-500 bg-emerald-900/40'
                : 'border-gray-700 bg-slate-800/50 hover:border-gray-500'
            }`}
          >
            <div className={`text-lg font-black ${
              company.id === selected
                ? company.color === 'indigo' ? 'text-indigo-300' : 'text-emerald-300'
                : 'text-gray-400'
            }`}>
              {company.shortName}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{company.name}</div>
            {company.id === selected && (
              <div className={`text-xs font-bold mt-1 ${
                company.color === 'indigo' ? 'text-indigo-400' : 'text-emerald-400'
              }`}>● Selecionada</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
