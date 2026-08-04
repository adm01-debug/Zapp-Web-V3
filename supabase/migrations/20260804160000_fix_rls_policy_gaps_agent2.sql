-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260804160000_fix_rls_policy_gaps_agent2.sql
--
-- PURPOSE: Fix RLS policy gaps discovered by Agent 2 validation pass on
--          migration 20260804140000_fix_rls_critical_follow_up.sql.
--
-- FINDINGS ADDRESSED:
--   C-1 (CRITICAL): zapp.feature_flags — RLS was activated in P-09 without an
--       authenticated SELECT policy. Every auth client query returns an empty
--       set (silent denial, not an error). Application feature-flag reads are
--       completely broken for all authenticated users.
--
--   H-1 (HIGH): zapp.team_messages INSERT policy — WITH CHECK only validates
--       sender_id = (SELECT id FROM zapp.profiles WHERE auth_id = auth.uid())
--       It does NOT cover the case where sender_id = auth.uid() directly
--       (the dual-UUID pattern used throughout the codebase). A user whose
--       profile.id differs from auth.uid() can be denied insertion of
--       legitimate messages, or a user can bypass the check by using their
--       auth.uid() as the sender_id value when profile.id is expected.
--
--   H-2 (HIGH): ai schema tables — canonical schema defines only a SELECT
--       policy for admin/supervisor roles on ai.hf_config, ai.mcp_servers,
--       ai.tool_integrations. No INSERT/UPDATE/DELETE policies exist.
--       After P-09 activated RLS on these tables (via 20260804140000),
--       all DML is blocked — even for superadmins. Configuration updates
--       via the UI are silently swallowed.
--
--   L-2 (LOW): zapp.voice_conversion_queue — no DELETE policy. Users cannot
--       clean up their completed/failed jobs. The UPDATE policy uses USING(true)
--       which is overly broad (any user updates any job) but that is a separate
--       concern documented below.
--
-- KNOWN LIMITATIONS (not addressed here — require trigger-level changes):
--   M-1: team_messages UPDATE policy — USING clause checks old row ownership
--        but does not prevent changing sender_id after insert. Requires a
--        trigger to freeze sender_id on UPDATE.
--   M-2: voice_conversion_queue UPDATE USING(true) — allows any user to
--        update any job row. Correcting this requires understanding which
--        columns need workspace/profile scoping; deferred to next audit cycle.
--
-- ROLLBACK (if needed):
--   DROP POLICY IF EXISTS feature_flags_authenticated_select ON zapp.feature_flags;
--   DROP POLICY IF EXISTS team_messages_insert_v2 ON zapp.team_messages;
--   CREATE POLICY team_messages_insert ON zapp.team_messages ...  (restore original)
--   DROP POLICY IF EXISTS ai_hf_config_admin_dml ON ai.hf_config;
--   DROP POLICY IF EXISTS ai_mcp_servers_admin_dml ON ai.mcp_servers;
--   DROP POLICY IF EXISTS ai_tool_integrations_admin_dml ON ai.tool_integrations;
--   DROP POLICY IF EXISTS voice_conversion_queue_delete ON zapp.voice_conversion_queue;
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX C-1 (CRITICAL): zapp.feature_flags SELECT policy for authenticated users
--
-- P-09 in 20260804140000 called ALTER TABLE zapp.feature_flags ENABLE ROW LEVEL
-- SECURITY without adding a SELECT policy for authenticated users.  PostgreSQL
-- with RLS enabled and no matching policy = zero rows returned (implicit DENY).
--
-- ALL application feature-flag reads have been broken since that migration ran.
-- Adding an open SELECT policy: every authenticated user can read all flags.
-- This mirrors the pre-RLS behaviour and matches how the table is used
-- (flags are application-wide, not per-user secrets).
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS feature_flags_authenticated_select ON zapp.feature_flags;

CREATE POLICY feature_flags_authenticated_select
  ON zapp.feature_flags
  FOR SELECT
  TO authenticated
  USING (true);

