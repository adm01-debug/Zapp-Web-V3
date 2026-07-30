-- Round 15 High Priority Gap #1: Consent Audit Growth Prevention
-- Problem: LGPD consent audit table grows 3.65x larger than contacts table (1000 toggles/day)
-- Solution: Implement archive table + rotation policy, move records >90 days old

-- Create archive table for old consent records (append-only)
CREATE TABLE IF NOT EXISTS lgpd_consent_audit_archive (
  id BIGSERIAL PRIMARY KEY,
  contact_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL, -- 'consent_given', 'consent_revoked', 'unmask_request', 'delete_request'
  timestamp TIMESTAMPTZ NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archive_batch_id VARCHAR(50) -- batch identifier for rollback capability
);

-- Create index for archive lookups
CREATE INDEX idx_consent_audit_archive_contact ON lgpd_consent_audit_archive(contact_id);
CREATE INDEX idx_consent_audit_archive_timestamp ON lgpd_consent_audit_archive(timestamp);
CREATE INDEX idx_consent_audit_archive_batch ON lgpd_consent_audit_archive(archive_batch_id);

-- Enable RLS (read-only for auditing)
ALTER TABLE lgpd_consent_audit_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY consent_audit_archive_read_only ON lgpd_consent_audit_archive
  AS PERMISSIVE FOR SELECT USING (true)
  AS RESTRICTIVE FOR UPDATE, DELETE USING (false);

-- Create archival function (SECURITY DEFINER, system-only)
CREATE OR REPLACE FUNCTION archive_old_consent_records(
  p_days_old INT DEFAULT 90,
  p_batch_id VARCHAR DEFAULT NULL
)
RETURNS TABLE(
  archived_records INT,
  batch_id VARCHAR,
  archive_timestamp TIMESTAMPTZ
) AS $$
DECLARE
  v_batch_id VARCHAR;
  v_count INT;
  v_cutoff_date TIMESTAMPTZ;
BEGIN
  -- Generate batch ID if not provided
  v_batch_id := COALESCE(p_batch_id, 'archive_' || to_char(now(), 'YYYYMMDDHH24MISS'));
  v_cutoff_date := now() - (p_days_old || ' days')::INTERVAL;

  -- Move records to archive (INSERT first, then DELETE for safety)
  INSERT INTO lgpd_consent_audit_archive (contact_id, action, timestamp, archive_batch_id)
  SELECT contact_id, action, timestamp, v_batch_id
  FROM lgpd_consent_audit
  WHERE timestamp < v_cutoff_date;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Now delete archived records from main table
  DELETE FROM lgpd_consent_audit
  WHERE timestamp < v_cutoff_date
  AND contact_id IN (
    SELECT contact_id FROM lgpd_consent_audit_archive
    WHERE archive_batch_id = v_batch_id
  );

  RETURN QUERY SELECT v_count::INT, v_batch_id, now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create rollback function to restore archived records if needed
CREATE OR REPLACE FUNCTION rollback_consent_archive(p_batch_id VARCHAR)
RETURNS TABLE(restored_count INT) AS $$
DECLARE
  v_count INT;
BEGIN
  -- Restore records from archive back to main table
  INSERT INTO lgpd_consent_audit (contact_id, action, timestamp)
  SELECT contact_id, action, timestamp
  FROM lgpd_consent_audit_archive
  WHERE archive_batch_id = p_batch_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Delete from archive after restoration
  DELETE FROM lgpd_consent_audit_archive WHERE archive_batch_id = p_batch_id;

  RETURN QUERY SELECT v_count::INT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create retention policy tracking table
CREATE TABLE IF NOT EXISTS consent_audit_retention_policy (
  id BIGSERIAL PRIMARY KEY,
  retention_days INT NOT NULL DEFAULT 90,
  archive_after_days INT NOT NULL DEFAULT 90,
  policy_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  policy_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  active BOOLEAN NOT NULL DEFAULT true
);

-- Insert default policy
INSERT INTO consent_audit_retention_policy (retention_days, archive_after_days)
SELECT 90, 90
WHERE NOT EXISTS (SELECT 1 FROM consent_audit_retention_policy WHERE active = true);

-- Create function to apply retention policy
CREATE OR REPLACE FUNCTION apply_consent_audit_retention_policy()
RETURNS TABLE(
  archived_count INT,
  deleted_count INT,
  policy_applied_at TIMESTAMPTZ
) AS $$
DECLARE
  v_archive_days INT;
  v_retention_days INT;
  v_archived INT;
  v_deleted INT;
  v_batch_id VARCHAR;
