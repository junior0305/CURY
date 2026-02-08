-- Add lead_assignment_enabled column if it doesn't exist
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS lead_assignment_enabled BOOLEAN DEFAULT FALSE;

-- Ensure RLS is updated to allow anyone to read this flag (needed for lead distribution logic)
DROP POLICY IF EXISTS "profiles_select_public" ON public.profiles;
CREATE POLICY "profiles_select_public" ON public.profiles FOR SELECT TO authenticated USING (true);
