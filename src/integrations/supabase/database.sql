-- Drop the previous policy
DROP POLICY IF EXISTS profiles_select_policy_hierarchy ON public.profiles;

-- RLS Policy for profiles table
-- This policy enforces the hierarchy:
-- 1. Superintendents can see everyone.
-- 2. Managers can see themselves and their direct reports (Brokers).
-- 3. Brokers can only see themselves.
CREATE POLICY "profiles_select_policy_hierarchy" ON public.profiles
FOR SELECT TO authenticated USING (
  -- Rule 1: User can always see their own profile
  (auth.uid() = id) 
  
  OR
  
  -- Rule 2: User is a Superintendent (can see everyone)
  (EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = auth.uid() AND p.role = 'SUPERINTENDENT'
  ))
  
  OR
  
  -- Rule 3: User is a Manager and the profile belongs to one of their direct reports
  (EXISTS (
    SELECT 1 FROM public.profiles AS p
    WHERE p.id = auth.uid() AND p.role = 'MANAGER'
  ) AND (manager_id = auth.uid()))
);