-- =============================================================================
-- F12 (P1): linkage fixes no Supabase canônico — realtime + view de auditoria
-- Prefixo reservado: 20260806210200 (agente F12)
-- Data: 2026-08-07
-- -----------------------------------------------------------------------------
-- 1) P1 realtime: zapp.security_acl_alerts entra na publicação supabase_realtime
--    (consumidor ativo: src/hooks/useACLAlerts.ts — postgres_changes INSERT/UPDATE
--    em schema zapp, tabela security_acl_alerts). Idempotente: DO block verifica
--    pg_publication_tables antes de ALTER PUBLICATION.
-- 2) P1 view: zapp.v_security_audit espelhando evo.v_security_audit
--    (pg_get_viewdef('evo.v_security_audit') — mesmas colunas e lógica, com o
--    namespace apontando para 'zapp'), WITH (security_invoker=true) + GRANT SELECT
--    TO authenticated. Corrige PGRST205 silencioso do AuditEvidenceDashboard.tsx
--    (safeClient schema 'zapp' consulta v_security_audit).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Realtime: publicar zapp.security_acl_alerts (idempotente)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'zapp'
      AND tablename = 'security_acl_alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.security_acl_alerts;
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- 2) View de auditoria: zapp.v_security_audit (espelho de evo.v_security_audit)
--    com security_invoker=true — evita PGRST205 no AuditEvidenceDashboard.tsx.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW zapp.v_security_audit
WITH (security_invoker = true) AS
WITH fns AS (
         SELECT 'FUNCTION'::text AS object_type,
            pg_proc.proname AS name,
                CASE pg_proc.prokind
                    WHEN 'f'::"char" THEN 'function'::text
                    WHEN 'p'::"char" THEN 'procedure'::text
                    ELSE 'trigger'::text
                END AS subtype,
            true AS security_definer,
            NOT has_function_privilege('anon'::name, pg_proc.oid, 'EXECUTE'::text) AS anon_blocked,
            NULL::boolean AS rls_enabled,
            NULL::bigint AS policy_count,
                CASE
                    WHEN has_function_privilege('anon'::name, pg_proc.oid, 'EXECUTE'::text) THEN '⚠ EXPOSTO a anon'::text
                    ELSE '✓ bloqueado'::text
                END AS status
           FROM pg_proc
          WHERE pg_proc.pronamespace = 'zapp'::regnamespace::oid AND pg_proc.prosecdef = true
        ), tbls AS (
         SELECT 'TABLE'::text AS object_type,
            c.relname AS name,
            'table'::text AS subtype,
            NULL::boolean AS security_definer,
            NOT (has_table_privilege('anon'::name, c.oid, 'SELECT'::text) OR has_table_privilege('anon'::name, c.oid, 'INSERT'::text)) AS anon_blocked,
            c.relrowsecurity AS rls_enabled,
            count(p.oid) AS policy_count,
                CASE
                    WHEN NOT c.relrowsecurity THEN '⚠ SEM RLS'::text
                    WHEN has_table_privilege('anon'::name, c.oid, 'SELECT'::text) OR has_table_privilege('anon'::name, c.oid, 'INSERT'::text) THEN '⚠ anon tem acesso'::text
                    WHEN count(p.oid) = 0 THEN '✓ deny-all'::text
                    ELSE '✓ policies definidas'::text
                END AS status
           FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             LEFT JOIN pg_policy p ON p.polrelid = c.oid
          WHERE n.nspname = 'zapp'::name AND c.relkind = 'r'::"char"
          GROUP BY c.relname, c.relrowsecurity, c.oid
        )
 SELECT fns.object_type,
    fns.name,
    fns.subtype,
    fns.security_definer,
    fns.anon_blocked,
    fns.rls_enabled,
    fns.policy_count,
    fns.status
   FROM fns
UNION ALL
 SELECT tbls.object_type,
    tbls.name,
    tbls.subtype,
    tbls.security_definer,
    tbls.anon_blocked,
    tbls.rls_enabled,
    tbls.policy_count,
    tbls.status
   FROM tbls;

-- -----------------------------------------------------------------------------
-- 3) Grant de leitura para authenticated (mesmo padrão de evo.v_security_audit)
-- -----------------------------------------------------------------------------
GRANT SELECT ON zapp.v_security_audit TO authenticated;
