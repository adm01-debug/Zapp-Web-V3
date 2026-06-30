-- =====================================================================
-- audit-rls-state.sql  —  Auditoria de segurança do ESTADO VIVO do banco
-- =====================================================================
-- POR QUE ESTE SCRIPT: a pasta supabase/migrations é histórico append-only.
-- Uma migration posterior pode ter restringido uma policy criada antes com
-- USING (true). Logo, "grepar migrations" mede o HISTÓRICO, não o estado real.
-- A verdade está aqui (pg_policies / pg_proc). Rode no banco de produção
-- CORRETO do zapp (o que tem chat_messages, inbox_conversations, etc.).
--
-- É 100% somente-leitura. Não altera nada. Apenas relata + GERA os comandos
-- de correção para você revisar e aplicar como migration.
-- =====================================================================

\echo '=== 1) RESUMO ==='
SELECT
  (SELECT count(*) FROM pg_policies WHERE schemaname='public')                              AS total_policies,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND qual='true')              AS open_read_using_true,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND with_check='true')        AS open_write_withcheck_true,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=false)                 AS tables_rls_disabled,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.prosecdef
       AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%'))
                                                                                            AS secdef_missing_search_path;

\echo '=== 2) POLICIES ABERTAS (USING true / WITH CHECK true) — priorizar tabelas sensíveis ==='
SELECT schemaname, tablename, policyname, cmd,
       roles::text,
       CASE WHEN qual='true' THEN 'READ ABERTO' ELSE '' END AS read_flag,
       CASE WHEN with_check='true' THEN 'WRITE ABERTO' ELSE '' END AS write_flag
FROM pg_policies
WHERE schemaname='public' AND (qual='true' OR with_check='true')
ORDER BY
  (tablename = ANY (ARRAY['chat_messages','inbox_conversations','file_attachments',
                          'audit_logs','message_queue','evolution_instances',
                          'whatsapp_sessions','contacts','organization_members'])) DESC,
  tablename, policyname;

\echo '=== 3) TABELAS PUBLIC SEM RLS HABILITADO ==='
SELECT n.nspname AS schema, c.relname AS table_name
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=false
ORDER BY c.relname;

\echo '=== 4) GERA ALTERs p/ funções SECURITY DEFINER SEM search_path (revise e aplique como migration) ==='
SELECT format(
  'ALTER FUNCTION %I.%I(%s) SET search_path = '''';',
  n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
) AS fix_statement
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef
  AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%')
ORDER BY p.proname;

-- =====================================================================
-- PLAYBOOK DE REMEDIAÇÃO (RLS aberto) — NÃO automatizável às cegas:
--   1. Para cada tabela da seção (2), identifique a coluna de tenant/owner
--      (ex.: organization_id, user_id) e troque:
--         USING (true)            ->  USING (organization_id = (auth.jwt() ->> 'org_id')::uuid)
--         WITH CHECK (true)       ->  WITH CHECK (organization_id = (auth.jwt() ->> 'org_id')::uuid)
--      (ajuste ao modelo multi-tenant real — via organization_members se aplicável).
--   2. Faça em uma migration por lote, começando pelas tabelas sensíveis.
--   3. Teste leitura/escrita por papel ANTES de promover a produção.
-- =====================================================================
