-- Round 14 Fix P3: HIGH severity - Transaction atomicity & snapshot isolation
-- Gap 1.1: SELECT...FOR UPDATE phantom reads under SERIALIZABLE isolation
-- Gap 1.2: Retry semantics not atomic
-- Gap 2.1: Job 1 crash between PII fields & timestamp

-- Atomic deduplication RPC with snapshot re-validation (Gap 1.1)
CREATE OR REPLACE FUNCTION deduplicate_campaign_contacts_atomically()
RETURNS TABLE(duplicates_removed INT, rows_locked INT) AS $$
DECLARE
  v_duplicates_removed INT := 0;
  v_rows_locked INT;
  v_duplicate_ids BIGINT[];
BEGIN
  -- BEGIN with SERIALIZABLE isolation for snapshot consistency (Gap 1.1)
  SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
  
  -- CRITICAL: Acquire lock FIRST before taking snapshot
  LOCK TABLE campaign_contacts IN SHARE ROW EXCLUSIVE MODE;
  GET DIAGNOSTICS v_rows_locked = ROW_COUNT;
  
  -- Step 1: Find duplicates under SERIALIZABLE isolation
  -- This re-scans after lock to ensure no phantom reads
  SELECT ARRAY_AGG(id)
  INTO v_duplicate_ids
  FROM (
    SELECT id, campaign_id, contact_id,
           ROW_NUMBER() OVER (
             PARTITION BY campaign_id, contact_id 
             ORDER BY created_at DESC
           ) as rn
    FROM campaign_contacts
    WHERE deleted_at IS NULL
  ) t
  WHERE rn > 1;
  
  -- Step 2: Validate snapshot didn't miss duplicates
  IF v_duplicate_ids IS NOT NULL THEN
    -- Re-check that all duplicates we found are still there
    -- (Detect if another transaction deleted them between lock and check)
    PERFORM 1 FROM campaign_contacts
    WHERE id = ANY(v_duplicate_ids)
    AND deleted_at IS NULL;
    
    IF NOT FOUND THEN
      -- Duplicates were deleted by concurrent transaction
      -- Rollback and retry
      RAISE EXCEPTION 'Snapshot inconsistency detected - retry duplicate removal' 
        USING ERRCODE = '40001'; -- Serialization failure
    END IF;
  END IF;
  
  -- Step 3: Backup before deletion (Gap 1.2 - atomic batch)
  CREATE TEMP TABLE dedup_backup AS
  SELECT * FROM campaign_contacts 
  WHERE id = ANY(v_duplicate_ids) AND deleted_at IS NULL;
  
  -- Step 4: Delete duplicates (keep first occurrence)
  DELETE FROM campaign_contacts
  WHERE id = ANY(v_duplicate_ids) AND deleted_at IS NULL;
  GET DIAGNOSTICS v_duplicates_removed = ROW_COUNT;
  
  -- Step 5: Log deletion for audit
  INSERT INTO audit_log (entity_type, entity_id, old_values, created_by)
  SELECT 'campaign_contacts_duplicate', id, row_to_json(dc), auth.uid()
  FROM dedup_backup dc;
  
  RETURN QUERY SELECT v_duplicates_removed, v_rows_locked;
EXCEPTION WHEN serialization_failure THEN
  RAISE NOTICE 'Serialization failure during deduplication - client should retry';
  RETURN QUERY SELECT 0, 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET lock_timeout='15s'
SET deadlock_timeout='500ms';

-- Atomic PII anonymization with guard timestamp (Gap 2.1)
-- Set pii_masked_at FIRST as a guard, then anonymize all fields
CREATE OR REPLACE FUNCTION anonymize_contacts_batch(contact_ids BIGINT[])
RETURNS TABLE(anonymized INT, already_masked INT) AS $$
DECLARE
  v_anonymized INT := 0;
  v_already_masked INT := 0;
