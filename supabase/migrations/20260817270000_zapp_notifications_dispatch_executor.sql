-- ============================================================================
-- 20260817270000_zapp_notifications_dispatch_executor.sql
-- DASHBOARD-08 / Etapa 68 — executor real de notificações
-- (edge zapp-notifications-dispatch): estado do canal + dedup + cron de disparo.
-- ----------------------------------------------------------------------------
-- 1. Etapa 68.3 — colunas de estado do executor em zapp.notification_channels_config
--    (last_sent_at/error são escritas pela edge a cada envio/falha).
-- 2. zapp.notification_delivery_log — dedup ATÔMICO por evento+canal
--    (UNIQUE (event_key, channel_id)); event_key = event_type|workspace_id|
--    conversation_id. A edge INSERTa antes de enviar (claim); duplicata 23505
--    = skip (Etapa 68.9 "dedup de eventos com payload repetido").
-- 3. Etapa 68.5 — cron pg_cron 'zapp-notifications-dispatch-5m' (a cada 5 min)
--    chamando a edge com body {} (heartbeat no-op de liveness do pipeline —
--    padrão dos crons prod: nps-daily-trigger 261, notif-dispatcher 478).
-- 100% ADDITIVE; idempotente (IF NOT EXISTS / unschedule guard).
-- ============================================================================

-- 1. Estado do canal (Etapa 68.3)
ALTER TABLE zapp.notification_channels_config
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS error text;

COMMENT ON COLUMN zapp.notification_channels_config.last_sent_at IS 'Último envio pelo executor zapp-notifications-dispatch.';
COMMENT ON COLUMN zapp.notification_channels_config.error IS 'Último erro de envio do executor (null = sem erro registrado).';

-- 2. Delivery log (dedup atômico por evento+canal — Etapa 68.9)
CREATE TABLE IF NOT EXISTS zapp.notification_delivery_log (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_key   text NOT NULL,
    channel_id  integer NOT NULL REFERENCES zapp.notification_channels_config(id) ON DELETE CASCADE,
    status      text NOT NULL DEFAULT 'sending',
    error       text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT notification_delivery_log_event_channel_uniq UNIQUE (event_key, channel_id)
);

ALTER TABLE zapp.notification_delivery_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'zapp' AND tablename = 'notification_delivery_log'
          AND policyname = 'service_full_access'
    ) THEN
        CREATE POLICY "service_full_access" ON zapp.notification_delivery_log
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.notification_delivery_log TO service_role;
CREATE INDEX IF NOT EXISTS notification_delivery_log_created_at_idx
  ON zapp.notification_delivery_log (created_at);

-- 3. Cron de disparo (Etapa 68.5) — heartbeat no-op a cada 5 min.
--    Padrão replicado dos crons prod ativos (nps-daily-trigger 261,
--    sync-groups-daily 476, notif-dispatcher 478): pg_net extensions.http_post
--    + service_role do vault (vault.decrypted_secrets name='supabase_service_role_key').
SELECT cron.unschedule('zapp-notifications-dispatch-5m')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'zapp-notifications-dispatch-5m');

SELECT cron.schedule(
  'zapp-notifications-dispatch-5m', '*/5 * * * *',
  $cmd$
    SELECT extensions.http_post(
      url     := 'https://supabase.atomicabr.com.br/functions/v1/zapp-notifications-dispatch',
      body    := '{}',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key')
      )
    );
  $cmd$
);

-- Registro de migration (aplicado no DB via INSERT idempotente)
-- INSERT INTO supabase_migrations.schema_migrations (version, name)
-- VALUES ('20260817270000', 'zapp_notifications_dispatch_executor')
-- ON CONFLICT (version) DO NOTHING;

-- Rollback:
--   SELECT cron.unschedule('zapp-notifications-dispatch-5m');
--   DROP TABLE zapp.notification_delivery_log;
--   ALTER TABLE zapp.notification_channels_config DROP COLUMN IF EXISTS last_sent_at, DROP COLUMN IF EXISTS error;
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260817270000';
-- ============================================================================
