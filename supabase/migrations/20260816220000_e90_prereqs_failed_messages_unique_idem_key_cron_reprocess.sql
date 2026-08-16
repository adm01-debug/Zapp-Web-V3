-- E90 pré-requisitos: unique index idempotency_key + cron reprocess-failed-messages-15m
-- 2026-08-16 | DB-as-source: aplicado via MCP (supabase_db_query, role postgres); este arquivo é o espelho versionado
-- | idempotente (IF NOT EXISTS; unschedule condicional; ON CONFLICT DO NOTHING)
-- | Pré-condição verificada antes da aplicação: zapp.failed_messages VAZIA (0 rows, 0 idempotency_keys distintas)

-- 1. Unique index em zapp.failed_messages(idempotency_key)
--    (idempotency_key é NULLABLE: múltiplos NULLs são permitidos em unique index no Postgres)
CREATE UNIQUE INDEX IF NOT EXISTS idx_failed_messages_idempotency_key
  ON zapp.failed_messages (idempotency_key);

-- 2. Cron pg_cron a cada 15min: reprocess-failed-messages
--    Padrão replicado dos crons prod ativos (nps-daily-trigger 261, sync-groups-daily 476,
--    check-whatsapp-numbers 477, notif-dispatcher 478): pg_net extensions.http_post
--    + service_role do vault (vault.decrypted_secrets name='supabase_service_role_key').
SELECT cron.unschedule('reprocess-failed-messages-15m')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reprocess-failed-messages-15m');

SELECT cron.schedule(
  'reprocess-failed-messages-15m', '*/15 * * * *',
  $cmd$
    SELECT extensions.http_post(
      url     := 'https://supabase.atomicabr.com.br/functions/v1/reprocess-failed-messages',
      body    := '{}',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key')
      )
    );
  $cmd$
);

-- 3. Registro de migration (aplicado no DB via INSERT idempotente)
-- INSERT INTO supabase_migrations.schema_migrations (version, name)
-- VALUES ('20260816220000', 'e90_prereqs_failed_messages_unique_idem_key_cron_reprocess')
-- ON CONFLICT (version) DO NOTHING;

-- Rollback:
--   SELECT cron.unschedule('reprocess-failed-messages-15m');
--   DROP INDEX IF EXISTS zapp.idx_failed_messages_idempotency_key;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260816220000';