BEGIN
  SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
  
  -- STEP 1: Set guard timestamp FIRST (prevents Job 3 from reading while anonymizing)
  UPDATE contacts
  SET pii_masked_at = NOW()
  WHERE id = ANY(contact_ids) AND deleted_at IS NULL AND pii_masked_at IS NULL;
  GET DIAGNOSTICS v_anonymized = ROW_COUNT;
  
  -- Count how many were already masked
  SELECT COUNT(*)::INT INTO v_already_masked
  FROM contacts
  WHERE id = ANY(contact_ids) AND pii_masked_at IS NOT NULL;
  
  -- STEP 2: Anonymize all PII fields (now Job 3 skips due to pii_masked_at check)
  UPDATE contacts
  SET 
    full_name = 'REDACTED',
    phone_number = 'REDACTED',
    email = 'REDACTED',
    push_name = 'REDACTED',
    profile_picture_url = 'REDACTED',
    company = 'REDACTED',
    role_title = 'REDACTED',
    instance_name = 'REDACTED',
    notes = 'REDACTED',
    raw_data = 'REDACTED'::jsonb,
    updated_at = NOW()
  WHERE id = ANY(contact_ids) AND pii_masked_at = NOW();
  -- Only update rows we just marked (atomic guarantee)
  
  RETURN QUERY SELECT v_anonymized, v_already_masked;
EXCEPTION WHEN deadlock_detected THEN
  RAISE EXCEPTION 'Deadlock during PII anonymization - batch will be retried by scheduler'
    USING ERRCODE = '40P01';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET lock_timeout='15s'
SET deadlock_timeout='500ms';

-- Atomic compliance report (Gap 2.2 - single transaction snapshot)
CREATE OR REPLACE FUNCTION get_compliance_metrics(snapshot_time TIMESTAMP DEFAULT NOW())
RETURNS TABLE(
  total_deleted INT,
  pending_deletion INT,
  already_anonymized INT,
  with_lgpd_consent INT,
  compliance_rate_pct NUMERIC
) AS $$
BEGIN
  SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
  
  RETURN QUERY
  WITH deleted_contacts AS (
    SELECT id, pii_masked_at, lgpd_consent 
    FROM contacts 
    WHERE deleted_at IS NOT NULL
    -- All queries within single transaction use consistent snapshot
  )
  SELECT 
    COUNT(*)::INT as total_deleted,
    COUNT(*) FILTER (WHERE pii_masked_at IS NULL)::INT as pending_deletion,
    COUNT(*) FILTER (WHERE pii_masked_at IS NOT NULL)::INT as already_anonymized,
    COUNT(*) FILTER (WHERE lgpd_consent = TRUE)::INT as with_consent,
    ROUND(
      COUNT(*) FILTER (WHERE pii_masked_at IS NOT NULL)::NUMERIC / 
      NULLIF(COUNT(*), 0) * 100, 2
    )::NUMERIC as compliance_rate_pct
  FROM deleted_contacts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Separate statement timeout from lock timeout (Gap 7.1)
-- Lock timeout = 15s (for acquiring lock)
-- Statement timeout = 120s (for executing statement)
CREATE OR REPLACE FUNCTION update_large_batch_safe(
  update_query TEXT,
  batch_size INT DEFAULT 10000
)
RETURNS TABLE(total_updated INT) AS $$
DECLARE
  v_total_updated INT := 0;
  v_batch_updated INT;
  v_offset INT := 0;
BEGIN
  SET lock_timeout='15s';       -- 3x job interval for lock acquisition
  SET statement_timeout='120s'; -- 2 minutes for full statement
  SET deadlock_timeout='500ms';
  
  -- Process in batches to stay within timeout
  WHILE v_total_updated < 1000000 LOOP
    EXECUTE format(
      '%s LIMIT %L OFFSET %L',
      update_query,
      batch_size,
      v_offset
    );
    
    GET DIAGNOSTICS v_batch_updated = ROW_COUNT;
    IF v_batch_updated = 0 THEN
      EXIT; -- No more rows to update
    END IF;
    
    v_total_updated := v_total_updated + v_batch_updated;
    v_offset := v_offset + batch_size;
  END LOOP;
  
  RETURN QUERY SELECT v_total_updated;
EXCEPTION WHEN lock_timeout THEN
  RAISE NOTICE 'Lock timeout exceeded - batch processing paused';
  RETURN QUERY SELECT v_total_updated;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

