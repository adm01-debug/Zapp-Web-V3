-- Fix: email_app.email_health_summary and email_app.email_revalidation_jobs were
-- not in supabase_realtime publication, so subscriptions in useEmailHealthStatus.ts
-- (lines 114, 139) were silent no-ops. This migration adds both tables idempotently.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'email_app'
      AND tablename = 'email_health_summary'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE email_app.email_health_summary;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'email_app'
      AND tablename = 'email_revalidation_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE email_app.email_revalidation_jobs;
  END IF;
END $$;
