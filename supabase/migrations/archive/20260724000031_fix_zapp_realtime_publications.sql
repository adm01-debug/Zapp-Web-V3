-- Migration: add missing physical zapp tables to supabase_realtime publication
-- Migration 20260724000023 erroneously added public.* VIEW proxies (no-op).
-- This migration adds the PHYSICAL tables in zapp.* schema.
--
-- Affected hooks:
--   zapp.notifications       → useConnectionManagement.ts:59, useConnectionAlertsPush.ts:26
--   zapp.message_reactions   → useMessageReactions.ts:33, useConversationReactionsRealtime.ts:35
--   zapp.whisper_messages    → useRealtimeInbox.ts:260
--   zapp.team_message_reactions → useTeamMessageReactions.ts:58

DO $$
DECLARE
  targets TEXT[] := ARRAY[
    'zapp.notifications',
    'zapp.message_reactions',
    'zapp.whisper_messages',
    'zapp.team_message_reactions'
  ];
  t TEXT;
  schema_name TEXT;
  table_name  TEXT;
  parts       TEXT[];
  already_pub BOOLEAN;
BEGIN
  FOREACH t IN ARRAY targets LOOP
    parts       := string_to_array(t, '.');
    schema_name := parts[1];
    table_name  := parts[2];

    -- Verify physical table exists
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = schema_name
        AND c.relname  = table_name
        AND c.relkind  = 'r'  -- ordinary table only, not view
    ) THEN
      RAISE WARNING 'Table %.% does not exist as a physical table — skipping', schema_name, table_name;
      CONTINUE;
    END IF;

    -- Check if already in publication
    SELECT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname   = 'supabase_realtime'
        AND schemaname = schema_name
        AND tablename  = table_name
    ) INTO already_pub;

    IF NOT already_pub THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I', schema_name, table_name);
      RAISE NOTICE 'Added %.% to supabase_realtime', schema_name, table_name;
    ELSE
      RAISE NOTICE '%.% already in supabase_realtime — skipping', schema_name, table_name;
    END IF;
  END LOOP;
END;
$$;
