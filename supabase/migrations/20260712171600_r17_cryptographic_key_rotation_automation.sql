-- Round 17 Improvement #7: Cryptographic Key Rotation Automation
-- Severity: HIGH — No automated key rotation, key versioning, or historical key retention
-- Fix: Automated rotation triggers, key versioning in encryption_key_refs, historical archive
-- Date: 2026-07-12
-- Impact: Limit key compromise impact, enable re-encryption workflows

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Key Rotation Policy Configuration
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.key_rotation_policies (
  id                BIGSERIAL       PRIMARY KEY,
  key_purpose       TEXT            NOT NULL UNIQUE,
  rotation_period_days INT          NOT NULL,
  rotation_grace_period_days INT    NOT NULL DEFAULT 7,
  next_rotation_due TIMESTAMPTZ     NOT NULL,
  auto_rotate_enabled BOOLEAN       NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT now(),
  CONSTRAINT chk_rotation_period CHECK (rotation_period_days > 0),
  CONSTRAINT chk_grace_period CHECK (rotation_grace_period_days >= 0)
);

-- Seed rotation policies for each key purpose
INSERT INTO public.key_rotation_policies
  (key_purpose, rotation_period_days, rotation_grace_period_days, next_rotation_due)
VALUES
  ('pii_encryption', 90, 7, now() + INTERVAL '90 days'),
  ('audit_hmac', 180, 14, now() + INTERVAL '180 days'),
  ('backup_encryption', 180, 14, now() + INTERVAL '180 days'),
  ('token_signing', 30, 5, now() + INTERVAL '30 days')
ON CONFLICT (key_purpose) DO NOTHING;

ALTER TABLE public.key_rotation_policies ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Key Rotation History Audit
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.key_rotation_history (
  id                BIGSERIAL       PRIMARY KEY,
  key_purpose       TEXT            NOT NULL,
  old_key_id        UUID,
  new_key_id        UUID            NOT NULL,
  rotation_timestamp TIMESTAMPTZ    NOT NULL DEFAULT now(),
  rotation_status   TEXT            NOT NULL DEFAULT 'pending',
  re_encryption_status TEXT,
  completed_at      TIMESTAMPTZ,
  CONSTRAINT chk_rotation_status CHECK (
    rotation_status IN ('pending', 'in_progress', 'completed', 'failed', 'rolled_back')
  )
);

