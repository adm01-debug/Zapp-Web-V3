-- FIX-05: S19/S20 - RPC Timeout + Connection Pool Exhaustion (CRITICAL)
-- =====================================================================
--
-- PROBLEM S19 - RPC Timeout under high concurrency:
-- When multiple Edge Functions simultaneously call increment_webhook_rate_limit,
-- RPC execution can hang indefinitely if:
-- 1. Database connection pool is exhausted (no available connections)
-- 2. RPC executes a very slow query (e.g., full table scan on rate_limits)
-- 3. Lock contention on webhook_rate_limits row causes cascading slowdown
-- 4. No statement timeout enforced → RPC hangs indefinitely
--
-- PROBLEM S20 - Connection Pool Exhaustion:
-- Edge Functions platform typically provides ~10-50 shared DB connections.
-- Under concurrent webhook load (100+ events/sec), all connections can be
-- consumed by slow RPCs, causing new requests to queue indefinitely.
--
-- SOLUTION:
-- 1. Add statement_timeout (5 seconds) to the RPC function definition
-- 2. Implement fast-path: use index on (instance_id, event_type, window_start)
--    to ensure O(1) lookup, not full table scan
-- 3. Minimize RPC execution time by reducing lock hold duration
-- 4. Add application-level timeout & retry logic in rate-limiter.ts
-- 5. Implement exponential backoff for transient connection failures

-- Step 1: Ensure webhook_rate_limits table has optimal indexes
CREATE INDEX IF NOT EXISTS idx_webhook_rate_limits_active
  ON zapp.webhook_rate_limits (instance_id, event_type, window_start)
  WHERE window_start > now() - INTERVAL '2 minutes';
-- This partial index ensures only "active" windows are indexed, reducing
-- index bloat from expired window rows. Fast-path for rate-limit lookup.

-- Step 2: Update RPC with statement timeout and optimized logic
CREATE OR REPLACE FUNCTION public.increment_webhook_rate_limit(
  p_instance_id text,
  p_event_type text,
  p_window_start timestamptz,
  p_limit int,
  p_window_seconds int DEFAULT 60
) RETURNS TABLE(current_count int, is_allowed boolean, window_expired boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, public
SET statement_timeout = '5s'
SET lock_timeout = '2s'
AS $fn$
DECLARE
  v_count int;
  v_now timestamptz;
  v_window_age_seconds int;
  v_expired boolean;
BEGIN
  v_now := now();
  v_window_age_seconds := EXTRACT(EPOCH FROM (v_now - p_window_start))::int;
  v_expired := (v_window_age_seconds >= p_window_seconds);

  IF v_expired THEN
    -- Window has expired: reset counter to 1 for this new request
    -- Use fast-path: DELETE + INSERT in single transaction
    DELETE FROM zapp.webhook_rate_limits
    WHERE instance_id = p_instance_id
      AND event_type = p_event_type
      AND window_start = p_window_start;

    INSERT INTO zapp.webhook_rate_limits(instance_id, event_type, window_start, event_count, created_at)
    VALUES (p_instance_id, p_event_type, p_window_start, 1, v_now)
    ON CONFLICT (instance_id, event_type, window_start)
    DO UPDATE SET
      event_count = 1,
      created_at = v_now
    RETURNING event_count INTO v_count;

    RETURN QUERY SELECT v_count, true, true;
  ELSE
    -- Window is still active: increment counter and check limit
    -- Use atomic INSERT ... ON CONFLICT with minimal lock duration
    INSERT INTO zapp.webhook_rate_limits(instance_id, event_type, window_start, event_count, created_at)
    VALUES (p_instance_id, p_event_type, p_window_start, 1, v_now)
    ON CONFLICT (instance_id, event_type, window_start)
    DO UPDATE SET event_count = zapp.webhook_rate_limits.event_count + 1
    RETURNING event_count INTO v_count;

    RETURN QUERY SELECT v_count, (v_count <= p_limit), false;
  END IF;
EXCEPTION WHEN lock_not_available THEN
  -- Timeout acquiring lock (connection pool contention)
  -- Fail-open: allow request and let producer handle any rate-limit errors
  -- Log this for observability (connection pool saturation alert)
  RAISE WARNING '[rate-limit] lock timeout - connection pool possibly saturated: %/%',
    p_instance_id, p_event_type;
  RETURN QUERY SELECT 999, true, false;
EXCEPTION WHEN statement_timeout THEN
  -- RPC execution timeout (query too slow)
  -- Fail-open: allow request to proceed, connection pool is under pressure
  RAISE WARNING '[rate-limit] statement timeout - RPC execution slow: %/%',
    p_instance_id, p_event_type;
  RETURN QUERY SELECT 999, true, false;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.increment_webhook_rate_limit(text, text, timestamptz, int, int)
  TO service_role, anon, authenticated;

-- Step 3: Create alert trigger for connection pool saturation
-- This alert fires when rate-limit RPC is timing out frequently
CREATE OR REPLACE FUNCTION public.fn_alert_rate_limit_timeout()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, evo
AS $fn$
BEGIN
  -- Check if we've had multiple rate-limit timeouts in the past 5 minutes
  -- (This would be populated by application logging of timeout exceptions)
  -- For now, this is a placeholder for future integration with observability
  NULL;
END;
$fn$;

-- Step 4: Document connection pool sizing recommendation
COMMENT ON FUNCTION public.increment_webhook_rate_limit(text, text, timestamptz, int, int) IS
  'Atomic rate-limit check with window boundary handling.

   FIX-05 Mitigations:
   1. statement_timeout = 5s: Prevents hung queries, allows graceful degradation
   2. lock_timeout = 2s: Fail-open if lock contention is detected
   3. Partial index on active windows: O(1) lookup, prevents full table scans
   4. Exception handlers: Catch timeout errors and fail-open (allow request)
   5. Recommended connection pool: 20-50 connections for 100+ evt/sec load

   For Edge Functions deployment:
   - Supabase typically provides 10-20 shared connections per function
   - Under 100 evt/sec × 1 RPC call/event = connection starvation likely
   - Solution: Use Supabase Pooling (PgBouncer) for >10k evt/sec
   - Alternative: Implement client-side rate-limiting to reduce RPC calls by 50%+

   Monitoring:
   - Watch for statement_timeout or lock_timeout warnings in logs
   - Alert threshold: >5 timeouts per minute = capacity scaling needed';
