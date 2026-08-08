-- Migration: pg_cron jobs criados/corrigidos na auditoria 2026-08-08
-- Jobs 317-322: outbound dispatch, stalled alert, shadow snapshot, canonical route, archive-drift guard
-- Idempotente: usa cron.unschedule + cron.schedule

-- ============================================================
-- Job 317: outbound-queue-dispatch (*/2 min)
-- ============================================================
SELECT cron.unschedule(j.jobid)
FROM cron.job j WHERE j.jobname = 'outbound-queue-dispatch';

SELECT cron.schedule(
  'outbound-queue-dispatch',
  '*/2 * * * *',
  'SELECT zapp.fn_outbound_dispatch(30)'
);

-- ============================================================
-- Job 318: outbound-queue-stalled-alert (*/15 min, anti-spam 30min)
-- ============================================================
SELECT cron.unschedule(j.jobid)
FROM cron.job j WHERE j.jobname = 'outbound-queue-stalled-alert';

SELECT cron.schedule(
  'outbound-queue-stalled-alert',
  '*/15 * * * *',
  $CRON$
  INSERT INTO zapp.warroom_alerts (alert_type, title, message, source, severity)
  SELECT
    'warning'::zapp.warroom_alert_type,
    'outbound_queue stagnada',
    format('outbound_message_queue: %s pending há mais de 15 min (mais antigo: %s)', cnt, oldest),
    'pg-cron:outbound-queue-stalled-alert',
    'warning'::text
  FROM (
    SELECT count(*) cnt, min(created_at)::text oldest
    FROM zapp.outbound_message_queue
    WHERE status = 'pending' AND created_at < now() - interval '15 minutes'
  ) t
  WHERE t.cnt > 0
    AND NOT EXISTS (
      SELECT 1 FROM zapp.warroom_alerts
      WHERE alert_type = 'warning'
        AND title = 'outbound_queue stagnada'
        AND created_at > now() - interval '30 minutes'
    )
  $CRON$
);

-- ============================================================
-- Job 319: shadow-source-snapshot-daily (00:15 daily)
-- ============================================================
SELECT cron.unschedule(j.jobid)
FROM cron.job j WHERE j.jobname = 'shadow-source-snapshot-daily';

SELECT cron.schedule(
  'shadow-source-snapshot-daily',
  '15 0 * * *',
  'SELECT evo.fn_shadow_snapshot_daily()'
);

-- ============================================================
-- Job 320: canonical-route-decision-daily (08:00 daily)
-- ============================================================
SELECT cron.unschedule(j.jobid)
FROM cron.job j WHERE j.jobname = 'canonical-route-decision-daily';

SELECT cron.schedule(
  'canonical-route-decision-daily',
  '0 8 * * *',
  'SELECT evo.fn_canonical_route_check_daily()'
);

-- ============================================================
-- Job 322: archive-drift-guard (*/5 min, anti-spam 4h)
-- Fix: adicionado NOT EXISTS anti-spam (antes disparava 1x a cada 5min infinitamente)
-- ============================================================
SELECT cron.unschedule(j.jobid)
FROM cron.job j WHERE j.jobname = 'archive-drift-guard';

SELECT cron.schedule(
  'archive-drift-guard',
  '*/5 * * * *',
  $CRON$
  INSERT INTO zapp.warroom_alerts (alert_type, title, message, source, severity)
  SELECT
    'warning'::zapp.warroom_alert_type,
    'DRIFT archive: timeout=' || t.s || 's (esperado 1800) cmd_ok=' || (c.s LIKE '%mmin +480%')::text,
    'source_timeout=' || st.source || ' source_cmd=' || sc.source,
    'pg_cron:archive-drift-guard',
    'warning'::zapp.warroom_alert_type
  FROM
    (SELECT setting as s FROM pg_settings WHERE name='archive_timeout') t,
    (SELECT setting as s FROM pg_settings WHERE name='archive_command') c,
    (SELECT source FROM pg_settings WHERE name='archive_timeout') st,
    (SELECT source FROM pg_settings WHERE name='archive_command') sc
  WHERE (t.s::int != 1800 OR c.s NOT LIKE '%mmin +480%')
    AND NOT EXISTS (
      SELECT 1 FROM zapp.warroom_alerts
      WHERE title LIKE 'DRIFT archive%'
        AND resolved_at IS NULL
        AND created_at > now() - interval '4 hours'
    )
  $CRON$
);
