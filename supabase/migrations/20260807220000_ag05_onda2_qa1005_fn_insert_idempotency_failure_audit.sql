-- ESPELHO repo×DB — migration aplicada via MCP (supabase_apply_migration) na auditoria Hermes 2026-08-06/07.
-- Registro em supabase_migrations.schema_migrations; este arquivo é o registro histórico (DB-as-source).
CREATE OR REPLACE FUNCTION zapp.fn_insert_idempotency_failure_audit(p_event_id text, p_instance text DEFAULT NULL::text, p_event_type text DEFAULT NULL::text, p_error_code text DEFAULT NULL::text, p_error_message text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp, pg_temp'
AS $function$
BEGIN
  INSERT INTO zapp.audit_logs (action, entity_type, event_type, resource, status, details)
  VALUES (
    'idempotency_rollback_failure',
    'webhook_event',
    coalesce(p_event_type, 'unknown'),
    'evolution-webhook',
    'error',
    jsonb_build_object(
      'event_id', p_event_id,
      'instance', p_instance,
      'event_type', p_event_type,
      'error_code', p_error_code,
      'error_message', p_error_message
    )
  );
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO ops.maintenance_log (job, details, ran_at)
    VALUES ('fn_insert_idempotency_failure_audit', jsonb_build_object('event_id', p_event_id, 'error', SQLERRM), now());
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$function$
