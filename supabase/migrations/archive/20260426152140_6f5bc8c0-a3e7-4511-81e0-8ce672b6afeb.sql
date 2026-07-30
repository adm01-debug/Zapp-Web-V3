DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'send_failures' AND n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v')
  ) THEN
    RAISE NOTICE 'SKIP 20260426152140 — public.send_failures not found';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "Authenticated can insert send failures" ON public.send_failures;

  EXECUTE $pol$
    CREATE POLICY "Service role inserts send failures"
    ON public.send_failures
    FOR INSERT
    TO service_role
    WITH CHECK (true)
  $pol$;
END $migration$;
