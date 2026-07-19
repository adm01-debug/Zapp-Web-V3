# Runbook — Aplicar bridges zapp.evolution_* na VPS

**Migração:** `docs/migrations/2026-07-15_zapp_evolution_credentials_bridge.sql`
**Alvo:** `supabase.atomicabr.com.br` (Postgres self-hosted)
**Objetivo:** eliminar `PGRST205` em `/admin/integrations/evolution-api` expondo
`evolution_instance_credentials` e `evolution_retry_metrics` no schema `zapp`.

> Não posso aplicar direto na VPS — sem acesso SSH/psql do lado do agente.
> Execute os passos abaixo manualmente e cole o resultado do `Validação`.

## 1. Aplicar

```bash
export PG_URL="postgres://postgres:***@supabase.atomicabr.com.br:5432/postgres"

# opção A: usar o aplicador oficial (recomendado)
./scripts/apply-vps-migrations.sh --only zapp_evolution_credentials_bridge

# opção B: psql direto (o arquivo é 100% transacional)
psql "$PG_URL" -1 -v ON_ERROR_STOP=1 \
  -f docs/migrations/2026-07-15_zapp_evolution_credentials_bridge.sql
```

O `NOTIFY pgrst, 'reload schema'` no final força o PostgREST a expor as views
sem restart.

## 2. Validação (cole o output no ticket)

```sql
-- 2.1  As views existem em zapp?
SELECT table_schema, table_name, view_definition IS NOT NULL AS has_body
FROM information_schema.views
WHERE table_schema = 'zapp'
  AND table_name IN ('evolution_instance_credentials','evolution_retry_metrics');

-- 2.2  GRANTs corretos?
SELECT grantee, privilege_type, table_name
FROM information_schema.role_table_grants
WHERE table_schema = 'zapp'
  AND table_name IN ('evolution_instance_credentials','evolution_retry_metrics')
ORDER BY table_name, grantee, privilege_type;

-- 2.3  security_invoker ligado (RLS herda da base)?
SELECT c.relname, c.reloptions
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'zapp'
  AND c.relname IN ('evolution_instance_credentials','evolution_retry_metrics');
-- reloptions deve conter {security_invoker=on}

-- 2.4  Consulta funcional (deve retornar linha ou 0 sem erro)
SELECT count(*) FROM zapp.evolution_instance_credentials;
SELECT count(*) FROM zapp.evolution_retry_metrics;
```

## 3. Smoke test automatizado

Após aplicar, rode:

```bash
bunx playwright test e2e/admin-evolution-api-smoke.spec.ts
```

O teste falha se qualquer request `/rest/v1/*` retornar corpo contendo
`PGRST205`, garantindo que os bridges estão de pé.

## 4. Rollback

```sql
BEGIN;
DROP VIEW IF EXISTS zapp.evolution_instance_credentials;
DROP VIEW IF EXISTS zapp.evolution_retry_metrics;
COMMIT;
NOTIFY pgrst, 'reload schema';
```
