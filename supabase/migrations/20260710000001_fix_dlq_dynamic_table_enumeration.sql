-- Fix fn_route_failed_webhooks_to_dlq to enumerate instance tables dynamically.
--
-- Previous version hardcoded two specific instance tables, causing the cron job
-- to fail with "relation does not exist" whenever an instance was dropped.
-- Additionally, the `[^v]` regex accidentally excluded any instance whose name
-- starts with 'v' (e.g. "vendas", "vip"). This migration fixes both issues:
--   1. Dynamic enumeration via information_schema — no hardcoded instance names.
--   2. LIKE-based prefix match instead of regex, with explicit exclusions for v2*.

CREATE OR REPLACE FUNCTION public.fn_route_failed_webhooks_to_dlq(
  p_max_age_minutes integer DEFAULT 60,
  p_batch_size integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'evo'
AS $function$
DECLARE
  v_routed    INT := 0;
  v_count     INT := 0;
  v_threshold TIMESTAMPTZ := now() - (p_max_age_minutes || ' minutes')::interval;
  v_tbl       TEXT;
  v_sql       TEXT;
BEGIN
  FOR v_tbl IN
    SELECT t.table_name
    FROM information_schema.tables t
    WHERE t.table_schema = 'evo'
      AND t.table_name LIKE 'evolution_webhook_events_%'
      AND t.table_name NOT IN ('evolution_webhook_events_v2', 'evolution_webhook_events_default')
      AND t.table_name NOT LIKE 'evolution_webhook_events_v2_%'
      AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name
  LOOP
    v_sql := format($sql$
      WITH failed AS (
        SELECT id, event_type, instance_name, remote_jid, payload, error_message
        FROM evo.%I
        WHERE processed = false
          AND error_message IS NOT NULL
          AND created_at < %L
        ORDER BY created_at ASC LIMIT %s
      ),
      inserted AS (
        INSERT INTO evo.evolution_webhook_dlq
          (event_type, instance_name, remote_jid, payload, error_message,
           status, next_retry_at, created_at, source_event_id)
        SELECT f.event_type, f.instance_name, f.remote_jid, f.payload,
          COALESCE(f.error_message, 'processing_failed'),
          'pending', now() + INTERVAL '5 minutes', now(), f.id
        FROM failed f
        ON CONFLICT (source_event_id) WHERE source_event_id IS NOT NULL DO NOTHING
        RETURNING source_event_id
      )
      UPDATE evo.%I
      SET processed = true, processed_at = now()
      WHERE id IN (SELECT source_event_id FROM inserted)
    $sql$, v_tbl, v_threshold, p_batch_size, v_tbl);
    EXECUTE v_sql;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_routed := v_routed + v_count;
  END LOOP;
  RETURN jsonb_build_object(
    'newly_routed_to_dlq', v_routed,
    'threshold', v_threshold,
    'batch_size', p_batch_size
  );
END;
$function$;
