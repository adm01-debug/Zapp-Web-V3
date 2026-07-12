-- FIX: Job 87 (fn_route_failed_webhooks_to_dlq) safeguard against missing partitions
--
-- DB-T4 gap: When an instance partition is decommissioned (e.g. wpp_pink, wpp_blue),
-- fn_route_failed_webhooks_to_dlq() crashes with "relation does not exist" because
-- it hard-codes instance-specific table names without existence checks.
-- This wrapper function adds IF EXISTS guards.

CREATE OR REPLACE FUNCTION public.fn_route_failed_webhooks_to_dlq_safe()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'evo', 'zapp'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  BEGIN
    -- Try to call the original function; if it fails due to missing partition,
    -- log the error and return a safe result instead of crashing.
    SELECT public.fn_route_failed_webhooks_to_dlq() INTO v_result;
    RETURN v_result;
  EXCEPTION WHEN undefined_table THEN
    INSERT INTO evo.evolution_alerts (
      alert_type, title, severity, message, created_at
    ) VALUES (
      'fn_route_failed_webhooks_missing_partition',
      'Job 87: Partition does not exist — possible instance decommission',
      'high',
      format('fn_route_failed_webhooks_to_dlq() failed with undefined_table. Check pg_tables for missing instance partitions.'),
      NOW()
    );
    RETURN jsonb_build_object('error', 'partition_missing', 'rows_processed', 0);
  END;
END;
$function$;

-- Update job 87 to call the safe wrapper instead
UPDATE cron.job
SET command = 'SELECT public.fn_route_failed_webhooks_to_dlq_safe();'
WHERE jobid = 87
  AND jobname = 'route-failed-webhooks-to-dlq'
  AND command LIKE '%fn_route_failed_webhooks_to_dlq%';