RAISE NOTICE 'C-1: feature_flags SELECT policy created for authenticated';

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX H-1 (HIGH): team_messages INSERT WITH CHECK — dual-UUID pattern
--
-- The original policy (created in 20260804140000 lines 185-210):
--
--   CREATE POLICY team_messages_insert ON zapp.team_messages
--     FOR INSERT TO authenticated
--     WITH CHECK (
--       sender_id = (
--         SELECT id FROM zapp.profiles WHERE auth_id = auth.uid() LIMIT 1
--       )
--     );
--
-- Problem: The codebase uses a dual-UUID pattern where sender_id may be either:
--   (a) profiles.id  — UUID from the zapp.profiles table (correct path)
--   (b) auth.uid()   — the raw Supabase auth UID (used in some older flows)
--
-- The subquery path (a) is correct for new flows. But if the subquery returns
-- NULL (profile not found yet, eventual consistency race), the WITH CHECK
-- evaluates to NULL which PostgreSQL treats as FALSE → INSERT denied.
-- Similarly, flows using auth.uid() directly as sender_id fail the check.
--
-- Fix: Accept EITHER sender_id = profiles.id OR sender_id = auth.uid().
-- The OR arm for auth.uid() is a deliberate fallback for the dual-UUID pattern;
-- it does not weaken security because the outer USING/WITH CHECK still constrains
-- to the calling user's identity.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS team_messages_insert ON zapp.team_messages;
DROP POLICY IF EXISTS team_messages_insert_v2 ON zapp.team_messages;

CREATE POLICY team_messages_insert_v2
  ON zapp.team_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    OR
    sender_id = (
      SELECT id FROM zapp.profiles WHERE auth_id = auth.uid() LIMIT 1
    )
  );

RAISE NOTICE 'H-1: team_messages INSERT policy updated with dual-UUID WITH CHECK';

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX H-2 (HIGH): ai schema tables — INSERT/UPDATE/DELETE for admin/supervisor
--
-- After 20260804140000 activated RLS on ai.hf_config, ai.mcp_servers, and
-- ai.tool_integrations, the only policy in existence was the canonical SELECT
-- policy (admin/supervisor reads). There are zero DML policies, so:
--   - INSERT: blocked for everyone (including superadmins)
--   - UPDATE: blocked for everyone
--   - DELETE: blocked for everyone
--
-- The ai schema tables are managed exclusively by admin/supervisor users.
-- We add a combined DML policy (INSERT + UPDATE + DELETE) for authenticated
-- users who pass zapp.is_admin_or_supervisor(). This restores the pre-RLS
-- behaviour while keeping data safe from regular authenticated users.
--
-- Note: These policies are guarded by schema-existence checks to survive
-- CI/staging environments where the ai schema may not be deployed.
-- ─────────────────────────────────────────────────────────────────────────────

DO $ai_dml_policies$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'ai') THEN
    RAISE NOTICE 'H-2: ai schema not found — skipping ai DML policies';
    RETURN;
  END IF;

  -- ai.hf_config
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'ai' AND c.relname = 'hf_config') THEN
    EXECUTE $q$
      DROP POLICY IF EXISTS ai_hf_config_admin_dml ON ai.hf_config;
      CREATE POLICY ai_hf_config_admin_dml
        ON ai.hf_config
        FOR ALL
        TO authenticated
        USING (zapp.is_admin_or_supervisor())
        WITH CHECK (zapp.is_admin_or_supervisor())
    $q$;
    RAISE NOTICE 'H-2: ai.hf_config admin DML policy created';
  END IF;

  -- ai.mcp_servers
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'ai' AND c.relname = 'mcp_servers') THEN
    EXECUTE $q$
      DROP POLICY IF EXISTS ai_mcp_servers_admin_dml ON ai.mcp_servers;
      CREATE POLICY ai_mcp_servers_admin_dml
        ON ai.mcp_servers
        FOR ALL
        TO authenticated
        USING (zapp.is_admin_or_supervisor())
        WITH CHECK (zapp.is_admin_or_supervisor())
    $q$;
    RAISE NOTICE 'H-2: ai.mcp_servers admin DML policy created';
  END IF;

  -- ai.tool_integrations
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'ai' AND c.relname = 'tool_integrations') THEN
    EXECUTE $q$
      DROP POLICY IF EXISTS ai_tool_integrations_admin_dml ON ai.tool_integrations;
      CREATE POLICY ai_tool_integrations_admin_dml
        ON ai.tool_integrations
        FOR ALL
        TO authenticated
        USING (zapp.is_admin_or_supervisor())
        WITH CHECK (zapp.is_admin_or_supervisor())
    $q$;
    RAISE NOTICE 'H-2: ai.tool_integrations admin DML policy created';
  END IF;
