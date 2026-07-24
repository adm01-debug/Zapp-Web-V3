-- Add missing public.* tables to supabase_realtime publication.
--
-- Context: the following physical tables were subscribed in app code but were
-- not present in the supabase_realtime publication, making every subscription
-- a silent no-op (zero events delivered).
--
-- Tables fixed:
--   public.message_reactions    — useMessageReactions.ts (schema corrected from 'zapp' to 'public')
--   public.notifications        — useConnectionManagement.ts / useConnectionAlertsPush.ts
--   public.talkx_recipients     — TalkXLiveMonitor.tsx
--   public.whisper_messages     — useRealtimeInbox.ts (schema corrected from 'zapp' to 'public')
--   public.team_message_reactions — useTeamMessageReactions.ts (schema corrected from 'zapp' to 'public')
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
    'public.message_reactions',
    'public.notifications',
    'public.talkx_recipients',
    'public.whisper_messages',
    'public.team_message_reactions'
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
