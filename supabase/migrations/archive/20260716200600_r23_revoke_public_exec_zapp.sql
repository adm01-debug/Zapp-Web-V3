-- ============================================================
-- Migration: 20260716200600_r23_revoke_public_exec_zapp
-- Purpose  : Revogar PUBLIC EXECUTE de todas as funções em zapp
-- Root cause: Criação de trigger functions (RT09 fix) herdou
--   =X/postgres (PUBLIC EXECUTE) como base privilege PostgreSQL.
--   DEFAULT PRIVILEGES existente só adicionava authenticated/service_role
--   mas não revogava o PUBLIC base, causando anon_exe_evo_zapp_breach=3
-- Fix: REVOKE EXECUTE FROM PUBLIC em todas as funções + selar default ACL
-- Impacto: Nenhum - trigger functions não são chamadas diretamente por
--   usuários, são invocadas automaticamente pelo mecanismo de triggers
-- Applied  : 2026-07-16 live
-- Idempotent: YES
-- ============================================================

-- Step 1: Revogar PUBLIC EXECUTE de todas as funções existentes em zapp
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA zapp FROM PUBLIC;

-- Step 2: Selar default privileges - futuras funções não herdam PUBLIC EXECUTE
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA zapp
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Step 3: Verificar - deve ser 0 após aplicação
-- SELECT count(*) AS public_exec_zapp
-- FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
-- WHERE n.nspname='zapp'
--   AND EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,'{}')) a
--              WHERE a.grantee=0 AND a.privilege_type='EXECUTE');
-- Expected: 0

-- SELECT count(*) AS anon_breach
-- FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
-- WHERE n.nspname IN ('evo','zapp')
--   AND has_function_privilege('anon', p.oid, 'EXECUTE')
--   AND has_schema_privilege('anon', n.nspname, 'USAGE');
-- Expected: 0
