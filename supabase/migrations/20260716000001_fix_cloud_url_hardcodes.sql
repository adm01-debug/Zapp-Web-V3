-- Corrective migration: replace all hardcoded Lovable Cloud URLs
-- with the canonical self-hosted URL (supabase.atomicabr.com.br).
--
-- Root cause: migrations 20260319210215, 20260319210228, 20260704190000,
-- and 20260711135019 embedded Lovable Cloud project URLs as hardcoded
-- fallbacks. Two patterns exist:
--   A) Dynamic (evaluated at cron execution time) — safe if app.settings.supabase_url
--      is configured, but fallback was wrong.
--   B) Static (baked via format() at schedule time) — wrong URL baked permanently.
--
-- This migration:
--   1. Sets app.settings.supabase_url to the self-hosted URL (ensures dynamic
--      fallback path works on first boot before explicit config).
--   2. Reschedules all 9 affected cron jobs with the correct hardcoded fallback.
--   3. Is idempotent (uses IF EXISTS / COALESCE guards).

DO $$
BEGIN
  -- Guarantee the runtime setting is correct on this instance
  PERFORM set_config('app.settings.supabase_url', 'https://supabase.atomicabr.com.br', false);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[fix-cloud-url] set_config skipped: %', SQLERRM;
END $$;

-- ── Reschedule cron jobs (require pg_cron) ────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE '[fix-cloud-url] pg_cron not installed — cron reschedule skipped';
    RETURN;
  END IF;

  -- ① sicoob-outbox-drain — URL was baked at schedule time (format/%L).
  --    Must reschedule with the correct URL.
  PERFORM cron.unschedule('sicoob-outbox-drain')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sicoob-outbox-drain');
  PERFORM cron.schedule(
    'sicoob-outbox-drain', '* * * * *',
    $cmd$
      SELECT net.http_post(
        url     := 'https://supabase.atomicabr.com.br/functions/v1/sicoob-outbox-consumer',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || COALESCE(
            NULLIF(current_setting('app.settings.service_role_key', true), ''), ''
          )
        ),
        body    := jsonb_build_object('trigger', 'cron')
      );
    $cmd$
  );

  -- ② cleanup-storage-orphans-daily (03:00 UTC)
  PERFORM cron.unschedule('cleanup-storage-orphans-daily')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-storage-orphans-daily');
  PERFORM cron.schedule(
    'cleanup-storage-orphans-daily', '0 3 * * *',
    $cmd$
      SELECT extensions.http_post(
        url     := COALESCE(
                     NULLIF(current_setting('app.settings.supabase_url', true), ''),
                     'https://supabase.atomicabr.com.br'
                   ) || '/functions/v1/cleanup-storage-orphans',
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

  -- ③ connection-health-check-every-5min (every 5 min)
  PERFORM cron.unschedule('connection-health-check-every-5min')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'connection-health-check-every-5min');
  PERFORM cron.schedule(
    'connection-health-check-every-5min', '*/5 * * * *',
    $cmd$
      SELECT extensions.http_post(
        url     := COALESCE(
                     NULLIF(current_setting('app.settings.supabase_url', true), ''),
                     'https://supabase.atomicabr.com.br'
                   ) || '/functions/v1/connection-health-check',
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

  -- ④ nps-scheduler-daily (14:00 UTC)
  PERFORM cron.unschedule('nps-scheduler-daily')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nps-scheduler-daily');
  PERFORM cron.schedule(
    'nps-scheduler-daily', '0 14 * * *',
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

  -- ⑤ provider-healthcheck-every-2min (every 2 min)
  PERFORM cron.unschedule('provider-healthcheck-every-2min')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'provider-healthcheck-every-2min');
  PERFORM cron.schedule(
    'provider-healthcheck-every-2min', '*/2 * * * *',
    $cmd$
      SELECT extensions.http_post(
        url     := COALESCE(
                     NULLIF(current_setting('app.settings.supabase_url', true), ''),
                     'https://supabase.atomicabr.com.br'
                   ) || '/functions/v1/provider-healthcheck',
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

  -- ⑥ queue-rebalance-every-5min (every 5 min)
  PERFORM cron.unschedule('queue-rebalance-every-5min')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'queue-rebalance-every-5min');
  PERFORM cron.schedule(
    'queue-rebalance-every-5min', '*/5 * * * *',
    $cmd$
      SELECT extensions.http_post(
        url     := COALESCE(
                     NULLIF(current_setting('app.settings.supabase_url', true), ''),
                     'https://supabase.atomicabr.com.br'
                   ) || '/functions/v1/queue-rebalance',
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

  -- ⑦ reprocess-failed-messages-15m (every 15 min)
  PERFORM cron.unschedule('reprocess-failed-messages-15m')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reprocess-failed-messages-15m');
  PERFORM cron.schedule(
    'reprocess-failed-messages-15m', '*/15 * * * *',
    $cmd$
      SELECT extensions.http_post(
        url     := COALESCE(
                     NULLIF(current_setting('app.settings.supabase_url', true), ''),
                     'https://supabase.atomicabr.com.br'
                   ) || '/functions/v1/reprocess-failed-messages',
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

  -- ⑧ talkx-scheduler-check (every minute)
  PERFORM cron.unschedule('talkx-scheduler-check')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'talkx-scheduler-check');
  PERFORM cron.schedule(
    'talkx-scheduler-check', '* * * * *',
    $cmd$
      SELECT extensions.http_post(
        url     := COALESCE(
                     NULLIF(current_setting('app.settings.supabase_url', true), ''),
                     'https://supabase.atomicabr.com.br'
                   ) || '/functions/v1/talkx-scheduler',
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

  -- ⑨ warroom-alert-resolver-1min (every minute)
  PERFORM cron.unschedule('warroom-alert-resolver-1min')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'warroom-alert-resolver-1min');
  PERFORM cron.schedule(
    'warroom-alert-resolver-1min', '* * * * *',
    $cmd$
      SELECT extensions.http_post(
        url     := COALESCE(
                     NULLIF(current_setting('app.settings.supabase_url', true), ''),
                     'https://supabase.atomicabr.com.br'
                   ) || '/functions/v1/auto-escalate-sla',
        body    := '{"mode":"resolve"}',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || COALESCE(
            NULLIF(current_setting('app.settings.service_role_key', true), ''), ''
          )
        )::jsonb
      );
    $cmd$
  );

  RAISE NOTICE '[fix-cloud-url] All 9 cron jobs rescheduled with self-hosted URL';

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[fix-cloud-url] cron reschedule error [%]: %', SQLSTATE, SQLERRM;
END $$;
