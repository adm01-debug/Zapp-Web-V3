-- Re-add public.* tables that were dropped from supabase_realtime and
-- add physical tables that were never published despite active subscriptions.
--
-- Drop history (why these are missing):
--   20260401001338: dropped password_reset_requests, rate_limit_logs,
--                   security_alerts, connection_health_logs
--   20260410111418: dropped calls
--
-- Tables with active subscriptions but never added:
--   public.voice_conversion_queue   — useAudioMessagePlayer.ts
--   public.provider_message_log     — useBridgeStatus.ts
--   public.system_health_incidents  — useBridgeStatus.ts
--   public.security_audit_logs      — useSecurityAuditLogs.ts
--   public.email_revalidation_jobs  — useEmailHealthStatus.ts
--   public.audio_meme_favorites     — useAudioManagement.ts
--
-- Idempotent: each entry guarded by pg_publication_tables check.
-- Per-iteration EXCEPTION block: a single failure does not abort the rest.

DO $$
DECLARE
  tbl         text;
  schema_name text;
  table_name  text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'public.calls',
    'public.security_alerts',
    'public.password_reset_requests',
    'public.rate_limit_logs',
    'public.connection_health_logs',
    'public.voice_conversion_queue',
    'public.provider_message_log',
    'public.system_health_incidents',
    'public.security_audit_logs',
    'public.email_revalidation_jobs',
    'public.audio_meme_favorites'
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
