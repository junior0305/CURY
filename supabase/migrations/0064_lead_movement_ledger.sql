-- 0064: Ledger de movimento do funil.
-- Base para "quem moveu o funil" (efetividade) e o "Já fiz" real da Comandra no cockpit v3.
-- Registra cada mudança de status de lead. O trigger é À PROVA DE FALHA:
-- nunca pode bloquear o UPDATE do lead (o insert do ledger fica dentro de um BEGIN/EXCEPTION).
--
-- Como aplicar (precisa de acesso ao banco):
--   supabase link --project-ref vaghxnypfphhxiobnhpk   (SP)   [ou dcimeuefnhaiemrfiklj (SJC)]
--   supabase db push
-- ou cole este arquivo no SQL Editor do Supabase.

create table if not exists public.lead_movements (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null,
  manager_id  uuid,
  broker_id   uuid,
  from_status text,
  to_status   text,
  moved_by    text,            -- 'broker' | 'agent' | 'ana' | 'system' | null (atribuição refinada depois)
  created_at  timestamptz not null default now()
);

create index if not exists idx_lead_movements_mgr_date on public.lead_movements (manager_id, created_at desc);
create index if not exists idx_lead_movements_lead     on public.lead_movements (lead_id, created_at desc);

alter table public.lead_movements enable row level security;

-- Gerente lê o movimento da própria equipe
drop policy if exists lead_movements_select_manager on public.lead_movements;
create policy lead_movements_select_manager on public.lead_movements
  for select using (manager_id = auth.uid());

-- Trigger: SECURITY DEFINER (insere ignorando RLS) e à prova de falha.
create or replace function public.trg_log_lead_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    begin
      insert into public.lead_movements (lead_id, manager_id, broker_id, from_status, to_status, moved_by)
      values (new.id, new.manager_id, new.broker_id, old.status, new.status, null);
    exception when others then
      null; -- jamais deixa o ledger quebrar o update do lead
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lead_movement on public.leads;
create trigger trg_lead_movement
  after update of status on public.leads
  for each row
  execute function public.trg_log_lead_movement();

-- PRÓXIMA ETAPA (fora desta migração): atribuir moved_by ('agent'/'broker'/'ana')
-- instrumentando os pontos que mudam status (edges dos agentes, webhook do corretor, ana-handoff),
-- para o cockpit mostrar a divisão Comandra x corretor x Ana em vez do total.
