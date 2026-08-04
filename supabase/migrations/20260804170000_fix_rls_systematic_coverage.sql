-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260804170000_fix_rls_systematic_coverage.sql
--
-- PURPOSE: Systematic RLS activation for tables whose policies are defined but
--          were never activated (inert), plus bpm schema baseline protection,
--          plus a constraint fix for whatsapp_connections health_status_check.
--
-- AGENT 5 FINDINGS ADDRESSED:
--   GAP-01 (CRITICAL) — zapp: 112 tables with policies but ENABLE RLS never
--       called. Inert policies = default ALLOW for all authenticated users.
--       Tables include empresas (51k records), consent_records, sessions,
--       security_alerts, security_events, whisper_messages, all
--       conversation_* tables.
--
--   GAP-02 (CRITICAL) — evo: 172 tables/partitions with policies but ENABLE
--       RLS never called. All WhatsApp message/conversation partitions,
--       contacts, media, and automations are unprotected across all instances.
--
--   GAP-03 (CRITICAL) — bpm: 41 tables, zero RLS enablement, zero policies.
--       Workflow definitions, execution history, human task assignments are
--       completely open. Adds baseline permissive authenticated policy;
--       business-logic policies must be layered separately.
--
--   GAP-04 (HIGH) — email_app.meta_capi_events: policy auth_secure_133 FOR ALL
--       exists but ENABLE RLS never called.
--
--   GAP-05 (HIGH) — zapp.feature_flags: covered by 20260804160000 already.
--       No action needed here.
--
--   SIDE-01 (HIGH) — zapp.whatsapp_connections: health_status_check constraint
--       is missing 'disconnected' and 'timeout' values. Edge function writes
--       both; current constraint causes CHECK violation (SQLSTATE 23514) on
--       every health status update, leaving connections stuck.
--
-- STRATEGY:
--   GAP-01/GAP-02: Dynamic DO block — find tables/partitions where:
--     (a) The schema is 'zapp' or 'evo'
--     (b) relrowsecurity = false  (RLS disabled)
--     (c) At least one policy exists in pg_policies for this table
--     Then call ALTER TABLE ... ENABLE ROW LEVEL SECURITY.
--     This is safe: existing policies become active; service_role always bypasses
--     RLS in Supabase so Edge Functions are unaffected.
--
--   GAP-03: Enable RLS on all bpm tables + add baseline SELECT/INSERT/UPDATE/
--     DELETE policy for authenticated users. Explicitly ALSO add service_role
--     bypass policy so internal tooling keeps full access.
--
--   GAP-04: One-liner ALTER TABLE email_app.meta_capi_events ENABLE ROW LEVEL SECURITY.
--
--   SIDE-01: DROP and recreate health_status_check with the full value set.
--
-- ROLLBACK (if needed — reverses RLS activation; destroys bpm baseline policies):
--   For each table in GAP-01 list: ALTER TABLE zapp.%I DISABLE ROW LEVEL SECURITY;
--   For each evo table:            ALTER TABLE evo.%I DISABLE ROW LEVEL SECURITY;
--   For each bpm table:            ALTER TABLE bpm.%I DISABLE ROW LEVEL SECURITY;
--                                  DROP POLICY IF EXISTS bpm_authenticated_baseline ON bpm.%I;
--   ALTER TABLE zapp.whatsapp_connections DROP CONSTRAINT IF EXISTS health_status_check_v2;
--   ALTER TABLE zapp.whatsapp_connections ADD CONSTRAINT health_status_check (...original...);
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- SIDE-01 FIRST: Fix whatsapp_connections health_status_check constraint
--
-- The current constraint (8 values) is missing 'disconnected' and 'timeout'.
-- Edge function health checks write these values → SQLSTATE 23514 on every
-- health update → connection health stuck in stale state.
--
-- New constraint includes all 10 values the system actually emits:
--   connected, disconnected, connecting, qr_code, timeout,
--   error, unknown, syncing, authenticated, logged_out
-- ─────────────────────────────────────────────────────────────────────────────

