-- Round 16 Migration #2: Tamper-Evident Audit Log with Hash Chaining
-- Severity: HIGH — Without integrity verification, a compromised DB user can
--           silently delete or modify audit records covering their tracks.
-- Fix: SHA-256 hash chain on audit log entries (each entry includes hash of prior).
--      Append-only enforcement via trigger. Verification function.
-- Date: 2026-07-12
-- Impact: Cryptographic proof of audit log integrity; detects tampering

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Append-only security audit chain table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.security_audit_chain (
  seq         BIGSERIAL       PRIMARY KEY,
  event_time  TIMESTAMPTZ     NOT NULL DEFAULT now(),
  event_type  TEXT            NOT NULL,
  actor_id    UUID,
  target_type TEXT            NOT NULL,
  target_id   TEXT,
  payload     JSONB           NOT NULL DEFAULT '{}',
  prev_hash   TEXT            NOT NULL DEFAULT '',
  entry_hash  TEXT            NOT NULL,
  CONSTRAINT  chk_entry_hash_not_empty CHECK (entry_hash <> '')
);

-- Prevent DELETE and UPDATE on audit chain rows (append-only enforcement)
CREATE OR REPLACE FUNCTION fn_audit_chain_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'audit_chain_immutable: Audit chain records cannot be deleted'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'audit_chain_immutable: Audit chain records cannot be modified'
      USING ERRCODE = '42501';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_chain_immutable ON public.security_audit_chain;
CREATE TRIGGER trg_audit_chain_immutable
  BEFORE DELETE OR UPDATE ON public.security_audit_chain
  FOR EACH ROW EXECUTE FUNCTION fn_audit_chain_immutable();

-- RLS: no authenticated user can delete or update; service_role inserts
ALTER TABLE public.security_audit_chain ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='security_audit_chain' AND policyname='chain_svc_full'
  ) THEN
    EXECUTE 'CREATE POLICY chain_svc_full ON public.security_audit_chain TO service_role USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='security_audit_chain' AND policyname='chain_admin_read'
  ) THEN
    EXECUTE 'CREATE POLICY chain_admin_read ON public.security_audit_chain FOR SELECT TO authenticated
             USING (is_admin_or_supervisor(auth.uid()))';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_chain_time
  ON public.security_audit_chain (event_time DESC);
