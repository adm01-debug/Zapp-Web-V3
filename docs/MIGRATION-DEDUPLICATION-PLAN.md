# Plano de Deduplicação de Migrations

## Contexto

O Supabase aplica migrations em ordem alfabética pelo nome do arquivo.
Arquivos com o mesmo prefixo de timestamp (YYYYMMDDHHMMSS) causam comportamento
indeterminado: a ordem de aplicação depende da parte textual do nome, e o rastreador
de migrations (`schema_migrations`) pode registrar apenas um dos dois.

**IMPORTANTE:** Migrations com timestamp duplicado que já foram aplicadas em produção
NÃO devem ser renomeadas — o rastreador reconhece por nome e renomear criar uma
migração "nova" não rastreada que seria re-aplicada.

## Duplicatas Detectadas

| Timestamp | Arquivo 1 | Arquivo 2 | Possivelmente Aplicada? |
|-----------|-----------|-----------|------------------------|
| `20260716200000` | `login_attempts_email_unique.sql` | `r23_p0_revoke_anon_schema_grants.sql` | ✅ Sim |
| `20260716210000` | `login_attempts_escalation_note.sql` | `r24_rt05_rt17_fixes.sql` | ✅ Sim |
| `20260717200000` | `fix_search_contacts_dispatch_cursor.sql` | `schema_hardening_v12.sql` | ✅ Sim |
| `20260717210000` | `10_10_final_improvements.sql` | `schema_hardening_v13_fix_connection_history.sql` | ✅ Sim |
| `20260717220000` | `fix_search_contacts_varchar_cast.sql` | `schema_hardening_v14_enum_constraints.sql` | ✅ Sim |
| `20260725000001` | `create_zapp_views_for_missing_edge_function_tables_batch2.sql` | `performance_indexes.sql` | ⚠️ Verificar |
| `20260725000002` | `business_analytics.sql` | `create_zapp_views_shared_module_tables.sql` | ⚠️ Verificar |
| `20260725000003` | `create_zapp_views_remaining_edge_function_tables.sql` | `feature_flags.sql` | ⚠️ Verificar |

## Procedimento de Resolução (requer DBA)

Para cada par de duplicatas que AINDA NÃO foram aplicadas a produção:

```sql
-- 1. Verificar quais já foram aplicadas
SELECT version FROM supabase_migrations.schema_migrations
WHERE version IN (
  '20260716200000', '20260716210000', '20260717200000',
  '20260717210000', '20260717220000',
  '20260725000001', '20260725000002', '20260725000003'
)
ORDER BY version;

-- 2. Para versões com DOIS arquivos mas apenas UMA entrada na tabela:
--    identificar qual foi aplicado, renomear apenas o que NÃO foi
SELECT version, name FROM supabase_migrations.schema_migrations
WHERE version LIKE '202607%'
ORDER BY version;
```

Após identificar arquivos seguros para renomear:

```bash
# Renomear o arquivo MENOS CRÍTICO de cada par (o segundo na ordem alfa)
# Usar timestamp +1 para manter a ordem lógica
# Exemplo:
git mv supabase/migrations/20260725000001_performance_indexes.sql \
       supabase/migrations/20260725000013_performance_indexes.sql

# Registrar a renomeação na tabela (se o arquivo foi aplicado com o nome antigo)
psql "$SUPABASE_DB_URL" << 'SQL'
UPDATE supabase_migrations.schema_migrations
SET version = '20260725000013', name = '20260725000013_performance_indexes'
WHERE version = '20260725000001' AND name LIKE '%performance_indexes%';
SQL
```

## Prevenção de Novos Duplicados

O workflow `migration-uniqueness.yml` bloqueia PRs com duplicatas novas.
Esta proteção está ativa desde o commit `a79b011`.

## Status

| Item | Status |
|------|--------|
| CI gate ativo (migration-uniqueness.yml) | ✅ Prevenção de novos duplicados |
| Auditoria de duplicatas pré-existentes | ✅ Documentada acima |
| Renomeação segura com UPDATE schema_migrations | ⏳ Pendente autorização DBA |
| Verificação pós-renomeação em staging | ⏳ Pendente staging estar disponível |
