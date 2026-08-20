# ML-004: Hardening de RLS em Tabelas de Idempotência/Telemetria

> **Implementado em:** `20260819153000` (enable RLS) + `20260819160000` (revogar authenticated)
> **PRs:** [#1323](https://github.com/adm01-debug/Zapp_Web_V3/pull/1323) (apenas ENABLE RLS, no-op) → [#1327](https://github.com/adm01-debug/Zapp_Web_V3/pull/1327) (revogação real)
> **Data:** 2026-08-19
> **Status:** ✅ Aplicado em produção — verificado via MCP Supabase

## Contexto

As tabelas `zapp.ai_function_metrics` e `zapp.processed_requests` foram criadas na migration `20260804210923` com `GRANT SELECT, INSERT, DELETE ON ... TO authenticated`. Isso permitia que **qualquer usuário autenticado** escrevesse/desse delete diretamente nessas tabelas, mesmo que o RLS estivesse configurado com policy `service_only`.

**Problema:** A role `authenticated` tem permissões de escrita que contradizem o princípio de acesso exclusivo via `service_role` (RPCs SECURITY DEFINER). O RLS sozinho (policies) não é suficiente — grants diretos criam backdoor.

## Mudanças

### 1. `20260819153000` — ENABLE RLS idempotente (PR [#1323](https://github.com/adm01-debug/Zapp_Web_V3/pull/1323))
- Adiciona `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` idempotente para ambas as tabelas
- Verifica se RLS já está ativo (`SELECT relrowsecurity`) antes de aplicar
- É no-op em produção (RLS já ativo via migration `20260807270000`)

### 2. `20260819160000` — Revogar `authenticated` (PR [#1327](https://github.com/adm01-debug/Zapp_Web_V3/pull/1327), o verdadeiro fix)
- `REVOKE ALL ON TABLE ... FROM authenticated` — remove SELECT/INSERT/DELETE/UPDATE
- `GRANT ALL ON TABLE ... TO service_role` — mantém acesso para RPCs
- Só `service_role` (bypass RLS) + `supabase_admin` preservam acesso

## Verificação em Produção

Após merge, as migrations foram registradas em `supabase_migrations.schema_migrations`:

```sql
SELECT version, name, executed_at
FROM supabase_migrations.schema_migrations
WHERE version >= '2026081915';
```

**Grants atuais (verificado 2026-08-20 via MCP Supabase):**

| Tabela | Grantee | Privilégios |
|--------|---------|-------------|
| `zapp.ai_function_metrics` | `service_role` | ALL (DELETE, INSERT, SELECT, UPDATE, TRIGGER, REFERENCES, TRUNCATE) |
| `zapp.processed_requests` | `service_role` | ALL (DELETE, INSERT, SELECT, UPDATE, TRIGGER, REFERENCES, TRUNCATE) |

**RLS ativo:**

| Tabela | relrowsecurity | Policies |
|--------|---------------|----------|
| `zapp.ai_function_metrics` | `true` | 1 (service_only) |
| `zapp.processed_requests` | `true` | 1 (service_only) |

**Zero linhas** em `information_schema.role_table_grants` para `authenticated` — revogação confirmada.

## Padrão para futuras correções

Sempre que encontrar `GRANT ... TO authenticated` em migrations de tabelas sensíveis:

1. **Verificar** se RLS já está ativo (`relrowsecurity`)
2. **Criar policy service_only** (se não existir): `USING (true)` com grantee `service_role`
3. **Revogar authenticated:** `REVOKE ALL ON ... FROM authenticated`
4. **Garantir service_role:** `GRANT ALL ON ... TO service_role`
5. **Migration aditiva** (nunca modificar migration já existente)
6. **Validar em produção** via MCP antes de encerrar

## Comando de validação

```sql
-- Verificar grants de authenticated
SELECT table_schema, table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'zapp'
  AND table_name IN ('ai_function_metrics', 'processed_requests')
  AND grantee = 'authenticated'
ORDER BY table_name;
-- Deve retornar 0 linhas

-- Verificar RLS
SELECT c.relname, c.relrowsecurity, count(p.oid) AS n_policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'zapp'
  AND c.relname IN ('ai_function_metrics', 'processed_requests')
GROUP BY c.relname, c.relrowsecurity;
-- Deve mostrar relrowsecurity=true e ao menos 1 policy
```
