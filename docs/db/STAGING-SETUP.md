# Ambiente de Staging — Procedimento

**Etapa 1 do plano DB.** Toda DDL estrutural DEVE passar por staging antes de produção.

---

## Por que staging é obrigatório aqui

O banco de produção tem **88 migrations registradas** em `supabase_migrations.schema_migrations` e **130 arquivos** no diretório `supabase/migrations/`. O banco foi migrado do Supabase Cloud (Lovable) para self-hosted via dump/restore em 2026-07-16, com migrations incrementais aplicadas desde então. Reaplicar os 130 arquivos num banco vazio **não** reproduz o estado de produção (schema é incremental). O ambiente de staging deve ser criado a partir do **baseline.sql** (etapa 2), não dos arquivos individuais.

---

## Provisionar o staging

### Opção A — Supabase CLI + dump de schema

```bash
# 1. Exportar schema real de produção
pg_dump \
  --schema-only \
  --no-owner \
  --no-acl \
  --schema='zapp,evo,public,bpm,email_app,ai,archive,ops,financeiro,vendas,logistica,artes,monitoring' \
  "postgresql://<user>:<SECRETO>@supabase.atomicabr.com.br:5432/postgres" \
  > docs/db/baseline/schema_$(date +%Y%m%d).sql

# 2. Carregar no staging (Supabase local ou instância separada)
psql "postgresql://<staging-url>" < docs/db/baseline/schema_$(date +%Y%m%d).sql

# 3. Verificar diff de schema (deve ser zero)
pg_dump --schema-only "postgresql://<prod>" > /tmp/prod.sql
pg_dump --schema-only "postgresql://<staging>" > /tmp/staging.sql
diff <(pg_format /tmp/prod.sql) <(pg_format /tmp/staging.sql) | head -50
```

### Opção B — Supabase self-hosted (Docker Compose / Swarm)

```bash
# No mesmo VPS, criar uma instância separada com compose:
cd infra/staging
docker compose up -d
# Carregar baseline (acima)
```

---

## Fluxo de deploy DDL (regra inegociável)

```
Dev escreve migration (^\d{14}$_descricao.sql)
        │
        ▼
CI valida: nome, colisão, idempotência, search_path
        │
        ▼
Aplicar em STAGING
        │
        ▼
Medir diff de schema contra baseline: deve ser 0 antes, ≥1 depois
        │
        ▼
Revisor aprova
        │
        ▼
Aplicar em PRODUÇÃO (nunca DDL manual)
```

---

## Guardrail de DDL manual em produção

O cron `ops-guardrails-deadman` (jobid 82, `*/10 * * * *`) chama `ops.fn_guardrails_check`, que detecta objetos criados fora de migration. Reforçar para gerar alerta P1 (etapa 3).

A tabela `ops.ddl_audit` (24.452 linhas auditadas) registra todo DDL executado. Consultar antes de qualquer intervenção:

```sql
SELECT event_time, object_type, schema_name, object_name, command_tag, session_user
FROM ops.ddl_audit
WHERE event_time > now() - interval '7 days'
ORDER BY event_time DESC;
```

---

## Status (27/07/2026)

- [ ] Staging provisionado
- [ ] Baseline.sql gerado e commitado em `docs/db/baseline/`
- [ ] Diff de schema staging↔prod = 0
- [ ] DDL manual em produção alerta P1 (etapa 3)

> Até o staging estar disponível, **nenhuma das etapas de onda 2+ deve ser aplicada em produção**.
