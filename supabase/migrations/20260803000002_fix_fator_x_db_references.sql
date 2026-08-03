-- Fix FATOR X references → Evolution DB
-- ------------------------------------------------------------------
-- 1. fn_constraints_reference_pipeline : alert message 'FATOR X' → 'Evolution DB',
--    doc_name 'FATOR_X_CONSTRAINTS_REFERENCE' → 'EVOLUTION_DB_CONSTRAINTS_REFERENCE',
--    'project-knowledge do Lovable' → 'project-knowledge'
-- 2. fn_snapshot_constraints_reference : doc_name 'FATOR_X_CONSTRAINTS_REFERENCE'
--    → 'EVOLUTION_DB_CONSTRAINTS_REFERENCE' (SELECT + INSERT)
-- 3. v_improvements_status : 'Schema fator_x crons' → 'Schema evolution_db crons'
--
-- CREATE OR REPLACE (não DROP+CREATE) para preservar permissões/grants.

CREATE OR REPLACE FUNCTION zapp.fn_constraints_reference_pipeline()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$
DECLARE
  v_snapshot jsonb;
  v_is_drift boolean;
  v_alert_id uuid;
BEGIN
  v_snapshot := fn_snapshot_constraints_reference(NULL, 'monthly_cron');
  v_is_drift := (v_snapshot->'drift'->>'is_drift')::boolean;
  
  IF v_is_drift THEN
    INSERT INTO zapp.webhook_health_alerts (alert_type, severity, title, details)
    VALUES ('constraints_reference_drift','WARNING',
      format('🔔 Schema Evolution DB mudou — regenerar EVOLUTION_DB_CONSTRAINTS_REFERENCE.md'),
      jsonb_build_object(
        'acao_recomendada', 'Executar fn_generate_constraints_reference() e subir na project-knowledge',
        'snapshot_id', v_snapshot->>'new_version_id',
        'drift', v_snapshot->'drift',
        'tamanho_kb', ROUND((v_snapshot->>'content_size_bytes')::int / 1024.0, 2),
        'total_linhas', (v_snapshot->>'total_lines')::int,
        'hash_novo', v_snapshot->>'hash'
      )
    ) RETURNING id INTO v_alert_id;
    v_snapshot := v_snapshot || jsonb_build_object('alert_created', v_alert_id);
  END IF;
  
  INSERT INTO zapp.evolution_audit_log (action, entity_type, performed_by, performed_by_type, metadata)
  VALUES ('gc','system_docs','constraints_reference_pipeline','system', v_snapshot);
  
  RETURN v_snapshot;
END;
$function$;

CREATE OR REPLACE FUNCTION zapp.fn_snapshot_constraints_reference(p_version text DEFAULT NULL::text, p_generated_by text DEFAULT 'system_cron'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$
DECLARE
  v_content text; v_hash text; v_prev record; v_drift jsonb;
  v_is_new_version boolean := false; v_new_id uuid;
  v_version text; v_lines int;
BEGIN
  v_content := fn_generate_constraints_reference();
  v_hash := encode(extensions.digest(v_content::bytea, 'sha256'), 'hex');
  v_lines := length(v_content) - length(replace(v_content, E'\n', '')) + 1;
  v_version := COALESCE(p_version, 'auto-' || to_char(now(), 'YYYYMMDD-HH24MI'));
  
  SELECT content_hash, version, generated_at INTO v_prev
  FROM zapp.system_docs
  WHERE doc_name = 'EVOLUTION_DB_CONSTRAINTS_REFERENCE'
  ORDER BY generated_at DESC LIMIT 1;
  
  IF v_prev.content_hash IS NULL THEN
    v_drift := jsonb_build_object('type', 'initial_snapshot', 'is_drift', false);
    v_is_new_version := true;
  ELSIF v_prev.content_hash = v_hash THEN
    v_drift := jsonb_build_object('type', 'identical', 'is_drift', false,
      'previous_version', v_prev.version, 'previous_generated_at', v_prev.generated_at);
  ELSE
    v_drift := jsonb_build_object('type', 'content_changed', 'is_drift', true,
      'previous_version', v_prev.version, 'previous_generated_at', v_prev.generated_at,
      'previous_hash', substring(v_prev.content_hash, 1, 12),
      'new_hash', substring(v_hash, 1, 12),
      'time_since_last', age(now(), v_prev.generated_at)::text);
    v_is_new_version := true;
  END IF;
  
  IF v_is_new_version THEN
    INSERT INTO zapp.system_docs (
      doc_name, version, content, content_hash,
      generated_by, total_lines, drift_from_previous
    ) VALUES (
      'EVOLUTION_DB_CONSTRAINTS_REFERENCE', v_version, v_content, v_hash,
      p_generated_by, v_lines, v_drift
    )
    ON CONFLICT (doc_name, content_hash) DO NOTHING
    RETURNING id INTO v_new_id;
  END IF;
  
  RETURN jsonb_build_object(
    'saved', v_new_id IS NOT NULL,
    'is_new_version', v_is_new_version,
    'new_version_id', v_new_id,
    'version', v_version,
    'hash', substring(v_hash, 1, 16),
    'content_size_bytes', length(v_content),
    'total_lines', v_lines,
    'drift', v_drift
  );
END;
$function$;

-- View: IF NOT EXISTS guard + CREATE OR REPLACE (preserva grants quando já existe)
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname = 'zapp' AND viewname = 'v_improvements_status'
  ) THEN
    CREATE VIEW zapp.v_improvements_status AS
    SELECT 'Trigger media fix'::text AS improvement,
    'DONE'::text AS status,
    'fn_auto_enqueue_media_download corrigido para path correto'::text AS detail