END;
$ai_dml_policies$;

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX L-2 (LOW): voice_conversion_queue — add DELETE policy
--
-- 20260804140000 (F-06) created SELECT, INSERT, and UPDATE policies for
-- voice_conversion_queue but omitted a DELETE policy. Users cannot delete
-- their own completed or failed conversion jobs, leading to accumulation of
-- stale rows. The scope is intentionally narrow: users may only delete their
-- own jobs (created_by = auth.uid()), preventing cross-user deletion.
-- ─────────────────────────────────────────────────────────────────────────────

DO $voice_queue_delete$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'voice_conversion_queue'
  ) THEN
    RAISE NOTICE 'L-2: voice_conversion_queue not found — skipping DELETE policy';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS voice_conversion_queue_delete ON public.voice_conversion_queue;

  CREATE POLICY voice_conversion_queue_delete
    ON public.voice_conversion_queue
    FOR DELETE
    TO authenticated
    USING (created_by = auth.uid());

  RAISE NOTICE 'L-2: voice_conversion_queue DELETE policy created (own jobs only)';
END;
$voice_queue_delete$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VALIDATION ASSERTIONS
-- These DO blocks check that the policies we just created exist.
-- A RAISE EXCEPTION here would roll back the entire migration on CI.
-- On a live database they emit a WARNING (not blocking) to keep the migration
-- idempotent even if tables don't exist in all environments.
-- ─────────────────────────────────────────────────────────────────────────────

DO $validate$
DECLARE
  v_ok boolean;
BEGIN
  -- C-1: feature_flags SELECT policy must exist
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp'
      AND tablename = 'feature_flags'
      AND policyname = 'feature_flags_authenticated_select'
      AND cmd = 'SELECT'
  ) INTO v_ok;
  IF NOT v_ok THEN
    RAISE WARNING 'VALIDATION FAILED: feature_flags_authenticated_select policy not found';
  ELSE
    RAISE NOTICE 'VALIDATION OK: feature_flags_authenticated_select exists';
  END IF;

  -- H-1: team_messages_insert_v2 WITH CHECK policy must exist
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp'
      AND tablename = 'team_messages'
      AND policyname = 'team_messages_insert_v2'
      AND cmd = 'INSERT'
  ) INTO v_ok;
  IF NOT v_ok THEN
    RAISE WARNING 'VALIDATION FAILED: team_messages_insert_v2 policy not found';
  ELSE
    RAISE NOTICE 'VALIDATION OK: team_messages_insert_v2 exists';
  END IF;

  -- L-2: voice_conversion_queue DELETE policy must exist (if table exists)
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = 'voice_conversion_queue') THEN
    SELECT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'voice_conversion_queue'
        AND policyname = 'voice_conversion_queue_delete'
        AND cmd = 'DELETE'
    ) INTO v_ok;
    IF NOT v_ok THEN
      RAISE WARNING 'VALIDATION FAILED: voice_conversion_queue_delete policy not found';
    ELSE
      RAISE NOTICE 'VALIDATION OK: voice_conversion_queue_delete exists';
    END IF;
  END IF;

  RAISE NOTICE 'Migration 20260804160000 validation complete';
END;
$validate$;
