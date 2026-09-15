-- O gerente passa a enxergar o disparador.
--
-- As cinco tabelas tinham RLS com uma política só, de ADMIN/SUPERINTENDENT.
-- Enquanto o disparo era coisa de administrador isso bastava; agora que cada
-- gerente dispara pelo próprio número, ele via a aba inteira vazia — dez
-- mensagens gravadas e "nenhuma mensagem ainda" na tela.
--
-- Leitura para MANAGER, escrita continua com o admin e com as edge functions
-- (que usam service_role e não passam por RLS).
--
-- Templates são da EMPRESA e ficam visíveis a todos os gerentes de propósito:
-- a conta de WhatsApp é uma só, e um template aprovado serve para todos. Já
-- campanha é de quem criou.

create or replace function public.eh_gestor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = any (array['MANAGER','ADMIN','SUPERINTENDENT'])
  );
$$;

-- ── templates: da empresa, todos os gestores veem ──────────────────────
drop policy if exists wa_tpl_gestor on public.whatsapp_templates;
create policy wa_tpl_gestor on public.whatsapp_templates
  for select using (public.eh_gestor());

-- ── campanhas: a sua, mais as da casa (sem dono) ───────────────────────
drop policy if exists wa_camp_gestor on public.whatsapp_campaigns;
create policy wa_camp_gestor on public.whatsapp_campaigns
  for select using (
    public.eh_gestor()
    and (owner_id is null or owner_id = auth.uid() or created_by = auth.uid())
  );

drop policy if exists wa_camp_gestor_ins on public.whatsapp_campaigns;
create policy wa_camp_gestor_ins on public.whatsapp_campaigns
  for insert with check (public.eh_gestor() and created_by = auth.uid());

drop policy if exists wa_camp_gestor_upd on public.whatsapp_campaigns;
create policy wa_camp_gestor_upd on public.whatsapp_campaigns
  for update using (
    public.eh_gestor() and (owner_id = auth.uid() or created_by = auth.uid())
  );

-- ── alvos: quem enxerga a campanha enxerga os alvos dela ───────────────
drop policy if exists wa_alvo_gestor on public.whatsapp_campaign_targets;
create policy wa_alvo_gestor on public.whatsapp_campaign_targets
  for select using (
    exists (select 1 from public.whatsapp_campaigns c
            where c.id = campaign_id
              and (c.owner_id is null or c.owner_id = auth.uid() or c.created_by = auth.uid()))
    and public.eh_gestor()
  );

drop policy if exists wa_alvo_gestor_ins on public.whatsapp_campaign_targets;
create policy wa_alvo_gestor_ins on public.whatsapp_campaign_targets
  for insert with check (
    public.eh_gestor()
    and exists (select 1 from public.whatsapp_campaigns c
                where c.id = campaign_id and c.created_by = auth.uid())
  );

-- ── conversas: quem respondeu ao disparo ───────────────────────────────
-- Sem recorte por equipe: a conta de WhatsApp e a fila de resposta sao da
-- empresa, e o gerente precisa ver a conversa para intervir. Recortar por
-- corretor esconderia justamente quem ainda nao tem dono — que e o caso que
-- mais importa.
drop policy if exists wa_thread_gestor on public.whatsapp_threads;
create policy wa_thread_gestor on public.whatsapp_threads
  for select using (public.eh_gestor());

drop policy if exists wa_msg_gestor on public.whatsapp_messages;
create policy wa_msg_gestor on public.whatsapp_messages
  for select using (public.eh_gestor());

-- ── a configuracao do numero ───────────────────────────────────────────
alter table public.whatsapp_config enable row level security;
drop policy if exists wa_cfg_gestor on public.whatsapp_config;
create policy wa_cfg_gestor on public.whatsapp_config
  for select using (public.eh_gestor());

-- O token NUNCA vai para o navegador. A tela nao precisa dele, e mandar um
-- token para o cliente e o tipo de vazamento que ninguem percebe.
revoke select (token, verify_token) on public.whatsapp_config from anon, authenticated;

grant execute on function public.eh_gestor() to anon, authenticated, service_role;
