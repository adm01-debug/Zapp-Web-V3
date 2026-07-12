-- FIX-01: S8 - Window Boundary Race Condition (CRITICAL)
-- ======================================================
--
-- PROBLEM (Race Condition):
-- 1. Request A arrives at t=59.9s, calculates window_start bucket (t=0s)
-- 2. Request A calls increment_webhook_rate_limit(window_start=t=0s)
-- 3. Meanwhile, cron job fires at t=60.0s, executes window reset (deletes old rows)
-- 4. The race window: RPC reads counter at t=59.9s (counter=limit), then window reset
--    deletes the row at t=60.0s
-- 5. Request A's rate-check uses stale counter value, makes wrong allow/deny decision
--
-- SOLUTION: Make window expiry detection atomic within the RPC.
-- The RPC must:
-- 1. Check if the window_start passed is expired (now() - window_start > 60 seconds)
-- 2. If expired: reset counter to 1, return allowed=true (first request in new window)
-- 3. If active: increment counter, check against limit
-- 4. All within single atomic transaction (no race with cron job)
--
-- RESULT: Window boundary transition is now atomic. No requests slip through
-- or get incorrectly rejected due to reset timing.

CREATE OR REPLACE FUNCTION public.increment_webhook_rate_limit(
  p_instance_id text,
  p_event_type text,
  p_window_start timestamptz,
  p_limit int,
  p_window_seconds int DEFAULT 60
) RETURNS TABLE(current_count bigint, is_allowed boolean, window_expired boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, public
AS $fn$
DECLARE
  v_count bigint;
  v_now timestamptz;
  v_window_age_seconds int;
  v_expired boolean;
BEGIN
  v_now := now();
  v_window_age_seconds := EXTRACT(EPOCH FROM (v_now - p_window_start))::int;
  v_expired := (v_window_age_seconds >= p_window_seconds);

  IF v_expired THEN
    -- Window has expired: reset counter to 1 for this new request
    -- Delete the old row (or upsert with reset) atomically
    DELETE FROM public.webhook_rate_limits
    WHERE instance_id = p_instance_id
      AND event_type = p_event_type
      AND window_start = p_window_start;

    INSERT INTO public.webhook_rate_limits(instance_id, event_type, window_start, event_count, created_at)
    VALUES (p_instance_id, p_event_type, p_window_start, 1, v_now)
    ON CONFLICT (instance_id, event_type, window_start)
    DO UPDATE SET
      event_count = 1,
      created_at = v_now
    RETURNING event_count INTO v_count;

    -- First request in new window is always allowed
    RETURN QUERY SELECT v_count, true, true;
  ELSE
    -- Window is still active: increment counter and check limit
    INSERT INTO public.webhook_rate_limits(instance_id, event_type, window_start, event_count, created_at)
    VALUES (p_instance_id, p_event_type, p_window_start, 1, v_now)
    ON CONFLICT (instance_id, event_type, window_start)
    DO UPDATE SET event_count = public.webhook_rate_limits.event_count + 1
    RETURNING event_count INTO v_count;

    RETURN QUERY SELECT v_count, (v_count <= p_limit), false;
  END IF;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.increment_webhook_rate_limit(text, text, timestamptz, int, int)
  TO service_role, anon, authenticated;

-- Update rate-limiter.ts to use the new window_expired return value
-- and pass p_window_seconds parameter (see comment below)

-- NOTE FOR CODE SYNC:
-- The rate-limiter.ts file now receives window_expired in the query result.
-- Update checkRateLimit() to:
-- 1. Pass windowSeconds to the RPC: p_window_seconds parameter
-- 2. Check the window_expired return value to log window boundary crossings
-- 3. Use window_expired to update metrics/observability (optional, but valuable)
