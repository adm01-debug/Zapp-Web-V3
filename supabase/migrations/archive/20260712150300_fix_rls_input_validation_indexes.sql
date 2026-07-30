-- Round 14 Fix P4: MEDIUM severity - RLS hardening, input validation, indexes
-- Gap 4.1: RLS UPDATE policy bypass via omitted column
-- Gap 4.2: is_admin_or_supervisor() NULL handling
-- Gap 6.1: sanitizeHtml() null coercion
-- Gap 9.1: Missing index on pii_masked_at

-- Hardened is_admin_or_supervisor function (Gap 4.2)
CREATE OR REPLACE FUNCTION is_admin_or_supervisor()
RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  
  -- Explicit NULL check for auth context
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_user_not_found: No authenticated user in context'
      USING ERRCODE = '42P01';
  END IF;
  
  -- Fetch role
  SELECT role INTO v_role
  FROM auth.users
  WHERE id = v_user_id;
  
  -- Explicit NULL check for role
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'auth_role_not_found: Role not set for user %', v_user_id
      USING ERRCODE = '42703';
  END IF;
  
  -- Explicit return (not implicit NULL)
  RETURN v_role IN ('admin', 'supervisor');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public';

-- Hardened RLS policy for conversation_snoozes (Gap 4.1)
-- Prevent UPDATE path bypass by checking contact ownership
DROP POLICY IF EXISTS "Allow snoozed_by updates" ON conversation_snoozes;

CREATE POLICY "Allow snoozed_by updates with contact ownership"
  ON conversation_snoozes
  FOR UPDATE
  USING (
    snoozed_by = auth.uid() 
    AND contact_id IN (
      SELECT id FROM contacts 
      WHERE owner_id = auth.uid()
        OR id IN (
          SELECT contact_id FROM contact_access 
          WHERE user_id = auth.uid() AND access_level >= 'edit'
        )
    )
  )
  WITH CHECK (
    snoozed_by = auth.uid() 
    AND contact_id IN (
      SELECT id FROM contacts 
      WHERE owner_id = auth.uid()
        OR id IN (
          SELECT contact_id FROM contact_access 
          WHERE user_id = auth.uid() AND access_level >= 'edit'
        )
    )
  );

-- RLS audit policy
CREATE POLICY "Snoozes visible to authorized users"
  ON conversation_snoozes
  FOR SELECT
  USING (
    snoozed_by = auth.uid()
    OR contact_id IN (
      SELECT id FROM contacts WHERE owner_id = auth.uid()
    )
  );

-- Critical indexes for LGPD compliance queries (Gap 9.1)
-- Partial index on pii_masked_at (only non-deleted rows)
CREATE INDEX IF NOT EXISTS idx_contacts_pii_masked_at_null
ON contacts(id, pii_masked_at)
WHERE deleted_at IS NULL AND pii_masked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_pii_masked_at_not_null
ON contacts(id, pii_masked_at)
WHERE deleted_at IS NULL AND pii_masked_at IS NOT NULL;

-- Index for LGPD consent filtering
CREATE INDEX IF NOT EXISTS idx_contacts_lgpd_consent
ON contacts(lgpd_consent)
WHERE deleted_at IS NULL;

-- Index for contact_access table (Gap 4.1 RLS optimization)
CREATE INDEX IF NOT EXISTS idx_contact_access_user_contact
ON contact_access(user_id, contact_id, access_level)
WHERE deleted_at IS NULL;

-- Analyze tables to update statistics
ANALYZE contacts;
ANALYZE conversation_snoozes;
ANALYZE contact_access;

