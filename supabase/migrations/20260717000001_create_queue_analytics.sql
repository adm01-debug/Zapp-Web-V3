-- GAP-10 fix: create zapp.queue_analytics table referenced by useQueueManagement.ts
-- Lines 203 (useQueueAnalyticsManagement) and 415 (useQueuesComparisonManagement)

CREATE TABLE IF NOT EXISTS zapp.queue_analytics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id        uuid NOT NULL REFERENCES zapp.queues(id) ON DELETE CASCADE,
  total_messages          integer     NOT NULL DEFAULT 0,
  average_response_time   numeric(10, 2) NOT NULL DEFAULT 0,
  first_response_time     numeric(10, 2),
  resolution_rate         numeric(5, 2)  NOT NULL DEFAULT 0 CHECK (resolution_rate BETWEEN 0 AND 100),
  customer_satisfaction   numeric(4, 2)  NOT NULL DEFAULT 0 CHECK (customer_satisfaction BETWEEN 0 AND 5),
  timestamp               timestamptz    NOT NULL DEFAULT now(),
  created_at              timestamptz    NOT NULL DEFAULT now()
);

-- Index for the query pattern: .eq('queue_id').order('timestamp', desc).limit(1)
CREATE INDEX IF NOT EXISTS queue_analytics_queue_id_timestamp_idx
  ON zapp.queue_analytics (queue_id, timestamp DESC);

-- RLS (all zapp tables require RLS)
ALTER TABLE zapp.queue_analytics ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read analytics for queues in their workspace
CREATE POLICY "queue_analytics_select" ON zapp.queue_analytics
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM zapp.queues q
      WHERE q.id = queue_analytics.queue_id
    )
  );

-- Only service_role can insert/update/delete (analytics are written by backend jobs)
CREATE POLICY "queue_analytics_insert_service" ON zapp.queue_analytics
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "queue_analytics_update_service" ON zapp.queue_analytics
  FOR UPDATE TO service_role USING (true);

CREATE POLICY "queue_analytics_delete_service" ON zapp.queue_analytics
  FOR DELETE TO service_role USING (true);

COMMENT ON TABLE zapp.queue_analytics IS
  'Periodic snapshots of queue performance metrics — one row per queue per measurement window.';

-- RLS policies alone do not grant the underlying table privilege.
-- authenticated needs SELECT; backend jobs run as service_role (all DML).
GRANT SELECT ON zapp.queue_analytics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.queue_analytics TO service_role;
