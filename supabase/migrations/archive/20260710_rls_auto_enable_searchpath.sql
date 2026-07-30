-- ============================================================
-- MIGRATION: 20260710_rls_auto_enable_searchpath.sql
-- Bug: rls_auto_enable foi criado com SECURITY DEFINER mas
-- sem SET search_path, criando risco de schema injection
-- (ausente em verificacao secdef_sp_ok do MASTER check)
--
-- Fix: adicionar SET search_path = public, pg_catalog
-- Esta e a versao definitiva v3 do rls_auto_enable:
-- - search_path seguro
-- - schemas cobertos: public + evo + zapp + ops
-- - logging adequado
-- ============================================================

CREATE OR REPLACE FUNCTION rls_auto_enable()
RETURNS event_trigger LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
    -- Monitorar public, evo, zapp e ops
    IF cmd.schema_name IS NOT NULL
       AND cmd.schema_name IN ('public', 'evo', 'zapp', 'ops')
       AND cmd.schema_name NOT IN ('pg_catalog','information_schema')
       AND cmd.schema_name NOT LIKE 'pg_toast%'
       AND cmd.schema_name NOT LIKE 'pg_temp%'
    THEN
      BEGIN
        EXECUTE format('ALTER TABLE IF EXISTS %s ENABLE ROW LEVEL SECURITY',
                       cmd.object_identity);
        RAISE LOG 'rls_auto_enable: habilitou RLS em %', cmd.object_identity;
      EXCEPTION WHEN OTHERS THEN
        RAISE LOG 'rls_auto_enable: FALHOU em % : %', cmd.object_identity, SQLERRM;
      END;
    ELSE
      RAISE LOG 'rls_auto_enable: skip % (schema % nao monitorado)',
                cmd.object_identity, cmd.schema_name;
    END IF;
  END LOOP;
END;
$$;

-- VERIFICACOES
SELECT
  proname,
  prosecdef,
  proconfig IS NOT NULL AS has_searchpath,
  proconfig[1] AS searchpath_value,
  prosrc ILIKE '%evo%' AS covers_evo,
  prosrc ILIKE '%zapp%' AS covers_zapp,
  prosrc ILIKE '%ops%' AS covers_ops
FROM pg_proc WHERE proname='rls_auto_enable';
-- Esperado: prosecdef=true, has_searchpath=true, covers_evo/zapp/ops=true

-- Confirmar: zero funcs SECURITY DEFINER sem search_path
SELECT COUNT(*) AS sem_sp
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE prosecdef AND n.nspname IN ('public','ops','zapp')
  AND p.proname NOT ILIKE 'dblink%'
  AND (proconfig IS NULL OR NOT EXISTS(
    SELECT 1 FROM unnest(proconfig) c WHERE c ILIKE 'search_path=%'));
-- Esperado: 0
