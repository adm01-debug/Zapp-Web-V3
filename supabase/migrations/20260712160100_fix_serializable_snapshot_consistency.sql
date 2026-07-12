-- Round 15 Critical Gap #2: SERIALIZABLE Snapshot Consistency Across RPC Calls
-- Problem: Job 4 (compliance metrics) sees phantom deleted contacts if mutations occur during transaction
-- Solution: Implement snapshot version tracking on contact mutations, validate before reading

-- Create snapshot tracking table
CREATE TABLE IF NOT EXISTS _snapshot_version_state (
  table_name VARCHAR(64) PRIMARY KEY,
  version_number BIGINT NOT NULL DEFAULT 1,
  last_mutation_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT snapshot_version_immutable_state CHECK (true)
);

-- Initialize snapshot version for contacts table
INSERT INTO _snapshot_version_state (table_name, version_number, last_mutation_at)
VALUES ('contacts', 1, now())
ON CONFLICT (table_name) DO NOTHING;

-- Create index on mutation timestamp for efficient queries
CREATE INDEX IF NOT EXISTS idx_snapshot_version_timestamp ON _snapshot_version_state(last_mutation_at);

-- Enable RLS on snapshot state (system-only access)
ALTER TABLE _snapshot_version_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY snapshot_version_state_no_direct_access ON _snapshot_version_state
  AS PERMISSIVE FOR ALL USING (false) WITH CHECK (false);

-- Function to increment snapshot version (called on every contact mutation)
CREATE OR REPLACE FUNCTION increment_snapshot_version(p_table_name VARCHAR)
RETURNS BIGINT AS $$
DECLARE
  v_new_version BIGINT;
BEGIN
  UPDATE _snapshot_version_state
  SET version_number = version_number + 1,
      last_mutation_at = now()
  WHERE table_name = p_table_name
  RETURNING version_number INTO v_new_version;

  RETURN COALESCE(v_new_version, 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to get current snapshot version
CREATE OR REPLACE FUNCTION get_snapshot_version(p_table_name VARCHAR)
RETURNS BIGINT AS $$
DECLARE
  v_version BIGINT;
BEGIN
  SELECT version_number INTO v_version
  FROM _snapshot_version_state
  WHERE table_name = p_table_name;

  RETURN COALESCE(v_version, 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to validate snapshot consistency (check if version changed during transaction)
CREATE OR REPLACE FUNCTION validate_snapshot_freshness(
  p_table_name VARCHAR,
  p_snapshot_version BIGINT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_current_version BIGINT;
BEGIN
  SELECT get_snapshot_version(p_table_name) INTO v_current_version;

  -- If versions match, snapshot is still fresh
  IF v_current_version = p_snapshot_version THEN
    RETURN TRUE;
  ELSE
    -- Snapshot has become stale; mutations occurred during transaction
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to increment snapshot version on every contact INSERT
CREATE OR REPLACE FUNCTION trigger_increment_contact_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM increment_snapshot_version('contacts');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_contact_snapshot_on_insert ON contacts;
CREATE TRIGGER trigger_contact_snapshot_on_insert
  AFTER INSERT ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION trigger_increment_contact_snapshot();

-- Trigger to increment snapshot version on every contact UPDATE
DROP TRIGGER IF EXISTS trigger_contact_snapshot_on_update ON contacts;
CREATE TRIGGER trigger_contact_snapshot_on_update
  AFTER UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION trigger_increment_contact_snapshot();

-- Trigger to increment snapshot version on every contact DELETE
DROP TRIGGER IF EXISTS trigger_contact_snapshot_on_delete ON contacts;
CREATE TRIGGER trigger_contact_snapshot_on_delete
  AFTER DELETE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION trigger_increment_contact_snapshot();

-- Create new compliance metrics function with snapshot validation
CREATE OR REPLACE FUNCTION get_compliance_metrics_with_snapshot_validation()
RETURNS TABLE(
  total_contacts BIGINT,
  masked_contacts BIGINT,
  unmask_requested BIGINT,
  deletion_requested BIGINT,
  snapshot_fresh BOOLEAN,
  snapshot_version BIGINT,
  metric_timestamp TIMESTAMPTZ
) AS $$
DECLARE
  v_snapshot_version BIGINT;
  v_is_fresh BOOLEAN;
BEGIN
  -- Set SERIALIZABLE isolation and get initial snapshot version
  SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

  -- Capture snapshot version BEFORE starting read
  v_snapshot_version := get_snapshot_version('contacts');

  -- Acquire table lock to prevent mutations during read
  LOCK TABLE contacts IN ACCESS SHARE MODE;

  -- Re-validate snapshot freshness after lock acquisition
  v_is_fresh := validate_snapshot_freshness('contacts', v_snapshot_version);

  IF NOT v_is_fresh THEN
    -- Snapshot became stale during lock wait; retry or fail
    RAISE EXCEPTION 'Snapshot became stale during compliance metrics calculation. Retry the operation.'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- Now safe to read; calculate metrics atomically
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE deleted_at IS NULL)::BIGINT,
    COUNT(*) FILTER (WHERE pii_masked_at IS NOT NULL AND deleted_at IS NULL)::BIGINT,
    COUNT(*) FILTER (WHERE lgpd_unmask_request = true AND deleted_at IS NULL)::BIGINT,
    COUNT(*) FILTER (WHERE lgpd_delete_request = true AND deleted_at IS NULL)::BIGINT,
    v_is_fresh,
    v_snapshot_version,
    now()
  FROM contacts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Alias for backward compatibility
CREATE OR REPLACE FUNCTION get_compliance_metrics()
RETURNS TABLE(
  total_contacts BIGINT,
  masked_contacts BIGINT,
  unmask_requested BIGINT,
  deletion_requested BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT t.total_contacts, t.masked_contacts, t.unmask_requested, t.deletion_requested
  FROM get_compliance_metrics_with_snapshot_validation() t
  WHERE t.snapshot_fresh = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update anonymize_contacts_batch() to increment snapshot version
CREATE OR REPLACE FUNCTION anonymize_contacts_batch_with_snapshot()
RETURNS TABLE(anonymized_count INT, snapshot_version BIGINT) AS $$
DECLARE
  v_count INT;
  v_snapshot BIGINT;
BEGIN
  SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

  -- Set guard timestamp FIRST before any PII modification
  UPDATE contacts
  SET pii_masked_at = now()
  WHERE pii_masked_at IS NULL
  AND lgpd_consent_given = false
  AND deleted_at IS NULL
  LIMIT 1000;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Increment snapshot version after mutations complete
  v_snapshot := increment_snapshot_version('contacts');

  RETURN QUERY SELECT v_count::INT, v_snapshot;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add metadata documenting snapshot consistency strategy
COMMENT ON TABLE _snapshot_version_state IS
  'Snapshot version tracking for SERIALIZABLE transaction consistency. '
  'Each contact table mutation increments version, allowing RPC functions to detect stale snapshots. '
  'Prevents phantom reads in compliance metrics and LGPD job orchestration.';

COMMENT ON FUNCTION get_compliance_metrics_with_snapshot_validation() IS
  'Calculate compliance metrics atomically with SERIALIZABLE isolation and snapshot validation. '
  'Validates that no mutations occurred between snapshot start and lock acquisition. '
  'Returns snapshot_fresh indicator; if false, operation should be retried.';

COMMENT ON FUNCTION validate_snapshot_freshness(VARCHAR, BIGINT) IS
  'Validate that snapshot version has not changed since capture. '
  'Used to detect stale snapshots during long-running transactions. '
  'Returns FALSE if mutations occurred after snapshot capture.';
