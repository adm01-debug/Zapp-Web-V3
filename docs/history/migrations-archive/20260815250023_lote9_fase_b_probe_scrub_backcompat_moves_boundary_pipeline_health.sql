-- ============================================================================
-- REPLAY CONVERGENTE — Lote 9 Fase B (aplicada em prod 2026-08-16 07:29 BRT
-- via supabase_db_query, transacao unica com guard). Ver convencao no 250008.
-- Efeito: I1 11->8 (probe, scrub e backcompat saem de evo). I2 mantido 0.
-- Corpos identicos ao aplicado (fonte: batch da sessao = estado de producao).
--
-- fn_ensure_evolution_backcompat_views: FIX de bug latente — o IF checava
-- pg_views em schemaname='evo' mas o CREATE apontava zapp.evolution_messages_v2;
-- o bloco nunca executava. Agora checa e cria evo.evolution_messages_v2
-- (o alias que existe e e consumido). Movida para ops (gerencia views
-- public/evo, nao e dominio evo).
-- ============================================================================

-- B1. View leitora reversa (zapp le agregado de webhook events evo)
CREATE OR REPLACE VIEW public.evo_webhook_events_recent WITH (security_invoker = on) AS
  SELECT created_at, processed
  FROM evo.evolution_webhook_events_v2
  WHERE created_at >= now() - interval '2 hours';

GRANT SELECT ON public.evo_webhook_events_recent TO service_role;

