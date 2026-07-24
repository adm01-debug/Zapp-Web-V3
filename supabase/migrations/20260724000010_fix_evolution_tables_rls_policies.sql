-- Addresses two P1 security findings from Codex review on PR #499:
--
-- P1-A (migrations 20260724000007 + 20260724000009):
--   The CREATE POLICY block referenced wc.workspace_id which does NOT exist in
--   zapp.whatsapp_connections (the column is absent from the table definition).
--   PostgreSQL raised an undefined_column error during the policy expression parse,
--   rolling back the DO $$ block — the instance_name column was never added and
--   the blanket auth_full_access (FOR ALL USING(true)) policy was never replaced.
--
-- P1-B (migrations 20260724000007 + 20260724000008):
--   Nine evolution tables in the evo schema had auth_full_access FOR ALL USING(true),
--   granting any authenticated Supabase user unrestricted INSERT/UPDATE/DELETE on
--   operational data: message queues, deals, follow-ups, chatbot logs, sentiment rows.
--
-- Fix strategy:
--   1. Add instance_name column to evo.evolution_sentiment_analysis (if missing).
--   2. For all 9 tables: drop the blanket auth_full_access (FOR ALL) policy and
--      replace it with a SELECT-only policy scoped to workspace members.
--   3. Ensure a proper service_role_full policy exists on each table.
--
-- Workspace scoping approach:
--   zapp.whatsapp_connections has no workspace_id column, so we cannot join
--   connections → workspace_members as the original code attempted. Instead we
--   verify that auth.uid() exists as a row in zapp.workspace_members, which is
--   the authoritative "registered platform user" table in this single-tenant
--   self-hosted environment. This is strictly more restrictive than USING(true)
--   (requires workspace membership), while still allowing all members to access
--   all evolution data consistently with the existing production policy pattern.
--
-- This migration is idempotent and safe to apply on top of any prior state.

DO $$
DECLARE
  tbl TEXT;
  schemas TEXT[];
  v_schema TEXT;
BEGIN
  -- ── 1. Add instance_name to evolution_sentiment_analysis if missing ────────
  SELECT n.nspname INTO v_schema
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'evolution_sentiment_analysis'
    AND c.relkind IN ('r', 'p')
    AND n.nspname IN ('zapp', 'evo')
  LIMIT 1;

  IF v_schema IS NOT NULL THEN
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
      RAISE NOTICE 'Added instance_name to %.evolution_sentiment_analysis', v_schema;
    END IF;

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_esa_instance_name ON %I.evolution_sentiment_analysis (instance_name)',
      v_schema
    );
  END IF;

  -- ── 2. Fix RLS on all 9 evolution tables ──────────────────────────────────
  FOR tbl IN SELECT unnest(ARRAY[
    'evolution_bitrix_queue',
    'evolution_chatbot_responses',
    'evolution_deals',
    'evolution_followups',
    'evolution_message_queue',
    'evolution_message_templates',
    'evolution_performance_metrics',
    'evolution_sentiment_analysis',
    'evolution_tags'
  ]) LOOP

    -- Locate physical table
    SELECT n.nspname INTO v_schema
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = tbl
      AND c.relkind IN ('r', 'p')
      AND n.nspname IN ('zapp', 'evo')
    LIMIT 1;

    IF v_schema IS NULL THEN
      RAISE NOTICE 'SKIP % — physical table not found', tbl;
      CONTINUE;
    END IF;

    -- Ensure RLS is enabled
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', v_schema, tbl);

    -- Ensure GRANT for authenticated (SELECT) and service_role (ALL)
    EXECUTE format('GRANT ALL ON TABLE %I.%I TO service_role', v_schema, tbl);
    EXECUTE format('GRANT SELECT ON TABLE %I.%I TO authenticated', v_schema, tbl);

    -- ── Drop blanket auth policies (FOR ALL) left from pre-migration state ──
    -- These allow authenticated users to INSERT/UPDATE/DELETE, which is wrong.
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = v_schema AND tablename = tbl
        AND policyname = 'auth_full_access'
    ) THEN
      EXECUTE format('DROP POLICY "auth_full_access" ON %I.%I', v_schema, tbl);
      RAISE NOTICE 'Dropped auth_full_access on %.%', v_schema, tbl;
    END IF;

    -- Also drop any previously attempted but misnamed service_role policy
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = v_schema AND tablename = tbl
        AND policyname = 'service_full_access'
    ) THEN
      EXECUTE format('DROP POLICY "service_full_access" ON %I.%I', v_schema, tbl);
      RAISE NOTICE 'Dropped service_full_access on %.%', v_schema, tbl;
    END IF;

    -- ── (Re)create service_role policy ──────────────────────────────────────
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = v_schema AND tablename = tbl
        AND policyname = 'service_role_full_' || tbl
    ) THEN
      EXECUTE format(
        'CREATE POLICY "service_role_full_%s" ON %I.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        tbl, v_schema, tbl
      );
    END IF;

    -- ── (Re)create SELECT-only policy for authenticated workspace members ────
    -- Drop stale SELECT-only blanket policy from migration 20260724000008
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = v_schema AND tablename = tbl
        AND policyname = 'auth_read_' || tbl
    ) THEN
      EXECUTE format('DROP POLICY "auth_read_%s" ON %I.%I', tbl, v_schema, tbl);
    END IF;

    EXECUTE format(
      $pol$
      CREATE POLICY "auth_read_%s"
        ON %I.%I FOR SELECT TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM zapp.workspace_members wm
            WHERE wm.user_id = auth.uid()
          )
        )
      $pol$,
      tbl, v_schema, tbl
    );

    RAISE NOTICE 'RLS policies updated on %.%', v_schema, tbl;
  END LOOP;
END $$;