DO $fix_health_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp' AND c.relname = 'whatsapp_connections'
  ) THEN
    RAISE NOTICE 'SIDE-01: whatsapp_connections not found — skipping';
    RETURN;
  END IF;

  -- Drop old constraint (any variant name — be resilient)
  BEGIN
    ALTER TABLE zapp.whatsapp_connections DROP CONSTRAINT IF EXISTS health_status_check;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'SIDE-01: Could not drop health_status_check: %', SQLERRM;
  END;

  BEGIN
    ALTER TABLE zapp.whatsapp_connections DROP CONSTRAINT IF EXISTS whatsapp_connections_health_status_check;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ALTER TABLE zapp.whatsapp_connections DROP CONSTRAINT IF EXISTS health_status_check_v2;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Recreate with full consolidated value set (union of all values ever written)
  ALTER TABLE zapp.whatsapp_connections ADD CONSTRAINT health_status_check_v2
    CHECK (health_status IS NULL OR health_status = ANY (ARRAY[
      'connected'::text, 'disconnected'::text, 'connecting'::text, 'qr_code'::text, 'timeout'::text,
      'error'::text, 'unknown'::text, 'syncing'::text, 'authenticated'::text, 'logged_out'::text,
      'healthy'::text, 'ok'::text, 'provisioned'::text, 'degraded'::text,
      'down'::text, 'offline'::text
    ]));
  RAISE NOTICE 'SIDE-01: health_status_check_v2 constraint created with 16 consolidated values';
END;
$fix_health_constraint$;

-- ─────────────────────────────────────────────────────────────────────────────
-- GAP-04: email_app.meta_capi_events — activate the dead policy
-- ─────────────────────────────────────────────────────────────────────────────

DO $gap04$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_namespace WHERE nspname = 'email_app'
  ) AND EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'email_app' AND c.relname = 'meta_capi_events'
  ) THEN
    BEGIN
      ALTER TABLE email_app.meta_capi_events ENABLE ROW LEVEL SECURITY;
      RAISE NOTICE 'GAP-04: email_app.meta_capi_events RLS enabled';
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'GAP-04: Could not enable RLS on email_app.meta_capi_events: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'GAP-04: email_app.meta_capi_events not found — skipping';
  END IF;
END;
$gap04$;

-- ─────────────────────────────────────────────────────────────────────────────
-- GAP-01: zapp schema — activate RLS on tables that have policies but RLS off
--
-- We iterate pg_class WHERE relnamespace='zapp' AND NOT relrowsecurity AND
-- EXISTS matching pg_policies row. This is safe because:
--   1. Only tables with pre-existing policies are touched
--   2. Supabase service_role always bypasses RLS → Edge Functions unaffected
--   3. Individual errors are caught and logged; the loop continues
-- ─────────────────────────────────────────────────────────────────────────────

DO $gap01_zapp$
DECLARE
  r record;
  v_count integer := 0;
  v_fail  integer := 0;
BEGIN
  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp'
      AND c.relkind IN ('r', 'p')     -- regular table or partitioned table root
      AND NOT c.relrowsecurity
      AND EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname = 'zapp' AND p.tablename = c.relname
      )
    ORDER BY c.relname
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE zapp.%I ENABLE ROW LEVEL SECURITY', r.tablename);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'GAP-01: Could not enable RLS on zapp.%: % (SQLSTATE: %)',
                    r.tablename, SQLERRM, SQLSTATE;
      v_fail := v_fail + 1;
    END;
  END LOOP;

  RAISE NOTICE 'GAP-01: zapp — enabled RLS on % tables (% failures)', v_count, v_fail;
END;
$gap01_zapp$;

-- ─────────────────────────────────────────────────────────────────────────────
-- GAP-02: evo schema — activate RLS on tables/partitions with policies but RLS off
--
-- Same pattern as GAP-01. Key concern: evo partitioned root tables
-- (evolution_messages, evolution_conversations) — enabling RLS on the root
-- automatically applies to all partitions in PostgreSQL 12+.
-- ─────────────────────────────────────────────────────────────────────────────

DO $gap02_evo$
DECLARE
  r record;
  v_count integer := 0;
  v_fail  integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'evo') THEN
    RAISE NOTICE 'GAP-02: evo schema not found — skipping';
    RETURN;
  END IF;

  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evo'
      AND c.relkind IN ('r', 'p')
      AND NOT c.relrowsecurity
      AND EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname = 'evo' AND p.tablename = c.relname
      )
    ORDER BY c.relname
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE evo.%I ENABLE ROW LEVEL SECURITY', r.tablename);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'GAP-02: Could not enable RLS on evo.%: % (SQLSTATE: %)',
                    r.tablename, SQLERRM, SQLSTATE;
      v_fail := v_fail + 1;
    END;
  END LOOP;

  RAISE NOTICE 'GAP-02: evo — enabled RLS on % tables/partitions (% failures)', v_count, v_fail;
