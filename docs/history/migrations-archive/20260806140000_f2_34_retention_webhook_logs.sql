-- F2-34: Retenção de webhook logs do schema zapp (90 dias)
-- ---------------------------------------------------------------------------
-- Contexto (aplicado em produção 2026-08-05 via psql postgres — fluxo self-hosted):
--   zapp.webhook_audit_log      ~190.532 linhas / 101 MB  (coluna de tempo: created_at)
--   zapp.webhook_events_processed ~190.870 linhas / 114 MB (coluna de tempo: processed_at)
--   Volume diário (últimos dias): 4.289 → 73.954 / dia (>5k/dia → janela de 90 dias)
--   Dados atuais: 02–05/ago/2026 (~4 dias) → 0 linhas acima de 90 dias → limpeza
--   inicial NÃO necessária; função + job ficam prontos para o crescimento.
--
-- O que JÁ existia (não duplicado, mantido):
--   * zapp.purge_webhook_logs()          — batch 50k, audit 90d + events 30d (canonical 20260804000000)
--   * job cron purge-webhook-logs        — diário, chama a função acima
--   * jobs ad-hoc (outros runbooks): purge_webhook_audit (61), purge_webhook_events_processed (152, 3d),
--     purge-webhook-audit-log-90d (209) — podas mais agressivas; NÃO alterados aqui.
-- Esta migration adiciona a função PARAMETRIZADA (F2-34) com batches de 5k e o
-- job semanal de 90 dias, sem remover os mecanismos existentes.
--
-- Rollback:
--   SELECT cron.unschedule('zapp-purge-webhook-logs-90d');
--   DROP FUNCTION IF EXISTS zapp.fn_purge_webhook_logs(interval);
-- ---------------------------------------------------------------------------

BEGIN;

-- (a) Função parametrizada: apaga em batches de 5.000 até não sobrar nada e
--     retorna o total de linhas apagadas (audit por created_at, events por processed_at).
CREATE OR REPLACE FUNCTION zapp.fn_purge_webhook_logs(older_than interval DEFAULT interval '90 days')
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, pg_catalog
AS $$
DECLARE
  v_total bigint := 0;
  v_batch bigint;
BEGIN
  -- zapp.webhook_audit_log: retenção por created_at
  LOOP
    DELETE FROM zapp.webhook_audit_log
    WHERE id IN (
      SELECT id FROM zapp.webhook_audit_log
      WHERE created_at < now() - older_than
      LIMIT 5000
    );
    GET DIAGNOSTICS v_batch = ROW_COUNT;
    v_total := v_total + v_batch;
    EXIT WHEN v_batch = 0;
    PERFORM pg_sleep(0.2); -- pequena pausa entre lotes (evita pressão contínua de WAL/locks)
  END LOOP;

  -- zapp.webhook_events_processed: retenção por processed_at
  LOOP
    DELETE FROM zapp.webhook_events_processed
    WHERE id IN (
      SELECT id FROM zapp.webhook_events_processed
      WHERE processed_at < now() - older_than
      LIMIT 5000
    );
    GET DIAGNOSTICS v_batch = ROW_COUNT;
    v_total := v_total + v_batch;
    EXIT WHEN v_batch = 0;
    PERFORM pg_sleep(0.2);
  END LOOP;

  INSERT INTO ops.maintenance_log (job, details, ran_at)
  VALUES ('fn_purge_webhook_logs',
          jsonb_build_object('older_than', older_than, 'deleted_rows', v_total),
          now())
  ON CONFLICT DO NOTHING;

  RETURN v_total;
END;
$$;

-- Só o postgres (dono / executor do pg_cron) chama esta função.
REVOKE ALL ON FUNCTION zapp.fn_purge_webhook_logs(interval) FROM PUBLIC, anon, authenticated;

-- (b) Job semanal do pg_cron (mesmo jobname = upsert, re-aplicação segura).
--     Agenda: toda segunda 05:00 UTC (02:00 local) — sem colisão com os purges diários.
SELECT cron.schedule(
  'zapp-purge-webhook-logs-90d',
  '0 5 * * 1',
  $$SELECT zapp.fn_purge_webhook_logs(interval '90 days')$$
);

COMMIT;
