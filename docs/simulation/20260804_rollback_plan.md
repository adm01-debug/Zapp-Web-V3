# Rollback Plan — Integração Schema zapp × Front (2026-08-04)

> Snapshot tirado em 2026-08-04T12:52 BRT via pg_catalog (funções/views/publicação).
> Aplicável em até 48h pós-deploy. Todas as operações são reversíveis.

## 1. DB — reverter migrations (F-01/F-02/F-03/F-06)

```sql
-- Wrappers zapp (remover)
DROP FUNCTION IF EXISTS zapp.rpc_app_bootstrap();
DROP FUNCTION IF EXISTS zapp.rpc_dashboard_init(uuid, uuid, timestamptz, timestamptz);

-- Restaurar EXECUTE das originais public (authenticated volta a ter acesso direto)
GRANT EXECUTE ON FUNCTION public.rpc_app_bootstrap() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_dashboard_init(uuid, uuid, timestamptz, timestamptz) TO authenticated;

-- Grants F-03 (revogar — estado original: sem EXECUTE)
REVOKE EXECUTE ON FUNCTION zapp.fn_increment_meme_use(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.fn_toggle_user_meme_favorite(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.import_user_data(jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.rpc_list_failed_messages(text[],text,text,timestamptz,timestamptz,integer,integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.fn_safe_audit_log(text,text,uuid,text,text,jsonb,jsonb,jsonb,text) FROM authenticated;

-- fn_safe_audit_log: restaurar corpo ORIGINAL sem guard
-- (o corpo original está no snapshot: docs/simulation/20260804_db_snapshot — CREATE OR REPLACE com o corpo sem as 2 linhas de guard)

-- RPCs de schema drift (remover)
DROP FUNCTION IF EXISTS zapp.rpc_schema_columns(text);
DROP FUNCTION IF EXISTS zapp.rpc_schema_tables(text);
```

## 2. Front — reverter via git

```bash
git revert <merge-commit-do-PR>   # ou: git checkout main~1 -- src/features/inbox/components/useAudioMessagePlayer.ts ...
```
Arquivos tocados (rollback = git revert do commit do PR):
- src/integrations/zappweb/hooks/useZappConversations.ts
- src/integrations/zappweb/hooks/useZappMessages.ts
- src/features/inbox/components/useAudioMessagePlayer.ts
- src/features/admin/hooks/monitoring/useRetryMetrics.ts
- src/lib/schemaDrift.ts
- src/features/integrations/hooks/useEvolutionApiIntegration.ts
- src/hooks/useAppBootstrap.ts · src/hooks/useDashboardDataBatch.ts
- supabase/functions/evolution-credentials/index.ts
- scripts/audit-contract.mjs · eslint.config.js · .github/workflows/* · .github/PULL_REQUEST_TEMPLATE.md
- docs/SCHEMA_REFERENCE.md · docs/INTEGRATION_INVARIANTS.md · docs/CREDENTIAL-MAP.md

## 3. Edge function — redeploy da versão anterior

O GET original é preservado no handler (POST adicionado); rollback = deploy do commit anterior via pipeline.

## 4. Notas de segurança (decisões documentadas)

- `fn_toggle_user_meme_favorite(uuid,uuid)` NÃO foi grantado: sem guard interno, aceita p_user_id arbitrário (favorecer como outro usuário). Overload 1-arg (com guard auth.uid) é o usado pelo front.
- `public.rpc_app_bootstrap/rpc_dashboard_init` tiveram EXECUTE revogado de authenticated (service_role only); o front passa a usar wrappers zapp (SECURITY DEFINER, search_path fixo). Rollback = re-grant acima.
- `fn_safe_audit_log` recebeu guard (auth.uid IS NULL → raise; performed_by ≠ auth.uid e não admin/supervisor → raise) ANTES do grant.
- PGRST_DB_SCHEMAS intocado (public,zapp,storage,graphql_public,artes,vendas,financeiro). evo/email_app NUNCA adicionar.
