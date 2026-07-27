# Onboarding — Database

> Guia para novos membros entenderem a arquitetura do banco.

---

## Primeiro Dia

### Entender a estrutura

1. Leia [ARCHITECTURE.md](ARCHITECTURE.md) — overview do banco
2. Leia [SCHEMA-CONTRACT.md](SCHEMA-CONTRACT.md) — regras de dependência
3. Leia [DDL-FREEZE-POLICY.md](DDL-FREEZE-POLICY.md) — como alterar o schema
4. Leia [AGENTS.md](AGENTS.md) — o que pode e não pode fazer

### Conectar ao banco

```bash
# Staging
psql $STAGING_URL

# Produção (apenas com aprovação)
psql $PROD_URL
```

### Queries úteis

```sql
-- Ver schemas
SELECT schema_name FROM information_schema.schemata
WHERE schema_name NOT IN ('pg_catalog','information_schema','extensions');

-- Ver tabelas de um schema
SELECT tablename FROM pg_tables WHERE schemaname = 'zapp' ORDER BY tablename;

-- Ver todas as views
SELECT schemaname, viewname FROM pg_views WHERE schemaname = 'public';

-- Ver cron jobs
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid;

-- Ver CI gates
SELECT * FROM ops.fn_ci_run_all_gates();
```

---

## Estrutura de Diretórios

```
supabase/
  migrations/          ← versionamento de DDL (canonical)
  functions/          ← Edge functions
  config.toml         ← Config do projeto Supabase

docs/db/
  ARCHITECTURE.md     ← Visão geral
  SCHEMA-CONTRACT.md  ← Contrato entre schemas
  DDL-FREEZE-POLICY.md ← Regras de mudança
  FUNCTIONS.md        ← Catálogo de functions
  ERROR-CONTRACT.md   ← Convenções de erro
  PARTITIONS.md       ← Tabelas particionadas
  INDEXES.md          ← Estratégia de índices
  CRONS.md            ← Cron jobs
  OBSERVABILITY.md    ← Dashboards e alertas
  AGENTS.md           ← Instruções para LLMs
  PR-CHECKLIST.md     ← Checklist de revisão
  ONBOARDING.md       ← Este arquivo
  adrs/               ← Architecture Decision Records
  schemas/            ← Documentação por schema
  baseline/           ← Catálogo baseline
```

---

## Regras Essenciais

1. **NUNCA** modifique o banco diretamente em produção
2. **SEMPRE** use migrations versionadas
3. **NUNCA** crie objetos em `evo` (Evolution API)
4. **NUNCA** crie FKs de `evo` para `zapp`
5. **SEMPRE** use `DROP INDEX CONCURRENTLY` (fora de transaction)
6. **SEMPRE** use `SET search_path = 'schema, pg_catalog'` em SECURITY DEFINER
7. **NUNCA** coloque `public` no search_path

---

## Emergências

### Query travou
```sql
SELECT pg_cancel_backend(pid);  -- tenta graceful
SELECT pg_terminate_backend(pid);  -- força
```

### Matview desatualizada
```sql
SELECT ops.fn_refresh_matview_safe('zapp', 'vw_dashboard_metrics');
```

### Cron travado
```sql
SELECT * FROM cron.job_run_details ORDER BY starttime DESC LIMIT 10;
```

### Migrations travadas
```sql
SELECT * FROM supabase/migrations.schema_migrations ORDER BY applied_at DESC;
```
