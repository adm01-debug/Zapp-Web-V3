-- =============================================================================
-- CAMPANHAS-14: pg_cron job — nps-daily-trigger
-- Dispara o NPS scheduler diariamente às 10:00 UTC.
-- A função edge nps-scheduler já existe; este job garante que seja chamada
-- também no horário matutino (o job existente nps-scheduler-daily roda às 14:00 UTC).
-- Padrão: extensions.http_post + app.settings.supabase_url + service_role_key
-- (idêntico aos demais jobs HTTP do projeto — canonical_schema linhas 93-264)
-- =============================================================================

DO $$
BEGIN
  -- Upsert idempotente: cancela a versão anterior se existir
  PERFORM cron.unschedule('nps-daily-trigger')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nps-daily-trigger');

  PERFORM cron.schedule(
    'nps-daily-trigger',
    '0 10 * * *',
    $cmd$
      SELECT extensions.http_post(
        url     := COALESCE(
                     NULLIF(current_setting('app.settings.supabase_url', true), ''),
                     'https://supabase.atomicabr.com.br'
                   ) || '/functions/v1/nps-scheduler',
        body    := '{}',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || COALESCE(
            NULLIF(current_setting('app.settings.service_role_key', true), ''), ''
          )
        )::jsonb
      );
    $cmd$
  );

  RAISE NOTICE '[campanhas-14] cron job "nps-daily-trigger" registrado (0 10 * * * UTC)';

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[campanhas-14] erro ao registrar cron job [%]: %', SQLSTATE, SQLERRM;
END $$;
