-- ============================================================================
-- AUDITORIA DE SEGURANÇA RLS / SECURITY DEFINER  (somente leitura)
-- Rodar na base viva — NÃO altera nada.
-- Objetivo: listar a superfície real (estado vivo), não o histórico de migrations.
-- ============================================================================

-- 1) Políticas permissivas demais: USING (true) ou WITH CHECK (true)
SELECT schemaname, tablename, policyname, cmd, roles,
       qual        AS using_expr,
       with_check  AS check_expr
FROM pg_policies
WHERE schemaname NOT IN ('pg_catalog','information_schema')
  AND ( qual = 'true' OR with_check = 'true' )
ORDER BY schemaname, tablename, policyname;

-- 2) Tabelas com RLS habilitado porém SEM nenhuma policy (bloqueio total acidental)
SELECT n.nspname AS schema, c.relname AS tabela
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND c.relrowsecurity
  AND n.nspname NOT IN ('pg_catalog','information_schema')
  AND NOT EXISTS (SELECT 1 FROM pg_policies p
                  WHERE p.schemaname = n.nspname AND p.tablename = c.relname)
ORDER BY 1,2;

-- 3) Tabelas em schema public SEM RLS habilitado (expostas via PostgREST)
SELECT n.nspname AS schema, c.relname AS tabela
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND NOT c.relrowsecurity AND n.nspname = 'public'
ORDER BY 1,2;

-- 4) Funções SECURITY DEFINER SEM SET search_path (risco de privilege escalation)
SELECT n.nspname AS schema, p.proname AS funcao,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prosecdef
  AND n.nspname NOT IN ('pg_catalog','information_schema')
  AND NOT EXISTS (
    SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) cfg
    WHERE cfg LIKE 'search_path=%'
  )
ORDER BY 1,2;

-- 5) Funções SECURITY DEFINER com GRANT EXECUTE para anon/authenticated
SELECT n.nspname AS schema, p.proname AS funcao, acl.grantee::regrole AS grantee
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(p.proacl) acl
WHERE p.prosecdef
  AND acl.privilege_type = 'EXECUTE'
  AND acl.grantee::regrole::text IN ('anon','authenticated')
ORDER BY 1,2;
