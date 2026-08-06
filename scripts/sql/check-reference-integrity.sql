-- ═══════════════════════════════════════════════════════════════════════════════
-- REF-INT — integridade de referências (Etapa 29): nenhuma referência pendurada
-- ═══════════════════════════════════════════════════════════════════════════════
-- Q-1: função em `zapp` → objeto (função/tabela/view/matview/partição/foreign
--      table) inexistente em zapp/public/evo/email_app/auth. Fonte: pg_catalog.
-- Q-2: cron.job.command → função inexistente. Fonte: cron.job.
--
-- READ-ONLY (apenas SELECT em catálogos + cron.job). Falha (psql ON_ERROR_STOP
-- + RAISE EXCEPTION) se existir qualquer pendência; imprime REFERENCE_INTEGRITY_OK
-- quando limpo.
--
-- Baseline 2026-08-05: Q-1 = 3 pendências (exatamente DB-01/02/03 do plano
-- 30 etapas), Q-2 = 0. Gate ativado após as correções — daqui em diante, qualquer
-- referência pendurada reprova o CI.
--
-- Uso local ou na VPS:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/sql/check-reference-integrity.sql
-- ═══════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

DO $$
DECLARE
  n_fn_obj  int;
  n_cron_fn int;
BEGIN
  -- Q-1 — Função → objeto inexistente (scan principal, schemas zapp/public/evo/email_app/auth)
  -- Comentários '--' são removidos antes do match: documentação de bugs antigos no corpo
  -- (ex.: fn_register_instance cita 'evo.instance_registry (inexistente)') não pode gerar
  -- falso positivo (fix 2026-08-06, achado AG-EX-10).
  WITH fns AS (
    SELECT p.proname, p.prosrc FROM pg_proc p
    WHERE p.pronamespace='zapp'::regnamespace
      AND p.prolang IN (SELECT oid FROM pg_language WHERE lanname IN ('plpgsql','sql'))
      AND p.prosrc IS NOT NULL),
  calls AS (
    SELECT f.proname AS caller, m[1] AS sch, m[2] AS callee
    FROM fns f, LATERAL regexp_matches(regexp_replace(f.prosrc, '--[^\n]*', '', 'g'),'(zapp|public|evo|email_app|auth)\.([a-z_][a-z0-9_]+)\s*\(','g') AS m)
  SELECT count(*) INTO n_fn_obj FROM calls c
  WHERE NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.proname=c.callee
        AND p.pronamespace=(SELECT oid FROM pg_namespace WHERE nspname=c.sch))
    AND NOT EXISTS (SELECT 1 FROM pg_class x WHERE x.relname=c.callee
        AND x.relnamespace=(SELECT oid FROM pg_namespace WHERE nspname=c.sch)
        AND x.relkind IN ('r','v','m','p','f'));

  -- Q-2 — Cron job → função inexistente (mesma remoção de comentários por robustez)
  WITH j AS (SELECT jobid, jobname, command FROM cron.job),
  calls AS (SELECT jobid, jobname, m[1] sch, m[2] fn
    FROM j, LATERAL regexp_matches(regexp_replace(command, '--[^\n]*', '', 'g'),'(zapp|public|evo|email_app)\.([a-z_][a-z0-9_]+)\s*\(','g') m)
  SELECT count(*) INTO n_cron_fn FROM calls c
  WHERE NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.proname=c.fn
        AND p.pronamespace=(SELECT oid FROM pg_namespace WHERE nspname=c.sch))
    AND NOT EXISTS (SELECT 1 FROM pg_class x WHERE x.relname=c.fn
        AND x.relnamespace=(SELECT oid FROM pg_namespace WHERE nspname=c.sch));

  RAISE NOTICE '[REF-INT] Q-1 função→objeto: % pendência(s); Q-2 cron→função: % pendência(s)', n_fn_obj, n_cron_fn;

  IF n_fn_obj > 0 OR n_cron_fn > 0 THEN
    RAISE EXCEPTION 'REFERENCE_INTEGRITY: % pendência(s) função→objeto, % pendência(s) cron→função', n_fn_obj, n_cron_fn;
  END IF;
END $$;

SELECT 'REFERENCE_INTEGRITY_OK' AS status;
