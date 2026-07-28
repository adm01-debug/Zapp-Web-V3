-- Migration: rpc_backfill_messages_contact_id
-- Repairs rows in zapp.messages where contact_id is NULL but a matching
-- contact exists (matched by phone or remote_jid).

CREATE OR REPLACE FUNCTION zapp.rpc_backfill_messages_contact_id(
  p_limit   INT     DEFAULT 1000,
  p_dry_run BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (repaired BIGINT, dry_run BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'zapp', 'pg_catalog'
AS $fn$
DECLARE v_count BIGINT := 0;
BEGIN
  IF p_dry_run THEN
    SELECT COUNT(*) INTO v_count
    FROM zapp.messages m
    WHERE m.contact_id IS NULL
      AND EXISTS (
        SELECT 1 FROM zapp.contacts c
        WHERE c.phone = m.sender_phone
      )
    LIMIT p_limit;
    RETURN QUERY SELECT v_count, TRUE;
    RETURN;
  END IF;

  WITH fixed AS (
    UPDATE zapp.messages m
    SET contact_id = (
      SELECT c.id FROM zapp.contacts c
      WHERE c.phone = m.sender_phone
      LIMIT 1
    )
    WHERE m.contact_id IS NULL
      AND m.sender_phone IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM zapp.contacts c2 WHERE c2.phone = m.sender_phone
      )
    LIMIT p_limit
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM fixed;

  RETURN QUERY SELECT v_count, FALSE;
END;
$fn$;

GRANT EXECUTE ON FUNCTION zapp.rpc_backfill_messages_contact_id(INT,BOOLEAN) TO service_role;