UNION ALL
 SELECT 'Media queue cleanup'::text AS improvement,
    'DONE'::text AS status,
    '23.625 itens órfãos removidos, 10k re-enfileirados'::text AS detail
UNION ALL
 SELECT 'Schema evolution_db crons'::text AS improvement,
    'DONE'::text AS status,
    '2 migrados para public, 6 desativados'::text AS detail
UNION ALL
 SELECT 'Cron optimization'::text AS improvement,
    'DONE'::text AS status,
    'retry_stuck: 2min→10min, followups: 1min→5min'::text AS detail
UNION ALL
 SELECT 'ANALYZE tables'::text AS improvement,
    'DONE'::text AS status,
    '5 tabelas com stats atualizadas'::text AS detail
UNION ALL
 SELECT 'DROP audit_mv_baileys_ids'::text AS improvement,
    'DONE'::text AS status,
    '271 MB liberados (MV + index)'::text AS detail
UNION ALL
 SELECT 'Alert retention'::text AS improvement,
    'DONE'::text AS status,
    'Cron #36 daily purge 30d/90d'::text AS detail
UNION ALL
 SELECT 'Archive audit tables'::text AS improvement,
    'DONE'::text AS status,
    '16 tabelas movidas para schema archive'::text AS detail
UNION ALL
 SELECT 'PG tuning (shared_buffers)'::text AS improvement,
    'PENDENTE'::text AS status,
    'Requer acesso host - ALTER SYSTEM bloqueado'::text AS detail
UNION ALL
 SELECT 'media_meta column'::text AS improvement,
    'DONE'::text AS status,
    '405.761 msgs populadas (99.96% com key)'::text AS detail
UNION ALL
 SELECT 'Trigger uses media_meta'::text AS improvement,
    'DONE'::text AS status,
    'Fallback para raw_data se media_meta NULL'::text AS detail
UNION ALL
 SELECT 'fn_process grava media_meta'::text AS improvement,
    'DONE'::text AS status,
    'Novas msgs terão media_meta automaticamente'::text AS detail
UNION ALL
 SELECT 'Growth monitoring'::text AS improvement,
    'DONE'::text AS status,
    'Cron #37 daily snapshots _db_size_snapshots'::text AS detail
UNION ALL
 SELECT 'Drop unused indexes'::text AS improvement,
    'DONE'::text AS status,
    '3 indexes removidos'::text AS detail
UNION ALL
 SELECT 'Purge cron jobs'::text AS improvement,
    'DONE'::text AS status,
    'Cron #38,39,40 para webhook/realtime/audit'::text AS detail;
  ELSE
    CREATE OR REPLACE VIEW zapp.v_improvements_status AS
    SELECT 'Trigger media fix'::text AS improvement,
    'DONE'::text AS status,
    'fn_auto_enqueue_media_download corrigido para path correto'::text AS detail
UNION ALL
 SELECT 'Media queue cleanup'::text AS improvement,
    'DONE'::text AS status,
    '23.625 itens órfãos removidos, 10k re-enfileirados'::text AS detail
UNION ALL
 SELECT 'Schema evolution_db crons'::text AS improvement,
    'DONE'::text AS status,
    '2 migrados para public, 6 desativados'::text AS detail
UNION ALL
 SELECT 'Cron optimization'::text AS improvement,
    'DONE'::text AS status,
    'retry_stuck: 2min→10min, followups: 1min→5min'::text AS detail
UNION ALL
 SELECT 'ANALYZE tables'::text AS improvement,
    'DONE'::text AS status,
    '5 tabelas com stats atualizadas'::text AS detail
UNION ALL
 SELECT 'DROP audit_mv_baileys_ids'::text AS improvement,
    'DONE'::text AS status,
    '271 MB liberados (MV + index)'::text AS detail
UNION ALL
 SELECT 'Alert retention'::text AS improvement,
    'DONE'::text AS status,
    'Cron #36 daily purge 30d/90d'::text AS detail
UNION ALL
 SELECT 'Archive audit tables'::text AS improvement,
    'DONE'::text AS status,
    '16 tabelas movidas para schema archive'::text AS detail
UNION ALL
 SELECT 'PG tuning (shared_buffers)'::text AS improvement,
    'PENDENTE'::text AS status,
    'Requer acesso host - ALTER SYSTEM bloqueado'::text AS detail
UNION ALL
 SELECT 'media_meta column'::text AS improvement,
    'DONE'::text AS status,
    '405.761 msgs populadas (99.96% com key)'::text AS detail
UNION ALL
 SELECT 'Trigger uses media_meta'::text AS improvement,
    'DONE'::text AS status,
    'Fallback para raw_data se media_meta NULL'::text AS detail
UNION ALL
 SELECT 'fn_process grava media_meta'::text AS improvement,
    'DONE'::text AS status,
    'Novas msgs terão media_meta automaticamente'::text AS detail
UNION ALL
 SELECT 'Growth monitoring'::text AS improvement,
    'DONE'::text AS status,
    'Cron #37 daily snapshots _db_size_snapshots'::text AS detail
UNION ALL
 SELECT 'Drop unused indexes'::text AS improvement,
    'DONE'::text AS status,
    '3 indexes removidos'::text AS detail
UNION ALL
 SELECT 'Purge cron jobs'::text AS improvement,
    'DONE'::text AS status,
    'Cron #38,39,40 para webhook/realtime/audit'::text AS detail;
  END IF;
END
$do$;
