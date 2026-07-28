-- Migration: rpc_bulk_repair_dedup_hashes
CREATE OR REPLACE FUNCTION zapp.rpc_bulk_repair_dedup_hashes(
  p_limit  INT DEFAULT 500,
  p_dry_run BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (repaired INT, dry_run BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'zapp', 'pg_catalog'
AS $fn$
DECLARE v_count INT := 0;
BEGIN
  IF p_dry_run THEN
    SELECT COUNT(*) INTO v_count
    FROM zapp.messages
    WHERE dedup_hash IS NULL
      AND content IS NOT NULL
    LIMIT p_limit;
    RETURN QUERY SELECT v_count, TRUE;
    RETURN;
  END IF;

  WITH updated AS (
    UPDATE zapp.messages
    SET dedup_hash = md5(
      COALESCE(whatsapp_message_id,'') || '|' ||
      COALESCE(content,'') || '|' ||
      COALESCE(contact_id::TEXT,'')
    )
    WHERE dedup_hash IS NULL
      AND content IS NOT NULL
    LIMIT p_limit
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM updated;

  RETURN QUERY SELECT v_count, FALSE;
END;
$fn$;

GRANT EXECUTE ON FUNCTION zapp.rpc_bulk_repair_dedup_hashes(INT,BOOLEAN) TO service_role;
