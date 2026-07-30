-- Fix remaining missing supabase_realtime publications.
--
-- Context: These tables are physical tables in `public` or `email_app` schema that
-- have never been added to the supabase_realtime publication, making all
-- postgres_changes subscriptions from the frontend silent no-ops.
--
-- Tables already in the publication (added previously, never dropped) that just
-- needed subscription schema corrections in client code (no migration needed):
--   public.notifications         (added 20251228173815)
--   public.security_alerts       (added 20260703110001 QA Round 3)
--   public.password_reset_requests (added 20260703110001 QA Round 3)
--   public.hmac_selftest_audit   (added 20260425154654)
--   public.email_health_summary  (added 20260506190146)
--
-- Tables that have NEVER been added to the publication (fixed here):
--   public.security_audit_logs   (created 20260528105941 / 20260701120000)
--   public.audio_meme_favorites  (created 20260619162007)
--   public.email_revalidation_jobs (created 20260711)
--   public.provider_message_log  (created 20260426/20260502)
--   public.system_health_incidents (created 20260507)
--   email_app.email_threads      (physical table; public.email_threads is a view added
--                                  to pub in 20260403 but views emit no WAL events)
--
-- Idempotent: each table is guarded by a pg_publication_tables check.

DO $$
DECLARE
  tbl         text;
  schema_name text;
  table_name  text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'public.security_audit_logs',    -- useSecurityAuditLogs.ts subscription
    'public.audio_meme_favorites',   -- useAudioManagement.ts audio_meme_favorites sub
    'public.email_revalidation_jobs',-- useEmailHealthStatus.ts email_revalidation sub
    'public.provider_message_log',   -- useBridgeStatus.ts traffic subscription
    'public.system_health_incidents',-- useBridgeStatus.ts health-incidents subscription
    'email_app.email_threads'        -- useEmail.ts / useEmailManagement.ts subscriptions
  ])
  LOOP
    schema_name := split_part(tbl, '.', 1);
    table_name  := split_part(tbl, '.', 2);

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname    = 'supabase_realtime'
        AND schemaname = schema_name
        AND tablename  = table_name
    ) THEN
      BEGIN
        EXECUTE format(
          'ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I',
          schema_name, table_name
        );
        RAISE NOTICE 'Added %.% to supabase_realtime', schema_name, table_name;
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not add %.% to supabase_realtime: % (%)',
          schema_name, table_name, SQLERRM, SQLSTATE;
      END;
    ELSE
      RAISE NOTICE '%.% already in supabase_realtime, skipping', schema_name, table_name;
    END IF;
  END LOOP;
END $$;
