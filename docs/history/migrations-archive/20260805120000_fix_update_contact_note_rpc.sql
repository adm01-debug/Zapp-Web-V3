-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260805120000_fix_update_contact_note_rpc.sql
-- Purpose  : CRITICAL gap found in exhaustive validation (2026-08-04, 5-agent audit).
--            The frontend (delta PR #724/#808) calls zapp.update_contact_note()
--            but the RPC was NEVER created: migration M24 (20260802000024,
--            branch claude/plan-implementation-review-bq8j14) was superseded by
--            the canonical squash, which only kept add_contact_note (canonical:12283).
--            Result: editing a contact note returns PGRST 404 (function not found).
-- Fix      : Create the RPC WITHOUT the updated_by column (verified NOT to exist
--            in production zapp.contact_notes — only id, contact_id, author_id,
--            content, created_at, updated_at, note_type, is_pinned).
--            Ownership guard: author or admin/supervisor only.
-- Verified : pg_proc in production 2026-08-04: update_contact_note absent.
-- Idempotent: CREATE OR REPLACE — safe to re-run.
-- Rollback  : DROP FUNCTION zapp.update_contact_note(uuid, text, text, boolean);
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION zapp.update_contact_note(
  p_note_id   uuid,
  p_content   text    DEFAULT NULL,
  p_note_type text    DEFAULT NULL,
  p_is_pinned boolean DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'zapp', 'evo', 'public'
AS $fn$
DECLARE
  v_profile_id  uuid;
  v_author_id   uuid;
  v_norm_type   text;
BEGIN
  v_profile_id := zapp.get_profile_id_for_user(auth.uid());
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'update_contact_note: perfil nao encontrado para uid=%', auth.uid()
      USING ERRCODE = '42501';
  END IF;

  -- Fetch existing note's author
  SELECT author_id INTO v_author_id
    FROM zapp.contact_notes
   WHERE id = p_note_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'update_contact_note: nota % nao encontrada', p_note_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Ownership / role guard
  IF v_profile_id <> v_author_id AND NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'forbidden: somente o autor ou admin pode editar esta nota'
      USING ERRCODE = '42501';
  END IF;

  -- Normalize note_type when provided
  IF p_note_type IS NOT NULL THEN
    v_norm_type := pg_catalog.lower(p_note_type);
    IF v_norm_type NOT IN ('general','call','email','meeting','task','internal') THEN
      v_norm_type := 'general';
    END IF;
  END IF;

  UPDATE zapp.contact_notes SET
    content    = CASE WHEN p_content   IS NOT NULL THEN p_content   ELSE content    END,
    note_type  = CASE WHEN p_note_type IS NOT NULL THEN v_norm_type ELSE note_type  END,
    is_pinned  = CASE WHEN p_is_pinned IS NOT NULL THEN p_is_pinned ELSE is_pinned  END,
    updated_at = pg_catalog.now()
  WHERE id = p_note_id;

  RETURN pg_catalog.jsonb_build_object(
    'id',         p_note_id,
    'updated_at', pg_catalog.now()
  );
END;
$fn$;

COMMENT ON FUNCTION zapp.update_contact_note(uuid, text, text, boolean)
  IS 'Updates a contact note. Only the author or admin/supervisor may edit. '
     'NULL params = keep existing value. (created 2026-08-05 — gap fix, RPC was '
     'missing from production while frontend already called it)';

REVOKE EXECUTE ON FUNCTION zapp.update_contact_note(uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.update_contact_note(uuid, text, text, boolean) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_exists BOOLEAN;
  v_acl    TEXT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'update_contact_note'
     AND p.proargnames = ARRAY['p_note_id','p_content','p_note_type','p_is_pinned']
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: zapp.update_contact_note not created';
  END IF;

  SELECT pg_catalog.array_to_string(p.proacl, ',') INTO v_acl
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'update_contact_note'
     AND p.proargnames = ARRAY['p_note_id','p_content','p_note_type','p_is_pinned'];

  IF v_acl IS NULL OR v_acl NOT LIKE '%authenticated=X%' THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: authenticated EXECUTE missing: %', v_acl;
  END IF;
  IF v_acl LIKE '%anon=X%' OR v_acl LIKE '%PUBLIC=X%' THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: anon/PUBLIC has EXECUTE: %', v_acl;
  END IF;
END $$;

COMMIT;
