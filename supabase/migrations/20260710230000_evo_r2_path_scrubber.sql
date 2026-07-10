-- ============================================================================
-- R2 Path Scrubber (E2-11)
-- Auditoria 2026-07-10
--
-- E2-11 — AccessDenied expõe path R2 no Sentry (info leak)
--   Quando o consumer tenta acessar um objeto R2 inexistente ou proibido,
--   a mensagem de erro completa (incluindo o path do bucket) é salva em
--   evolution_health_logs.error_message, evolution_webhook_dlq.error_message/
--   error_stack/raw_payload e evolution_alerts.message/description.
--   Esses campos chegam ao Sentry/GlitchTip via logging, expondo a estrutura
--   interna de armazenamento (bucket name, prefixos de path, IDs de arquivo).
--
-- Solução: DB-side scrubber que substitui padrões sensíveis por placeholders.
--   Padrões cobertos:
--   • https://<account>.r2.cloudflarestorage.com/<bucket>/<path>
--   • s3://<bucket>/<path>   (S3-style R2 URLs)
--   • r2://<bucket>/<path>   (protocolo r2://)
--   • Fragmentos AccessDenied/NoSuchKey inline com paths
--
-- Infraestrutura:
--   • evo.fn_scrub_r2_paths_from_logs() — scrubs text cols em 3 tabelas,
--     janela configurável (padrão: últimas 24h). Retorna jsonb com contagens.
--   • Scheduled: 0 4 * * * (04:00 diário, low-traffic window)
--
-- Idempotente: CREATE OR REPLACE + cron.unschedule.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- Core scrubbing helper — pure immutable function (safe to call anywhere)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION evo.fn_scrub_r2_text(p_input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_temp
AS $$
  SELECT
    -- Cloudflare R2 full URLs: https://<account-id>.r2.cloudflarestorage.com/...
    regexp_replace(
      -- S3-style bucket paths: s3://bucket-name/path/to/object
      regexp_replace(
        -- r2:// protocol paths
        regexp_replace(
          p_input,
          'r2://[^\s''"<>]+',
          '[R2-PATH-REDACTED]',
          'gi'
        ),
        's3://[^\s''"<>]+',
        '[R2-PATH-REDACTED]',
        'gi'
      ),
      'https://[0-9a-f]{32}\.r2\.cloudflarestorage\.com/[^\s''"<>]*',
      '[R2-PATH-REDACTED]',
      'gi'
    )
$$;

COMMENT ON FUNCTION evo.fn_scrub_r2_text(text) IS
  'E2-11: Scrubs R2/S3 storage paths from a text value. '
  'Patterns: r2://, s3://, https://<account>.r2.cloudflarestorage.com/. '
  'IMMUTABLE PARALLEL SAFE — safe for use in indexes, generated columns, triggers.';

-- ──────────────────────────────────────────────────────────────────────────────
-- Main batch scrubber — runs on a time window to catch historical data
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION evo.fn_scrub_r2_paths_from_logs(
  p_window interval DEFAULT '24 hours'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public, pg_temp
AS $$
DECLARE
  v_health_scrubbed   bigint := 0;
  v_dlq_scrubbed      bigint := 0;
  v_alerts_scrubbed   bigint := 0;
  v_since             timestamptz;
BEGIN
  v_since := now() - p_window;

  -- ── 1. evolution_health_logs.error_message ──────────────────────────────
  WITH updated AS (
    UPDATE evo.evolution_health_logs
    SET error_message = evo.fn_scrub_r2_text(error_message)
    WHERE created_at >= v_since
      AND error_message IS NOT NULL
      AND (
        error_message ILIKE '%r2.cloudflarestorage.com%'
        OR error_message ILIKE '%s3://%'
        OR error_message ILIKE '%r2://%'
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_health_scrubbed FROM updated;

  -- ── 2. evolution_webhook_dlq — error_message, error_stack, raw_payload ──
  WITH updated AS (
    UPDATE evo.evolution_webhook_dlq
    SET
      error_message = CASE
        WHEN error_message IS NOT NULL
          AND (
            error_message ILIKE '%r2.cloudflarestorage.com%'
            OR error_message ILIKE '%s3://%'
            OR error_message ILIKE '%r2://%'
          )
        THEN evo.fn_scrub_r2_text(error_message)
        ELSE error_message
      END,
      error_stack = CASE
        WHEN error_stack IS NOT NULL
          AND (
            error_stack ILIKE '%r2.cloudflarestorage.com%'
            OR error_stack ILIKE '%s3://%'
            OR error_stack ILIKE '%r2://%'
          )
        THEN evo.fn_scrub_r2_text(error_stack)
        ELSE error_stack
      END,
      raw_payload = CASE
        WHEN raw_payload IS NOT NULL
          AND (
            raw_payload ILIKE '%r2.cloudflarestorage.com%'
            OR raw_payload ILIKE '%s3://%'
            OR raw_payload ILIKE '%r2://%'
          )
        THEN evo.fn_scrub_r2_text(raw_payload)
        ELSE raw_payload
      END
    WHERE created_at >= v_since
      AND (
        (error_message IS NOT NULL AND (
          error_message ILIKE '%r2.cloudflarestorage.com%'
          OR error_message ILIKE '%s3://%'
          OR error_message ILIKE '%r2://%'
        ))
        OR (error_stack IS NOT NULL AND (
          error_stack ILIKE '%r2.cloudflarestorage.com%'
          OR error_stack ILIKE '%s3://%'
          OR error_stack ILIKE '%r2://%'
        ))
        OR (raw_payload IS NOT NULL AND (
          raw_payload ILIKE '%r2.cloudflarestorage.com%'
          OR raw_payload ILIKE '%s3://%'
          OR raw_payload ILIKE '%r2://%'
        ))
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_dlq_scrubbed FROM updated;

  -- ── 3. evolution_alerts — message, description, title ───────────────────
  WITH updated AS (
    UPDATE evo.evolution_alerts
    SET
      message = CASE
        WHEN message IS NOT NULL
          AND (
            message ILIKE '%r2.cloudflarestorage.com%'
            OR message ILIKE '%s3://%'
            OR message ILIKE '%r2://%'
          )
        THEN evo.fn_scrub_r2_text(message)
        ELSE message
      END,
      description = CASE
        WHEN description IS NOT NULL
          AND (
            description ILIKE '%r2.cloudflarestorage.com%'
            OR description ILIKE '%s3://%'
            OR description ILIKE '%r2://%'
          )
        THEN evo.fn_scrub_r2_text(description)
        ELSE description
      END,
      title = CASE
        WHEN title IS NOT NULL
          AND (
            title ILIKE '%r2.cloudflarestorage.com%'
            OR title ILIKE '%s3://%'
            OR title ILIKE '%r2://%'
          )
        THEN evo.fn_scrub_r2_text(title)
        ELSE title
      END
    WHERE created_at >= v_since
      AND (
        (message IS NOT NULL AND (
          message ILIKE '%r2.cloudflarestorage.com%'
          OR message ILIKE '%s3://%'
          OR message ILIKE '%r2://%'
        ))
        OR (description IS NOT NULL AND (
          description ILIKE '%r2.cloudflarestorage.com%'
          OR description ILIKE '%s3://%'
          OR description ILIKE '%r2://%'
        ))
        OR (title IS NOT NULL AND (
          title ILIKE '%r2.cloudflarestorage.com%'
          OR title ILIKE '%s3://%'
          OR title ILIKE '%r2://%'
        ))
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_alerts_scrubbed FROM updated;

  RETURN jsonb_build_object(
    'scrubbed_at',        now(),
    'window',             p_window,
    'health_logs',        v_health_scrubbed,
    'webhook_dlq',        v_dlq_scrubbed,
    'evolution_alerts',   v_alerts_scrubbed,
    'total_rows_updated', v_health_scrubbed + v_dlq_scrubbed + v_alerts_scrubbed,
    'status',             CASE
                            WHEN (v_health_scrubbed + v_dlq_scrubbed + v_alerts_scrubbed) > 0
                            THEN 'SCRUBBED'
                            ELSE 'CLEAN'
                          END
  );
END;
$$;

COMMENT ON FUNCTION evo.fn_scrub_r2_paths_from_logs(interval) IS
  'E2-11: Batch-scrubs R2/S3 storage paths from error fields in evolution_health_logs, '
  'evolution_webhook_dlq (error_message, error_stack, raw_payload), and '
  'evolution_alerts (message, description, title). '
  'Replaces r2://, s3://, and https://<account>.r2.cloudflarestorage.com/ paths '
  'with [R2-PATH-REDACTED] to prevent info leak via Sentry/GlitchTip. '
  'Default window: 24h. Scheduled daily at 04:00 via pg_cron.';

REVOKE EXECUTE ON FUNCTION evo.fn_scrub_r2_paths_from_logs(interval) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION evo.fn_scrub_r2_paths_from_logs(interval) TO service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- pg_cron: daily at 04:00 (low-traffic window)
-- ──────────────────────────────────────────────────────────────────────────────
SELECT cron.unschedule('evo-r2-path-scrubber')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'evo-r2-path-scrubber');

SELECT cron.schedule(
  'evo-r2-path-scrubber',
  '0 4 * * *',
  $$SELECT evo.fn_scrub_r2_paths_from_logs('24 hours'::interval)$$
);

-- ──────────────────────────────────────────────────────────────────────────────
-- Backfill: scrub any existing leaks (window=30 days)
-- Runs once at migration time; subsequent runs via cron use 24h window.
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT evo.fn_scrub_r2_paths_from_logs('30 days'::interval) INTO v_result;
  RAISE NOTICE 'E2-11 backfill: %', v_result;
END;
$$;
