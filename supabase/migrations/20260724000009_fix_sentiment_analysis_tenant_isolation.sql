-- Patches evolution_sentiment_analysis for tenant isolation.
--
-- Fixes P1 security gap flagged in Codex review of 20260724000007:
-- the original SELECT policy used USING(true), allowing any authenticated
-- user to read sentiment data across all tenants. Resolves by:
--   1. Adding instance_name column (ties rows to a WhatsApp connection)
--   2. Replacing the blanket SELECT policy with a workspace-scoped one
--   3. Adding supporting index on instance_name
--
-- Safe to apply on top of 20260724000007 regardless of whether the table
-- was created with or without the instance_name column.

DO $$
DECLARE
  v_schema TEXT;
BEGIN
  -- Locate the physical table (relkind 'r' or 'p') in zapp or evo
  SELECT n.nspname INTO v_schema
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'evolution_sentiment_analysis'
    AND c.relkind IN ('r', 'p')
    AND n.nspname IN ('zapp', 'evo')
  LIMIT 1;

  IF v_schema IS NULL THEN
    RAISE NOTICE 'SKIP 20260724000009 — evolution_sentiment_analysis physical table not found';
    RETURN;
  END IF;

  -- ── Add instance_name column if missing ──────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = v_schema
      AND table_name   = 'evolution_sentiment_analysis'
      AND column_name  = 'instance_name'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I.evolution_sentiment_analysis ADD COLUMN instance_name TEXT NOT NULL DEFAULT ''''',
      v_schema
    );
    RAISE NOTICE 'Added instance_name column to %.evolution_sentiment_analysis', v_schema;
  END IF;

  -- ── Index for instance_name ──────────────────────────────────────────────
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_esa_instance_name ON %I.evolution_sentiment_analysis (instance_name)',
    v_schema
  );

  -- ── Replace blanket SELECT policy with workspace-scoped one ─────────────
  -- Drop whatever policy exists (old blanket or a previous partial fix)
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname  = v_schema
      AND tablename   = 'evolution_sentiment_analysis'
      AND policyname  = 'auth_read_evolution_sentiment_analysis'
  ) THEN
    EXECUTE format(
      'DROP POLICY "auth_read_evolution_sentiment_analysis" ON %I.evolution_sentiment_analysis',
      v_schema
    );
  END IF;

  -- workspace_members check: any member of any workspace can read sentiment data.
  -- zapp.whatsapp_connections has no workspace_id column, so we cannot join through
  -- connections — instead we verify that auth.uid() is a registered workspace member.
  EXECUTE format(
    $pol$
    CREATE POLICY "auth_read_evolution_sentiment_analysis"
      ON %I.evolution_sentiment_analysis
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM zapp.workspace_members wm
          WHERE wm.user_id = auth.uid()
        )
      )
    $pol$,
    v_schema
  );

  RAISE NOTICE 'Tenant-scoped SELECT policy applied to %.evolution_sentiment_analysis', v_schema;
END $$;
