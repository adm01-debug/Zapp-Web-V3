-- P2 QA pos-merge 2026-08-06: desfasar cron 'evo-401-feed' (jobid 161)
-- Motivo: schedule '4,14,24,34,44,54' colide 6x/h com verify-alert-delivery-10min
-- (fix a4c). Novo schedule '7,17,27,37,47,57':
--   - nao esta em 1+5n (whatsapp_reconcile_apply = 1,6,11,...)
--   - nao esta em 3+5n (scan-media-security = 3,8,13,...)
--   - nao esta em 4+10n (verify-alert-delivery = 4,14,24,...)
--   - impar: nao colide com reprocess_pending_webhooks (0-58/2, pares)
--   - nao colide com evo-detect-401-bursts (8,23,38,53)
-- cron.schedule faz upsert por jobname; comando preservado byte-exact.
SELECT cron.schedule(
  'evo-401-feed',
  '7,17,27,37,47,57 * * * *',
  $cmd$
    INSERT INTO zapp.webhook_health_alerts
      (alert_type, severity, title, details, created_at)
    SELECT
      'sentry_401_feed',
      'info',
      format('E3-10: Sentry 401 feed — %s events in last 10min', payload->>'event_count'),
      payload,
      now()
    FROM (SELECT evo.fn_get_401_payload(10) AS payload) sub
    WHERE (payload->>'event_count')::int > 0
  $cmd$
);
