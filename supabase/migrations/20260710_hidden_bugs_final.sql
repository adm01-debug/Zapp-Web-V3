-- ============================================================
-- MIGRATION: 20260710_hidden_bugs_final.sql
-- Bugs descobertos nos testes de validacao final
--
-- Bug 1: public.databasechangelog sem PRIMARY KEY
--   Tabela do Liquibase (owner: metabase_user) sem PK formal
--   Fix: ADD CONSTRAINT databasechangelog_pkey PRIMARY KEY (id, author, filename)
--   (executado via supabase_admin por ownership)
--
-- Bug 2: public.prevent_role_escalation SECURITY DEFINER sem search_path
--   Trigger critico de seguranca que previne escalada de roles
--   Chama auth.uid() e public.is_admin_or_supervisor()
--   Fix: ALTER FUNCTION SET search_path = public, auth, extensions, pg_catalog
--
-- Score: 98.8/A+ (158/160) → 100.0/A+ (160/160)
-- ============================================================

-- FIX 1: PK em databasechangelog (Liquibase padrao)
-- Verificar duplicatas primeiro
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='databasechangelog'
      AND constraint_type='PRIMARY KEY'
  ) THEN
    ALTER TABLE public.databasechangelog
      ADD CONSTRAINT databasechangelog_pkey PRIMARY KEY (id, author, filename);
    RAISE NOTICE 'PK adicionada em databasechangelog';
  ELSE
    RAISE NOTICE 'PK ja existe em databasechangelog';
  END IF;
END $$;

-- FIX 2: search_path em prevent_role_escalation
-- Este trigger protege profiles contra escalada de roles
-- Requer access a auth.uid() e public.is_admin_or_supervisor()
ALTER FUNCTION public.prevent_role_escalation()
  SET search_path = public, auth, extensions, pg_catalog;

-- VERIFICACOES POS-DEPLOY
-- 1. PK via pg_constraint (mais confiavel que information_schema)
SELECT c.conname AS pk_name, c.contype AS type
FROM pg_constraint c
JOIN pg_class cl ON cl.oid=c.conrelid
JOIN pg_namespace n ON n.oid=cl.relnamespace
WHERE cl.relname='databasechangelog' AND n.nspname='public' AND c.contype='p';
-- Esperado: databasechangelog_pkey, type='p'

-- 2. search_path na funcao de seguranca
SELECT proname, proconfig[1] AS sp
FROM pg_proc WHERE proname='prevent_role_escalation';
-- Esperado: search_path=public, auth, extensions, pg_catalog

-- 3. Zero SECDEF sem search_path
SELECT COUNT(*) AS sem_sp
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE prosecdef AND n.nspname IN ('public','ops','zapp')
  AND p.proname NOT ILIKE 'dblink%'
  AND (proconfig IS NULL OR NOT EXISTS(
    SELECT 1 FROM unnest(proconfig) c WHERE c ILIKE 'search_path=%'));
-- Esperado: 0

-- 4. Score 100.0/A+
SELECT (fn_system_health_score()->>'score')::numeric=100.0 AS score_100,
       fn_system_health_score()->>'grade'='A+' AS grade_aplus,
       (fn_system_health_score()->'breakdown'->'pk_integrity'->>'tables_no_pk')::int=0 AS pk_ok;
-- Esperado: todos true
