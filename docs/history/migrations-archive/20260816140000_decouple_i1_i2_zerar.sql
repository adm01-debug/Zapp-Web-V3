-- decouple: zerar I1 (4 fns evo citando zapp) e I2 (1 fn zapp escrevendo em evo)
-- 2026-08-16 | Rota A mantida | aplicação cirúrgica e idempotente
-- Estratégia:
--   1. Enum de contrato zapp.evolution_pipeline_status -> public (camada de contrato)
--   2. evo.rpc_boundary_insert_pipeline_health: cast via public.evolution_pipeline_status
--   3. zapp.fn_pipeline_health_probe: variável via public.evolution_pipeline_status
--   4. evo.rpc_boundary_provision_instance_partitions: PARTITION OF evo.* (parents reais; corrige bug latente)
--   5. evo.rpc_complete_media_download: escreve em evo.evolution_messages_wpp2 direto + registra mídia/audit via RPC de contrato zapp.rpc_boundary_register_media
--   6. evo.fn_repontar_filhas_graveyard -> SET SCHEMA zapp (função de manutenção do ZAPP; evo.* qualificado = leitura)
--   7. zapp.fn_backfill_contact_id -> SET SCHEMA evo (manutenção do dado evo; ctid só existe na tabela física) + cron 334 repontado

-- ============================================================
-- PASSO 1: mover enum de contrato para public (idempotente)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
             WHERE t.typname='evolution_pipeline_status' AND n.nspname='zapp')
     AND NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
                     WHERE t.typname='evolution_pipeline_status' AND n.nspname='public') THEN
    ALTER TYPE zapp.evolution_pipeline_status SET SCHEMA public;
    RAISE NOTICE 'enum evolution_pipeline_status movido para public';
  ELSE
    RAISE NOTICE 'enum evolution_pipeline_status já em public ou ausente — skip';
  END IF;
END $$;

