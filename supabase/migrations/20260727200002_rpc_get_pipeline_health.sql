-- Migration: rpc_get_pipeline_health — consolidated pipeline health dashboard
-- Returns a single-row snapshot of the message pipeline state.
-- Used by: monitoring dashboards, health-check crons, PostgREST API.

CREATE OR REPLACE FUNCTION zapp.rpc_get_pipeline_health()
RETURNS TABLE (
  checked_at              TIMESTAMPTZ,
  pending_messages        BIGINT,
  stuck_messages_5m       BIGINT,
  stuck_messages_30m      BIGINT,
  failed_messages_24h     BIGINT,
  queued_media            BIGINT,
  dispatch_errors_1h      BIGINT,
  realtime_lag_seconds    DOUBLE PRECISION,
  oldest_pending_minutes  DOUBLE PRECISION
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'zapp', 'pg_catalog'
AS $$
  SELECT
    NOW() AS checked_at,
    COUNT(*) FILTER (WHERE status IN ('pending','queued'))            AS pending_messages,
    COUNT(*) FILTER (WHERE status='pending' AND created_at < NOW()-INTERVAL'5 min')  AS stuck_messages_5m,
    COUNT(*) FILTER (WHERE status='pending' AND created_at < NOW()-INTERVAL'30 min') AS stuck_messages_30m,
    COUNT(*) FILTER (WHERE status='failed'  AND created_at > NOW()-INTERVAL'24 h')   AS failed_messages_24h,
    (SELECT COUNT(*) FROM zapp.media_queue WHERE status='pending')   AS queued_media,
    (SELECT COUNT(*) FROM zapp.dispatch_error_logs WHERE created_at > NOW()-INTERVAL'1 h') AS dispatch_errors_1h,
    EXTRACT(EPOCH FROM (NOW()-MIN(created_at))) FILTER (WHERE status='pending') AS realtime_lag_seconds,
    EXTRACT(EPOCH FROM (NOW()-MIN(created_at)))/60 FILTER (WHERE status='pending') AS oldest_pending_minutes
  FROM zapp.messages
$$;

GRANT EXECUTE ON FUNCTION zapp.rpc_get_pipeline_health() TO authenticated, service_role;
