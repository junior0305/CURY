-- Drop the old permissive policy
DROP POLICY IF EXISTS profiles_select_policy ON public.profiles;

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
    SELECT 1 FROM profiles 
    WHERE (profiles.id = auth.uid() AND profiles.role = 'SUPERINTENDENT')
  ))
  
  OR
  
  -- Rule 3: User is a Manager and the profile belongs to one of their direct reports (Brokers)
  (EXISTS (
    SELECT 1 FROM profiles 
    WHERE (profiles.id = auth.uid() AND profiles.role = 'MANAGER')
  ) AND (manager_id = auth.uid()))
);