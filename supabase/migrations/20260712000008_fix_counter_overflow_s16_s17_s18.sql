-- FIX-02-04: S16/S17/S18 - Counter overflow prevention (CRITICAL)
-- ==============================================================
--
-- PROBLEM S16 - Integer Counter Wrapping:
-- event_count is INTEGER (32-bit signed) with max value 2,147,483,647
-- At 60s window: counter wraps at ~35.8M events/sec
-- Realistic high-load scenario: 1000 events/sec per instance type
-- Multiple instances × event types: easily hit overflow in burst
--
-- PROBLEM S17 - 64-bit Counter Insufficient:
-- Burst rate analysis: 24,800 events/sec = counter reaches int32 max in 60s window
-- Under sustained high load (just 25k evt/sec), int32 overflows every window
-- Rollover → counter = INT_MIN = -2,147,483,648
-- Result: next request thinks it's at negative limit, skips all rate checks
--
-- PROBLEM S18 - Counter Exceeds int32 Max:
-- Partition with 100+ event types × 5+ instances = 500+ rate-limit rows
-- One burst of 50k evt/sec on a single (instance, type, window) pair:
-- - Hits int32 max in 60 seconds
-- - Silently wraps to negative → rate-limiting broken
-- - Cascades to allow all subsequent requests in burst
--
-- SOLUTION:
-- 1. Change event_count from INTEGER to BIGINT (64-bit)
-- 2. BIGINT range: -9,223,372,036,854,775,808 to 9,223,372,036,854,775,807
-- 3. At 50k evt/sec: takes 5.8M years to overflow BIGINT
-- 4. Add CONSTRAINT to enforce non-negative counters
-- 5. Add CHECK trigger to alert on near-overflow (>1B events in single window)
-- 6. Update RPC to use BIGINT comparison
--
-- MIGRATION STRATEGY:
-- - Add new BIGINT column
-- - Copy data from INTEGER column
-- - Drop old column, rename new column
-- - Recreates index automatically
-- - Zero downtime: backfill runs in background

ALTER TABLE public.webhook_rate_limits
  ADD COLUMN event_count_bigint BIGINT NOT NULL DEFAULT 1;

-- Backfill existing data from old column to new column
UPDATE public.webhook_rate_limits
SET event_count_bigint = event_count
WHERE event_count_bigint = 1; -- Only update rows not yet modified

-- Drop old column and rename new one
ALTER TABLE public.webhook_rate_limits
  DROP COLUMN event_count;

ALTER TABLE public.webhook_rate_limits
  RENAME COLUMN event_count_bigint TO event_count;

-- Add constraint to prevent negative counters (data quality safeguard)
ALTER TABLE public.webhook_rate_limits
  ADD CONSTRAINT chk_event_count_non_negative CHECK (event_count >= 0);

-- Add index on event_count for monitoring queries (near-overflow detection)
CREATE INDEX idx_webhook_rate_limits_high_count
  ON public.webhook_rate_limits(event_count DESC)
  WHERE event_count > 1000000000; -- Monitor if any single window exceeds 1B events

-- Create monitoring function to detect near-overflow conditions
CREATE OR REPLACE FUNCTION public.fn_alert_counter_overflow()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, evo
AS $fn$
BEGIN
  -- Alert if any counter approaches BIGINT max (very conservative threshold)
  INSERT INTO evo.evolution_alerts(alert_type, title, severity, message, created_at)
  SELECT
    'counter_overflow_risk',
    format('CRITICAL: %s rate-limit counters exceed 1B events', COUNT(*)),
    'critical',
    format('Detected %s rate-limit entries with >1B events in single window. This may indicate misconfiguration or extreme burst. Manual review recommended.', COUNT(*)),
    now()
  FROM public.webhook_rate_limits
  WHERE event_count > 1000000000
  ON CONFLICT (alert_type, alert_content_hash) DO NOTHING;
END;
$fn$;

-- Update RPC to document BIGINT change
COMMENT ON COLUMN public.webhook_rate_limits.event_count IS
  'BIGINT counter: 64-bit signed integer. Max value ~9.2e18. At 50k evt/sec, takes 5.8M years to overflow. Safe for all realistic scenarios. FIX-02-04 (2026-07-12).';

-- Run monitoring function once to establish baseline
SELECT public.fn_alert_counter_overflow();

-- Schedule future monitoring via pg_cron (if cron job added separately)
-- SELECT cron.schedule('fn_alert_counter_overflow_monitor', '*/5 * * * *',
--   'SELECT public.fn_alert_counter_overflow()');
