-- Fix fn_route_failed_webhooks_to_dlq: replace [^v] regex with LIKE-based enumeration.
--
-- The regex `~ '^evolution_webhook_events_[^v]'` accidentally excludes any instance table
-- whose name starts with 'v' (e.g. "vendas", "vip"). This was the bug documented in session 5
-- but the corrected version (migration 20260710000001) was never applied — the production DB
-- was patched manually with defensive coding (exception handler, column check, v_skipped counter)
-- that was NOT in the committed migration file.
--
-- This migration supersedes 20260710000001 and:
--   1. Applies the LIKE-based fix (the actual intent of 20260710000001).
--   2. Preserves all defensive coding added manually during session 5.
--   3. Preserves production defaults (30 min / 200 rows) and search_path order.
--
-- Only line changed vs production: regex → LIKE

CREATE OR REPLACE FUNCTION public.fn_route_failed_webhooks_to_dlq(
  p_max_age_minutes integer DEFAULT 30,
  p_batch_size integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'evo', 'public'
AS $function$
DECLARE
  v_routed    INT := 0;
  v_count     INT := 0;
  v_skipped   INT := 0;
  v_threshold TIMESTAMPTZ := now() - (p_max_age_minutes || ' minutes')::interval;
  v_tbl       TEXT;
  v_sql       TEXT;
  v_has_col   BOOLEAN;
BEGIN
  FOR v_tbl IN
    SELECT t.table_name
    FROM information_schema.tables t
    WHERE t.table_schema = 'evo'
      AND t.table_name LIKE 'evolution_webhook_events_%'
      AND t.table_name NOT IN ('evolution_webhook_events_v2','evolution_webhook_events_default')
      AND t.table_name NOT LIKE 'evolution_webhook_events_v2_%'
      AND t.table_type = 'BASE TABLE'
    ORDER BY t.table_name
  LOOP
    BEGIN
      SELECT EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='evo' AND table_name=v_tbl AND column_name='processed'
      ) INTO v_has_col;
      IF NOT v_has_col THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;
      v_sql := format(
        'WITH failed AS ('
        '  SELECT id, event_type, instance_name, remote_jid, payload, error_message'
        '  FROM evo.%I'
        '  WHERE processed=false AND error_message IS NOT NULL AND created_at<%L'
        '  ORDER BY created_at ASC LIMIT %s'
        '), inserted AS ('
        '  INSERT INTO evo.evolution_webhook_dlq'
        '    (event_type, instance_name, remote_jid, payload, error_message,'
        '     status, next_retry_at, created_at, source_event_id)'
        '  SELECT f.event_type, f.instance_name, f.remote_jid, f.payload,'
        '    COALESCE(f.error_message,''processing_failed''),'
        '    ''pending'', now()+INTERVAL ''5 minutes'', now(), f.id'
        '  FROM failed f'
        '  ON CONFLICT (source_event_id) WHERE source_event_id IS NOT NULL DO NOTHING'
        '  RETURNING source_event_id'
        ') UPDATE evo.%I SET processed=true, processed_at=now()'
        ' WHERE id IN (SELECT source_event_id FROM inserted)',
        v_tbl, v_threshold, p_batch_size, v_tbl
      );
      EXECUTE v_sql;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_routed := v_routed + v_count;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
      RAISE WARNING 'dlq_router: tabela % inacessivel (SQLSTATE=%): %', v_tbl, SQLSTATE, SQLERRM;
    END;
  END LOOP;
  RETURN jsonb_build_object(
    'newly_routed_to_dlq', v_routed,
    'tables_skipped', v_skipped,
    'threshold', v_threshold,
    'batch_size', p_batch_size
  );
END;
$function$;
