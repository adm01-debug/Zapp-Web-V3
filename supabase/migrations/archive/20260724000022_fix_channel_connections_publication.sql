-- Add public.channel_connections to supabase_realtime publication.
--
-- Context: safeChannelConnectionsQuery.subscribe() in safe-queries.ts listens to
-- public.channel_connections for live channel-status updates.
-- The table (created 20260318 / 20260502) was never added to the publication.
-- All postgres_changes subscriptions were silent no-ops.
--
-- Idempotent: guarded by pg_publication_tables check.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname    = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'channel_connections'
  ) THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_connections;
      RAISE NOTICE 'Added public.channel_connections to supabase_realtime';
    EXCEPTION WHEN others THEN
      RAISE WARNING 'Could not add public.channel_connections to supabase_realtime: % (%)', SQLERRM, SQLSTATE;
    END;
  ELSE
    RAISE NOTICE 'public.channel_connections already in supabase_realtime, skipping';
  END IF;
END $$;
