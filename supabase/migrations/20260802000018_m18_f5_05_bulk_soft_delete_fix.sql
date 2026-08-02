-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260802000018_m18_f5_05_bulk_soft_delete_fix.sql
-- Purpose  : F5-05 CRÍTICO — Fix zapp.bulk_soft_delete_contacts() which was
--            referencing columns deleted_by / deleted_reason on the VIEW
--            zapp.contacts. Those columns do not exist on the view; only on
--            the physical table evo.evolution_contacts (added by M-16 F5-03).
--
-- Root cause: Previous implementation ran:
--   UPDATE zapp.contacts SET deleted_at=now(), deleted_by=auth.uid(),
--          deleted_reason=p_reason, updated_at=now()
-- zapp.contacts is an auto-updatable VIEW with security_invoker=on.
-- Its SELECT clause does not expose deleted_by or deleted_reason, so
-- PostgreSQL rejected the UPDATE at parse time with:
--   "column "deleted_by" of relation "contacts" does not exist"
--
-- Fix: Rewrite function to UPDATE evo.evolution_contacts directly, bypassing
--      the VIEW. Columns deleted_by / deleted_reason / undo_expires_at are
--      now present on the physical table (M-16 added them).
--
-- Changes:
--   1. CREATE OR REPLACE zapp.bulk_soft_delete_contacts() — updates
--      evo.evolution_contacts directly.
--   2. Revoke from PUBLIC/anon; grant to authenticated only.
--
-- Idempotência: CREATE OR REPLACE — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION zapp.bulk_soft_delete_contacts(
  p_contact_ids  uuid[],
  p_reason       text DEFAULT NULL
)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'zapp', 'evo', 'public'
AS $function$
DECLARE
  v_count  integer;
  v_caller uuid;
BEGIN
  -- ── Authorization ──────────────────────────────────────────────────────────
  IF NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'permission denied: admin or supervisor required'
      USING ERRCODE = '42501';
  END IF;

  -- ── Input validation ───────────────────────────────────────────────────────
  IF p_contact_ids IS NULL OR array_length(p_contact_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  IF array_length(p_contact_ids, 1) > 500 THEN
    RAISE EXCEPTION 'maximum 500 contacts per bulk operation, got %',
      array_length(p_contact_ids, 1)
      USING ERRCODE = 'P0001';
  END IF;

  v_caller := auth.uid();

  -- ── Soft-delete: UPDATE physical table directly (bypass view) ──────────────
  -- evo.evolution_contacts has deleted_by / deleted_reason / undo_expires_at
  -- since migration M-16 (F5-03). The VIEW zapp.contacts does NOT expose these
  -- columns, so any UPDATE targeting the view would fail at parse time.
  UPDATE evo.evolution_contacts
     SET deleted_at      = now(),
         deleted_by      = v_caller,
         deleted_reason  = COALESCE(p_reason, 'bulk_deletion'),
         undo_expires_at = now() + INTERVAL '30 days',
         updated_at      = now()
   WHERE id         = ANY(p_contact_ids)
     AND deleted_at IS NULL;  -- idempotent: already-deleted rows are skipped

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- ── Audit log ──────────────────────────────────────────────────────────────
  IF v_count > 0 THEN
    INSERT INTO zapp.audit_logs (
      action, entity_type, entity_id, performed_by, details
    ) VALUES (
      'bulk_soft_delete',
      'contact',
      p_contact_ids[1],            -- representative entity_id (first in batch)
      v_caller,
      jsonb_build_object(
        'contact_ids',  p_contact_ids,
        'count',        v_count,
        'reason',       COALESCE(p_reason, 'bulk_deletion'),
        'deleted_at',   now()
      )
    ) ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_count;
END;
$function$;

-- Permissions: authenticated users who pass the is_admin_or_supervisor() check.
REVOKE EXECUTE ON FUNCTION zapp.bulk_soft_delete_contacts(uuid[], text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.bulk_soft_delete_contacts(uuid[], text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_secdef  BOOLEAN;
  v_lang    TEXT;
  v_schpath TEXT;
BEGIN
  SELECT prosecdef, l.lanname,
         (SELECT s FROM unnest(proconfig) s WHERE s LIKE 'search_path%' LIMIT 1)
    INTO v_secdef, v_lang, v_schpath
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_language  l ON l.oid = p.prolang
   WHERE n.nspname = 'zapp' AND p.proname = 'bulk_soft_delete_contacts';

  IF NOT FOUND THEN
    RAISE EXCEPTION '[M-18 VER] bulk_soft_delete_contacts not found in zapp schema';
  END IF;

  IF NOT v_secdef THEN
    RAISE EXCEPTION '[M-18 VER] bulk_soft_delete_contacts is not SECURITY DEFINER';
  END IF;

  RAISE NOTICE '[M-18 VER] F5-05 bulk_soft_delete_contacts OK — lang=% SECURITY DEFINER ✓ search_path=% ✓',
    v_lang, v_schpath;
END $$;
