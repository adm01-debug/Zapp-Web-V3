-- 20260801050002 — Governanca: retencao de webhook logs (auditoria etapa 46)
-- Aplicado em producao: 2026-08-01
-- Volumetria na aplicacao: webhook_audit_log=169.923 (0 antigas >90d), webhook_events_processed=169.960 (0 antigas >30d)
-- Purga em lotes de 50k para evitar bloat/WAL excessivo (disco em 71%).
-- Rollback:
--   SELECT cron.unschedule('purge-webhook-logs');
--   DROP FUNCTION IF EXISTS zapp.purge_webhook_logs();

BEGIN;

CREATE TABLE IF NOT EXISTS ops.maintenance_log (
  id bigserial PRIMARY KEY,
  job text NOT NULL,
  details jsonb,
  ran_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION zapp.purge_webhook_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, pg_catalog
AS $$
DECLARE
  v_deleted bigint := 0;
  v_batch bigint;
BEGIN
  -- webhook_audit_log: retencao de 90 dias, em lotes de 50k
  LOOP
    DELETE FROM zapp.webhook_audit_log
    WHERE id IN (
      SELECT id FROM zapp.webhook_audit_log
      WHERE created_at < now() - interval '90 days'
      LIMIT 50000
    );
    GET DIAGNOSTICS v_batch = ROW_COUNT;
    v_deleted := v_deleted + v_batch;
    EXIT WHEN v_batch < 50000;
  END LOOP;

  -- webhook_events_processed: retencao de 30 dias, em lotes de 50k
  LOOP
    DELETE FROM zapp.webhook_events_processed
    WHERE id IN (
      SELECT id FROM zapp.webhook_events_processed
      WHERE processed_at < now() - interval '30 days'
      LIMIT 50000
    );
    GET DIAGNOSTICS v_batch = ROW_COUNT;
    v_deleted := v_deleted + v_batch;
    EXIT WHEN v_batch < 50000;
  END LOOP;

  INSERT INTO ops.maintenance_log (job, details, ran_at)
  VALUES ('purge_webhook_logs', jsonb_build_object('deleted_rows', v_deleted), now())
  ON CONFLICT DO NOTHING;
END $$;

REVOKE ALL ON FUNCTION zapp.purge_webhook_logs() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('purge-webhook-logs', '15 3 * * *', $$SELECT zapp.purge_webhook_logs()$$);

COMMIT;