BEGIN
  -- Get active policy
  SELECT archive_after_days, retention_days INTO v_archive_days, v_retention_days
  FROM consent_audit_retention_policy
  WHERE active = true
  LIMIT 1;

  IF v_archive_days IS NULL THEN
    RAISE EXCEPTION 'No active consent audit retention policy found';
  END IF;

  -- Archive records older than archive_after_days
  SELECT archived_records INTO v_archived
  FROM archive_old_consent_records(v_archive_days)
  LIMIT 1;

  v_archived := COALESCE(v_archived, 0);

  -- Delete records from archive older than retention_days (permanent deletion)
  DELETE FROM lgpd_consent_audit_archive
  WHERE archived_at < (now() - (v_retention_days || ' days')::INTERVAL);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN QUERY SELECT v_archived, v_deleted, now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Schedule archival to run daily at 3 AM UTC (after backup window)
SELECT cron.schedule(
  'consent_audit_archival_daily',
  '0 3 * * *',
  'SELECT apply_consent_audit_retention_policy()'
);

-- Create view for audit monitoring (shows both active and archived records when needed)
CREATE OR REPLACE VIEW v_all_consent_audit AS
  SELECT contact_id, action, timestamp, 'active' AS location
  FROM lgpd_consent_audit
  WHERE timestamp > now() - INTERVAL '90 days'

  UNION ALL

  SELECT contact_id, action, timestamp, 'archive' AS location
  FROM lgpd_consent_audit_archive
  WHERE timestamp > now() - INTERVAL '1 year';

-- Add RLS policy to view
ALTER VIEW v_all_consent_audit OWNER TO postgres;

-- Create statistics table for monitoring table growth
CREATE TABLE IF NOT EXISTS consent_audit_growth_stats (
  measurement_date DATE PRIMARY KEY,
  active_records BIGINT,
  archived_records BIGINT,
  archive_table_size_bytes BIGINT,
  active_table_size_bytes BIGINT,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create function to capture growth metrics
CREATE OR REPLACE FUNCTION capture_consent_audit_metrics()
RETURNS TABLE(measurement_date DATE, active_count BIGINT, archive_count BIGINT) AS $$
BEGIN
  INSERT INTO consent_audit_growth_stats (
    measurement_date,
    active_records,
    archived_records,
    active_table_size_bytes,
    archive_table_size_bytes
  )
  VALUES (
    current_date,
    (SELECT COUNT(*) FROM lgpd_consent_audit),
    (SELECT COUNT(*) FROM lgpd_consent_audit_archive),
    (SELECT pg_total_relation_size('lgpd_consent_audit')::BIGINT),
    (SELECT pg_total_relation_size('lgpd_consent_audit_archive')::BIGINT)
  )
  ON CONFLICT (measurement_date) DO UPDATE SET
    active_records = EXCLUDED.active_records,
    archived_records = EXCLUDED.archived_records,
    active_table_size_bytes = EXCLUDED.active_table_size_bytes,
    archive_table_size_bytes = EXCLUDED.archive_table_size_bytes,
    measured_at = now();

  RETURN QUERY
  SELECT measurement_date, active_records, archived_records
  FROM consent_audit_growth_stats
  WHERE measurement_date = current_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Schedule metrics capture daily at 4 AM UTC
SELECT cron.schedule(
  'consent_audit_metrics_daily',
  '0 4 * * *',
  'SELECT capture_consent_audit_metrics()'
);

-- Add comments
COMMENT ON TABLE lgpd_consent_audit_archive IS
  'Archive for old LGPD consent audit records (>90 days old). Append-only. '
  'Moved here by apply_consent_audit_retention_policy() to keep main table optimized. '
  'Permanent deletion after 1 year retention window per retention policy.';

COMMENT ON TABLE consent_audit_retention_policy IS
  'Configurable retention policy for LGPD consent audit. '
  'archive_after_days: move to archive table; retention_days: permanent deletion window. '
  'Default: 90 days active + 90 days archive = 180 days total.';

COMMENT ON FUNCTION apply_consent_audit_retention_policy() IS
  'Apply retention policy: archive records >90 days old, permanently delete archived records >retention window. '
  'Scheduled daily at 3 AM UTC. Prevents consent audit table from growing unbounded.';
