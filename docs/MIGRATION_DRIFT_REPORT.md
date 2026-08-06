# Migration Drift Report

**Data**: 2026-08-06  
**Gerado por**: Auditoria automatizada  
**Status**: Parcial — requer acesso ao banco para lista completa

## Problema

Aproximadamente 15 versões de migration foram aplicadas diretamente no banco de dados de produção via MCP/SQL sem que os arquivos `.sql` correspondentes existam no filesystem `supabase/migrations/`.

Isso cria um **drift** entre o estado do banco e o estado do código — migrações aplicadas no banco não são rastreadas no Git.

## Risco

| Risco | Severidade | Impacto |
|-------|-----------|---------|
| Perda de migrações em restore | 🔴 Crítico | Banco restaurado ficaria sem as migrações perdidas |
| Inconsistência em novas instâncias | 🟠 Alto | Deploy em novo ambiente falharia |
| Impossibilidade de rollback | 🟠 Alto | Sem arquivo SQL, rollback manual é difícil |
| Desconhecimento do estado real | 🟡 Médio | Time não sabe o que foi aplicado |

## Migrações com Drift Conhecido

As seguintes migrações foram aplicadas via MCP mas podem não ter arquivo SQL correspondente:

| Migration | Conteúdo | Status do Arquivo |
|-----------|---------|------------------|
| `20260717000002_create_missing_rpcs_stubs.sql` | RPCs stubs (initiate_gmail_oauth, etc.) | ⚠️ Verificar |
| `20260721_fix_cursor_rpcs_and_search_path.sql` | Fix search_path + dispatch_error_logs | ⚠️ Verificar |
| Outras ~13 | Desconhecido — aplicadas via MCP | ❌ Sem arquivo |

## Ação Recomendada

1. **Inventariar**: `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 30;`
2. **Comparar**: verificar quais versões têm arquivo em `supabase/migrations/`
3. **Retrocriar**: para cada versão sem arquivo, criar o `.sql` reconstruindo do `pg_dump`
4. **Proteger**: adicionar hook de CI que rejeita deploy se `schema_migrations` divergir do filesystem

## Comandos para Diagnóstico

```sql
-- Versões no banco (via Supabase MCP)
SELECT version, inserted_at 
FROM supabase_migrations.schema_migrations 
ORDER BY inserted_at DESC 
LIMIT 30;
```

```bash
# Versões no filesystem
ls supabase/migrations/ | sort -r | head -30
```

## Próximo Passo

Executar diagnóstico via Supabase MCP para inventário completo. Tarefa pendente de alta prioridade.
