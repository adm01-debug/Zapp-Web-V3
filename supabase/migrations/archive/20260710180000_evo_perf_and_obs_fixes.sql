-- ============================================================================
-- Performance & Observability Fixes (E5-04 / E5-05 / E10-08 / E2-06)
-- Auditoria 2026-07-10
--
-- E5-05 — Backcompat-views verifier polling reduzido de 15min → 6h
--   fn_ensure_evolution_backcompat_views() é idempotente: após a criação
--   inicial das views não há trabalho real. Rodar a cada 15min desperdiçava
--   CPU varrendo pg_class sem necessidade.
--
-- E10-08 — Cache warm-up após vacuum noturno
--   VACUUM ANALYZE nas 5 tabelas evo (02:01-02:21) esvazia o shared_buffers.
--   fn_cache_warmup_after_vacuum() roda a 02:35 para pré-aquecer o cache
--   antes das primeiras queries de produção.
--
-- E5-04 — pg_sleep(10) na fn_logpatch_verify
--   O boot do container Evolution pode demorar até 10s para gravar o
--   health_log no Supabase. Sem o sleep, o verifier lia o log anterior
--   (falso positivo de "UNKNOWN"). Drop+recreate necessário por assinatura
--   RETURNS TABLE imutável no PostgreSQL.
--
-- E2-06 — Media pipeline health check restrito a horário comercial
--   fn_check_media_pipeline_health() gerava alertas falsos à madrugada
--   quando não há tráfego normal de mídia. Cron alterado de */15 * * * *
--   para */15 11-23 * * * (08h-22h BRT = 11h-23h UTC).
--
-- Aplicados ao vivo via MCP em 2026-07-10. Todos verificados.
-- Idempotente: cron.unschedule(IF EXISTS) + cron.schedule + DROP IF EXISTS
--   + CREATE OR REPLACE FUNCTION.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- E5-05: Reduce backcompat-views verifier from every-15-min to every-6h
-- ──────────────────────────────────────────────────────────────────────────────
SELECT cron.unschedule('ensure-evolution-backcompat-views')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ensure-evolution-backcompat-views');

SELECT cron.schedule(
  'ensure-evolution-backcompat-views',
  '0 */6 * * *',
  'SELECT evo.fn_ensure_evolution_backcompat_views()'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- E10-08: Cache warm-up function + daily cron at 02:35
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION evo.fn_cache_warmup_after_vacuum()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public, pg_temp
AS $$
DECLARE
  v_start timestamptz := now();
  v_counts jsonb := '{}';
  v_n bigint;
BEGIN
  SELECT COUNT(*) INTO v_n FROM evo.evolution_messages_wpp2;
  v_counts := v_counts || jsonb_build_object('evolution_messages_wpp2', v_n);

  SELECT COUNT(*) INTO v_n FROM evo.evolution_alerts WHERE resolved = false;
  v_counts := v_counts || jsonb_build_object('evolution_alerts_open', v_n);

  SELECT COUNT(*) INTO v_n FROM evo.evolution_contacts WHERE deleted_at IS NULL;
  v_counts := v_counts || jsonb_build_object('evolution_contacts_active', v_n);

  SELECT COUNT(*) INTO v_n FROM evo.evolution_bootstrap_log;
  v_counts := v_counts || jsonb_build_object('evolution_bootstrap_log', v_n);

  SELECT COUNT(*) INTO v_n FROM evo.evolution_connection_history;
  v_counts := v_counts || jsonb_build_object('evolution_connection_history', v_n);

  SELECT COUNT(*) INTO v_n FROM public.evolution_messages WHERE created_at > now() - interval '7 days';
  v_counts := v_counts || jsonb_build_object('evolution_messages_7d', v_n);

  RETURN jsonb_build_object(
    'warmed_at', v_start,
    'duration_ms', EXTRACT(EPOCH FROM (now() - v_start)) * 1000,
    'counts', v_counts
  );
END;
$$;

COMMENT ON FUNCTION evo.fn_cache_warmup_after_vacuum() IS
  'E10-08: Warm shared_buffers cache after nightly VACUUM run (02:01-02:21). '
  'Prevents first-query cold-cache degradation. Scheduled at 02:35 daily.';

SELECT cron.unschedule('cache-warmup-after-vacuum')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cache-warmup-after-vacuum');

SELECT cron.schedule(
  'cache-warmup-after-vacuum',
  '35 2 * * *',
  'SELECT evo.fn_cache_warmup_after_vacuum()'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- E5-04: Add pg_sleep(10) boot-log grace period to fn_logpatch_verify
-- ──────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS evo.fn_logpatch_verify();

CREATE OR REPLACE FUNCTION evo.fn_logpatch_verify()
RETURNS TABLE(patch text, status text, detail text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public, pg_temp
AS $$
DECLARE
  v_last_log RECORD;
BEGIN
  -- E5-04: 10s grace period for boot logs to land in evolution_health_logs
  PERFORM pg_sleep(10);

  SELECT * INTO v_last_log
  FROM evo.evolution_health_logs
  ORDER BY created_at DESC
  LIMIT 1;

  RETURN QUERY SELECT
    'T1_message_dump'::TEXT,
    CASE WHEN v_last_log.status = 'success' THEN 'OK' ELSE 'UNKNOWN' END::TEXT,
    COALESCE('last_check=' || v_last_log.created_at::TEXT, 'no_health_log')::TEXT;

  RETURN QUERY SELECT
    'T2_stanza_dump'::TEXT,
    CASE WHEN v_last_log.status = 'success' THEN 'OK' ELSE 'UNKNOWN' END::TEXT,
    'inferred_from_T1'::TEXT;

  RETURN QUERY SELECT
    'T3_sentry_filter'::TEXT,
    'APPLY_REQUIRED'::TEXT,
    'Verificar log de boot: [logpatch] T3 OK'::TEXT;

  RETURN QUERY SELECT
    'T4_apikey_mask'::TEXT,
    'APPLY_REQUIRED'::TEXT,
    'Verificar log de boot: [logpatch] T4 OK'::TEXT;

  RETURN QUERY SELECT
    'T5_cache_dump'::TEXT,
    'APPLY_REQUIRED'::TEXT,
    'Verificar log de boot: [logpatch] T5 OK — ForceUpdate 484 aplicado em 2026-07-10'::TEXT;

  RETURN QUERY SELECT
    'SUMMARY'::TEXT,
    CASE
      WHEN v_last_log.status = 'success' THEN 'PARTIAL_OK'
      ELSE 'NEEDS_VERIFICATION'
    END::TEXT,
    'ForceUpdate=484 | T1-T5 no logpatch | Verificar logs de boot do container evolution'::TEXT;
END;
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- E2-06: Restrict media pipeline health check to business hours (11h-23h UTC)
-- ──────────────────────────────────────────────────────────────────────────────
SELECT cron.unschedule('check-media-pipeline-health')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-media-pipeline-health');

SELECT cron.schedule(
  'check-media-pipeline-health',
  '*/15 11-23 * * *',
  'SELECT public.fn_check_media_pipeline_health()'
);
