-- ═══════════════════════════════════════════════════════════════════════════════
-- DB05B — Guardrail de integridade de referências (Etapa 29, Opção B — cron/ops)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Cria ops.fn_check_reference_integrity() (SECURITY DEFINER, read-only) que roda
-- as queries do guardrail REF-INT:
--   Q-1: função em `zapp` → objeto inexistente (função/tabela/view/matview/
--        partição/foreign table) em zapp/public/evo/email_app/auth
--   Q-2: cron.job.command → função inexistente
-- Grava o resultado em ops._infra_check_log (score = 100 - pendências,
-- max_score = 100, issues = n_pend, detail = jsonb com as pendências) e
-- retorna jsonb com o resumo — NUNCA levanta exceção (fail-soft; o gate
-- fail-closed é o workflow db-reference-integrity.yml via scripts/sql/check-reference-integrity.sql).
--
-- Registra o cron job diário `reference-integrity-daily` ('0 8 * * *' UTC)
-- via cron.schedule, com upsert idempotente (unschedule se já existir).
--
-- Baseline 2026-08-05: Q-1 = 3 (DB-01/02/03, corrigidos nas fases 2-4),
-- Q-2 = 0. Aplicado APÓS as correções — pendências remanescentes devem ser 0.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ops.fn_check_reference_integrity()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'ops', 'pg_catalog', 'cron'
AS $function$
DECLARE
  v_fn_obj   jsonb;  -- pendências Q-1 (detalhe)
  v_cron_fn  jsonb;  -- pendências Q-2 (detalhe)
  v_n_pend   int;
  v_score    int;
BEGIN
  -- Q-1 — função → objeto inexistente (schemas zapp/public/evo/email_app/auth)
  WITH fns AS (
    SELECT p.proname, p.prosrc FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'zapp'::regnamespace
      AND p.prolang IN (SELECT oid FROM pg_catalog.pg_language WHERE lanname IN ('plpgsql','sql'))
      AND p.prosrc IS NOT NULL),
  calls AS (
    SELECT f.proname AS caller, m[1] AS sch, m[2] AS callee
    FROM fns f, LATERAL pg_catalog.regexp_matches(f.prosrc,'(zapp|public|evo|email_app|auth)\.([a-z_][a-z0-9_]+)\s*\(','g') AS m),
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

  -- Q-2 — cron job → função inexistente
  WITH j AS (SELECT jobid, jobname, command FROM cron.job),
  calls AS (SELECT jobid, jobname, m[1] AS sch, m[2] AS fn
    FROM j, LATERAL pg_catalog.regexp_matches(command,'(zapp|public|evo|email_app)\.([a-z_][a-z0-9_]+)\s*\(','g') AS m),
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
$function$;

-- Cron job diário (upsert idempotente): 08:00 UTC
DO $$
BEGIN
  PERFORM cron.unschedule('reference-integrity-daily')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reference-integrity-daily');

  PERFORM cron.schedule(
    'reference-integrity-daily',
    '0 8 * * *',
    'SELECT ops.fn_check_reference_integrity()'
  );
END $$;
