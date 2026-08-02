-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260802000016_m16_f5_03_soft_delete_contacts.sql
-- Purpose  : F5-03 CRÍTICO — Replace hard DELETE in fn_contacts_view_delete_handler
--            with a proper soft-delete that satisfies LGPD requirements.
--
-- Root cause: fn_contacts_view_delete_handler() executed
--   DELETE FROM evo.evolution_contacts WHERE id = OLD.id
--   bypassing the soft-delete mechanism already implied by the view filter
--   (zapp.contacts WHERE ec.deleted_at IS NULL). Hard-deletes are LGPD-illegal
--   within the mandatory 30-day undo window.
--
-- Changes:
--   1. ADD COLUMN IF NOT EXISTS: deleted_by, deleted_reason, undo_expires_at
--      to evo.evolution_contacts (deleted_at already exists).
--   2. Rewrite fn_contacts_view_delete_handler() in the zapp schema
--      (SECURITY DEFINER, SET search_path) as soft-delete via UPDATE.
--   3. Create zapp.undo_soft_delete(p_contact_id uuid) — admin only, 30-day window.
--   4. Register pg_cron job hard-delete-expired-contacts (runs daily at 03:00 UTC).
--
-- Idempotência: ADD COLUMN IF NOT EXISTS; CREATE OR REPLACE; cron schedule
--   uses DELETE + INSERT pattern (safe to re-run).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: Add soft-delete metadata columns to evo.evolution_contacts
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE evo.evolution_contacts
  ADD COLUMN IF NOT EXISTS deleted_by     uuid,
  ADD COLUMN IF NOT EXISTS deleted_reason text,
  ADD COLUMN IF NOT EXISTS undo_expires_at timestamptz;

-- Index for the daily hard-delete cron (only touches expired soft-deleted rows).
CREATE INDEX IF NOT EXISTS evolution_contacts_soft_delete_expiry_idx
  ON evo.evolution_contacts (undo_expires_at)
  WHERE deleted_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: Rewrite fn_contacts_view_delete_handler as soft-delete
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_contacts_view_delete_handler()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'zapp', 'evo', 'public'
AS $function$
DECLARE
  v_caller_id uuid;
BEGIN
  -- Resolve the calling user; NULL is acceptable for service-role/cron.
  v_caller_id := auth.uid();

  UPDATE evo.evolution_contacts
     SET deleted_at      = now(),
         deleted_by      = v_caller_id,
         undo_expires_at = now() + INTERVAL '30 days',
         updated_at      = now()
   WHERE id = OLD.id
     AND deleted_at IS NULL;  -- idempotent: already soft-deleted rows are no-ops

  RETURN OLD;
END;
$function$;

-- Revoke broad access; only authenticated users reach it through the view trigger.
REVOKE EXECUTE ON FUNCTION zapp.fn_contacts_view_delete_handler() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_contacts_view_delete_handler() TO authenticated, service_role;

-- Ensure the trigger on zapp.contacts INSTEAD OF DELETE points to the new function.
-- Drop any legacy trigger that might point to the old public.fn_contacts_view_delete_handler.
DO $$
BEGIN
  -- Drop legacy trigger in any schema that calls the old function.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c   ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_proc p    ON p.oid = t.tgfoid
    JOIN pg_catalog.pg_namespace np ON np.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND c.relname = 'contacts'
     AND p.proname = 'fn_contacts_view_delete_handler'
     AND np.nspname = 'public'
  ) THEN
    DROP TRIGGER IF EXISTS contacts_delete_trigger ON zapp.contacts;
    RAISE NOTICE '[M-16] Dropped legacy contacts_delete_trigger (was pointing to public schema fn)';
  END IF;
END $$;

