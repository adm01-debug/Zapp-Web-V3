-- Migration: revoke_excessive_grants_control_tables
-- Applied: 2026-08-07 | M-6 do AUDIT_REPORT_2026-08-06.md
-- Remove GRANT excessivo de 'authenticated' em tabelas de controle interno.
-- Seguro: RLS permanece ativo em todas (belt-and-suspenders).

-- schema_migrations (zapp): nenhuma razão de app para acesso direto
REVOKE ALL ON zapp.schema_migrations FROM authenticated;

-- role_permissions: mantém SELECT (RBAC lê roles próprias via RLS)
-- revoga DML (escritas devem ir via RPC/service_role)
REVOKE INSERT, UPDATE, DELETE ON zapp.role_permissions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.role_permissions FROM authenticated;

-- processed_webhook_events: idempotência de webhook → edge functions usam service_role
REVOKE ALL ON zapp.processed_webhook_events FROM authenticated;
REVOKE ALL ON public.processed_webhook_events FROM authenticated;

-- Verificação pós-aplicação esperada:
--   has_table_privilege('authenticated','zapp.role_permissions','SELECT') = TRUE
--   has_table_privilege('authenticated','zapp.role_permissions','INSERT') = FALSE
--   has_table_privilege('authenticated','zapp.schema_migrations','SELECT') = FALSE