-- ============================================================
-- PASSO 2: evo.rpc_boundary_insert_pipeline_health — cast public
-- ============================================================
CREATE OR REPLACE FUNCTION evo.rpc_boundary_insert_pipeline_health(p_row jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
  INSERT INTO evo.evolution_pipeline_health_log(
    checked_at, pipeline_status, baileys_health, gap_inbound_min,
    detail, probe_status, instance_name, unroutable_count,
    webhook_events_1h, alerts_critical_open, notes,
    webhook_processed_pct, queue_pending_now, evo_state, alerts_unresolved
  ) VALUES (
    COALESCE((p_row->>'checked_at')::timestamptz, now()),
    (p_row->>'pipeline_status')::public.evolution_pipeline_status,
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
$function$;

-- ============================================================
-- PASSO 3: zapp.fn_pipeline_health_probe — variável public
-- ============================================================
CREATE OR REPLACE FUNCTION zapp.fn_pipeline_health_probe()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE
  v_gap_min NUMERIC; v_last_msg_at TIMESTAMPTZ; v_msg_count_1h INTEGER;
  v_probe_status TEXT; v_pipeline_status public.evolution_pipeline_status;
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
    'business_hours',v_business_hours,
    'detail',v_detail
  );
END;
$function$;

-- ============================================================
-- PASSO 4: evo.rpc_boundary_provision_instance_partitions — parents em evo (corrige bug)
-- ============================================================
CREATE OR REPLACE FUNCTION evo.rpc_boundary_provision_instance_partitions(p_instance_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
DECLARE
  v_part_msgs TEXT := 'evolution_messages_'      || replace(p_instance_name, '-', '_');
  v_part_conv TEXT := 'evolution_conversations_' || replace(p_instance_name, '-', '_');
BEGIN
  -- Rota A: parents residem em evo (move E73-E75 consumado em 16/08).
  -- Filhas novas nascem em evo, dono do dado do provider.
  EXECUTE format('CREATE TABLE IF NOT EXISTS evo.%I PARTITION OF evo.evolution_messages FOR VALUES IN (%L)', v_part_msgs, p_instance_name);
  EXECUTE format('CREATE TABLE IF NOT EXISTS evo.%I PARTITION OF evo.evolution_conversations FOR VALUES IN (%L)', v_part_conv, p_instance_name);
END;
$function$;

-- ============================================================
-- PASSO 5: contrato zapp.rpc_boundary_register_media + rpc_complete_media_download
-- ============================================================
CREATE OR REPLACE FUNCTION zapp.rpc_boundary_register_media(
  p_message_id uuid, p_remote_jid text, p_media_type text, p_instance_name text,
  p_mimetype text, p_file_name text, p_storage_path text, p_storage_url text,
  p_storage_bucket text, p_media_status text, p_queue_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
BEGIN
  INSERT INTO zapp.evolution_media
    (message_id, remote_jid, media_type, instance_name, mime_type, file_name,
     storage_path, storage_url, storage_bucket, storage_path_clean, media_status, created_at)
  SELECT p_message_id, p_remote_jid, p_media_type, p_instance_name, p_mimetype,
         COALESCE(p_file_name, substring(p_storage_path FROM '[^/]+$')),
         p_storage_path, p_storage_url, p_storage_bucket, p_storage_path, p_media_status, now()
  WHERE NOT EXISTS (SELECT 1 FROM zapp.evolution_media e WHERE e.message_id = p_message_id);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO zapp.evolution_audit_log (action, entity_type, entity_id, new_values, metadata, performed_by, created_at)
  VALUES ('media_register_failed', 'evolution_media', gen_random_uuid(),
          jsonb_build_object('queue_id', p_queue_id, 'error', SQLERRM),
          jsonb_build_object('storage_url', p_storage_url), 'rpc_complete_media_download', now());
END;
$function$;

CREATE OR REPLACE FUNCTION evo.rpc_complete_media_download(p_queue_id bigint, p_download_url text DEFAULT NULL::text, p_storage_path text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'evo', 'public', 'pg_catalog'
AS $function$
DECLARE
  v_msg_uuid uuid;
  v_public_url text;
  v_media_type text;
  v_remote_jid text;
  v_instance_name text;
  v_mimetype text;
  v_r2_base text := 'https://zapp-media-proxy.adm01.workers.dev';
BEGIN
  IF p_download_url IS NOT NULL THEN
    v_public_url := evo.fn_media_public_url(p_download_url);
  ELSIF p_storage_path IS NOT NULL THEN
    v_public_url := v_r2_base || '/' || p_storage_path;
  END IF;

  UPDATE evo.media_download_queue
  SET status='done', download_url=v_public_url, storage_path=p_storage_path, processed_at=now()
  WHERE id=p_queue_id
  RETURNING message_uuid INTO v_msg_uuid;

  IF v_msg_uuid IS NOT NULL AND v_public_url IS NOT NULL THEN
    -- Dado de mensagem é do evo (Rota A): escreve direto na tabela física
    UPDATE evo.evolution_messages_wpp2
    SET media_url=v_public_url,
        media_status='ready',
        media_bucket=CASE WHEN v_public_url LIKE '%whatsapp-media%' THEN 'whatsapp-media'
                          WHEN v_public_url LIKE '%audio-messages%' THEN 'audio-messages'
                          ELSE NULL END,
        media_path=CASE WHEN p_storage_path IS NOT NULL THEN p_storage_path ELSE NULL END,
        updated_at=now()
    WHERE id=v_msg_uuid;
  END IF;

  -- FIX EX-01 2026-08-10: registrar metadados em evolution_media (bug: done sem registro)
  BEGIN
    SELECT CASE q.media_type
             WHEN 'imageMessage' THEN 'image'
             WHEN 'videoMessage' THEN 'video'
             WHEN 'ptvMessage' THEN 'video'
             WHEN 'audioMessage' THEN 'audio'
             WHEN 'ptt' THEN 'audio'
             WHEN 'documentMessage' THEN 'document'
             WHEN 'stickerMessage' THEN 'sticker'
             ELSE CASE WHEN q.media_type IN ('image','audio','document','video','sticker') THEN q.media_type ELSE NULL END
           END,
           q.remote_jid, q.instance_name, q.mimetype
    INTO v_media_type, v_remote_jid, v_instance_name, v_mimetype
    FROM evo.media_download_queue q WHERE q.id = p_queue_id;

    PERFORM zapp.rpc_boundary_register_media(
      v_msg_uuid, v_remote_jid, v_media_type, v_instance_name, v_mimetype, NULL,
      p_storage_path, v_public_url,
      CASE WHEN v_public_url LIKE '%whatsapp-media%' THEN 'whatsapp-media'
           WHEN v_public_url LIKE '%audio-messages%' THEN 'audio-messages'
           ELSE NULL END,
      'ready', p_queue_id);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- contrato já audita internamente
  END;
END;
$function$;

-- ============================================================
-- PASSO 6: fn_repontar_filhas_graveyard -> zapp (manutenção do ZAPP)
-- ============================================================
CREATE OR REPLACE FUNCTION zapp.fn_repontar_filhas_graveyard(p_dry_run boolean DEFAULT true)
 RETURNS TABLE(tabela text, linhas_afetadas bigint)
 LANGUAGE plpgsql
 SET search_path TO 'zapp', 'public', 'pg_catalog'
AS $function$
DECLARE
  v_g record; v_pares int := 0; v_pulados int := 0; v_n bigint;
  v_msgs bigint := 0; v_conv bigint := 0; v_notif bigint := 0; v_status bigint := 0; v_events bigint := 0;
BEGIN
  IF p_dry_run THEN RAISE NOTICE 'fn_repontar_filhas_graveyard: DRY RUN';
  ELSE RAISE NOTICE 'fn_repontar_filhas_graveyard: MODO REAL'; END IF;
  FOR v_g IN
    SELECT g.deleted_contact_id, g.merged_into_contact_id, g.original_remote_jid
    FROM evo.contact_id_graveyard g
    WHERE g.merged_into_contact_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM zapp.evolution_contacts c WHERE c.id=g.merged_into_contact_id)
    ORDER BY g.deleted_at, g.deleted_contact_id
  LOOP
    v_pares := v_pares + 1;
    IF p_dry_run THEN SELECT count(*) INTO v_n FROM zapp.evolution_messages WHERE contact_id=v_g.deleted_contact_id;
    ELSE UPDATE zapp.evolution_messages SET contact_id=v_g.merged_into_contact_id WHERE contact_id=v_g.deleted_contact_id; GET DIAGNOSTICS v_n = ROW_COUNT; END IF;
    v_msgs := v_msgs + v_n;
    IF p_dry_run THEN SELECT count(*) INTO v_n FROM zapp.evolution_conversations WHERE contact_id=v_g.deleted_contact_id;
    ELSE UPDATE zapp.evolution_conversations SET contact_id=v_g.merged_into_contact_id WHERE contact_id=v_g.deleted_contact_id; GET DIAGNOSTICS v_n = ROW_COUNT; END IF;
    v_conv := v_conv + v_n;
    IF p_dry_run THEN SELECT count(*) INTO v_n FROM zapp.evolution_notifications WHERE contact_id=v_g.deleted_contact_id;
    ELSE UPDATE zapp.evolution_notifications SET contact_id=v_g.merged_into_contact_id WHERE contact_id=v_g.deleted_contact_id; GET DIAGNOSTICS v_n = ROW_COUNT; END IF;
    v_notif := v_notif + v_n;
    IF p_dry_run THEN SELECT count(*) INTO v_n FROM zapp.evolution_whatsapp_status WHERE contact_id=v_g.deleted_contact_id;
    ELSE UPDATE zapp.evolution_whatsapp_status SET contact_id=v_g.merged_into_contact_id WHERE contact_id=v_g.deleted_contact_id; GET DIAGNOSTICS v_n = ROW_COUNT; END IF;
    v_status := v_status + v_n;
    IF p_dry_run THEN SELECT count(*) INTO v_n FROM zapp.conversation_events WHERE contact_id=v_g.deleted_contact_id;
    ELSE UPDATE zapp.conversation_events SET contact_id=v_g.merged_into_contact_id WHERE contact_id=v_g.deleted_contact_id; GET DIAGNOSTICS v_n = ROW_COUNT; END IF;
    v_events := v_events + v_n;
  END LOOP;
  SELECT count(*) INTO v_pulados FROM evo.contact_id_graveyard g WHERE g.merged_into_contact_id IS NULL OR NOT EXISTS (SELECT 1 FROM zapp.evolution_contacts c WHERE c.id=g.merged_into_contact_id);
  IF v_pulados > 0 THEN RAISE NOTICE '  pares PULADOS: %', v_pulados; END IF;
  tabela := 'zapp.evolution_messages';       linhas_afetadas := v_msgs;   RETURN NEXT;
  tabela := 'zapp.evolution_conversations';  linhas_afetadas := v_conv;   RETURN NEXT;
  tabela := 'zapp.evolution_notifications'; linhas_afetadas := v_notif;  RETURN NEXT;
  tabela := 'zapp.evolution_whatsapp_status'; linhas_afetadas := v_status; RETURN NEXT;
  tabela := 'zapp.conversation_events';     linhas_afetadas := v_events; RETURN NEXT;
END; $function$;

-- remover a versão antiga em evo (se existir — CREATE OR REPLACE acima já criou em zapp)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='evo' AND p.proname='fn_repontar_filhas_graveyard') THEN
    DROP FUNCTION evo.fn_repontar_filhas_graveyard(boolean);
    RAISE NOTICE 'evo.fn_repontar_filhas_graveyard dropada (movida para zapp)';
  END IF;
END $$;

-- ============================================================
-- PASSO 7: fn_backfill_contact_id -> evo + cron 334
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='zapp' AND p.proname='fn_backfill_contact_id') THEN
    ALTER FUNCTION zapp.fn_backfill_contact_id(integer) SET SCHEMA evo;
    RAISE NOTICE 'zapp.fn_backfill_contact_id movida para evo';
  END IF;
END $$;

UPDATE cron.job SET command='SELECT evo.fn_backfill_contact_id(5000)' WHERE jobid=334 AND command LIKE 'SELECT zapp.fn_backfill_contact_id%';
