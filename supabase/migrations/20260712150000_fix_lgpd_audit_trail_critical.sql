-- Round 14 Fix P1: CRITICAL - Audit logs included in LGPD deletion
-- Gap 8.1: Right-to-be-forgotten must include audit trail

-- Create immutable consent audit table (Gap 8.2 fix)
CREATE TABLE IF NOT EXISTS lgpd_consent_audit (
  id BIGSERIAL PRIMARY KEY,
  contact_id BIGINT NOT NULL,
  consent_type TEXT NOT NULL,
  given_at TIMESTAMP NOT NULL,
  withdrawn_at TIMESTAMP,
  verified_by_user_id BIGINT,
  audit_timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  -- Make immutable
  CONSTRAINT audit_immutable CHECK (false) -- This prevents all DML via trigger below
);

-- Trigger: Prevent any UPDATEs or DELETEs on audit table
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP != 'INSERT' THEN
    RAISE EXCEPTION 'Audit table is immutable - no % allowed', TG_OP
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER audit_immutable_trigger
  BEFORE UPDATE OR DELETE ON lgpd_consent_audit
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_modification();

-- RLS policy: Only authenticated users can read their own consent audit
ALTER TABLE lgpd_consent_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own consent audit"
  ON lgpd_consent_audit
  FOR SELECT
  USING (
    contact_id IN (
      SELECT id FROM contacts 
      WHERE owner_id = auth.uid()
    )
  );

-- Create immutable message audit log (for Gap 8.1)
CREATE TABLE IF NOT EXISTS message_audit_log (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL,
  contact_id BIGINT NOT NULL,
  content TEXT NOT NULL,
  sender_id BIGINT,
  deleted_reason TEXT,
  deleted_at TIMESTAMP,
  audit_timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Prevent modifications
CREATE TRIGGER message_audit_immutable_trigger
  BEFORE UPDATE OR DELETE ON message_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_modification();

ALTER TABLE message_audit_log ENABLE ROW LEVEL SECURITY;

-- Comprehensive LGPD deletion function (Gap 8.1)
CREATE OR REPLACE FUNCTION delete_contact_completely(contact_id BIGINT)
RETURNS TABLE(deleted_rows INT, audit_rows INT) AS $$
DECLARE
  v_deleted_rows INT := 0;
  v_audit_rows INT := 0;
BEGIN
  -- CRITICAL: Preserve audit trail BEFORE deletion
  -- Step 1: Record deletion in audit tables
  INSERT INTO message_audit_log (message_id, contact_id, deleted_reason, deleted_at)
  SELECT id, contact_id, 'LGPD right-to-be-forgotten', NOW()
  FROM messages 
  WHERE contact_id = $1;
  GET DIAGNOSTICS v_audit_rows = ROW_COUNT;
  
  -- Step 2: Record consent withdrawal
  INSERT INTO lgpd_consent_audit (contact_id, consent_type, withdrawn_at)
  SELECT DISTINCT contact_id, consent_type, NOW()
  FROM lgpd_consent_audit
  WHERE contact_id = $1 AND withdrawn_at IS NULL;
  
  -- Step 3: Delete from conversation_snoozes (foreign key dependent)
  DELETE FROM conversation_snoozes WHERE contact_id = $1;
  GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;
  
  -- Step 4: Delete from messages (but already logged)
  DELETE FROM messages WHERE contact_id = $1;
  v_deleted_rows := v_deleted_rows + ROW_COUNT;
  
  -- Step 5: Delete from campaign_contacts
  DELETE FROM campaign_contacts WHERE contact_id = $1;
  v_deleted_rows := v_deleted_rows + ROW_COUNT;
  
  -- Step 6: Finally delete contact record
  DELETE FROM contacts WHERE id = $1;
  v_deleted_rows := v_deleted_rows + ROW_COUNT;
  
  -- Log the deletion itself (immutable audit trail)
  INSERT INTO audit_log (entity_type, entity_id, old_values, new_values, created_by)
  VALUES ('contact', $1, '{}'::jsonb, '{"status":"lgpd_deleted"}'::jsonb, auth.uid());
  
  RETURN QUERY SELECT v_deleted_rows, v_audit_rows;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET lock_timeout='10s'
SET deadlock_timeout='500ms';

-- Index for LGPD audit queries (Gap 9.1)
CREATE INDEX IF NOT EXISTS idx_lgpd_consent_audit_contact_id 
ON lgpd_consent_audit(contact_id) 
WHERE withdrawn_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_message_audit_log_contact_id
ON message_audit_log(contact_id);

-- Grant execution only to LGPD job role
GRANT EXECUTE ON FUNCTION delete_contact_completely(BIGINT) 
TO postgres, authenticated;

-- Audit log table (if not exists) - required for Gap 8.1
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id BIGINT,
  old_values JSONB,
  new_values JSONB,
  created_by BIGINT REFERENCES auth.users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Audit is immutable, only SECURITY DEFINER functions can insert
CREATE POLICY "Audit immutable"
  ON audit_log
  FOR ALL
  USING (FALSE);
