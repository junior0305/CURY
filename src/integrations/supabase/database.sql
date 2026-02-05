-- Add lead_assignment_enabled column
ALTER TABLE public.profiles ADD COLUMN lead_assignment_enabled BOOLEAN DEFAULT FALSE;

-- RLS Policy Update for Admin Access:
-- We need to allow Superintendents and Managers to view/update their team members.

-- 1. Define a function to check if the current user is a Superintendent or Manager
CREATE OR REPLACE FUNCTION public.is_manager_or_superintendent(user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = user_id
    AND role IN ('SUPERINTENDENT', 'MANAGER')
  );
$$;

-- 2. Update SELECT policy: Allow authenticated users to view their team or all profiles if Superintendent.
DROP POLICY IF EXISTS profiles_select_policy ON public.profiles;
CREATE POLICY "Allow authenticated users to view their team or all profiles if Superintendent" ON public.profiles
FOR SELECT TO authenticated USING (
  auth.uid() = id OR -- Can see self
  EXISTS (
    SELECT 1 FROM public.profiles AS manager_profile
    WHERE manager_profile.id = auth.uid()
    AND manager_profile.role = 'SUPERINTENDENT' -- Superintendent can see all
  ) OR
  (
    EXISTS (
      SELECT 1 FROM public.profiles AS manager_profile
      WHERE manager_profile.id = auth.uid()
      AND manager_profile.role = 'MANAGER' -- Manager can see their team
    ) AND manager_id = auth.uid()
  )
);

-- 3. Update UPDATE policy: Allow Superintendents/Managers to update their team's profiles, and everyone to update themselves.
DROP POLICY IF EXISTS profiles_update_policy ON public.profiles;
CREATE POLICY "Allow authenticated users to update their team or self profiles" ON public.profiles
FOR UPDATE TO authenticated USING (
  auth.uid() = id OR -- Can update self
  EXISTS (
    SELECT 1 FROM public.profiles AS manager_profile
    WHERE manager_profile.id = auth.uid()
    AND manager_profile.role = 'SUPERINTENDENT' -- Superintendent can update all
  ) OR
  (
    EXISTS (
      SELECT 1 FROM public.profiles AS manager_profile
      WHERE manager_profile.id = auth.uid()
      AND manager_profile.role = 'MANAGER' -- Manager can update their team
    ) AND manager_id = auth.uid()
  )
);