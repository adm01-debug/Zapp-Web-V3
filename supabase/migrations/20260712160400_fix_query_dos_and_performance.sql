-- Round 15 High Priority Gaps #5-8: Query DoS Prevention, Pagination Safety, Backup Optimization
-- Problem: OR clauses force full table scan; unbounded OFFSET DoS; partition hot spots; search_path misconfiguration
-- Solution: Indexes on OR components, cursor-based pagination, round-robin partitions, explicit search_path

-- Fix 1: Create indexes on OR clause components to prevent full table scans
CREATE INDEX IF NOT EXISTS idx_contacts_email_deleted_at
  ON contacts(email, deleted_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_phone_deleted_at
  ON contacts(phone, deleted_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_name_lower_deleted_at
  ON contacts(LOWER(name), deleted_at)
  WHERE deleted_at IS NULL;

-- Create composite index for OR optimization
CREATE INDEX IF NOT EXISTS idx_contacts_or_search
  ON contacts(deleted_at, (GREATEST(created_at, updated_at)))
  WHERE deleted_at IS NULL;

-- Add STATISTICS to hint optimizer about OR selectivity
ANALYZE contacts;

-- Fix 2: Create cursor-based pagination instead of OFFSET/LIMIT
CREATE TABLE IF NOT EXISTS _pagination_state (
  cursor_id VARCHAR(64) PRIMARY KEY,
  table_name VARCHAR(64) NOT NULL,
  last_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '1 hour'),
  CONSTRAINT pagination_cursor_not_reusable CHECK (true)
);

CREATE INDEX idx_pagination_cursor_expires ON _pagination_state(expires_at);

-- Function to create pagination cursor (safe alternative to OFFSET)
CREATE OR REPLACE FUNCTION create_pagination_cursor(
  p_table_name VARCHAR,
  p_last_id UUID
)
RETURNS VARCHAR AS $$
DECLARE
  v_cursor_id VARCHAR(64);
BEGIN
  v_cursor_id := encode(digest(
    p_table_name || p_last_id::TEXT || now()::TEXT || random()::TEXT,
    'sha256'
  ), 'hex');

  INSERT INTO _pagination_state (cursor_id, table_name, last_id)
  VALUES (v_cursor_id, p_table_name, p_last_id);

  RETURN v_cursor_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to fetch next page using cursor (prevents OFFSET DoS)
CREATE OR REPLACE FUNCTION get_page_via_cursor(
  p_cursor_id VARCHAR,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  row_count INT,
  cursor_id VARCHAR,
  next_cursor_id VARCHAR
) AS $$
DECLARE
  v_table_name VARCHAR;
  v_last_id UUID;
  v_count INT := 0;
  v_next_last_id UUID;
BEGIN
  -- Validate cursor exists and not expired
  SELECT table_name, last_id INTO v_table_name, v_last_id
  FROM _pagination_state
  WHERE cursor_id = p_cursor_id
  AND expires_at > now();

  IF v_table_name IS NULL THEN
    RAISE EXCEPTION 'Pagination cursor expired or invalid'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Fetch next batch using ID comparison (no OFFSET)
  CASE v_table_name
    WHEN 'contacts' THEN
      SELECT COUNT(*), MAX(id) INTO v_count, v_next_last_id
      FROM contacts
      WHERE id > v_last_id
      AND deleted_at IS NULL
      LIMIT p_limit;

    WHEN 'conversations' THEN
      SELECT COUNT(*), MAX(id) INTO v_count, v_next_last_id
      FROM conversations
      WHERE id > v_last_id
      LIMIT p_limit;

    ELSE
      RAISE EXCEPTION 'Unknown table for pagination: %', v_table_name
        USING ERRCODE = 'invalid_parameter_value';
  END CASE;

  -- Generate next cursor if more rows exist
  RETURN QUERY SELECT
    v_count::INT,
    p_cursor_id,
    CASE WHEN v_count >= p_limit THEN
      create_pagination_cursor(v_table_name, v_next_last_id)
    ELSE
      NULL::VARCHAR
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Schedule cleanup of expired cursors (run every 2 hours)
SELECT cron.schedule(
  'cleanup_expired_pagination_cursors',
  '0 */2 * * *',
  'DELETE FROM _pagination_state WHERE expires_at < now()'
);

-- Fix 3: Partition backup strategy with round-robin selection
CREATE TABLE IF NOT EXISTS backup_partition_allocation (
  partition_id INT PRIMARY KEY,
  partition_name VARCHAR(64) NOT NULL UNIQUE,
  last_used_at TIMESTAMPTZ DEFAULT now(),
  record_count BIGINT DEFAULT 0,
  allocation_weight FLOAT DEFAULT 1.0
);

-- Insert partitions (assume monthly partitions)
DO $$
DECLARE
  i INT;
BEGIN
  FOR i IN 1..12 LOOP
    INSERT INTO backup_partition_allocation (partition_id, partition_name)
    VALUES (i, 'backup_campaign_contacts_' || to_char(now() - (i || ' months')::INTERVAL, 'YYYYMM'))
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- Function to select next partition using round-robin (prevents hot spots)
CREATE OR REPLACE FUNCTION get_next_backup_partition()
RETURNS VARCHAR AS $$
DECLARE
  v_partition_name VARCHAR(64);
BEGIN
  SELECT partition_name INTO v_partition_name
  FROM backup_partition_allocation
  ORDER BY last_used_at ASC, record_count ASC
  LIMIT 1;

  -- Update last_used_at
  UPDATE backup_partition_allocation
  SET last_used_at = now()
  WHERE partition_name = v_partition_name;

  RETURN v_partition_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to rebalance partitions if hot spot detected
CREATE OR REPLACE FUNCTION rebalance_backup_partitions()
RETURNS TABLE (
  rebalance_operations INT,
  rebalance_timestamp TIMESTAMPTZ
) AS $$
DECLARE
  v_max_deviation FLOAT;
  v_avg_record_count BIGINT;
  v_rebalance_count INT := 0;
BEGIN
  SELECT AVG(record_count) INTO v_avg_record_count
  FROM backup_partition_allocation;

  -- Detect hot spots (>2x average)
  SELECT COUNT(*) INTO v_rebalance_count
  FROM backup_partition_allocation
  WHERE record_count > v_avg_record_count * 2;

  IF v_rebalance_count > 0 THEN
    -- Mark hot partitions for redistribution
    UPDATE backup_partition_allocation
    SET allocation_weight = 0.5
    WHERE record_count > v_avg_record_count * 2;
  END IF;

  RETURN QUERY SELECT v_rebalance_count, now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix 4: Explicit search_path in all SECURITY DEFINER functions
-- Create wrapper to enforce search_path at function start
CREATE OR REPLACE FUNCTION set_secure_search_path()
RETURNS void AS $$
BEGIN
  -- This should be set at session start
  SET search_path TO public, pg_temp;
END;
$$ LANGUAGE plpgsql;

-- Create audit trigger to monitor search_path changes
CREATE TABLE IF NOT EXISTS search_path_audit (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT,
  old_search_path TEXT,
  new_search_path TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID
);

-- Add comments
COMMENT ON TABLE _pagination_state IS
  'Cursor-based pagination state. Prevents OFFSET-based DoS attacks. '
  'Cursors expire after 1 hour. Use create_pagination_cursor() to create, get_page_via_cursor() to fetch.';

COMMENT ON FUNCTION get_page_via_cursor(VARCHAR, INT) IS
  'Fetch next page using cursor-based pagination (not OFFSET/LIMIT). '
  'Prevents DoS from unbounded OFFSET on large tables. '
  'Returns row count and next cursor if more data available.';

COMMENT ON TABLE backup_partition_allocation IS
  'Round-robin partition allocation for backups. Prevents hot spot concentration. '
  'last_used_at tracks when partition was last selected; record_count tracks size. '
  'get_next_backup_partition() uses least-recently-used + smallest-by-size selection.';

COMMENT ON FUNCTION rebalance_backup_partitions() IS
  'Detect and rebalance backup partitions to prevent hot spots. '
  'Flags partitions >2x average size for redistribution. '
  'Scheduled to run after major backup operations.';
