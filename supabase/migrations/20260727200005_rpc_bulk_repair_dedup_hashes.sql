-- Migration: rpc_bulk_repair_dedup_hashes
--
-- Bulk-repairs missing dedup_hash values for evolution_contacts using
-- the same hash formula as the LGPD edge function (lgpd-scheduled-jobs job 3):
--
--   sha256( digits(phone_number) || '|' || lower(email) || '|' || lower(full_name) )
--
-- Runs entirely in the database (pgcrypto digest) to avoid the overhead of
-- fetching thousands of rows to the edge function and back.  The edge function
-- job 3 is still the primary path for incremental maintenance; this RPC is
-- intended for bulk on-demand repair (e.g. after a backfill of messages that
-- created many new contacts, or after a migration that altered the formula).
--
-- Safety guards:
--   - SECURITY DEFINER + fixed search_path (zapp, evo)
--   - Admin/supervisor role check via zapp.is_admin_or_supervisor()
--   - pii_masked_at IS NULL filter — never overwrite anonymized contacts
--   - p_batch_size: capped at 10,000 per call to bound transaction time
--   - p_dry_run: preview what would be updated without committing
--
-- Returns:
--   { updated, skipped, dry_run, instance_name, elapsed_ms }

-- Ensure pgcrypto is available (extension is pre-installed on Supabase)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION zapp.rpc_bulk_repair_dedup_hashes(
  p_instance_name text    DEFAULT 'wpp2',
  p_batch_size    int     DEFAULT 5000,
  p_dry_run       boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, evo, public
AS $$
DECLARE
  v_start     timestamptz := clock_timestamp();
  v_cap       int         := LEAST(p_batch_size, 10000);
  v_updated   bigint      := 0;
  v_skipped   bigint;
BEGIN
  -- Role guard: only admins/supervisors
  IF NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required'
      USING ERRCODE = 'P0001';
  END IF;

  -- Count rows that would be skipped (already have a hash)
  SELECT COUNT(*)
    INTO v_skipped
    FROM evo.evolution_contacts
   WHERE instance_name   = p_instance_name
     AND dedup_hash      IS NOT NULL
     AND deleted_at      IS NULL;

  IF NOT p_dry_run THEN
    -- Update up to p_batch_size contacts that are missing dedup_hash.
    -- Hash formula matches lgpd-scheduled-jobs job 3:
    --   sha256( regexp_replace(phone_number, '\D', '', 'g') || '|' ||
    --           lower(coalesce(email,''))                   || '|' ||
    --           lower(coalesce(full_name,''))               )
    WITH candidates AS (
      SELECT id
        FROM evo.evolution_contacts
       WHERE instance_name = p_instance_name
         AND dedup_hash    IS NULL
         AND pii_masked_at IS NULL
         AND deleted_at    IS NULL
       LIMIT v_cap
       FOR UPDATE SKIP LOCKED
    ),
    updated AS (
      UPDATE evo.evolution_contacts ec
         SET dedup_hash = encode(
               digest(
                 regexp_replace(coalesce(ec.phone_number, ''), '\D', '', 'g')
                 || '|'
                 || lower(coalesce(ec.email, ''))
                 || '|'
                 || lower(coalesce(ec.full_name, '')),
                 'sha256'
               ),
               'hex'
             ),
             updated_at  = now()
        FROM candidates c
       WHERE ec.id          = c.id
         AND ec.pii_masked_at IS NULL
      RETURNING ec.id
    )
    SELECT COUNT(*) INTO v_updated FROM updated;
  ELSE
    -- Dry run: just count how many would be updated
    SELECT COUNT(*)
      INTO v_updated
      FROM evo.evolution_contacts
     WHERE instance_name = p_instance_name
       AND dedup_hash    IS NULL
       AND pii_masked_at IS NULL
       AND deleted_at    IS NULL
     LIMIT v_cap;
  END IF;

  RETURN jsonb_build_object(
    'updated',        v_updated,
    'skipped',        v_skipped,
    'dry_run',        p_dry_run,
    'batch_size',     v_cap,
    'instance_name',  p_instance_name,
    'elapsed_ms',     EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000
  );
END;
$$;

-- Permissions
REVOKE EXECUTE ON FUNCTION zapp.rpc_bulk_repair_dedup_hashes(text, int, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION zapp.rpc_bulk_repair_dedup_hashes(text, int, boolean) FROM anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_bulk_repair_dedup_hashes(text, int, boolean) TO authenticated;

COMMENT ON FUNCTION zapp.rpc_bulk_repair_dedup_hashes(text, int, boolean) IS
  'Bulk-computes and writes dedup_hash for contacts missing it in the given Evolution '
  'instance. Same hash formula as LGPD edge function job 3 (SHA-256 of phone|email|name). '
  'Requires admin or supervisor role. Capped at 10,000 rows per call. '
  'Use p_dry_run=true to preview without committing.';
