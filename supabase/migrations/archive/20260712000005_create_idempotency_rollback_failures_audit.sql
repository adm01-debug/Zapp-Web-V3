-- FIX 1 audit table: Track idempotency rollback failures (C-1 G1 gap)
--
-- When unmarkEventProcessed fails during a 429 response, the event remains
-- permanently deduplicated, causing silent loss on re-delivery. This table
-- records every such failure so operators can detect and remediate.

CREATE TABLE IF NOT EXISTS public.idempotency_rollback_failures (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL,
  instance TEXT,
  event_type TEXT,
  error_code TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT idx_event_id_created UNIQUE (event_id, created_at)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_failures_created
  ON public.idempotency_rollback_failures (created_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_idempotency_failures_instance
  ON public.idempotency_rollback_failures (instance, created_at DESC NULLS LAST);

-- Grant read access to monitoring role
GRANT SELECT ON public.idempotency_rollback_failures TO authenticated;

-- Add alert if any failures exist from past 24h (can be scheduled as a cron job)
CREATE OR REPLACE FUNCTION public.fn_alert_idempotency_failures()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'evo'
AS $function$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.idempotency_rollback_failures
  WHERE created_at > NOW() - INTERVAL '24 hours';

  IF v_count > 0 THEN
    INSERT INTO evo.evolution_alerts (
      alert_type, title, severity, message, created_at
    ) VALUES (
      'idempotency_rollback_failure',
      format('CRITICAL: %s events lost due to rollback failures in last 24h', v_count),
      'critical',
      format('Investigate idempotency_rollback_failures table. %s events are permanently deduplicated and will not reprocess.', v_count),
      NOW()
    ) ON CONFLICT (alert_type, alert_content_hash) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('rollback_failures_24h', v_count);
END;
$function$;
