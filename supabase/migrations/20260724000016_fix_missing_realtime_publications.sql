-- Add zapp.whatsapp_connections and zapp.qr_attempts to supabase_realtime.
--
-- Previously the subscriptions in QrAttemptsPanel.tsx and connectionsRepository.ts
-- used schema: 'public', but public.whatsapp_connections and public.qr_attempts are
-- VIEWS (not physical tables) — views never emit WAL events.
-- Physical tables live in zapp schema. Subscription code is updated in the same PR
-- to use schema: 'zapp'.
--
-- Idempotent: guards with pg_publication_tables check.

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'zapp.whatsapp_connections',
    'zapp.qr_attempts'
  ])
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname    = 'supabase_realtime'
        AND schemaname = split_part(tbl, '.', 1)
        AND tablename  = split_part(tbl, '.', 2)
    ) THEN
      BEGIN
        EXECUTE format(
          'ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I',
          split_part(tbl, '.', 1), split_part(tbl, '.', 2)
        );
        RAISE NOTICE 'Added % to supabase_realtime', tbl;
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not add % to supabase_realtime: % (%)', tbl, SQLERRM, SQLSTATE;
      END;
    ELSE
      RAISE NOTICE '% already in supabase_realtime, skipping', tbl;
    END IF;
  END LOOP;
END $$;
