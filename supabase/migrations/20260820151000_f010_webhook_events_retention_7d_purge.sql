-- F-010 (PLANO-100 GATE-C) — retenção webhook_events_processed 7 dias
-- Aplicado em produção 2026-08-20:
--   DELETE 237.004 rows > 7d (de 602.171 para 365.167, ~290MB heap+index liberável)
--   Cron job 546: purge-webhook-events-7d (30 00 * * 0 = domingo 21:30 BRT)
--   Rollback: ALTER DEFAULT PRIVILEGES + GRANT (f005), DROP cron 546

SELECT cron.schedule('purge-webhook-events-7d', '30 00 * * 0', $cmd$
  DELETE FROM zapp.webhook_events_processed
  WHERE processed_at < now() - interval '7 days';
  ANALYZE zapp.webhook_events_processed;
$cmd$);
