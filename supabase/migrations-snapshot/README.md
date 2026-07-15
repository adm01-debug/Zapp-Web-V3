# Snapshot do Schema — Lovable Cloud (ZAPP Web)

> **Arquitetura atual**: Supabase Self-Hosted (`supabase.atomicabr.com.br`), schema `zapp`. Veja [../SCHEMA_REFERENCE.md](SCHEMA_REFERENCE.md).


Snapshot **live** do schema `public` extraído via `pg_dump` do banco de produção.

## Estatísticas

| Objeto | Total |
|---|---:|
| Extensions | 7 |
| Enums | 4 |
| Tables | 146 |
| Indexes | 331 |
| Functions | 105 |
| Triggers | 82 |
| Views | 10 |
| RLS Policies | 414 |
| Storage Buckets | 7 |

## Arquivos

| Arquivo | Propósito |
|---|---|
| `00_extensions.sql` | `CREATE EXTENSION IF NOT EXISTS` para pgcrypto, pg_trgm, pg_cron, pg_net, uuid-ossp, supabase_vault, pg_stat_statements |
| `01_enums.sql` | 4 enums via `DO $$ BEGIN CREATE TYPE ... EXCEPTION duplicate_object` |
| `02_schema_full.sql` | Dump `pg_dump --schema-only --schema=public` (tabelas + funções + views + policies + grants) |
| `03_storage_buckets.sql` | `INSERT ... ON CONFLICT DO NOTHING` dos 7 buckets |
| `ALL_IN_ONE.sql` | Concatenado em ordem segura, envolvido em `BEGIN/COMMIT` |

## Como aplicar num Supabase de destino

### Opção 1 — psql direto (recomendado)
```bash
psql -h <destino-host> -U postgres -d postgres -f ALL_IN_ONE.sql
```

### Opção 2 — SQL Editor do painel Supabase
Cola o conteúdo de `ALL_IN_ONE.sql` no editor → Run.

## Garantias

- ✅ **Idempotente**: `CREATE ... IF NOT EXISTS`, `CREATE OR REPLACE`, `DO $$ EXCEPTION duplicate_object`, `ON CONFLICT DO NOTHING`
- ✅ **Sem DROP** — nunca destrói dados/objetos existentes no destino
- ✅ **Transacional** — envolvido em `BEGIN/COMMIT`; falha reverte tudo
- ✅ **Sem owner** — usa o role que rodar o script (não trava em `postgres` role)

## O que NÃO está incluído

1. **Dados das tabelas** — export CSV separado por `psql \COPY` (não incluso aqui)
2. **auth.users / auth.sessions** — schema `auth` é gerenciado pelo Supabase
3. **Arquivos de Storage** — só metadados dos buckets; objetos precisam de cópia via Storage API
4. **Edge Functions** — código vive em `supabase/functions/`
5. **Secrets** — configurados no painel do destino
6. **Cron jobs** (`pg_cron`) — verificar `cron.job` no destino

## Regenerar

Este snapshot é gerado pelo pipeline `pg_dump --schema-only --no-owner`. Para regenerar:

```bash
pg_dump --schema-only --schema=public --no-owner -f 02_schema_full.sql
```

Data de geração: veja cabeçalho de `ALL_IN_ONE.sql`.
