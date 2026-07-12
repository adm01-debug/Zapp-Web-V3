
-- 1) departments: drop permissive SELECT and restrict to admins/supervisors
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'departments' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.departments', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Admins and supervisors can view departments"
ON public.departments
FOR SELECT
TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));

-- 2) instance_registry: drop permissive SELECT and restrict to admins/supervisors
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'instance_registry' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.instance_registry', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Admins and supervisors can view instance registry"
ON public.instance_registry
FOR SELECT
TO authenticated
USING (public.is_admin_or_supervisor(auth.uid()));

-- Remove instance_registry from realtime publication so changes aren't broadcast
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'instance_registry'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.instance_registry';
  END IF;
END $$;

-- 3) conversation_transfers: fix broken SELECT policy that uses auth.uid() vs profile.id
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'conversation_transfers' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.conversation_transfers', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Agents can view their own transfers"
ON public.conversation_transfers
FOR SELECT
TO authenticated
USING (
  public.is_admin_or_supervisor(auth.uid())
  OR from_agent_id = public.get_profile_id_for_user(auth.uid())
  OR to_agent_id = public.get_profile_id_for_user(auth.uid())
);

-- 4) audit_logs: remove the public INSERT policy and restrict to authenticated
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_logs' AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.audit_logs', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Authenticated users can insert their own audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
