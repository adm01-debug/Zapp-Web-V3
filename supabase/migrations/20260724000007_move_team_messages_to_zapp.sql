-- Move public.team_messages to zapp schema and fix Realtime publication.
--
-- Background: team_messages was created in public schema (20260402130912) and later
-- removed from supabase_realtime (20260411110716). Frontend hooks in useTeamConversations.ts
-- subscribe with schema: 'zapp' — so the table must live in zapp and be in the publication.
--
-- Steps:
--   1. Move physical table public.team_messages → zapp.team_messages (idempotent).
--   2. Create a public.team_messages VIEW proxy for backward compatibility.
--   3. Add zapp.team_messages to supabase_realtime (idempotent).

DO $$
BEGIN
  -- Step 1: Move table only if it still lives in public
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'team_messages' AND table_type = 'BASE TABLE'
  ) THEN
    ALTER TABLE public.team_messages SET SCHEMA zapp;
    RAISE NOTICE 'Moved public.team_messages to zapp schema';
  ELSE
    RAISE NOTICE 'public.team_messages not a base table (already moved or is a view), skipping ALTER TABLE';
  END IF;

  -- Step 2: Create VIEW proxy in public if none exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'team_messages'
  ) THEN
    EXECUTE $sql$
      CREATE OR REPLACE VIEW public.team_messages
        WITH (security_invoker = on)
        AS SELECT * FROM zapp.team_messages
    $sql$;
    EXECUTE $sql$
      GRANT SELECT ON public.team_messages TO authenticated, anon
    $sql$;
    RAISE NOTICE 'Created public.team_messages VIEW proxy';
  ELSE
    RAISE NOTICE 'public.team_messages view already exists, skipping';
  END IF;

  -- Step 3: Add zapp.team_messages to publication if not already present
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'zapp'
      AND tablename = 'team_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.team_messages;
    RAISE NOTICE 'Added zapp.team_messages to supabase_realtime';
  ELSE
    RAISE NOTICE 'zapp.team_messages already in supabase_realtime, skipping';
  END IF;
END $$;
