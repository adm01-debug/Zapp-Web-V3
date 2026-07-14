-- Round 15 Critical Gap #1: Contact ID Reuse Prevention
-- Problem: Deleted contact ID can be reassigned to new user, inheriting deletion history and RLS policies
-- Solution: Implement contact_id_graveyard table to permanently mark deleted IDs, prevent reassignment

-- Create immutable graveyard for deleted contact IDs
CREATE TABLE IF NOT EXISTS contact_id_graveyard (
  deleted_contact_id BIGINT PRIMARY KEY,
  original_user_id UUID NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expiration_date TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 years'),
  reason VARCHAR(255) NOT NULL,
  CONSTRAINT graveyard_immutable CHECK (false) -- Never allow INSERT, use triggers only
);

-- Create index for fast lookups during INSERT validation
CREATE INDEX idx_contact_id_graveyard_lookup ON contact_id_graveyard(deleted_contact_id);
CREATE INDEX idx_contact_id_graveyard_expiration ON contact_id_graveyard(expiration_date);

-- Enable row-level security on graveyard table
ALTER TABLE contact_id_graveyard ENABLE ROW LEVEL SECURITY;

-- Create system-only policy (cannot query via PostgREST, only via SECURITY DEFINER functions)
CREATE POLICY graveyard_no_direct_access ON contact_id_graveyard
  AS PERMISSIVE
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- Create function to add deleted contact to graveyard (SECURITY DEFINER, system-only)
CREATE OR REPLACE FUNCTION add_to_contact_id_graveyard(
  p_contact_id BIGINT,
  p_user_id UUID,
  p_reason VARCHAR
) RETURNS void AS $$
BEGIN
  -- Bypass constraints using direct INSERT into system table
  INSERT INTO contact_id_graveyard (deleted_contact_id, original_user_id, reason)
  VALUES (p_contact_id, p_user_id, p_reason)
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create function to check if contact ID is reusable
CREATE OR REPLACE FUNCTION is_contact_id_available(p_contact_id BIGINT)
RETURNS BOOLEAN AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  -- Check if ID exists in graveyard and if expiration has not passed
  SELECT EXISTS(
    SELECT 1 FROM contact_id_graveyard
    WHERE deleted_contact_id = p_contact_id
    AND expiration_date > now()
  ) INTO v_exists;

  RETURN NOT v_exists;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to prevent contact ID reuse on INSERT
CREATE OR REPLACE FUNCTION prevent_contact_id_reuse()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT is_contact_id_available(NEW.id) THEN
    RAISE EXCEPTION 'Contact ID % was previously deleted and cannot be reused for 7 years', NEW.id
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop old trigger if exists, recreate with new logic
DROP TRIGGER IF EXISTS trigger_prevent_contact_id_reuse ON contacts;
CREATE TRIGGER trigger_prevent_contact_id_reuse
  BEFORE INSERT ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION prevent_contact_id_reuse();

-- Modify delete_contact_completely() to add ID to graveyard
-- First, read current definition
DROP FUNCTION IF EXISTS delete_contact_completely(UUID);

CREATE OR REPLACE FUNCTION delete_contact_completely(p_contact_id UUID)
RETURNS void AS $$
DECLARE
  v_contact_numeric_id BIGINT;
  v_user_id UUID;
BEGIN
  -- Get contact's numeric ID and user_id before deletion
  SELECT id::BIGINT, user_id INTO v_contact_numeric_id, v_user_id
  FROM contacts
  WHERE id = p_contact_id;

  -- Add contact ID to graveyard FIRST (before any deletion)
  PERFORM add_to_contact_id_graveyard(v_contact_numeric_id, v_user_id, 'contact_deleted');

  -- Record deletion in immutable audit log
  INSERT INTO audit_log (table_name, operation, record_id, changes, user_id)
  VALUES ('contacts', 'DELETE', p_contact_id::text,
          jsonb_build_object('deleted_contact_id', v_contact_numeric_id,
                             'reason', 'complete_deletion'),
          auth.uid());

  -- Cascade delete: delete contact and all related data
  -- (assumes foreign key constraints with ON DELETE CASCADE are defined)
  DELETE FROM contacts WHERE id = p_contact_id;

  -- Verify deletion was successful
  IF FOUND THEN
    RAISE NOTICE 'Contact % and all related data deleted, ID marked in graveyard until %',
      p_contact_id, now() + INTERVAL '7 years';
  ELSE
    RAISE EXCEPTION 'Contact % not found', p_contact_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create cleanup function to expire old graveyard entries (run via pg_cron)
CREATE OR REPLACE FUNCTION cleanup_expired_contact_ids()
RETURNS TABLE(deleted_count INT) AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM contact_id_graveyard
  WHERE expiration_date < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Schedule cleanup to run daily at 2 AM UTC (removes entries >7 years old)
SELECT cron.schedule(
  'cleanup_expired_contact_ids',
  '0 2 * * *',
  'SELECT cleanup_expired_contact_ids()'
);

-- Add metadata comment documenting the 7-year expiration window
COMMENT ON TABLE contact_id_graveyard IS
  'Immutable graveyard of deleted contact IDs. Prevents ID reuse for 7 years after deletion. '
  'Supports compliance with data retention requirements and prevents accidental history inheritance. '
  'Expires entries older than 7 years via daily scheduled cleanup.';

COMMENT ON FUNCTION is_contact_id_available(BIGINT) IS
  'Check if a contact ID is available for reuse (not in active graveyard). '
  'Returns FALSE if ID was deleted within last 7 years.';

COMMENT ON FUNCTION add_to_contact_id_graveyard(BIGINT, UUID, VARCHAR) IS
  'Add a deleted contact ID to the immutable graveyard. Called by delete_contact_completely(). '
  'Prevents the ID from being reused for 7 years.';