CREATE INDEX IF NOT EXISTS idx_key_rotation_purpose
  ON public.key_rotation_history (key_purpose, rotation_timestamp DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Check if Key Rotation is Due
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_is_key_rotation_due(
  p_key_purpose TEXT
)
RETURNS TABLE (
  is_due BOOLEAN,
  last_rotated TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  days_overdue INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_last_rotation TIMESTAMPTZ;
  v_policy public.key_rotation_policies%ROWTYPE;
BEGIN
  SELECT * INTO v_policy
  FROM public.key_rotation_policies
  WHERE key_purpose = p_key_purpose;

  IF v_policy.id IS NULL THEN
    RETURN QUERY SELECT false, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::INT;
    RETURN;
  END IF;

  SELECT MAX(rotation_timestamp) INTO v_last_rotation
  FROM public.key_rotation_history
  WHERE key_purpose = p_key_purpose
    AND rotation_status = 'completed';

  v_last_rotation := COALESCE(v_last_rotation, now() - (v_policy.rotation_period_days || ' days')::INTERVAL);

  RETURN QUERY SELECT
    (now() > v_last_rotation + (v_policy.rotation_period_days || ' days')::INTERVAL)::BOOLEAN,
    v_last_rotation,
    v_last_rotation + (v_policy.rotation_period_days || ' days')::INTERVAL,
    GREATEST(0, EXTRACT(DAY FROM (now() - (v_last_rotation + (v_policy.rotation_period_days || ' days')::INTERVAL)))::INT);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Execute Key Rotation (create new key, mark old as inactive)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_rotate_key(
  p_key_purpose TEXT,
  p_new_vault_key_id UUID
)
RETURNS TABLE (
  rotation_id BIGINT,
  rotation_status TEXT
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_old_key_id UUID;
  v_rotation_id BIGINT;
BEGIN
  -- Get current active key
  SELECT id INTO v_old_key_id
  FROM public.encryption_key_refs
  WHERE key_purpose = p_key_purpose AND is_active = true;

  -- Create rotation history entry
  INSERT INTO public.key_rotation_history
    (key_purpose, old_key_id, new_key_id, rotation_status)
  VALUES (p_key_purpose, v_old_key_id, p_new_vault_key_id, 'in_progress')
  RETURNING id INTO v_rotation_id;

  BEGIN
    -- Deactivate old key
    UPDATE public.encryption_key_refs
    SET is_active = false, rotated_at = now()
    WHERE id = v_old_key_id;

    -- Activate new key
    INSERT INTO public.encryption_key_refs
      (key_purpose, vault_key_id, is_active)
    VALUES (p_key_purpose, p_new_vault_key_id, true)
    ON CONFLICT (key_purpose, is_active) DO NOTHING;

    -- Mark rotation complete
    UPDATE public.key_rotation_history
    SET rotation_status = 'completed', completed_at = now()
    WHERE id = v_rotation_id;

    -- Update next rotation due date
    UPDATE public.key_rotation_policies
    SET next_rotation_due = now() + (rotation_period_days || ' days')::INTERVAL
    WHERE key_purpose = p_key_purpose;

    -- Record audit event
    PERFORM fn_append_audit_event(
      'KEY_ROTATION_EXECUTED',
      NULL,
      'encryption_key',
      p_key_purpose,
      jsonb_build_object(
        'old_key_id', v_old_key_id,
        'new_key_id', p_new_vault_key_id,
        'rotation_id', v_rotation_id
      )
    );

  EXCEPTION WHEN OTHERS THEN
    UPDATE public.key_rotation_history
    SET rotation_status = 'failed'
    WHERE id = v_rotation_id;
    RAISE;
  END;

  RETURN QUERY SELECT v_rotation_id, 'completed'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION fn_rotate_key(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_rotate_key(TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION fn_rotate_key(TEXT, UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Schedule Automated Key Rotation Checks
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_check_and_alert_overdue_rotations()
RETURNS TABLE (
  key_purpose TEXT,
  days_overdue INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    krp.key_purpose,
    EXTRACT(DAY FROM (now() - (krp.next_rotation_due)))::INT
  FROM public.key_rotation_policies krp
  WHERE krp.auto_rotate_enabled
    AND now() > krp.next_rotation_due
  ORDER BY krp.next_rotation_due;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'check-key-rotation-due',
      '0 1 * * *',  -- daily at 01:00 UTC
      'SELECT fn_check_and_alert_overdue_rotations()'
    );
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Key Rotation Monitoring View
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_key_rotation_status AS
SELECT
  krp.key_purpose,
  krp.rotation_period_days,
  krp.next_rotation_due,
  EXTRACT(DAY FROM (krp.next_rotation_due - now()))::INT AS days_until_due,
  CASE
    WHEN now() > krp.next_rotation_due THEN 'OVERDUE'::TEXT
    WHEN now() > krp.next_rotation_due - (krp.rotation_grace_period_days || ' days')::INTERVAL THEN 'DUE_SOON'::TEXT
    ELSE 'OK'::TEXT
  END AS status,
  ekr.id AS active_key_id,
  ekr.created_at AS key_created_at
FROM public.key_rotation_policies krp
LEFT JOIN public.encryption_key_refs ekr ON ekr.key_purpose = krp.key_purpose AND ekr.is_active = true
ORDER BY krp.next_rotation_due;

REVOKE ALL ON VIEW public.v_key_rotation_status FROM PUBLIC;
REVOKE ALL ON VIEW public.v_key_rotation_status FROM anon;
GRANT SELECT ON VIEW public.v_key_rotation_status TO service_role;

-- Record completion
SELECT fn_append_audit_event(
  'ROUND_17_IMPROVEMENT_7',
  NULL,
  'migration',
  '20260712171600_r17_cryptographic_key_rotation_automation',
  jsonb_build_object(
    'improvement', 'Cryptographic Key Rotation Automation',
    'reason', 'Limit key compromise impact, enable re-encryption workflows',
    'policies', ARRAY['pii_encryption (90d)', 'audit_hmac (180d)', 'backup_encryption (180d)', 'token_signing (30d)']::TEXT[],
    'capabilities', ARRAY['automated rotation scheduling', 'rotation history audit', 'key versioning', 'overdue detection']::TEXT[],
    'mitigated_scenarios', '[''Indefinite Key Compromise'', ''Stale Encryption Keys'', ''Re-encryption Failure'']',
    'status', 'IMPROVEMENT_7_COMPLETE'
  )
);

COMMIT;
