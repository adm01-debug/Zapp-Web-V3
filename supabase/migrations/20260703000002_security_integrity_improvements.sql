-- ============================================================
-- Migration: 20260703000002 — Security + Integrity improvements
-- Applies three gaps identified in audit:
--
-- GAP 1: auth_rw RLS policy was ALL (SELECT+INSERT+UPDATE+DELETE)
--   for all authenticated users, overriding admin-only ipp_admin_*
--   policies. Replaced with SELECT-only ipp_user_select policy.
--
-- GAP 2: instance_name had no CHECK constraint — empty strings,
--   spaces, tabs and newlines were silently accepted. Added
--   CHECK (instance_name ~ '\S') using regex (not trim() which
--   fails to detect tabs/newlines in PostgreSQL).
--
-- GAP 3: auto_pause_instance_on_auth_spike() logged the raw
--   (unclamped) p_trigger_count in audit_logs.details, creating
--   a discrepancy between stored value and logged value when
--   trigger_count was negative. Now logs the clamped value plus
--   the original raw value for debugging.
-- ============================================================


-- ============================================================
-- 1. RLS: Replace over-permissive auth_rw with SELECT-only
-- ============================================================

-- Drop the ALL-access policy that overrode admin-only policies
DROP POLICY IF EXISTS auth_rw ON zapp.instance_processing_pauses;

-- Create proper read-only policy for all authenticated users
-- (admins keep write access via ipp_admin_insert/update/delete)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='zapp'
      AND tablename='instance_processing_pauses'
      AND policyname='ipp_user_select'
  ) THEN
    EXECUTE $$
      CREATE POLICY ipp_user_select
        ON zapp.instance_processing_pauses
        FOR SELECT
        TO authenticated
        USING (true);
    $$;
  END IF;
END;
$$;


-- ============================================================
-- 2. CHECK constraint: instance_name must contain non-whitespace
-- Uses regex \S (non-whitespace) rather than trim() which fails
-- to detect tabs (\t) and newlines (\n) in PostgreSQL.
-- ============================================================

-- Pre-flight: fail loudly if existing data would violate
DO $$
DECLARE v_cnt integer;
BEGIN
  SELECT count(*) INTO v_cnt
    FROM zapp.instance_processing_pauses
   WHERE instance_name !~ '\S';
  IF v_cnt > 0 THEN
    RAISE EXCEPTION
      'ABORT: % rows in instance_processing_pauses have empty/whitespace instance_name. '
      'Clean them before applying this migration.', v_cnt;
  END IF;
END;
$$;

ALTER TABLE zapp.instance_processing_pauses
  ADD CONSTRAINT instance_name_not_empty
  CHECK (instance_name ~ '\S');


-- ============================================================
-- 3. Fix auto_pause_instance_on_auth_spike: audit clamped tc
-- Changes:
--   a) Extract clamped values into variables (v_clamped_tc,
--      v_clamped_min) for consistency across INSERT and UPDATE
--   b) Audit records clamped trigger_count (what was stored)
--      plus raw_trigger_count (original param) for debugging
-- ============================================================

CREATE OR REPLACE FUNCTION public.auto_pause_instance_on_auth_spike(
  p_instance      text,
  p_reason        text,
  p_trigger_count integer,
  p_minutes       integer DEFAULT 15
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, zapp
AS $$
DECLARE
  v_id           uuid;
  v_existing     uuid;
  v_clamped_tc   integer;
  v_clamped_min  integer;
BEGIN
  -- Clamp p_minutes to [1, 1440]
  IF p_minutes <= 0 OR p_minutes > 1440 THEN
    v_clamped_min := 15;
  ELSE
    v_clamped_min := p_minutes;
  END IF;

  -- Clamp trigger_count to [0, +inf)
  v_clamped_tc := GREATEST(0, COALESCE(p_trigger_count, 0));

  -- If active pause exists, extend it (no duplicate rows)
  SELECT id INTO v_existing
    FROM public.instance_processing_pauses
   WHERE instance_name = p_instance
     AND paused_until > now()
   ORDER BY paused_until DESC
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE public.instance_processing_pauses
       SET paused_until  = GREATEST(paused_until,
                             now() + (v_clamped_min || ' minutes')::interval),
           trigger_count = trigger_count + v_clamped_tc,
           reason        = p_reason,
           updated_at    = now()
     WHERE id = v_existing;
    RETURN v_existing;
  END IF;

  -- Create new pause
  INSERT INTO public.instance_processing_pauses (
    instance_name, paused_until, reason, trigger_count, auto_paused
  )
  VALUES (
    p_instance,
    now() + (v_clamped_min || ' minutes')::interval,
    p_reason,
    v_clamped_tc,
    true
  )
  RETURNING id INTO v_id;

  -- Audit: log clamped values (consistent with what was stored)
  -- raw_trigger_count preserved for debugging when input was negative
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    NULL,
    'instance_auto_paused',
    'instance_processing_pauses',
    v_id,
    jsonb_build_object(
      'instance',          p_instance,
      'minutes',           v_clamped_min,
      'reason',            p_reason,
      'trigger_count',     v_clamped_tc,
      'raw_trigger_count', p_trigger_count
    )
  );

  RETURN v_id;
END;
$$;


-- ============================================================
-- Verification assertions (run inline to fail fast on mistakes)
-- ============================================================
DO $$
DECLARE v_cnt integer;
BEGIN
  -- auth_rw must be gone
  SELECT count(*) INTO v_cnt FROM pg_policies
    WHERE schemaname='zapp' AND tablename='instance_processing_pauses'
      AND policyname='auth_rw';
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'ASSERT FAILED: auth_rw still exists';
  END IF;

  -- ipp_user_select must exist as SELECT-only
  SELECT count(*) INTO v_cnt FROM pg_policies
    WHERE schemaname='zapp' AND tablename='instance_processing_pauses'
      AND policyname='ipp_user_select' AND cmd='SELECT';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'ASSERT FAILED: ipp_user_select not found or wrong cmd';
  END IF;

  -- CHECK constraint must exist
  SELECT count(*) INTO v_cnt FROM pg_constraint
    WHERE conrelid='zapp.instance_processing_pauses'::regclass
      AND contype='c' AND conname='instance_name_not_empty';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'ASSERT FAILED: instance_name_not_empty constraint not found';
  END IF;

  -- Function must have v_clamped_tc
  SELECT count(*) INTO v_cnt FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='auto_pause_instance_on_auth_spike'
      AND p.prosrc LIKE '%v_clamped_tc%';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'ASSERT FAILED: function does not contain v_clamped_tc';
  END IF;

  RAISE NOTICE 'ALL MIGRATION ASSERTIONS PASSED';
END;
$$;
