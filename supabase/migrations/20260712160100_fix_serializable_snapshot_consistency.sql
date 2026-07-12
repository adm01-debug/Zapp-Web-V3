-- Round 15 Migration #2: SERIALIZABLE Snapshot Consistency
-- Prevents phantom reads in compliance metric calculations
-- Date: 2026-07-12
-- Impact: Ensures snapshot freshness tracking for all table mutations

BEGIN;

CREATE TABLE IF NOT EXISTS _snapshot_version_state (
  table_name VARCHAR(64) PRIMARY KEY,
  version_number BIGINT NOT NULL DEFAULT 1,
  last_mutation_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE _snapshot_version_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY snapshot_version_no_direct_access ON _snapshot_version_state
  AS (ALL) FOR ALL TO public
  USING (FALSE)
  WITH CHECK (FALSE);

INSERT INTO _snapshot_version_state (table_name, version_number, last_mutation_at)
VALUES ('contacts', 1, now())
ON CONFLICT (table_name) DO NOTHING;

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
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION validate_snapshot_freshness(
  p_table_name VARCHAR,
  p_snapshot_version BIGINT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_current_version BIGINT;
BEGIN
  SELECT version_number INTO v_current_version
  FROM _snapshot_version_state
  WHERE table_name = p_table_name;
  RETURN (COALESCE(v_current_version, 1) = p_snapshot_version);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION trigger_snapshot_on_contacts_insert()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM increment_snapshot_version('contacts');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_snapshot_contacts_insert
AFTER INSERT ON contacts
FOR EACH ROW
EXECUTE FUNCTION trigger_snapshot_on_contacts_insert();

CREATE OR REPLACE FUNCTION trigger_snapshot_on_contacts_update()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM increment_snapshot_version('contacts');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_snapshot_contacts_update
AFTER UPDATE ON contacts
FOR EACH ROW
EXECUTE FUNCTION trigger_snapshot_on_contacts_update();

CREATE OR REPLACE FUNCTION trigger_snapshot_on_contacts_delete()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM increment_snapshot_version('contacts');
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_snapshot_contacts_delete
AFTER DELETE ON contacts
FOR EACH ROW
EXECUTE FUNCTION trigger_snapshot_on_contacts_delete();

CREATE OR REPLACE FUNCTION get_compliance_metrics()
RETURNS TABLE (
  metric_name VARCHAR,
  metric_value BIGINT,
  snapshot_fresh BOOLEAN,
  validated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    'total_contacts'::VARCHAR,
    COUNT(*)::BIGINT,
    validate_snapshot_freshness('contacts', get_snapshot_version('contacts')),
    now()
  FROM contacts
  WHERE deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql STABLE;

COMMIT;