-- Recreate trigger pointing to zapp.fn_contacts_view_delete_handler.
DROP TRIGGER IF EXISTS contacts_delete_trigger ON zapp.contacts;
CREATE TRIGGER contacts_delete_trigger
  INSTEAD OF DELETE ON zapp.contacts
  FOR EACH ROW EXECUTE FUNCTION zapp.fn_contacts_view_delete_handler();

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 3: RPC undo_soft_delete — admin/supervisor only, within 30-day window
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.undo_soft_delete(p_contact_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'zapp', 'evo', 'public'
AS $function$
DECLARE
  v_contact evo.evolution_contacts%ROWTYPE;
BEGIN
  -- Only admins and supervisors may undo deletes.
  IF NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'permission denied: admin or supervisor required'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_contact
    FROM evo.evolution_contacts
   WHERE id = p_contact_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact % not found', p_contact_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_contact.deleted_at IS NULL THEN
    RETURN jsonb_build_object('restored', false, 'reason', 'contact is not soft-deleted');
  END IF;

  IF v_contact.undo_expires_at IS NOT NULL AND v_contact.undo_expires_at < now() THEN
    RAISE EXCEPTION 'undo window expired on %', v_contact.undo_expires_at
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE evo.evolution_contacts
     SET deleted_at      = NULL,
         deleted_by      = NULL,
         deleted_reason  = NULL,
         undo_expires_at = NULL,
         updated_at      = now()
   WHERE id = p_contact_id;

  -- Audit trail
  INSERT INTO zapp.audit_logs (
    action, entity_type, entity_id, performed_by, details
  ) VALUES (
    'undo_soft_delete', 'contact', p_contact_id, auth.uid(),
    jsonb_build_object('restored_at', now())
  ) ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('restored', true, 'contact_id', p_contact_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION zapp.undo_soft_delete(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.undo_soft_delete(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 4: Cron job — hard-delete contacts whose 30-day window has expired
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE '[M-16] pg_cron not available — skipping cron registration';
    RETURN;
  END IF;

  -- Remove any existing schedule for this job to allow safe re-run.
  DELETE FROM cron.job WHERE jobname = 'hard-delete-expired-contacts';

  -- Run daily at 03:00 UTC; limited batch of 10k per run to avoid long locks.
  PERFORM cron.schedule(
    'hard-delete-expired-contacts',
    '0 3 * * *',
    $$
    DELETE FROM evo.evolution_contacts
     WHERE deleted_at IS NOT NULL
       AND undo_expires_at < NOW()
     LIMIT 10000;
    $$
  );

  RAISE NOTICE '[M-16] Cron hard-delete-expired-contacts scheduled (daily 03:00 UTC)';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn_exists  BOOLEAN;
  v_secdef     BOOLEAN;
  v_trig_count INTEGER;
  v_col_count  INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'fn_contacts_view_delete_handler'
  ) INTO v_fn_exists;

  IF NOT v_fn_exists THEN
    RAISE EXCEPTION '[M-16 VER] fn_contacts_view_delete_handler not found in zapp schema';
  END IF;

  SELECT prosecdef INTO v_secdef
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp' AND p.proname = 'fn_contacts_view_delete_handler';

  IF NOT v_secdef THEN
    RAISE EXCEPTION '[M-16 VER] fn_contacts_view_delete_handler is not SECURITY DEFINER';
  END IF;

  SELECT COUNT(*) INTO v_trig_count
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c   ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'zapp' AND c.relname = 'contacts'
     AND t.tgname = 'contacts_delete_trigger'
     AND NOT t.tgisinternal;

  IF v_trig_count = 0 THEN
    RAISE EXCEPTION '[M-16 VER] contacts_delete_trigger not found on zapp.contacts';
  END IF;

  SELECT COUNT(*) INTO v_col_count
    FROM information_schema.columns
   WHERE table_schema = 'evo'
     AND table_name   = 'evolution_contacts'
     AND column_name IN ('deleted_by', 'deleted_reason', 'undo_expires_at');

  IF v_col_count < 3 THEN
    RAISE EXCEPTION '[M-16 VER] Missing soft-delete columns on evo.evolution_contacts (found %/3)', v_col_count;
  END IF;

  RAISE NOTICE '[M-16 VER] F5-03 SOFT-DELETE OK — trigger ✓ SECURITY DEFINER ✓ columns(%) ✓', v_col_count;
END $$;
