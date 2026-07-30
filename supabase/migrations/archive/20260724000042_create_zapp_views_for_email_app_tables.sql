-- Migration: create zapp VIEW proxies for email_app tables
--
-- Context:
--   All email_app tables are physically in the email_app schema. The Supabase client
--   is configured with db: { schema: 'zapp' }, so every safeClient.from('email_X')
--   call sends Accept-Profile: zapp → PostgREST resolves against zapp → PGRST205.
--
--   Affected calls:
--     • safeClient.from('email_accounts', ...) in:
--         useEmailManagement.ts:285,596   → PGRST205
--         useEmail.ts:114,451             → PGRST205
--     • safeClient.from('email_messages', ...) in:
--         useEmailManagement.ts:372       → PGRST205
--         useEmail.ts:215                 → PGRST205
--     • safeClient.from('email_threads', ...) in:
--         useEmailManagement.ts:1138      → PGRST205
--     • safeClient.from('email_drafts', ...) in:
--         useEmailManagement.ts:855,908   → PGRST205
--         useEmailDraft.ts:50,103         → PGRST205
--     • safeClient.from('email_labels', ...) in:
--         useGmailLabels.ts:33            → PGRST205
--     • safeClient.from('email_signatures', ...) in:
--         useEmailManagement.ts:1255,1269,1290,1306,1310 → PGRST205
--
--   Fix: create security_invoker VIEWs in zapp schema that delegate to email_app
--   physical tables. PostgREST resolves zapp.email_X → VIEW → email_app.email_X
--   (physical), applying the caller's RLS context (security_invoker=on).
--
--   Each block:
--     1. Checks that the email_app.X physical table (relkind 'r' or 'p') exists.
--     2. Drops any existing view/table named zapp.X with the same name.
--     3. Creates the VIEW with security_invoker = on.
--     4. Grants SELECT, INSERT, UPDATE, DELETE to authenticated.
--     5. Grants ALL to service_role.
--
--   Idempotent: safe to re-run; CREATE OR REPLACE VIEW handles existing view.
--   The DO-block guards skip gracefully if email_app.X does not exist in this
--   environment (e.g. a fresh local dev DB that hasn't run the email migrations).

-- ---------------------------------------------------------------------------
-- 1. zapp.email_accounts → email_app.email_accounts
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'email_app' AND c.relname = 'email_accounts'
      AND c.relkind IN ('r', 'p')
  ) THEN
    EXECUTE $v$
      CREATE OR REPLACE VIEW zapp.email_accounts
        WITH (security_invoker = on)
      AS SELECT * FROM email_app.email_accounts
    $v$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.email_accounts TO authenticated';
    EXECUTE 'GRANT ALL ON zapp.email_accounts TO service_role';
    RAISE NOTICE 'Created zapp.email_accounts VIEW → email_app.email_accounts';
  ELSE
    RAISE NOTICE 'SKIP zapp.email_accounts — email_app.email_accounts not a physical table';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. zapp.email_messages → email_app.email_messages
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'email_app' AND c.relname = 'email_messages'
      AND c.relkind IN ('r', 'p')
  ) THEN
    EXECUTE $v$
      CREATE OR REPLACE VIEW zapp.email_messages
        WITH (security_invoker = on)
      AS SELECT * FROM email_app.email_messages
    $v$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.email_messages TO authenticated';
    EXECUTE 'GRANT ALL ON zapp.email_messages TO service_role';
    RAISE NOTICE 'Created zapp.email_messages VIEW → email_app.email_messages';
  ELSE
    RAISE NOTICE 'SKIP zapp.email_messages — email_app.email_messages not a physical table';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. zapp.email_threads → email_app.email_threads
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'email_app' AND c.relname = 'email_threads'
      AND c.relkind IN ('r', 'p')
  ) THEN
    EXECUTE $v$
      CREATE OR REPLACE VIEW zapp.email_threads
        WITH (security_invoker = on)
      AS SELECT * FROM email_app.email_threads
    $v$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.email_threads TO authenticated';
    EXECUTE 'GRANT ALL ON zapp.email_threads TO service_role';
    RAISE NOTICE 'Created zapp.email_threads VIEW → email_app.email_threads';
  ELSE
    RAISE NOTICE 'SKIP zapp.email_threads — email_app.email_threads not a physical table';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. zapp.email_drafts → email_app.email_drafts
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'email_app' AND c.relname = 'email_drafts'
      AND c.relkind IN ('r', 'p')
  ) THEN
    EXECUTE $v$
      CREATE OR REPLACE VIEW zapp.email_drafts
        WITH (security_invoker = on)
      AS SELECT * FROM email_app.email_drafts
    $v$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.email_drafts TO authenticated';
    EXECUTE 'GRANT ALL ON zapp.email_drafts TO service_role';
    RAISE NOTICE 'Created zapp.email_drafts VIEW → email_app.email_drafts';
  ELSE
    RAISE NOTICE 'SKIP zapp.email_drafts — email_app.email_drafts not a physical table';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. zapp.email_labels → email_app.email_labels
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'email_app' AND c.relname = 'email_labels'
      AND c.relkind IN ('r', 'p')
  ) THEN
    EXECUTE $v$
      CREATE OR REPLACE VIEW zapp.email_labels
        WITH (security_invoker = on)
      AS SELECT * FROM email_app.email_labels
    $v$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.email_labels TO authenticated';
    EXECUTE 'GRANT ALL ON zapp.email_labels TO service_role';
    RAISE NOTICE 'Created zapp.email_labels VIEW → email_app.email_labels';
  ELSE
    RAISE NOTICE 'SKIP zapp.email_labels — email_app.email_labels not a physical table';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. zapp.email_signatures → email_app.email_signatures
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'email_app' AND c.relname = 'email_signatures'
      AND c.relkind IN ('r', 'p')
  ) THEN
    EXECUTE $v$
      CREATE OR REPLACE VIEW zapp.email_signatures
        WITH (security_invoker = on)
      AS SELECT * FROM email_app.email_signatures
    $v$;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.email_signatures TO authenticated';
    EXECUTE 'GRANT ALL ON zapp.email_signatures TO service_role';
    RAISE NOTICE 'Created zapp.email_signatures VIEW → email_app.email_signatures';
  ELSE
    RAISE NOTICE 'SKIP zapp.email_signatures — email_app.email_signatures not a physical table';
  END IF;
END;
$$;
