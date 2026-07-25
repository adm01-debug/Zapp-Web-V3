-- Migration: Move 5 stuck Realtime tables from public → zapp (BUG-47–BUG-51)
--
-- Problem: Frontend subscribes via schema:'zapp' to these 5 tables but all
-- physical tables remain in public → supabase_realtime publication has no
-- matching entry → all Realtime callbacks are silent no-ops.
--
-- Affected subscriber files:
--   message_reactions:         useMessageReactions.ts:33, useConversationReactionsRealtime.ts:35
--   whisper_messages:          useRealtimeInbox.ts:260, WhisperMode.tsx:101
--   team_conversations:        team-chat Realtime hooks (schema:'zapp')
--   team_conversation_members: team-chat Realtime hooks (schema:'zapp')
--   team_message_reactions:    useTeamMessageReactions.ts:58 (schema:'zapp')
--                              NOTE: zapp VIEW from 20260725000007 must be dropped first
--
-- Pattern per table (fully idempotent):
--   a. Drop VIEW in zapp if exists (from 20260725000007 or 20260724000031)
--   b. ALTER TABLE public.X SET SCHEMA zapp  (skip if already in zapp)
--   c. GRANT on zapp.X (authenticated + service_role)
--   d. CREATE VIEW public.X WITH (security_invoker=on) → zapp.X
--   e. GRANT on public.X VIEW
--   f. ALTER PUBLICATION supabase_realtime ADD TABLE zapp.X
--
-- Notes on correctness:
--   • FK constraints reference table OIDs — SET SCHEMA preserves them without
--     any ALTER CONSTRAINT statements.
--   • RLS policies, indexes, triggers all move with the table via OID.
--   • public.is_team_conversation_member() references public.team_conversation_members
--     which becomes a VIEW proxy → zapp; SECURITY DEFINER runs as owner, bypasses
--     the VIEW's security_invoker — no recursion.
--   • Sequences stay in public but remain owned by the column; nextval() still works.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. message_reactions
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- a. Drop any zapp VIEW created by prior migrations
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'message_reactions' AND n.nspname = 'zapp' AND c.relkind = 'v'
  ) THEN
    DROP VIEW zapp.message_reactions;
    RAISE NOTICE '[1] Dropped VIEW zapp.message_reactions';
  END IF;

  -- b. Move physical table from public → zapp
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'message_reactions' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    ALTER TABLE public.message_reactions SET SCHEMA zapp;
    RAISE NOTICE '[1] Moved public.message_reactions → zapp';
  ELSIF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'message_reactions' AND n.nspname = 'zapp' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE '[1] message_reactions already in zapp — skipping move';
  ELSE
    RAISE WARNING '[1] message_reactions not found in public or zapp';
  END IF;

  -- c. Grant on physical table
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.message_reactions TO authenticated';
  EXECUTE 'GRANT ALL ON zapp.message_reactions TO service_role';

  -- d. Create public VIEW proxy
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'message_reactions' AND n.nspname = 'public'
  ) THEN
    EXECUTE $ddl$
      CREATE VIEW public.message_reactions
        WITH (security_invoker = on)
      AS SELECT * FROM zapp.message_reactions
    $ddl$;
    RAISE NOTICE '[1] Created public.message_reactions VIEW proxy → zapp';
  ELSE
    RAISE NOTICE '[1] public.message_reactions already exists — skipping VIEW creation';
  END IF;

  -- e. Grant on VIEW
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_reactions TO authenticated';
  EXECUTE 'GRANT ALL ON public.message_reactions TO service_role';

  -- f. Add zapp physical table to publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'zapp'
      AND tablename = 'message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.message_reactions;
    RAISE NOTICE '[1] Added zapp.message_reactions to supabase_realtime';
  ELSE
    RAISE NOTICE '[1] zapp.message_reactions already in supabase_realtime';
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. whisper_messages
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- a. Drop any zapp VIEW
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'whisper_messages' AND n.nspname = 'zapp' AND c.relkind = 'v'
  ) THEN
    DROP VIEW zapp.whisper_messages;
    RAISE NOTICE '[2] Dropped VIEW zapp.whisper_messages';
  END IF;

  -- b. Move physical table
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'whisper_messages' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    ALTER TABLE public.whisper_messages SET SCHEMA zapp;
    RAISE NOTICE '[2] Moved public.whisper_messages → zapp';
  ELSIF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'whisper_messages' AND n.nspname = 'zapp' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE '[2] whisper_messages already in zapp — skipping move';
  ELSE
    RAISE WARNING '[2] whisper_messages not found in public or zapp';
  END IF;

  -- c. Grant on physical table
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.whisper_messages TO authenticated';
  EXECUTE 'GRANT ALL ON zapp.whisper_messages TO service_role';

  -- d. Create public VIEW proxy
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'whisper_messages' AND n.nspname = 'public'
  ) THEN
    EXECUTE $ddl$
      CREATE VIEW public.whisper_messages
        WITH (security_invoker = on)
      AS SELECT * FROM zapp.whisper_messages
    $ddl$;
    RAISE NOTICE '[2] Created public.whisper_messages VIEW proxy → zapp';
  ELSE
    RAISE NOTICE '[2] public.whisper_messages already exists — skipping VIEW creation';
  END IF;

  -- e. Grant on VIEW
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.whisper_messages TO authenticated';
  EXECUTE 'GRANT ALL ON public.whisper_messages TO service_role';

  -- f. Add to publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'zapp'
      AND tablename = 'whisper_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.whisper_messages;
    RAISE NOTICE '[2] Added zapp.whisper_messages to supabase_realtime';
  ELSE
    RAISE NOTICE '[2] zapp.whisper_messages already in supabase_realtime';
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. team_conversations  (move parent BEFORE child for clarity)
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- a. Drop any zapp VIEW (CASCADE in case dependent VIEWs exist)
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'team_conversations' AND n.nspname = 'zapp' AND c.relkind = 'v'
  ) THEN
    DROP VIEW zapp.team_conversations CASCADE;
    RAISE NOTICE '[3] Dropped VIEW zapp.team_conversations (CASCADE)';
  END IF;

  -- b. Move physical table
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'team_conversations' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    ALTER TABLE public.team_conversations SET SCHEMA zapp;
    RAISE NOTICE '[3] Moved public.team_conversations → zapp';
  ELSIF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'team_conversations' AND n.nspname = 'zapp' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE '[3] team_conversations already in zapp — skipping move';
  ELSE
    RAISE WARNING '[3] team_conversations not found in public or zapp';
  END IF;

  -- c. Grant
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.team_conversations TO authenticated';
  EXECUTE 'GRANT ALL ON zapp.team_conversations TO service_role';

  -- d. Create public VIEW proxy
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'team_conversations' AND n.nspname = 'public'
  ) THEN
    EXECUTE $ddl$
      CREATE VIEW public.team_conversations
        WITH (security_invoker = on)
      AS SELECT * FROM zapp.team_conversations
    $ddl$;
    RAISE NOTICE '[3] Created public.team_conversations VIEW proxy → zapp';
  ELSE
    RAISE NOTICE '[3] public.team_conversations already exists — skipping VIEW creation';
  END IF;

  -- e. Grant on VIEW
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_conversations TO authenticated';
  EXECUTE 'GRANT ALL ON public.team_conversations TO service_role';

  -- f. Add to publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'zapp'
      AND tablename = 'team_conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.team_conversations;
    RAISE NOTICE '[3] Added zapp.team_conversations to supabase_realtime';
  ELSE
    RAISE NOTICE '[3] zapp.team_conversations already in supabase_realtime';
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. team_conversation_members  (child of team_conversations)
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- a. Drop any zapp VIEW
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'team_conversation_members' AND n.nspname = 'zapp' AND c.relkind = 'v'
  ) THEN
    DROP VIEW zapp.team_conversation_members;
    RAISE NOTICE '[4] Dropped VIEW zapp.team_conversation_members';
  END IF;

  -- b. Move physical table
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'team_conversation_members' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    ALTER TABLE public.team_conversation_members SET SCHEMA zapp;
    RAISE NOTICE '[4] Moved public.team_conversation_members → zapp';
  ELSIF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'team_conversation_members' AND n.nspname = 'zapp' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE '[4] team_conversation_members already in zapp — skipping move';
  ELSE
    RAISE WARNING '[4] team_conversation_members not found in public or zapp';
  END IF;

  -- c. Grant
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.team_conversation_members TO authenticated';
  EXECUTE 'GRANT ALL ON zapp.team_conversation_members TO service_role';

  -- d. Create public VIEW proxy
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'team_conversation_members' AND n.nspname = 'public'
  ) THEN
    EXECUTE $ddl$
      CREATE VIEW public.team_conversation_members
        WITH (security_invoker = on)
      AS SELECT * FROM zapp.team_conversation_members
    $ddl$;
    RAISE NOTICE '[4] Created public.team_conversation_members VIEW proxy → zapp';
  ELSE
    RAISE NOTICE '[4] public.team_conversation_members already exists — skipping VIEW creation';
  END IF;

  -- e. Grant on VIEW
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_conversation_members TO authenticated';
  EXECUTE 'GRANT ALL ON public.team_conversation_members TO service_role';

  -- f. Add to publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'zapp'
      AND tablename = 'team_conversation_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.team_conversation_members;
    RAISE NOTICE '[4] Added zapp.team_conversation_members to supabase_realtime';
  ELSE
    RAISE NOTICE '[4] zapp.team_conversation_members already in supabase_realtime';
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. team_message_reactions
--    SPECIAL: zapp.team_message_reactions VIEW was created in 20260725000007 as a
--    proxy to public.team_message_reactions — must DROP before SET SCHEMA or
--    PostgreSQL will reject the name collision.
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  -- a. Drop VIEW in zapp (from 20260725000007)
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'team_message_reactions' AND n.nspname = 'zapp' AND c.relkind = 'v'
  ) THEN
    DROP VIEW zapp.team_message_reactions;
    RAISE NOTICE '[5] Dropped VIEW zapp.team_message_reactions (from 20260725000007)';
  END IF;

  -- b. Move physical table
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'team_message_reactions' AND n.nspname = 'public' AND c.relkind = 'r'
  ) THEN
    ALTER TABLE public.team_message_reactions SET SCHEMA zapp;
    RAISE NOTICE '[5] Moved public.team_message_reactions → zapp';
  ELSIF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'team_message_reactions' AND n.nspname = 'zapp' AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE '[5] team_message_reactions already in zapp — skipping move';
  ELSE
    RAISE WARNING '[5] team_message_reactions not found in public or zapp';
  END IF;

  -- c. Grant on physical table (supersedes VIEW grants from 20260725000007)
  EXECUTE 'GRANT SELECT, INSERT, DELETE ON zapp.team_message_reactions TO authenticated';
  EXECUTE 'GRANT ALL ON zapp.team_message_reactions TO service_role';

  -- d. Create public VIEW proxy (replaces the old public→zapp VIEW that was dropped)
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'team_message_reactions' AND n.nspname = 'public'
  ) THEN
    EXECUTE $ddl$
      CREATE VIEW public.team_message_reactions
        WITH (security_invoker = on)
      AS SELECT * FROM zapp.team_message_reactions
    $ddl$;
    RAISE NOTICE '[5] Created public.team_message_reactions VIEW proxy → zapp';
  ELSE
    RAISE NOTICE '[5] public.team_message_reactions already exists — skipping VIEW creation';
  END IF;

  -- e. Grant on VIEW
  EXECUTE 'GRANT SELECT, INSERT, DELETE ON public.team_message_reactions TO authenticated';
  EXECUTE 'GRANT ALL ON public.team_message_reactions TO service_role';

  -- f. Add to publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'zapp'
      AND tablename = 'team_message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.team_message_reactions;
    RAISE NOTICE '[5] Added zapp.team_message_reactions to supabase_realtime';
  ELSE
    RAISE NOTICE '[5] zapp.team_message_reactions already in supabase_realtime';
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Remove public.team_message_reactions from supabase_realtime if it was added
-- by earlier migrations (now superseded by zapp.team_message_reactions above).
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'team_message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.team_message_reactions;
    RAISE NOTICE '[5] Removed public.team_message_reactions from supabase_realtime (now a VIEW)';
  END IF;
END;
$$;
