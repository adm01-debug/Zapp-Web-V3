-- Round 14 Fix P2: HIGH severity - Backup retention + Job timeout alignment
-- Gap 5.2: Backup table unbounded growth
-- Gap 1.3: Lock timeout vs job frequency misalignment

-- Increase lock timeout to accommodate job queue (Gap 1.3)
-- Jobs run every 5s, so 15s timeout = 3x interval buffer
ALTER TABLE campaign_contacts SET (
  lock_timeout = '15s',
  deadlock_timeout = '500ms'
);

-- Create backup retention policy table
CREATE TABLE IF NOT EXISTS _backups.backup_metadata (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  backup_date DATE NOT NULL,
  row_count INT,
  size_bytes BIGINT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  retention_until TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '30 days',
  UNIQUE(table_name, backup_date)
);

-- Revoke public access to backup metadata
REVOKE ALL ON _backups.backup_metadata FROM public;
REVOKE ALL ON _backups.backup_metadata FROM authenticated;
GRANT SELECT ON _backups.backup_metadata TO postgres;

-- Implement partitioned backup table (Gap 5.2 - prevents unbounded growth)
DROP TABLE IF EXISTS _backups.campaign_contacts_pre_dedup CASCADE;

CREATE TABLE _backups.campaign_contacts_pre_dedup (
  id BIGSERIAL,
  campaign_id BIGINT NOT NULL,
  contact_id BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL,
  backup_date DATE NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (id, backup_date)
) PARTITION BY RANGE (backup_date);

-- Create partition for today
CREATE TABLE _backups.campaign_contacts_pre_dedup_2026_07_12
  PARTITION OF _backups.campaign_contacts_pre_dedup
  FOR VALUES FROM ('2026-07-12') TO ('2026-07-13');

-- Revoke public access to backup table (Gap 5.1)
REVOKE ALL ON _backups.campaign_contacts_pre_dedup FROM public;
REVOKE ALL ON _backups.campaign_contacts_pre_dedup FROM authenticated;
GRANT SELECT ON _backups.campaign_contacts_pre_dedup TO postgres;

-- Add RLS to prevent even role-escalated users from reading (Gap 5.1)
ALTER TABLE _backups.campaign_contacts_pre_dedup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Backup only accessible to SECURITY DEFINER functions"
  ON _backups.campaign_contacts_pre_dedup
  FOR ALL
  USING (FALSE); -- All direct access denied

-- SECURITY DEFINER function to create daily backup
CREATE OR REPLACE FUNCTION backup_campaign_contacts()
RETURNS TABLE(backed_up INT, deleted_old_partitions INT) AS $$
DECLARE
  v_backed_up INT;
  v_deleted INT := 0;
  v_partition_to_delete TEXT;
BEGIN
  -- Step 1: Create today's partition if it doesn't exist
  BEGIN
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS _backups.campaign_contacts_pre_dedup_%s '
      'PARTITION OF _backups.campaign_contacts_pre_dedup '
      'FOR VALUES FROM (%L) TO (%L)',
      TO_CHAR(CURRENT_DATE, 'YYYY_MM_DD'),
      CURRENT_DATE,
      CURRENT_DATE + INTERVAL '1 day'
    );
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Partition already exists
  END;
  
  -- Step 2: Clear yesterday's data (keep only today's snapshot)
  DELETE FROM _backups.campaign_contacts_pre_dedup
  WHERE backup_date < CURRENT_DATE;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  -- Step 3: Insert today's snapshot
  INSERT INTO _backups.campaign_contacts_pre_dedup 
    (campaign_id, contact_id, created_at, backup_date)
  SELECT campaign_id, contact_id, created_at, CURRENT_DATE
  FROM campaign_contacts
  WHERE deleted_at IS NULL;
  GET DIAGNOSTICS v_backed_up = ROW_COUNT;
  
  -- Step 4: Record metadata
  INSERT INTO _backups.backup_metadata (table_name, backup_date, row_count)
  VALUES ('campaign_contacts', CURRENT_DATE, v_backed_up)
  ON CONFLICT (table_name, backup_date) DO UPDATE
  SET row_count = v_backed_up;
  
  -- Step 5: Delete partitions older than 30 days
  FOR v_partition_to_delete IN
    SELECT partition_name
    FROM pg_partitions
    WHERE parent_table = '_backups.campaign_contacts_pre_dedup'
    AND EXTRACT(DAY FROM NOW() - to_date(
      substring(partition_name FROM '_\d{4}_\d{2}_\d{2}$'), 
      'YYYY_MM_DD'
    )) > 30
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I', v_partition_to_delete);
    v_deleted := v_deleted + 1;
  END LOOP;
  
  RETURN QUERY SELECT v_backed_up, v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET lock_timeout='10s'
SET deadlock_timeout='500ms';

-- Create job queue table (Gap 1.3 - job serialization)
CREATE TABLE IF NOT EXISTS _lgpd_job_queue (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL DEFAULT NOW() + INTERVAL '20 seconds',
  locked_at TIMESTAMP,
  status TEXT DEFAULT 'pending',
  UNIQUE(job_name, DATE(started_at))
);

-- RLS: No user access
ALTER TABLE _lgpd_job_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Job queue immutable"
  ON _lgpd_job_queue
  FOR ALL
  USING (FALSE);

-- Acquire job lock function (Gap 1.3)
CREATE OR REPLACE FUNCTION acquire_job_lock(job_name TEXT, lock_duration_seconds INT DEFAULT 20)
RETURNS TABLE(acquired BOOLEAN, job_id BIGINT) AS $$
DECLARE
  v_job_id BIGINT;
BEGIN
  BEGIN
    INSERT INTO _lgpd_job_queue (job_name, expires_at, status)
    VALUES (job_name, NOW() + (lock_duration_seconds || ' seconds')::INTERVAL, 'running')
    RETURNING id INTO v_job_id;
    
    RETURN QUERY SELECT TRUE, v_job_id;
  EXCEPTION WHEN unique_violation THEN
    -- Another job instance already running for today
    RETURN QUERY SELECT FALSE, NULL::BIGINT;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Release job lock function
CREATE OR REPLACE FUNCTION release_job_lock(job_id BIGINT)
RETURNS VOID AS $$
BEGIN
  UPDATE _lgpd_job_queue 
  SET status = 'completed', locked_at = NOW()
  WHERE id = job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

