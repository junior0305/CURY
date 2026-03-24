import { createClient } from '@supabase/supabase-js';
import { getSelectedCompany } from './companies';

const company = getSelectedCompany();

export const supabase = createClient(company.url, company.anonKey);
