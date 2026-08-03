-- M52: F7-18 — Create zapp.hmac_selftest_audit for HMAC self-test history
--
-- Problem: edge function webhook-hmac-selftest runs HMAC+replay scenarios and
-- returns results via HTTP but never inserted rows into any DB table.
-- HmacAuditHistoryPanel reads from zapp.hmac_selftest_audit via useHmacAuditHistory
-- and always shows 0 rows because nothing wrote to it.
--
-- Fix: create the table with the schema expected by useHmacAuditHistory, enable RLS,
-- add to supabase_realtime publication so the realtime subscription works, and wire
-- the edge function to insert one audit row per invocation (separate change).
--

CREATE TABLE IF NOT EXISTS zapp.hmac_selftest_audit (
  id                uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance          text        NOT NULL DEFAULT 'selftest',
  ok                boolean     NOT NULL,
  duration_ms       integer,
  error             text,
  message           text,
  good_accepted     boolean,
  tampered_rejected boolean,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE zapp.hmac_selftest_audit ENABLE ROW LEVEL SECURITY;

-- service_role inserts (edge function uses service role key)
CREATE POLICY "service_role_insert_hmac_selftest_audit"
  ON zapp.hmac_selftest_audit
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- authenticated users can read (admin panel)
CREATE POLICY "authenticated_select_hmac_selftest_audit"
  ON zapp.hmac_selftest_audit
  FOR SELECT
  TO authenticated
  USING (true);

-- Index for time-range queries (used by useHmacAuditHistory .gte('created_at', since))
CREATE INDEX IF NOT EXISTS hmac_selftest_audit_created_at_idx
  ON zapp.hmac_selftest_audit (created_at DESC);

-- Index for instance filter queries
CREATE INDEX IF NOT EXISTS hmac_selftest_audit_instance_created_at_idx
  ON zapp.hmac_selftest_audit (instance, created_at DESC);

-- Add to supabase_realtime so useHmacAuditHistory's postgres_changes subscription fires
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'zapp'
      AND tablename = 'hmac_selftest_audit'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.hmac_selftest_audit;
  END IF;
END $$;

-- Verification
DO $$
DECLARE
  v_exists boolean;
  v_pub    boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'zapp' AND tablename = 'hmac_selftest_audit'
  ) INTO v_exists;

  SELECT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'zapp'
      AND tablename = 'hmac_selftest_audit'
  ) INTO v_pub;

  RAISE NOTICE 'M52 F7-18: hmac_selftest_audit table_exists=%, in_realtime_pub=%',
    v_exists, v_pub;
END $$;