CREATE INDEX IF NOT EXISTS idx_audit_chain_actor
  ON public.security_audit_chain (actor_id, event_time DESC)
  WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_chain_event_type
  ON public.security_audit_chain (event_type, event_time DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Function to append a tamper-evident entry (computes hash chain)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_append_audit_event(
  p_event_type  TEXT,
  p_actor_id    UUID,
  p_target_type TEXT,
  p_target_id   TEXT,
  p_payload     JSONB DEFAULT '{}'
)
RETURNS BIGINT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_prev_hash  TEXT;
  v_prev_seq   BIGINT;
  v_entry_hash TEXT;
  v_payload_str TEXT;
  v_new_seq    BIGINT;
BEGIN
  -- Get previous chain tip (locked for consistency under concurrent inserts)
  SELECT seq, entry_hash INTO v_prev_seq, v_prev_hash
  FROM public.security_audit_chain
  ORDER BY seq DESC
  LIMIT 1
  FOR UPDATE;

  v_prev_hash := COALESCE(v_prev_hash, '0000000000000000000000000000000000000000000000000000000000000000');

  -- Build entry hash: SHA-256(seq_hint || event_time || event_type || prev_hash || payload)
  v_payload_str := COALESCE(p_target_type, '') || '|' ||
                   COALESCE(p_target_id, '') || '|' ||
                   COALESCE(p_event_type, '') || '|' ||
                   v_prev_hash || '|' ||
                   COALESCE(p_payload::TEXT, '{}');

  v_entry_hash := encode(
    digest(v_payload_str::BYTEA, 'sha256'),
    'hex'
  );

  INSERT INTO public.security_audit_chain (
    event_type, actor_id, target_type, target_id, payload, prev_hash, entry_hash
  )
  VALUES (
    p_event_type, p_actor_id, p_target_type, p_target_id,
    COALESCE(p_payload, '{}'), v_prev_hash, v_entry_hash
  )
  RETURNING seq INTO v_new_seq;

  RETURN v_new_seq;
END;
$$;

REVOKE ALL ON FUNCTION fn_append_audit_event(TEXT, UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_append_audit_event(TEXT, UUID, TEXT, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION fn_append_audit_event(TEXT, UUID, TEXT, TEXT, JSONB) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Verification function — detects tampering anywhere in chain
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_verify_audit_chain(
  p_from_seq BIGINT DEFAULT 1,
  p_to_seq   BIGINT DEFAULT NULL
)
RETURNS TABLE (
  seq          BIGINT,
  is_valid     BOOLEAN,
  expected_hash TEXT,
  stored_hash   TEXT,
  break_detected BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  r            RECORD;
  v_prev_hash  TEXT := '0000000000000000000000000000000000000000000000000000000000000000';
  v_computed   TEXT;
  v_payload_str TEXT;
  v_chain_broken BOOLEAN := FALSE;
BEGIN
  FOR r IN
    SELECT a.seq, a.event_time, a.event_type, a.target_type, a.target_id,
           a.payload, a.prev_hash, a.entry_hash
    FROM public.security_audit_chain a
    WHERE a.seq >= p_from_seq
      AND (p_to_seq IS NULL OR a.seq <= p_to_seq)
    ORDER BY a.seq
  LOOP
    -- Recompute expected hash
    v_payload_str := COALESCE(r.target_type, '') || '|' ||
                     COALESCE(r.target_id, '') || '|' ||
                     COALESCE(r.event_type, '') || '|' ||
                     v_prev_hash || '|' ||
                     COALESCE(r.payload::TEXT, '{}');

    v_computed := encode(digest(v_payload_str::BYTEA, 'sha256'), 'hex');

    -- Check stored prev_hash matches what we computed as prev
    IF r.prev_hash <> v_prev_hash THEN
      v_chain_broken := TRUE;
    END IF;

    seq           := r.seq;
    is_valid      := (v_computed = r.entry_hash AND NOT v_chain_broken);
    expected_hash := v_computed;
    stored_hash   := r.entry_hash;
    break_detected := v_chain_broken;

    v_prev_hash := r.entry_hash;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION fn_verify_audit_chain(BIGINT, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_verify_audit_chain(BIGINT, BIGINT) FROM anon;
GRANT EXECUTE ON FUNCTION fn_verify_audit_chain(BIGINT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION fn_verify_audit_chain(BIGINT, BIGINT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Trigger on user_roles — log every RBAC change to tamper-evident chain
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_audit_user_role_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_payload JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_payload := jsonb_build_object(
      'operation', 'INSERT',
      'user_id', NEW.user_id,
      'role', NEW.role::TEXT,
      'workspace_id', NEW.workspace_id,
      'assigned_by', NEW.assigned_by,
      'new_row', row_to_json(NEW)
    );
    PERFORM fn_append_audit_event(
      'RBAC_GRANT', auth.uid(), 'user_roles', NEW.id::TEXT, v_payload
    );

  ELSIF TG_OP = 'UPDATE' THEN
    v_payload := jsonb_build_object(
      'operation', 'UPDATE',
      'user_id', NEW.user_id,
      'old_role', OLD.role::TEXT,
      'new_role', NEW.role::TEXT,
      'workspace_id', NEW.workspace_id,
      'old_row', row_to_json(OLD),
      'new_row', row_to_json(NEW)
    );
    PERFORM fn_append_audit_event(
      'RBAC_CHANGE', auth.uid(), 'user_roles', NEW.id::TEXT, v_payload
    );

  ELSIF TG_OP = 'DELETE' THEN
    v_payload := jsonb_build_object(
      'operation', 'DELETE',
      'user_id', OLD.user_id,
      'role', OLD.role::TEXT,
      'workspace_id', OLD.workspace_id,
      'deleted_row', row_to_json(OLD)
    );
    PERFORM fn_append_audit_event(
      'RBAC_REVOKE', auth.uid(), 'user_roles', OLD.id::TEXT, v_payload
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_user_roles_audit_chain ON public.user_roles;
CREATE TRIGGER trg_user_roles_audit_chain
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION fn_audit_user_role_change();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Seed genesis block (chain anchor)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.security_audit_chain WHERE seq = 1) THEN
    INSERT INTO public.security_audit_chain (
      event_type, actor_id, target_type, target_id, payload, prev_hash, entry_hash
    ) VALUES (
      'CHAIN_GENESIS',
      NULL,
      'system',
      'genesis',
      jsonb_build_object('migration', '20260712170100', 'timestamp', now()),
      '0000000000000000000000000000000000000000000000000000000000000000',
      encode(digest(
        ('system|genesis|CHAIN_GENESIS|' ||
         '0000000000000000000000000000000000000000000000000000000000000000|' ||
         '{"migration":"20260712170100"}')::BYTEA,
        'sha256'
      ), 'hex')
    );
    RAISE NOTICE 'Audit chain genesis block seeded';
  END IF;
END;
$$;

COMMIT;
