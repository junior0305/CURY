-- 1. Localizar o ID da Jussara e do seu gestor
-- 2. Atualizar o lead 'Alian' (ou similar) que está sem dono
UPDATE public.leads
SET 
  broker_id = (SELECT id FROM public.profiles WHERE first_name ILIKE '%Jussara%' LIMIT 1),
  manager_id = (SELECT manager_id FROM public.profiles WHERE first_name ILIKE '%Jussara%' LIMIT 1),
  status = 'NEW',
  last_interaction_at = NOW()
WHERE (name ILIKE '%Alian%' OR name ILIKE '%Allan%') 
AND broker_id IS NULL;

-- 3. Atualizar os logs de distribuição para refletir que este lead foi resgatado manualmente
UPDATE public.distribution_logs
SET 
  status = 'SUCCESS',
  assigned_to_name = (SELECT first_name || ' ' || last_name FROM public.profiles WHERE first_name ILIKE '%Jussara%' LIMIT 1) || ' (Resgate Manual)'
WHERE (lead_name ILIKE '%Alian%' OR lead_name ILIKE '%Allan%')
AND status = 'NO_BROKER_AVAILABLE';
