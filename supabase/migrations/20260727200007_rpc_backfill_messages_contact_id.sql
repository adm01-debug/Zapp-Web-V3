-- Migration: rpc_backfill_messages_contact_id
--
-- Repairs evolution_messages rows where contact_id IS NULL by joining against
-- evolution_contacts on (instance_name, remote_jid) or (instance_name, phone_number).
--
-- This is the DB-side repair path surfaced by rpc_get_pipeline_health under
-- the 'messages_no_contact' penalty. It avoids Edge Function roundtrips for
-- large repair jobs (tens of thousands of rows).
--
-- Algorithm:
--   1. Find messages without contact_id that are not groups/broadcast/system
--   2. Join to evolution_contacts via remote_jid (exact match, fastest) or
--      via phone_number extracted from remote_jid (covers @s.whatsapp.net format)
--   3. UPDATE in a single CTE to minimise lock time
--   4. Cap at p_batch_size (default 5000, max 20000) to bound transaction time
--
-- Returns:
--   { repaired, remaining_estimate, instance_name, elapsed_ms, dry_run }

CREATE OR REPLACE FUNCTION zapp.rpc_backfill_messages_contact_id(
  p_instance_name text    DEFAULT 'wpp2',
  p_batch_size    int     DEFAULT 5000,
  p_dry_run       boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, evo
AS $$
DECLARE
  v_start         timestamptz := clock_timestamp();
  v_cap           int         := LEAST(p_batch_size, 20000);
  v_repaired      bigint      := 0;
  v_remaining     bigint;
BEGIN
  -- Role guard: only admins/supervisors
  IF NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT p_dry_run THEN
    -- Repair step: join messages to contacts via remote_jid first, then
    -- fall back to phone_number extracted from jid (split_part('@',1)).
    WITH candidates AS (
      SELECT m.id AS msg_id
        FROM evo.evolution_messages m
       WHERE m.instance_name = p_instance_name
         AND m.contact_id    IS NULL
         AND m.remote_jid    NOT LIKE '%@g.us'
         AND m.remote_jid    NOT LIKE '%@broadcast'
         AND m.remote_jid    NOT IN ('unknown@s.whatsapp.net', 'unknown@deleted')
         AND split_part(m.remote_jid, '@', 1) NOT LIKE 'smoke%'
       LIMIT v_cap
       FOR UPDATE SKIP LOCKED
    ),
    contact_match AS (
      -- Priority 1: exact remote_jid match (O(1) via unique index)
      SELECT DISTINCT ON (m.id)
             m.id                AS msg_id,
             c.id                AS contact_id
        FROM candidates cand
        JOIN evo.evolution_messages m ON m.id = cand.msg_id
        JOIN evo.evolution_contacts c
          ON c.instance_name = m.instance_name
         AND c.remote_jid    = m.remote_jid
         AND c.deleted_at    IS NULL
      UNION ALL
      -- Priority 2: phone_number match (strips @suffix, removes non-digits)
      SELECT DISTINCT ON (m.id)
             m.id                AS msg_id,
             c.id                AS contact_id
        FROM candidates cand
        JOIN evo.evolution_messages m ON m.id = cand.msg_id
        LEFT JOIN evo.evolution_contacts c
          ON c.instance_name = m.instance_name
         AND c.phone_number  = regexp_replace(split_part(m.remote_jid, '@', 1), '\D', '', 'g')
         AND c.deleted_at    IS NULL
       WHERE c.id IS NOT NULL
    ),
    best_match AS (
      -- Pick first match per message (remote_jid match wins due to UNION ALL order)
      SELECT DISTINCT ON (msg_id) msg_id, contact_id
        FROM contact_match
       WHERE contact_id IS NOT NULL
       ORDER BY msg_id
    ),
    updated AS (
      UPDATE evo.evolution_messages em
         SET contact_id = bm.contact_id
        FROM best_match bm
       WHERE em.id = bm.msg_id
         AND em.contact_id IS NULL
      RETURNING em.id
    )
    SELECT COUNT(*) INTO v_repaired FROM updated;
  ELSE
    -- Dry run: count candidates
    SELECT COUNT(*)
      INTO v_repaired
      FROM (
        SELECT m.id
          FROM evo.evolution_messages m
         WHERE m.instance_name = p_instance_name
           AND m.contact_id    IS NULL
           AND m.remote_jid    NOT LIKE '%@g.us'
           AND m.remote_jid    NOT LIKE '%@broadcast'
           AND m.remote_jid    NOT IN ('unknown@s.whatsapp.net', 'unknown@deleted')
           AND split_part(m.remote_jid, '@', 1) NOT LIKE 'smoke%'
         LIMIT v_cap
      ) sub;
  END IF;

  -- Estimate how many remain after this batch
  SELECT COUNT(*)
    INTO v_remaining
    FROM evo.evolution_messages
   WHERE instance_name = p_instance_name
     AND contact_id    IS NULL
     AND remote_jid    NOT LIKE '%@g.us'
     AND remote_jid    NOT LIKE '%@broadcast'
     AND remote_jid    NOT IN ('unknown@s.whatsapp.net', 'unknown@deleted')
     AND split_part(remote_jid, '@', 1) NOT LIKE 'smoke%';

  RETURN jsonb_build_object(
    'repaired',           v_repaired,
    'remaining_estimate', v_remaining,
    'instance_name',      p_instance_name,
    'dry_run',            p_dry_run,
    'batch_size',         v_cap,
    'elapsed_ms',         EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000
  );
END;
$$;

-- Permissions
REVOKE EXECUTE ON FUNCTION zapp.rpc_backfill_messages_contact_id(text, int, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION zapp.rpc_backfill_messages_contact_id(text, int, boolean) FROM anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_backfill_messages_contact_id(text, int, boolean) TO authenticated;

COMMENT ON FUNCTION zapp.rpc_backfill_messages_contact_id(text, int, boolean) IS
  'Repairs evolution_messages rows with contact_id IS NULL by joining to evolution_contacts '
  'via remote_jid (exact) or phone_number (extracted). Capped at 20k rows per call. '
  'Use p_dry_run=true to preview the repair count. Requires admin or supervisor role.';
