# Migrations

**Retrato de:** 27/07/2026.

## O fato central: drift entre banco e repositório

| Métrica | Valor |
|---|---|
| Migrations **registradas no banco** (`supabase_migrations.schema_migrations`) | **52** |
| Arquivos de migration no repositório | **944** |
| Primeira versão registrada | `20260716` |
| Última versão registrada | `20260727161000` |

**Leitura:** o banco de produção **não foi construído aplicando as 944 migrations** — o tracking formal começou em 16/07/2026. Reconstruir do zero a partir dos arquivos **não reproduz** o estado atual. Por isso a etapa 16 do plano prevê um **baseline squash** (dump do estado real → `baseline.sql`) validado em staging por diff de schema.

## Versões malformadas (corrigir + gate de CI)

Estas 4 versões aplicadas **não** seguem `^\d{14}$` (14 dígitos `YYYYMMDDHHMMSS`):

| Versão | Migration |
|---|---|
| `20260716` | `fix_dispatch_error_logs_grant` |
| `20260717` | `create_queue_analytics` |
| `20260722` | `qa_infra_corrections` |
| `20260722.2` | `fix_profiles_insert_policy_and_trigger` |

## Duas árvores de migration

Existem migrations em **`supabase/migrations/`** (fonte canônica). ~~`infra/migrations/`~~ foi **removido** em 2026-08-04 (PR #767) — os 8 SQLs foram aplicados via psql e o DDL está coberto pelo canônico `20260804000000_canonical_schema.sql`.

## Regras

1. Nome sempre `^\d{14}$` (14 dígitos). CI deve **falhar** em colisão de timestamp ou fuga do padrão.
2. Um tema por migration; **rollback documentado** (ou justificativa de irreversibilidade).
3. Fluxo `staging → prod`: nenhuma migration toca produção sem passar por staging + diff de schema contra o baseline.
4. DDL não-transacional (`CREATE INDEX CONCURRENTLY`, `VACUUM`, `ALTER TYPE ADD VALUE`) roda fora de transação — sinalizar na migration.
