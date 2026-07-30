-- =============================================================================
-- FALHA #10 — Missing cron schedules + column drift
-- Source: AUDITORIA_LOVABLE_VS_ZAPP_2026-07-04.md (P0 + P1 items)
--
-- PART 1 (P1): Column drift in conversation_threads, team_conversations,
--              and message_reactions — columns present in Lovable Cloud but
--              absent from self-hosted schema.
-- PART 2 (P0): 8 Lovable Cloud cron jobs whose edge functions are deployed
--              but have no schedule in self-hosted.
--              Items already covered by earlier migrations are omitted:
--                • cleanup-failed-messages-daily (20260423174952)
--                • cleanup-evolution-retry-metrics-daily (20260423153935)
--
-- Idempotente:
--   - ADD COLUMN IF NOT EXISTS / exception-guarded ALTER TABLE blocks
--   - cron.unschedule (guarded by EXISTS) + cron.schedule
--   - DO block skips silently when pg_cron is absent
--
-- The cron command strings use current_setting() so URL and key are resolved
-- at JOB EXECUTION TIME (not at migration time), making the migration safe to
-- apply in any environment where settings are configured later.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PART 1: Column drift fixes
-- ---------------------------------------------------------------------------

-- conversation_threads — 4 SLA columns
ALTER TABLE IF EXISTS public.conversation_threads
  ADD COLUMN IF NOT EXISTS sla_enabled                    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sla_warning_threshold_minutes  integer,
  ADD COLUMN IF NOT EXISTS sla_critical_threshold_minutes integer,
  ADD COLUMN IF NOT EXISTS sla_notification_message       text;

-- team_conversations — 7 routing / assignment columns
DO $$ BEGIN
  ALTER TABLE public.team_conversations
    ADD COLUMN IF NOT EXISTS assigned_at          timestamptz,
    ADD COLUMN IF NOT EXISTS assigned_to          uuid,
    ADD COLUMN IF NOT EXISTS deleted_at           timestamptz,
    ADD COLUMN IF NOT EXISTS routing_status       text,
    ADD COLUMN IF NOT EXISTS whatsapp_api_key     text,
    ADD COLUMN IF NOT EXISTS whatsapp_instance_id text,
    ADD COLUMN IF NOT EXISTS whatsapp_mode        text;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.team_conversations
    ADD CONSTRAINT team_conversations_assigned_to_fkey
    FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table  THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

-- message_reactions — whisper correlation column
ALTER TABLE IF EXISTS public.message_reactions
  ADD COLUMN IF NOT EXISTS whisper_message_id uuid;

DO $$ BEGIN
  ALTER TABLE public.message_reactions
    ADD CONSTRAINT message_reactions_whisper_message_id_fkey
    FOREIGN KEY (whisper_message_id) REFERENCES public.whisper_messages(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table  THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- PART 2: Missing cron job schedules
--
-- The command strings use current_setting() with `missing_ok = true` so they
-- resolve the URL and service-role key at JOB FIRE TIME, not at migration
-- time.  Fallback URL is the Lovable Cloud project URL; on self-hosted, set:
--   ALTER DATABASE postgres SET "app.settings.supabase_url"         = '...';
--   ALTER DATABASE postgres SET "app.settings.service_role_key"     = '...';
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — skipping cron schedule setup (FALHA #10)';
    RETURN;
  END IF;

  -- ---- 1. cleanup-storage-orphans-daily  (03:00 UTC) ---- --
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

  -- ---- 2. connection-health-check-every-5min  (every 5 min) ---- --
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

  -- ---- 3. nps-scheduler-daily  (14:00 UTC) ---- --
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

  -- ---- 4. provider-healthcheck-every-2min  (every 2 min) ---- --
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

  -- ---- 5. queue-rebalance-every-5min  (every 5 min) ---- --
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

  -- ---- 6. reprocess-failed-messages-15m  (every 15 min) ---- --
  -- Also removes the duplicate "-15min" variant that Lovable Cloud had.
  PERFORM cron.unschedule('reprocess-failed-messages-15min')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reprocess-failed-messages-15min');
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

  -- ---- 7. talkx-scheduler-check  (every minute) ---- --
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

  -- ---- 8. warroom-alert-resolver-1min  (every minute) ---- --
  -- Lovable Cloud name for the auto-escalate-sla resolver loop.
  -- Mapped to the auto-escalate-sla edge function with mode=resolve.
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

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'FALHA #10 cron setup error [%]: %', SQLSTATE, SQLERRM;
END $$;
