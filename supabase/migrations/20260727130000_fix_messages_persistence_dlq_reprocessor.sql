-- Migration: fix_messages_persistence_dlq_reprocessor
-- Created: 2026-07-27
-- Purpose:
--   1. Ensure evo.evolution_webhook_dlq has columns needed by the DLQ reprocessor edge function
--   2. Register pg_cron job for reprocess-webhook-dlq (runs every 5 min)
--   3. Ensure the reprocess-webhook-dlq edge function URL is accessible
--
-- Context: Fix for the "ghost processed" bug where handleIncomingMessage silently returned
--   (instead of throwing) on INSERT failure, leaving events marked processed=true in
--   webhook_events_processed with no message persisted. The edge function fix in
--   evolution-webhook-messages.ts now throws on non-duplicate INSERT failures, routing
--   the entry to evolution_webhook_dlq. This migration adds the reprocessor cron job.

BEGIN;

-- ── 1. Ensure retry_count column exists on evo.evolution_webhook_dlq ────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'evo'
      AND table_name = 'evolution_webhook_dlq'
      AND column_name = 'retry_count'
  ) THEN
    ALTER TABLE evo.evolution_webhook_dlq ADD COLUMN retry_count integer NOT NULL DEFAULT 0;
    RAISE NOTICE 'Added retry_count column to evo.evolution_webhook_dlq';
  ELSE
    RAISE NOTICE 'retry_count column already exists on evo.evolution_webhook_dlq — skipping';
  END IF;
END;
$$;

-- ── 2. Ensure last_attempt_at column exists ──────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'evo'
      AND table_name = 'evolution_webhook_dlq'
      AND column_name = 'last_attempt_at'
  ) THEN
    ALTER TABLE evo.evolution_webhook_dlq ADD COLUMN last_attempt_at timestamptz;
    RAISE NOTICE 'Added last_attempt_at column to evo.evolution_webhook_dlq';
  ELSE
    RAISE NOTICE 'last_attempt_at already exists on evo.evolution_webhook_dlq — skipping';
  END IF;
END;
$$;

-- ── 3. Ensure succeeded_at column exists ────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'evo'
      AND table_name = 'evolution_webhook_dlq'
      AND column_name = 'succeeded_at'
  ) THEN
    ALTER TABLE evo.evolution_webhook_dlq ADD COLUMN succeeded_at timestamptz;
    RAISE NOTICE 'Added succeeded_at column to evo.evolution_webhook_dlq';
  ELSE
    RAISE NOTICE 'succeeded_at already exists on evo.evolution_webhook_dlq — skipping';
  END IF;
END;
$$;

-- ── 4. Index for efficient DLQ reprocessor query ────────────────────────────
-- Filters: status='pending', event_type IN (...), retry_count < MAX_RETRIES, ORDER BY created_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'evo'
      AND tablename = 'evolution_webhook_dlq'
      AND indexname = 'idx_evolution_webhook_dlq_reprocess'
  ) THEN
    CREATE INDEX idx_evolution_webhook_dlq_reprocess
      ON evo.evolution_webhook_dlq (status, event_type, retry_count, created_at)
      WHERE status = 'pending';
    RAISE NOTICE 'Created reprocessor index on evo.evolution_webhook_dlq';
  ELSE
    RAISE NOTICE 'idx_evolution_webhook_dlq_reprocess already exists — skipping';
  END IF;
END;
$$;

-- ── 5. pg_cron: register reprocess-webhook-dlq to run every 5 minutes ──────
-- Only if pg_cron extension is available and job does not already exist.
DO $$
DECLARE
  v_supabase_url text := current_setting('app.supabase_url', true);
  v_service_key  text := current_setting('app.service_role_key', true);
  v_job_name     text := 'reprocess-webhook-dlq';
BEGIN
  -- Skip if pg_cron extension not present
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — skipping cron registration for %', v_job_name;
    RETURN;
  END IF;

  -- Skip if job already exists
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = v_job_name) THEN
    RAISE NOTICE 'pg_cron job "%" already exists — skipping', v_job_name;
    RETURN;
  END IF;

  -- Require SUPABASE_URL to be configured via app settings
  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    RAISE NOTICE 'app.supabase_url not set — skipping pg_cron registration for %; register manually', v_job_name;
    RETURN;
  END IF;

  PERFORM cron.schedule(
    v_job_name,
    '*/5 * * * *',
    format(
      $cron$
        SELECT net.http_post(
          url := %L || '/functions/v1/reprocess-webhook-dlq',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || %L,
            'x-cron-source', 'pg_cron'
          ),
          body := '{}'::jsonb
        )
      $cron$,
      v_supabase_url,
      v_service_key
    )
  );

  RAISE NOTICE 'pg_cron job "%" registered to run every 5 minutes', v_job_name;
END;
$$;

COMMIT;
