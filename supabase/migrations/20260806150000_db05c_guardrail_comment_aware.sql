-- ============================================================================
-- DB05C — Guardrail comment-aware (falso positivo Q-1 por comentários)
-- ============================================================================
-- Tipo: FIX do guardrail de integridade de referências (Etapa 29, Opção B).
--
-- PROBLEMA (achado AG-EX-10, 2026-08-06): a Q-1 canônica casava textos em
--   comentários '--' do corpo de zapp.fn_register_instance que DOCUMENTAM o
--   bug antigo ('evo.instance_registry (inexistente)', 'evo.evolution_webhook_events
--   (tabela inexistente)') → 2 falsos positivos → ops.fn_check_reference_integrity()
--   registrava score 98/issues 2 mesmo com DB-01/02/03 100% resolvidos
--   (prova: Q-1 com regexp_replace de comentários = 0 linhas).
--
-- FIX: remover comentários '--' antes do regexp match (Q-1 e Q-2). O mesmo
--   ajuste foi aplicado em scripts/sql/check-reference-integrity.sql (CI).
--
-- Rollback: CREATE OR REPLACE da versão anterior (20260806125500) — reverter
--   o regexp_replace na Q-1/Q-2.
-- ============================================================================

CREATE OR REPLACE FUNCTION ops.fn_check_reference_integrity()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ops', 'pg_catalog', 'cron'
AS $function$
DECLARE
  v_fn_obj   jsonb;
  v_cron_fn  jsonb;
  v_n_pend   int;
  v_score    int;
BEGIN
  WITH fns AS (
    SELECT p.proname, p.prosrc FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'zapp'::regnamespace
      AND p.prolang IN (SELECT oid FROM pg_catalog.pg_language WHERE lanname IN ('plpgsql','sql'))
      AND p.prosrc IS NOT NULL),
  calls AS (
    SELECT f.proname AS caller, m[1] AS sch, m[2] AS callee
    FROM fns f, LATERAL pg_catalog.regexp_matches(
           pg_catalog.regexp_replace(f.prosrc, '--[^\n]*', '', 'g'),
           '(zapp|public|evo|email_app|auth)\.([a-z_][a-z0-9_]+)\s*\(','g') AS m),
  pend AS (
    SELECT c.sch, c.callee, count(DISTINCT c.caller) AS callers,
           (array_agg(DISTINCT c.caller ORDER BY c.caller))[1:8] AS sample
    FROM calls c
    WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.proname=c.callee
            AND p.pronamespace=(SELECT oid FROM pg_catalog.pg_namespace WHERE nspname=c.sch))
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class x WHERE x.relname=c.callee
            AND x.relnamespace=(SELECT oid FROM pg_catalog.pg_namespace WHERE nspname=c.sch)
            AND x.relkind IN ('r','v','m','p','f'))
    GROUP BY c.sch, c.callee)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('schema', sch, 'callee', callee, 'callers', callers, 'sample', sample) ORDER BY callers DESC), '[]'::jsonb)
    INTO v_fn_obj FROM pend;

  WITH j AS (SELECT jobid, jobname, command FROM cron.job),
  calls AS (SELECT jobid, jobname, m[1] AS sch, m[2] AS fn
    FROM j, LATERAL pg_catalog.regexp_matches(
           pg_catalog.regexp_replace(command, '--[^\n]*', '', 'g'),
           '(zapp|public|evo|email_app)\.([a-z_][a-z0-9_]+)\s*\(','g') AS m),
  pend AS (
    SELECT c.sch, c.fn, count(DISTINCT c.jobid) AS jobs,
           (array_agg(DISTINCT c.jobname ORDER BY c.jobname))[1:6] AS sample_jobs
    FROM calls c
    WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.proname=c.fn
            AND p.pronamespace=(SELECT oid FROM pg_catalog.pg_namespace WHERE nspname=c.sch))
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class x WHERE x.relname=c.fn
            AND x.relnamespace=(SELECT oid FROM pg_catalog.pg_namespace WHERE nspname=c.sch))
    GROUP BY c.sch, c.fn)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('schema', sch, 'function', fn, 'jobs', jobs, 'sample_jobs', sample_jobs) ORDER BY jobs DESC), '[]'::jsonb)
    INTO v_cron_fn FROM pend;

  v_n_pend := jsonb_array_length(v_fn_obj) + jsonb_array_length(v_cron_fn);
  v_score  := 100 - v_n_pend;

  INSERT INTO ops._infra_check_log(score, max_score, issues, detail, checked_at)
  VALUES (v_score, 100, v_n_pend,
          jsonb_build_object(
            'check', 'reference_integrity',
            'n_fn_obj', jsonb_array_length(v_fn_obj),
            'n_cron_fn', jsonb_array_length(v_cron_fn),
            'fn_obj_pend', v_fn_obj,
            'cron_fn_pend', v_cron_fn
          ),
          now());

  RETURN jsonb_build_object(
    'status', CASE WHEN v_n_pend = 0 THEN 'OK' ELSE 'PENDING_REFERENCES' END,
    'n_fn_obj', jsonb_array_length(v_fn_obj),
    'n_cron_fn', jsonb_array_length(v_cron_fn),
    'n_pend', v_n_pend,
    'score', v_score,
    'max_score', 100,
    'checked_at', now(),
    'fn_obj_pend', v_fn_obj,
    'cron_fn_pend', v_cron_fn
  );
END;
$function$
;
