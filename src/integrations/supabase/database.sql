-- 1. Extensões Necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabela de Equipes
CREATE TABLE IF NOT EXISTS public.teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Tabela de Perfis (Profiles)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  role TEXT DEFAULT 'BROKER',
  manager_id UUID REFERENCES public.profiles(id),
  team_id UUID REFERENCES public.teams(id),
  lead_assignment_enabled BOOLEAN DEFAULT false,
  warning_count INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Tabela de Leads
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT NOT NULL,
  status TEXT DEFAULT 'NEW',
  broker_id UUID REFERENCES public.profiles(id),
  manager_id UUID REFERENCES public.profiles(id),
  tag TEXT,
  notes TEXT,
  exclusion_reason TEXT,
  last_nudge_at TIMESTAMP WITH TIME ZONE,
  next_action_date TIMESTAMP WITH TIME ZONE,
  last_interaction_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Tabela de Tarefas
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  due_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT DEFAULT 'OPEN',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Filas de Distribuição
CREATE TABLE IF NOT EXISTS public.distribution_queues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  match_field TEXT NOT NULL,
  match_value TEXT NOT NULL,
  broker_ids UUID[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  last_assigned_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Logs de Distribuição
CREATE TABLE IF NOT EXISTS public.distribution_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_name TEXT,
  lead_phone TEXT,
  assigned_to_name TEXT,
  queue_name TEXT,
  status TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Integrações do Sistema
CREATE TABLE IF NOT EXISTS public.system_integrations (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Logs de Webhooks
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_key TEXT,
  payload JSONB,
  status_code INTEGER,
  response_body TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. Histórico do Funil
CREATE TABLE IF NOT EXISTS public.funnel_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  broker_id UUID REFERENCES public.profiles(id),
  stage TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. Notas dos Leads
CREATE TABLE IF NOT EXISTS public.lead_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  broker_id UUID REFERENCES public.profiles(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. Notificações Internas
CREATE TABLE IF NOT EXISTS public.internal_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  from_id UUID REFERENCES public.profiles(id),
  to_id UUID REFERENCES public.profiles(id),
  message TEXT NOT NULL,
  type TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 13. Controle de Áudio Lido
CREATE TABLE IF NOT EXISTS public.audio_notifications_read (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 14. Campanhas Ativas
CREATE TABLE IF NOT EXISTS public.active_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  target_action TEXT NOT NULL,
  target_count INTEGER NOT NULL,
  reward_amount NUMERIC NOT NULL,
  is_active BOOLEAN DEFAULT true,
  ends_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 15. Configurações de Recompensa
CREATE TABLE IF NOT EXISTS public.reward_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  action_type TEXT NOT NULL,
  label TEXT NOT NULL,
  reward_type TEXT DEFAULT 'PIX',
  amount_value NUMERIC DEFAULT 0,
  target_count INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 16. Conquistas (Achievements)
CREATE TABLE IF NOT EXISTS public.achievements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.reward_configs(id),
  reward_label TEXT,
  reward_value NUMERIC,
  reward_type TEXT DEFAULT 'SYSTEM',
  status TEXT DEFAULT 'PENDING',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 17. Segurança (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_notifications_read ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;

-- Políticas de Leitura Pública/Geral
CREATE POLICY "profiles_read_all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "teams_read_all" ON public.teams FOR SELECT USING (true);
CREATE POLICY "campaigns_read_public" ON public.active_campaigns FOR SELECT USING (true);
CREATE POLICY "achievements_read_public" ON public.achievements FOR SELECT USING (true);

-- Políticas de Acesso a Leads
CREATE POLICY "leads_access_policy" ON public.leads FOR ALL USING (
  (broker_id = auth.uid()) OR 
  (manager_id = auth.uid()) OR 
  (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('SUPERINTENDENT', 'ADMIN')))
);

CREATE POLICY "profiles_update_self_or_admin" ON public.profiles FOR UPDATE USING (
  (auth.uid() = id) OR 
  (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('SUPERINTENDENT', 'ADMIN')))
);

-- 18. Funções e Gatilhos (Triggers)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, email, role)
  VALUES (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'role', 'BROKER')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.log_funnel_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR (OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.funnel_history (lead_id, broker_id, stage)
    VALUES (NEW.id, NEW.broker_id, NEW.status);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_lead_status_change
  AFTER INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.log_funnel_change();