-- 20260818100000_etapa38_media_queue_stalled_alert_retry_purge
-- Espelho DB-as-source (reconstruido do estado vivo em 2026-08-18; aplicado
-- originalmente via MCP). Dois crons de saude da fila de midia:
--  * media-queue-stalled-alert (*/15): alerta critical se produtor parado >2h,
--    lock orfao >30min ou failed rate 24h >10% (dedupe 6h em evolution_alerts)
--  * media-loss-retry-purge (30 3 * * *): repara ponteiros com objeto ja no R2,
--    retry de failed com retry restante, expurgo registry/fila (janela 45d)
-- Idempotente (unschedule antes de schedule).

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'media-queue-stalled-alert';
SELECT cron.schedule('media-queue-stalled-alert', '*/15 * * * *', $etapa38a$
DO $$
DECLARE
  v_horas numeric;
  v_pend int; v_locks int; v_f24 int; v_t24 int;
  v_dispara boolean := false;
  v_motivos text[] := '{}';
BEGIN
  SELECT round(extract(epoch FROM (now() - max(created_at))) / 3600, 1),
         count(*) FILTER (WHERE status IN ('pending','processing')),
         count(*) FILTER (WHERE locked_at > now() - interval '30 minutes'),
         count(*) FILTER (WHERE status = 'failed'
                          AND created_at >= now() - interval '24 hours'),
         count(*) FILTER (WHERE created_at >= now() - interval '24 hours')
    INTO v_horas, v_pend, v_locks, v_f24, v_t24
    FROM evo.media_download_queue;

  IF v_horas IS NULL OR v_horas > 2 THEN
    v_dispara := true;
    v_motivos := array_append(v_motivos, 'produtor_parado_' || coalesce(v_horas::text, 'fila_vazia') || 'h');
  END IF;
  IF v_locks > 0 THEN
    v_dispara := true;
    v_motivos := array_append(v_motivos, 'lock_orfao_' || v_locks);
  END IF;
  IF v_t24 >= 20 AND v_f24::numeric / v_t24 > 0.10 THEN
    v_dispara := true;
    v_motivos := array_append(v_motivos, 'failed_rate_' || round(100.0 * v_f24 / v_t24, 1) || 'pct');
  END IF;

  IF v_dispara
     AND NOT EXISTS (SELECT 1 FROM zapp.evolution_alerts
                      WHERE alert_type = 'media_download_queue_stalled'
                        AND resolved = false AND resolved_at IS NULL
                        AND created_at > now() - interval '6 hours') THEN
    INSERT INTO zapp.evolution_alerts (alert_type, severity, title, message, payload)
    VALUES ('media_download_queue_stalled', 'critical',
            'Fila de download de midia travada/estagnada',
            'media_download_queue parada: ' || array_to_string(v_motivos, ', '),
            jsonb_build_object(
              'horas_sem_item_novo', v_horas,
              'pendentes', v_pend,
              'locks_ativos', v_locks,
              'falhas_24h', v_f24,
              'total_24h', v_t24,
              'ultimo_item_em', (SELECT max(created_at) FROM evo.media_download_queue),
              'threshold_horas_sem_item', 2,
              'threshold_lock_min', 30,
              'threshold_failed_rate_24h', 0.10));
  END IF;
END $$;
$etapa38a$);

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'media-loss-retry-purge';
SELECT cron.schedule('media-loss-retry-purge', '30 3 * * *', $etapa38b$
DO $$
DECLARE
  v_retry int := 0; v_arquivadas int := 0;
BEGIN
  -- 1) RETRY (a): repara ponteiro de mensagens cujo objeto JA existe no R2 (formato2 = 200 OK)
  UPDATE evo.evolution_messages_wpp2 m
     SET media_url    = e.storage_url,
         media_bucket = COALESCE(e.storage_bucket, 'zapp-whatsapp-media'),
         media_path   = COALESCE(e.storage_path_clean, e.storage_path),
         media_status = 'ready'
    FROM zapp.evolution_media e
   WHERE m.message_id = e.message_id
     AND m.instance_name = e.instance_name
     AND e.storage_url LIKE '%/media/%'
     AND e.media_status = 'ready'
     AND EXISTS (SELECT 1 FROM evo.media_loss_registry l
                  WHERE l.message_id = e.message_id
                    AND l.instance_name = e.instance_name
                    AND l.loss_class = 'sem_ponteiro'
                    AND l.recovered_at IS NULL);
  GET DIAGNOSTICS v_retry = ROW_COUNT;

  -- 2) Marca recuperadas no registry (idempotente: recovered_at IS NULL)
  UPDATE evo.media_loss_registry l
     SET recoverable = true,
         recovered_at = now(),
         notes = 'reparo-metadados-r2 ' || to_char(now(), 'YYYY-MM-DD')
    FROM zapp.evolution_media e
   WHERE l.message_id = e.message_id
     AND l.instance_name = e.instance_name
     AND l.loss_class = 'sem_ponteiro'
     AND l.recovered_at IS NULL
     AND e.storage_url LIKE '%/media/%'
     AND e.media_status = 'ready';

  -- 3) RETRY (b): fila - failed com retry restante, URL presente e <= 10 dias
  UPDATE evo.media_download_queue
     SET status = 'pending',
         next_retry_at = now(),
         retry_count = retry_count + 1,
         error_message = NULL
   WHERE status = 'failed'
     AND retry_count < max_retries
     AND download_url IS NOT NULL
     AND created_at >= now() - interval '10 days';

  -- 4) EXPURGO registry: arquiva classes terminais + fora da janela de 45d
  INSERT INTO evo.media_loss_archive
     (id, snapshot_at, message_uuid, message_id, instance_name, remote_jid,
      message_type, created_at, loss_class, recoverable, recovered_at, notes, purged_at)
  SELECT l.id, l.snapshot_at, l.message_uuid, l.message_id, l.instance_name, l.remote_jid,
         l.message_type, l.created_at, l.loss_class, l.recoverable, l.recovered_at, l.notes, now()
    FROM evo.media_loss_registry l
   WHERE l.loss_class IN ('cdn_expirado', 'presigned_expirado')
      OR (l.loss_class = 'sem_ponteiro'
          AND l.created_at < now() - interval '45 days'
          AND NOT EXISTS (SELECT 1 FROM zapp.evolution_media e
                           WHERE e.message_id = l.message_id
                             AND e.instance_name = l.instance_name
                             AND e.storage_url LIKE '%/media/%'
                             AND e.media_status = 'ready'));
  GET DIAGNOSTICS v_arquivadas = ROW_COUNT;

  DELETE FROM evo.media_loss_registry l
   WHERE l.loss_class IN ('cdn_expirado', 'presigned_expirado')
      OR (l.loss_class = 'sem_ponteiro'
          AND l.created_at < now() - interval '45 days'
          AND NOT EXISTS (SELECT 1 FROM zapp.evolution_media e
                           WHERE e.message_id = l.message_id
                             AND e.instance_name = l.instance_name
                             AND e.storage_url LIKE '%/media/%'
                             AND e.media_status = 'ready'));

  -- 5) EXPURGO fila: ruido de teste + failed fora da janela
  DELETE FROM evo.media_download_queue
   WHERE status = 'done' AND error_message LIKE 'AUDIT_TEST%';
  DELETE FROM evo.media_download_queue
   WHERE status = 'failed' AND created_at < now() - interval '45 days';

  RAISE NOTICE 'media-loss retry=% arquivadas=%', v_retry, v_arquivadas;
END $$;
$etapa38b$);
