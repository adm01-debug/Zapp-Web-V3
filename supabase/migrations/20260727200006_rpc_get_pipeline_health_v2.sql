-- Migration: rpc_get_pipeline_health_v2
-- Adds breakdown by connection/instance to the pipeline health snapshot.
-- Supersedes rpc_get_pipeline_health (kept for backwards compatibility).

CREATE OR REPLACE FUNCTION zapp.rpc_get_pipeline_health_v2(
  p_instance_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  checked_at              TIMESTAMPTZ,
  instance_name           TEXT,
  pending_messages        BIGINT,
  stuck_messages_5m       BIGINT,
  stuck_messages_30m      BIGINT,
  failed_messages_24h     BIGINT,
  oldest_pending_minutes  DOUBLE PRECISION
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'zapp', 'pg_catalog'
AS $$
  SELECT
    NOW()                                                                      AS checked_at,
    m.instance_name,
    COUNT(*) FILTER (WHERE m.status IN ('pending','queued'))                   AS pending_messages,
    COUNT(*) FILTER (WHERE m.status='pending' AND m.created_at < NOW()-INTERVAL'5 min')  AS stuck_messages_5m,
    COUNT(*) FILTER (WHERE m.status='pending' AND m.created_at < NOW()-INTERVAL'30 min') AS stuck_messages_30m,
    COUNT(*) FILTER (WHERE m.status='failed'  AND m.created_at > NOW()-INTERVAL'24 h')   AS failed_messages_24h,
    EXTRACT(EPOCH FROM (NOW()-MIN(m.created_at)))/60
      FILTER (WHERE m.status='pending')                                        AS oldest_pending_minutes
  FROM zapp.messages m
  WHERE (p_instance_name IS NULL OR m.instance_name = p_instance_name)
  GROUP BY m.instance_name
$$;

GRANT EXECUTE ON FUNCTION zapp.rpc_get_pipeline_health_v2(TEXT) TO authenticated, service_role;