END;
$gap02_evo$;

-- ─────────────────────────────────────────────────────────────────────────────
-- GAP-03: bpm schema — enable RLS + add baseline policies
--
-- The bpm schema has 41 tables with ZERO policies. Enabling RLS without policies
-- would block everyone. We:
--   1. Enable RLS on all bpm relkind='r' tables
--   2. Add a permissive authenticated baseline (FOR ALL TO authenticated USING(true)
--      WITH CHECK(true)) so current access is preserved
--   3. Add a service_role bypass (FOR ALL TO service_role USING(true) WITH CHECK(true))
--      so Edge Functions retain full access
--
-- IMPORTANT: This is an interim measure. Business-logic policies (workspace
-- scoping, role checks) must be added in a subsequent migration once the bpm
-- table ownership model is documented.
-- ─────────────────────────────────────────────────────────────────────────────

DO $gap03_bpm$
DECLARE
  r record;
  v_count integer := 0;
  v_fail  integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'bpm') THEN
    RAISE NOTICE 'GAP-03: bpm schema not found — skipping';
    RETURN;
  END IF;

  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'bpm'
      AND c.relkind = 'r'    -- regular tables only (bpm has no partitioned roots)
    ORDER BY c.relname
  LOOP
    BEGIN
      -- Enable RLS
      EXECUTE format('ALTER TABLE bpm.%I ENABLE ROW LEVEL SECURITY', r.tablename);

      -- Baseline authenticated policy (permissive — preserves existing behaviour)
      EXECUTE format(
        'DROP POLICY IF EXISTS bpm_authenticated_baseline ON bpm.%I',
        r.tablename
      );
      EXECUTE format(
        'CREATE POLICY bpm_authenticated_baseline ON bpm.%I
           FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        r.tablename
      );

      -- Service role bypass (belt-and-suspenders; service_role already bypasses
      -- RLS at the Supabase level, but explicit policy prevents future confusion)
      EXECUTE format(
        'DROP POLICY IF EXISTS bpm_service_role_bypass ON bpm.%I',
        r.tablename
      );
      EXECUTE format(
        'CREATE POLICY bpm_service_role_bypass ON bpm.%I
           FOR ALL TO service_role USING (true) WITH CHECK (true)',
        r.tablename
      );

      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'GAP-03: Could not configure bpm.%: % (SQLSTATE: %)',
                    r.tablename, SQLERRM, SQLSTATE;
      v_fail := v_fail + 1;
    END;
  END LOOP;

  RAISE NOTICE 'GAP-03: bpm — enabled RLS + baseline policies on % tables (% failures)',
               v_count, v_fail;
  RAISE NOTICE 'GAP-03: REMINDER — bpm baseline policies are permissive. Layer business-logic policies in next migration cycle.';
END;
$gap03_bpm$;

-- ─────────────────────────────────────────────────────────────────────────────
-- FINAL SUMMARY
-- ─────────────────────────────────────────────────────────────────────────────

DO $summary$
DECLARE
  v_zapp_rls_count integer;
  v_evo_rls_count  integer;
  v_bpm_rls_count  integer;
BEGIN
  SELECT COUNT(*) INTO v_zapp_rls_count
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'zapp' AND c.relkind IN ('r','p') AND c.relrowsecurity;

  SELECT COUNT(*) INTO v_evo_rls_count
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'evo' AND c.relkind IN ('r','p') AND c.relrowsecurity;

  SELECT COUNT(*) INTO v_bpm_rls_count
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'bpm' AND c.relkind = 'r' AND c.relrowsecurity;

  RAISE NOTICE '=== Migration 20260804170000 complete ===';
  RAISE NOTICE '  zapp tables with RLS active: %', v_zapp_rls_count;
  RAISE NOTICE '  evo  tables with RLS active: %', v_evo_rls_count;
  RAISE NOTICE '  bpm  tables with RLS active: %', v_bpm_rls_count;
  RAISE NOTICE '  health_status_check_v2 constraint: see SIDE-01 block above';
END;
$summary$;
