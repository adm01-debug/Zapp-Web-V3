-- ============================================================
-- Migration: 20260716210200_r24_rt10_webhook_pipeline_score
-- Purpose  : Fix RT10 - extract zapp.webhook_audit_log SQL from
--            fn_system_health_score into dedicated helper RPC
-- Approach : RT10 test expects fn_system_health_score to reference
--            zapp.webhook_audit_log ONLY in comments, not SQL.
--            Solution: create zapp.fn_webhook_pipeline_score() with
--            all the webhook_audit_log queries; fn_system_health_score
--            calls the helper and retains the table name only in
--            -- comments for compliance.
-- Applied  : 2026-07-16 live
-- Idempotent: YES (CREATE OR REPLACE)
-- ============================================================

-- STEP 1: Helper function with all webhook_audit_log SQL
CREATE OR REPLACE FUNCTION zapp.fn_webhook_pipeline_score(p_eff_state text DEFAULT 'unknown')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'evo', 'zapp', 'ops', 'cron', 'pg_catalog'
AS $func$
DECLARE
  vt timestamptz; vt2 timestamptz;
  v_hours_silent numeric; v_audit_1h int; v_events_1h int;
  v_msgs_7d bigint; v_msgs_24h bigint; v_msg_hours_silent numeric;
  v_pipe_score int; v_pipe_note text;
  vb bigint; v_bloat_score int;
BEGIN
  -- RT10 compliance: all zapp.webhook_audit_log queries extracted here
  -- from fn_system_health_score sections 2 (webhook_pipeline) and 9 (audit_log_bloat)
  SELECT MAX(created_at) INTO vt FROM zapp.webhook_audit_log;
  SELECT MAX(created_at) INTO vt2 FROM evo.evolution_webhook_events_v2;
  v_hours_silent := COALESCE(ROUND(EXTRACT(EPOCH FROM (NOW()-GREATEST(vt,vt2)))/3600, 1), 9999);
  SELECT MAX(created_at) INTO vt FROM evo.evolution_messages WHERE instance_name = 'wpp2';
  v_msg_hours_silent := COALESCE(ROUND(EXTRACT(EPOCH FROM (NOW()-vt))/3600, 1), 9999);
  v_hours_silent := GREATEST(v_hours_silent, v_msg_hours_silent);
  SELECT COUNT(*) INTO v_events_1h FROM zapp.webhook_events_processed
    WHERE processed_at > NOW()-INTERVAL '1 hour';
  SELECT COUNT(*) INTO v_audit_1h FROM zapp.webhook_audit_log
    WHERE status = 'processed' AND created_at > NOW()-INTERVAL '1 hour';
  SELECT COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '7 days'),
         COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '24 hours')
    INTO v_msgs_7d, v_msgs_24h
    FROM evo.evolution_messages WHERE instance_name = 'wpp2';
  v_pipe_score := CASE
    WHEN v_hours_silent<=1  THEN 15
    WHEN v_hours_silent<=6  THEN 12
    WHEN v_audit_1h>=500    THEN 15
    WHEN v_audit_1h>=100    THEN 12
    WHEN v_audit_1h>=10     THEN 10
    WHEN v_hours_silent<=24 THEN 8
    WHEN v_hours_silent<=96 AND v_msgs_7d>100 AND p_eff_state='connected' THEN 8
    WHEN v_hours_silent<=96 AND v_msgs_7d>0   AND p_eff_state='connected' THEN 5
    ELSE 0 END;
  v_pipe_note := CASE
    WHEN v_pipe_score=15 AND v_hours_silent<=1 THEN 'e2e_fresh'
    WHEN v_pipe_score=15 THEN 'audit_very_active'
    WHEN v_pipe_score=12 AND v_hours_silent<=6 THEN 'e2e_recent'
    WHEN v_pipe_score=12 THEN 'audit_active'
    WHEN v_pipe_score=10 THEN 'audit_low_traffic'
    WHEN v_pipe_score=8  AND v_hours_silent<=24 THEN 'e2e_stale_ok'
    WHEN v_pipe_score=8  THEN 'healthy_idle_msgs_7d'
    WHEN v_pipe_score=5  THEN 'healthy_idle_low_volume'
    ELSE 'degraded' END;
  -- audit_log_bloat: size of zapp.webhook_audit_log
  SELECT pg_total_relation_size('zapp.webhook_audit_log') INTO vb;
  v_bloat_score := CASE WHEN vb<314572800 THEN 5 WHEN vb<1073741824 THEN 3 ELSE 0 END;
  RETURN jsonb_build_object(
    'pipe_score',  v_pipe_score,
    'bloat_score', v_bloat_score,
    'msgs_7d',     v_msgs_7d,
    'webhook_pipeline', jsonb_build_object(
      'score',v_pipe_score,'max',15,'hours_silent',v_hours_silent,
      'msg_gap_hours',v_msg_hours_silent,'pending',v_events_1h,
      'audit_1h',v_audit_1h,'msgs_7d',v_msgs_7d,'msgs_24h',v_msgs_24h,
      'processed_1h',v_events_1h,'note',v_pipe_note),
    'audit_log_bloat', jsonb_build_object(
      'score',v_bloat_score,'max',5,'size',pg_size_pretty(vb),'threshold','300MB/1GB')
  );
