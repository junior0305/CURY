-- Create tasks table
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID NULL REFERENCES public.leads(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'FOLLOW_UP',
  title TEXT NOT NULL,
  notes TEXT,
  due_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Clean old policies if re-running
DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;

-- SELECT: brokers see own, managers see their direct reports, superintendents see all
CREATE POLICY "tasks_select" ON public.tasks
FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'SUPERINTENDENT'
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles me
    JOIN public.profiles member ON member.manager_id = me.id
    WHERE me.id = auth.uid() AND me.role = 'MANAGER' AND member.id = tasks.user_id
  )
);

-- INSERT: user can insert their own tasks; managers can insert for their direct reports; superintendents can insert for anyone
CREATE POLICY "tasks_insert" ON public.tasks
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'SUPERINTENDENT'
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles me
    JOIN public.profiles member ON member.manager_id = me.id
    WHERE me.id = auth.uid() AND me.role = 'MANAGER' AND member.id = tasks.user_id
  )
);

-- UPDATE: user can update own; managers update their direct reports; superintendents update all
CREATE POLICY "tasks_update" ON public.tasks
FOR UPDATE TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'SUPERINTENDENT'
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles me
    JOIN public.profiles member ON member.manager_id = me.id
    WHERE me.id = auth.uid() AND me.role = 'MANAGER' AND member.id = tasks.user_id
  )
)
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'SUPERINTENDENT'
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles me
    JOIN public.profiles member ON member.manager_id = me.id
    WHERE me.id = auth.uid() AND me.role = 'MANAGER' AND member.id = tasks.user_id
  )
);

-- DELETE: user can delete own; managers delete their direct reports; superintendents delete all
CREATE POLICY "tasks_delete" ON public.tasks
FOR DELETE TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'SUPERINTENDENT'
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles me
    JOIN public.profiles member ON member.manager_id = me.id
    WHERE me.id = auth.uid() AND me.role = 'MANAGER' AND member.id = tasks.user_id
  )
);