-- B2. Boundary de escrita em evo.evolution_pipeline_health_log
CREATE OR REPLACE FUNCTION evo.rpc_boundary_insert_pipeline_health(p_row jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'evo', 'pg_catalog'
AS $fn$
  INSERT INTO evo.evolution_pipeline_health_log(
    checked_at, pipeline_status, baileys_health, gap_inbound_min,
    detail, probe_status, instance_name, unroutable_count,
    webhook_events_1h, alerts_critical_open, notes,
    webhook_processed_pct, queue_pending_now, evo_state, alerts_unresolved
  ) VALUES (
    COALESCE((p_row->>'checked_at')::timestamptz, now()),
    (p_row->>'pipeline_status')::zapp.evolution_pipeline_status,
    p_row->>'baileys_health',
    (p_row->>'gap_inbound_min')::numeric,
    p_row->>'detail',
    p_row->>'probe_status',
    p_row->>'instance_name',
    COALESCE((p_row->>'unroutable_count')::int, 0),
    (p_row->>'webhook_events_1h')::int,
    (p_row->>'alerts_critical_open')::int,
    p_row->>'notes',
    (p_row->>'webhook_processed_pct')::numeric,
    (p_row->>'queue_pending_now')::int,
    p_row->>'evo_state',
    (p_row->>'alerts_unresolved')::int
  );
$fn$;

REVOKE ALL ON FUNCTION evo.rpc_boundary_insert_pipeline_health(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evo.rpc_boundary_insert_pipeline_health(jsonb) TO service_role;

-- B3. Probe evo -> zapp (em prod: ALTER SET SCHEMA preservando OID + C-O-R;
-- aqui replay auto-contido: C-O-R em zapp + DROP IF EXISTS lado evo)
CREATE OR REPLACE FUNCTION zapp.fn_pipeline_health_probe()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE
  v_gap_min NUMERIC; v_last_msg_at TIMESTAMPTZ; v_msg_count_1h INTEGER;
  v_probe_status TEXT; v_pipeline_status zapp.evolution_pipeline_status;
  v_detail TEXT; v_alerts_open INTEGER; v_now_brt TIMESTAMPTZ;
  v_dow INTEGER; v_hour_brt INTEGER; v_business_hours BOOLEAN;
  v_is_weekend BOOLEAN; v_crit_threshold INTEGER; v_warn_threshold INTEGER; v_fast_threshold INTEGER;
  v_wh_processed_pct NUMERIC;
  v_queue_pending INTEGER;
  v_evo_state TEXT;
  v_alerts_unresolved INTEGER;
BEGIN
  SELECT MAX(created_at), COUNT(*) FILTER (WHERE created_at >= NOW()-INTERVAL '1 hour')
  INTO v_last_msg_at, v_msg_count_1h FROM zapp.evolution_messages;

  v_gap_min := EXTRACT(EPOCH FROM (NOW()-COALESCE(v_last_msg_at,NOW()-INTERVAL '9999 minutes')))/60;

  SELECT COUNT(*) INTO v_alerts_open
  FROM zapp.evolution_alerts WHERE severity IN ('critical','high') AND resolved_at IS NULL;

  SELECT COUNT(*) INTO v_alerts_unresolved
  FROM zapp.evolution_alerts WHERE resolved_at IS NULL;

  SELECT
    CASE WHEN COUNT(*)=0 THEN NULL
         ELSE ROUND(100.0*COUNT(*) FILTER (WHERE processed=true)/COUNT(*), 1)
    END,
    COALESCE(COUNT(*) FILTER (WHERE processed=false OR processed IS NULL), 0)
  INTO v_wh_processed_pct, v_queue_pending
  FROM public.evo_webhook_events_recent
  WHERE created_at >= date_trunc('hour', NOW()-INTERVAL '1 hour');

  SELECT COALESCE(lower(status), 'unknown') INTO v_evo_state
  FROM zapp.whatsapp_connections WHERE instance_name='wpp2' LIMIT 1;

  v_now_brt := NOW() AT TIME ZONE 'America/Sao_Paulo';
  v_dow := EXTRACT(DOW FROM v_now_brt);
  v_hour_brt := EXTRACT(HOUR FROM v_now_brt);
  v_is_weekend := (v_dow=0 OR v_dow=6);
  v_business_hours := NOT v_is_weekend AND (v_hour_brt BETWEEN 8 AND 19);

  IF v_business_hours THEN
    v_crit_threshold:=90; v_warn_threshold:=30; v_fast_threshold:=15;
  ELSIF v_is_weekend THEN
    v_crit_threshold:=1440; v_warn_threshold:=480; v_fast_threshold:=240;
  ELSE
    v_crit_threshold:=120; v_warn_threshold:=45; v_fast_threshold:=20;
  END IF;

  IF v_gap_min > v_crit_threshold THEN
    v_probe_status:='critical'; v_pipeline_status:='critical';
    v_detail:=format('GAP CRITICO: %s min (threshold=%s, %s)',ROUND(v_gap_min),v_crit_threshold,
      CASE WHEN v_is_weekend THEN 'fim de semana' WHEN v_business_hours THEN 'comercial' ELSE 'off' END);
  ELSIF v_gap_min > v_warn_threshold THEN
    v_probe_status:='warn'; v_pipeline_status:='degraded_webhook';
    v_detail:=format('GAP elevado: %s min (warn=%s)',ROUND(v_gap_min),v_warn_threshold);
  ELSIF v_msg_count_1h=0 AND v_gap_min > v_fast_threshold THEN
    v_probe_status:='warn'; v_pipeline_status:='warning';
    v_detail:=format('Sem msgs/1h. Gap: %s min',ROUND(v_gap_min));
  ELSE
    v_probe_status:='ok'; v_pipeline_status:='healthy';
    v_detail:=format('OK. Gap: %s min. Msgs/1h: %s. EvoState: %s',ROUND(v_gap_min),v_msg_count_1h,COALESCE(v_evo_state,'?'));
  END IF;

  PERFORM evo.rpc_boundary_insert_pipeline_health(jsonb_build_object(
    'checked_at', NOW(),
    'pipeline_status', v_pipeline_status::TEXT,
    'baileys_health', CASE WHEN v_gap_min<v_warn_threshold THEN 'connected' ELSE 'check_required' END,
    'gap_inbound_min', v_gap_min,
    'detail', v_detail,
    'probe_status', v_probe_status,
    'instance_name', 'wpp2',
    'unroutable_count', 0,
    'webhook_events_1h', v_msg_count_1h,
    'alerts_critical_open', v_alerts_open,
    'notes', format('probe-15min|dow=%s|wk=%s|biz=%s|crit=%s|evo=%s',
      v_dow, v_is_weekend, v_business_hours, v_crit_threshold, COALESCE(v_evo_state,'?')),
    'webhook_processed_pct', v_wh_processed_pct,
    'queue_pending_now', v_queue_pending,
    'evo_state', v_evo_state,
    'alerts_unresolved', v_alerts_unresolved
  ));

  IF v_probe_status='critical' THEN
    INSERT INTO zapp.evolution_alerts (severity, alert_type, message, payload)
    SELECT 'critical','pipeline_gap',
      format('GAP critico: %s min (%s)', ROUND(v_gap_min),
        CASE WHEN v_is_weekend THEN 'fim de semana'
             WHEN v_business_hours THEN 'horario comercial' ELSE 'fora do horario' END),
      jsonb_build_object('gap_min',v_gap_min,'last_msg_at',v_last_msg_at,
        'threshold',v_crit_threshold,'is_weekend',v_is_weekend)
    WHERE NOT EXISTS (
      SELECT 1 FROM zapp.evolution_alerts
      WHERE alert_type='pipeline_gap' AND severity='critical'
        AND resolved_at IS NULL AND created_at>=NOW()-INTERVAL '30 minutes'
    );
  END IF;

  RETURN jsonb_build_object(
    'status',v_probe_status,'gap_min',ROUND(v_gap_min),'msgs_1h',v_msg_count_1h,
    'alerts_open',v_alerts_open,'alerts_unresolved',v_alerts_unresolved,
    'pipeline_status',v_pipeline_status::TEXT,
    'business_hours',v_business_hours,'is_weekend',v_is_weekend,
    'crit_threshold',v_crit_threshold,'evo_state',v_evo_state,
    'wh_processed_pct',v_wh_processed_pct,'queue_pending',v_queue_pending,
    'checked_at',NOW()
  );
END;
$function$;

DROP FUNCTION IF EXISTS evo.fn_pipeline_health_probe();

-- B4. Scrub R2 (helper puro + principal) evo -> zapp
CREATE OR REPLACE FUNCTION zapp.fn_scrub_r2_text(p_input text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_temp'
AS $function$
  SELECT
    regexp_replace(
      regexp_replace(
        regexp_replace(
          p_input,
          'r2://[^\s''\"<>]+',
          '[R2-PATH-REDACTED]',
          'gi'
        ),
        's3://[^\s''\"<>]+',
        '[R2-PATH-REDACTED]',
        'gi'
      ),
      'https://[0-9a-f]{32}\.r2\.cloudflarestorage\.com/[^\s''\"<>]*',
      '[R2-PATH-REDACTED]',
      'gi'
    )
$function$;

DROP FUNCTION IF EXISTS evo.fn_scrub_r2_text(text);

CREATE OR REPLACE FUNCTION zapp.fn_scrub_r2_paths_from_logs(p_window interval DEFAULT '24:00:00'::interval)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE
  v_health_scrubbed   bigint := 0;
  v_dlq_scrubbed      bigint := 0;
  v_alerts_scrubbed   bigint := 0;
  v_since             timestamptz;
BEGIN
  v_since := now() - p_window;

  WITH updated AS (
    UPDATE zapp.evolution_health_logs
    SET error_message = zapp.fn_scrub_r2_text(error_message)
    WHERE created_at >= v_since
      AND error_message IS NOT NULL
      AND (
        error_message ILIKE '%r2.cloudflarestorage.com%'
        OR error_message ILIKE '%s3://%'
        OR error_message ILIKE '%r2://%'
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_health_scrubbed FROM updated;

  WITH updated AS (
    UPDATE zapp.evolution_webhook_dlq
    SET
      error_message = CASE
        WHEN error_message IS NOT NULL AND (
          error_message ILIKE '%r2.cloudflarestorage.com%'
          OR error_message ILIKE '%s3://%'
          OR error_message ILIKE '%r2://%'
        ) THEN zapp.fn_scrub_r2_text(error_message)
        ELSE error_message
      END,
      error_stack = CASE
        WHEN error_stack IS NOT NULL AND (
          error_stack ILIKE '%r2.cloudflarestorage.com%'
          OR error_stack ILIKE '%s3://%'
          OR error_stack ILIKE '%r2://%'
        ) THEN zapp.fn_scrub_r2_text(error_stack)
        ELSE error_stack
      END,
      raw_payload = CASE
        WHEN raw_payload IS NOT NULL AND (
          raw_payload ILIKE '%r2.cloudflarestorage.com%'
          OR raw_payload ILIKE '%s3://%'
          OR raw_payload ILIKE '%r2://%'
        ) THEN zapp.fn_scrub_r2_text(raw_payload)
        ELSE raw_payload
      END
    WHERE created_at >= v_since
      AND (
        (error_message IS NOT NULL AND (
          error_message ILIKE '%r2.cloudflarestorage.com%'
          OR error_message ILIKE '%s3://%'
          OR error_message ILIKE '%r2://%'
        ))
        OR (error_stack IS NOT NULL AND (
          error_stack ILIKE '%r2.cloudflarestorage.com%'
          OR error_stack ILIKE '%s3://%'
          OR error_stack ILIKE '%r2://%'
        ))
        OR (raw_payload IS NOT NULL AND (
          raw_payload ILIKE '%r2.cloudflarestorage.com%'
          OR raw_payload ILIKE '%s3://%'
          OR raw_payload ILIKE '%r2://%'
        ))
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_dlq_scrubbed FROM updated;

  WITH updated AS (
    UPDATE zapp.evolution_alerts
    SET
      message = CASE
        WHEN message IS NOT NULL AND (
          message ILIKE '%r2.cloudflarestorage.com%'
          OR message ILIKE '%s3://%'
          OR message ILIKE '%r2://%'
        ) THEN zapp.fn_scrub_r2_text(message)
        ELSE message
      END,
      description = CASE
        WHEN description IS NOT NULL AND (
          description ILIKE '%r2.cloudflarestorage.com%'
          OR description ILIKE '%s3://%'
          OR description ILIKE '%r2://%'
        ) THEN zapp.fn_scrub_r2_text(description)
        ELSE description
      END,
      title = CASE
        WHEN title IS NOT NULL AND (
          title ILIKE '%r2.cloudflarestorage.com%'
          OR title ILIKE '%s3://%'
          OR title ILIKE '%r2://%'
        ) THEN zapp.fn_scrub_r2_text(title)
        ELSE title
      END
    WHERE created_at >= v_since
      AND (
        (message IS NOT NULL AND (
          message ILIKE '%r2.cloudflarestorage.com%'
          OR message ILIKE '%s3://%'
          OR message ILIKE '%r2://%'
        ))
        OR (description IS NOT NULL AND (
          description ILIKE '%r2.cloudflarestorage.com%'
          OR description ILIKE '%s3://%'
          OR description ILIKE '%r2://%'
        ))
        OR (title IS NOT NULL AND (
          title ILIKE '%r2.cloudflarestorage.com%'
          OR title ILIKE '%s3://%'
          OR title ILIKE '%r2://%'
        ))
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_alerts_scrubbed FROM updated;

  RETURN jsonb_build_object(
    'scrubbed_at',        now(),
    'window',             p_window,
    'health_logs',        v_health_scrubbed,
    'webhook_dlq',        v_dlq_scrubbed,
    'evolution_alerts',   v_alerts_scrubbed,
    'total_rows_updated', v_health_scrubbed + v_dlq_scrubbed + v_alerts_scrubbed,
    'status',             CASE
                            WHEN (v_health_scrubbed + v_dlq_scrubbed + v_alerts_scrubbed) > 0
                            THEN 'SCRUBBED'
                            ELSE 'CLEAN'
                          END
  );
END;
$function$;

DROP FUNCTION IF EXISTS evo.fn_scrub_r2_paths_from_logs(interval);

-- B5. Backcompat -> ops, com FIX do IF inconsistente (ver header)
CREATE OR REPLACE FUNCTION ops.fn_ensure_evolution_backcompat_views()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE r record; v_count int := 0;
BEGIN
  PERFORM set_config('lock_timeout','3s', true);

  -- GARANTIR view alias evo.evolution_messages_v2 -> zapp.evolution_messages (tabela ativa)
  -- FIX 2026-08-16 (lote 9 fase B): o IF checava evo mas o CREATE apontava zapp.
  -- A view real/consumida e evo.evolution_messages_v2; check e create agora coerentes.
  IF NOT EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname='evo' AND viewname='evolution_messages_v2'
  ) THEN
    EXECUTE $view$
      CREATE VIEW evo.evolution_messages_v2 WITH (security_invoker = on) AS
        SELECT id,message_id,remote_jid,instance_name,from_me,message_type,direction,
               status,status_at,content,caption,media_url,media_mimetype,media_filename,
               media_size,media_type,media_meta,quoted_message_id,push_name,contact_id,
               conversation_id,is_starred,is_important,is_read,category,sentiment,tags,
               notes,follow_up_at,follow_up_done,sent_by_bot,template_name,audio_meme_id,
               sticker_id,link_preview,payload,raw_data,deleted_at,edited_at,
               created_at,updated_at
        FROM zapp.evolution_messages
    $view$;
    v_count := v_count + 1;
  END IF;

  FOR r IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='evo' AND c.relname LIKE 'evolution_%' AND c.relkind IN ('r','p')
      AND NOT EXISTS (
        SELECT 1 FROM pg_class pv JOIN pg_namespace pn ON pn.oid=pv.relnamespace
        WHERE pn.nspname='public' AND pv.relname=c.relname
      )
    ORDER BY c.relname
  LOOP
    EXECUTE format('CREATE VIEW public.%I WITH (security_invoker = on) AS SELECT * FROM evo.%I', r.relname, r.relname);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', r.relname);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', r.relname);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

DROP FUNCTION IF EXISTS evo.fn_ensure_evolution_backcompat_views();

-- B6. Repoint dos crons (idempotente)
SELECT cron.alter_job(182, command => 'SELECT zapp.fn_pipeline_health_probe()');
SELECT cron.alter_job(159, command => 'SELECT zapp.fn_scrub_r2_paths_from_logs(''24 hours''::interval)');
SELECT cron.alter_job(138, command => 'SELECT ops.fn_ensure_evolution_backcompat_views()');