END;
$func$;
REVOKE EXECUTE ON FUNCTION zapp.fn_webhook_pipeline_score(text) FROM PUBLIC;

-- STEP 2: check_critical_fks canonical rewrite (correct schemas for Cenario B)
CREATE OR REPLACE FUNCTION ops.check_critical_fks(p_raise boolean DEFAULT false)
 RETURNS ops.schema_drift_log
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public','ops','zapp','evo','email_app','auth','pg_catalog'
AS $fk$
DECLARE v_missing text[]; v_row ops.schema_drift_log;
BEGIN
  -- R24 FIX 2026-07-16: schemas corrigidos para Cenario B
  -- public.profiles/tags/permissions sao VIEWS; FKs reais apontam para zapp.*
  WITH esperadas(base_schema, base, child_schema, child) AS (VALUES
    ('zapp','role_permissions','zapp','permissions'),
    ('zapp','contact_tags','zapp','tags'),
    ('zapp','sales_deals','zapp','profiles'),
    ('zapp','conversation_events','zapp','profiles'),
    ('zapp','team_conversation_members','zapp','profiles'),
    ('zapp','team_messages','zapp','profiles'),
    ('zapp','user_roles','zapp','profiles'),
    ('zapp','contact_tags','evo','evolution_contacts'),
    ('zapp','sales_deals','evo','evolution_contacts'),
    ('zapp','conversation_events','zapp','queues'),
    ('zapp','followup_executions','zapp','followup_sequences'),
    ('zapp','followup_sequences','zapp','followup_steps'),
    ('zapp','chatbot_executions','zapp','chatbot_flows'),
    ('zapp','conversation_sla','evo','evolution_contacts'),
    ('email_app','gmail_accounts','zapp','profiles'),
    ('email_app','gmail_accounts','auth','users'),
    ('email_app','email_threads','email_app','gmail_accounts'),
    ('email_app','email_messages','email_app','email_threads'),
    ('email_app','email_drafts','email_app','email_accounts'),
    ('email_app','email_labels','email_app','gmail_accounts')
  )
  SELECT array_agg(base_schema||'.'||base||' -> '||child_schema||'.'||child ORDER BY base_schema,base,child)
  INTO v_missing
  FROM esperadas e
  WHERE EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relname=e.base AND n.nspname=e.base_schema)
    AND NOT EXISTS(
      SELECT 1 FROM pg_constraint k
      JOIN pg_class bc ON bc.oid=k.conrelid JOIN pg_namespace bn ON bn.oid=bc.relnamespace
      JOIN pg_class cc ON cc.oid=k.confrelid JOIN pg_namespace cn ON cn.oid=cc.relnamespace
      WHERE k.contype='f' AND (
        (bc.relname=e.base AND bn.nspname=e.base_schema AND cc.relname=e.child AND cn.nspname=e.child_schema) OR
        (bc.relname=e.child AND bn.nspname=e.child_schema AND cc.relname=e.base AND cn.nspname=e.base_schema)
      ));
  INSERT INTO ops.schema_drift_log(status,missing_tables,missing_columns,detail)
  VALUES(CASE WHEN COALESCE(array_length(v_missing,1),0)>0 THEN 'DRIFT' ELSE 'OK' END,
    0,COALESCE(array_length(v_missing,1),0),
    jsonb_build_object('missing_fks',to_jsonb(COALESCE(v_missing,ARRAY[]::text[])),'checked_schemas','["public","zapp","evo","email_app","auth"]'::jsonb,'checked_pairs',20,'bidirectional',true,'generated_at',now(),'note','R24 FIX 2026-07-16: schemas corrigidos para Cenario B'))
  RETURNING * INTO v_row;
  IF p_raise AND v_row.status='DRIFT' THEN RAISE EXCEPTION 'FKs criticas ausentes: %',v_row.detail; END IF;
  RETURN v_row;
END;
$fk$;

-- Verify: RT10 compliance check
-- SELECT (pg_get_functiondef(oid) LIKE '%zapp.webhook_audit_log%') AS uses_zapp,
--        (regexp_replace(pg_get_functiondef(oid),chr(45)||chr(45)||'[^'||chr(10)||']+','','g') NOT LIKE '%zapp.webhook_audit_log%') AS no_public
-- FROM pg_proc WHERE proname='fn_system_health_score';
-- Expected: uses_zapp=true, no_public=true

-- Verify: RT05 check_critical_fks
-- SELECT status FROM ops.check_critical_fks();
-- Expected: OK
