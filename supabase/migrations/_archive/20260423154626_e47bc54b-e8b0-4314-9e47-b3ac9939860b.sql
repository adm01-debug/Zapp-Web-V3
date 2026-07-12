
-- 1) Allow supervisors to SELECT failed_messages (admins kept)
DROP POLICY IF EXISTS "Admins can view failed messages" ON public.failed_messages;
CREATE POLICY "Admins and supervisors can view failed messages"
  ON public.failed_messages
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- 2) Allow service_role to INSERT/UPDATE (edge functions). Admins keep insert/update too.
DROP POLICY IF EXISTS "Admins can insert failed messages" ON public.failed_messages;
DROP POLICY IF EXISTS "Admins can update failed messages" ON public.failed_messages;

CREATE POLICY "Service role and admins can insert failed messages"
  ON public.failed_messages
  FOR INSERT
  TO authenticated, service_role
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Service role admins and supervisors can update failed messages"
  ON public.failed_messages
  FOR UPDATE
  TO authenticated, service_role
  USING (
    auth.role() = 'service_role'
    OR public.is_admin_or_supervisor(auth.uid())
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- 3) Cleanup function — purge succeeded/abandoned older than 30 days
CREATE OR REPLACE FUNCTION public.cleanup_old_failed_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.failed_messages
   WHERE status IN ('succeeded', 'abandoned')
     AND COALESCE(succeeded_at, last_attempt_at, created_at) < now() - interval '30 days';
END;
$$;

-- 4) Daily cron at 03:15 UTC (idempotent: drop+recreate)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-failed-messages-daily') THEN
    PERFORM cron.unschedule('cleanup-failed-messages-daily');
  END IF;
  PERFORM cron.schedule(
    'cleanup-failed-messages-daily',
    '15 3 * * *',
    $cron$ SELECT public.cleanup_old_failed_messages(); $cron$
  );
EXCEPTION WHEN undefined_table THEN
  -- pg_cron not installed; skip silently
  NULL;
END $$;

-- 5) Realtime: ensure REPLICA IDENTITY FULL and add to publication
ALTER TABLE public.failed_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'failed_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.failed_messages';
  END IF;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;
