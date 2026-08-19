# supabase/migrations — Guia Canônico

> Atualizado em **2026-08-19** pela operação de limpeza `MIGRATIONS_CLEANUP_PLAN_100_STEPS` (branch `chore/migrations-cleanup-20260819`).

## Modelo vigente: **DB-as-source**

O banco de produção (Supabase self-hosted `supabase.atomicabr.com.br`) é a **fonte de verdade dos objetos**. O fluxo oficial:

1. DDL em produção é aplicado via **MCP SQL versionado**, nunca DDL solto.
2. Toda aplicação grava registro em `supabase_migrations.schema_migrations` (`version` + `name`), idempotente.
3. Os arquivos aqui são o **registro histórico/espelho** do que roda no DB — `supabase db push` **não** é usado (DB restaurado de dump). **Reorganizações deste diretório NÃO desaplicam o que já está no DB.**
4. Timestamps futuros são permitidos e normais para ordenação.
5. Se o objeto já existir no DB, a migration deve conter o corpo **corrigido que JÁ roda no DB** (sem reintroduzir bug) e é registrada como no-op.
6. Arquivo sem efeito real no DB não é registrado antes de decisão explícita (aplicar × arquivar).

## Estrutura atual

| Camada | O que é |
|---|---|
| `20260804000000_canonical_schema_squash_133_migrations.sql` | **Squash canônico** (baseline consolidado, 133 migrations antigas). **Imutável** — está na allowlist do `ci.yml`. |
| `20260804…20260816_*` | Histórico incremental **consolidado** no canônico/snapshot (a maioria foi arquivada em `docs/history/migrations-archive/`; as restantes são fixes de segurança/RLS mantidos por allowlist). |
| `20260817…` (≥ BASELINE) | **Fila viva do aplicador** — só estes arquivos são (re)aplicados por `infra/db-migrate/apply-migrations.sh`. |
| `20260819…_reconcile_repo_db_backfill.sql` | **Reconciliação repo×DB**: objetos órfãos VIVOS recuperados do snapshot (corpo = o que já roda; idempotente; registrada como no-op). |
| `__tests__/` | Testes de migration (Deno: `deno test --allow-read supabase/migrations/__tests__/`). |

**BASELINE do aplicador: `20260817000000`** — arquivos com versão menor NUNCA são reaplicados. Versionamento: `^[0-9]{14}_[A-Za-z0-9_-]+\.sql` (14 dígitos `YYYYMMDDHHMMSS` + `_` + nome). Fora desse padrão, o aplicador falha o job.

## Como o aplicador decide pendências

`infra/db-migrate/apply-migrations.sh` (disparado por `db-migrate.yml` em push na main que toque `supabase/migrations/**`):

1. `BASELINE=20260817000000` — só considera versões ≥ baseline **ausentes** em `schema_migrations`.
2. Ordem lexicográfica; `psql -1 -v ON_ERROR_STOP=1` por arquivo (arquivos com `CONCURRENTLY` rodam sem `-1`). Para no 1º erro (nada é registrado como aplicado se falhar).
3. Registra cada sucesso com `INSERT … ON CONFLICT (version) DO NOTHING`.
4. Ao final: SIGUSR1 no `supabase_rest` (reload do schema cache do PostgREST).

## Gates de CI sobre migrations (o que faz cada um FALHAR)

| Workflow / script | Falha quando… |
|---|---|
| `migration-lint.yml` → `scripts/lint-migrations.mjs` | ML-001 SECDEF sem `SET search_path` · ML-002 escrita em VIEW-proxy `public` (`notifications, profiles, user_roles, failed_messages, dispatch_error_logs`) · ML-003 `ALTER PUBLICATION supabase_realtime ADD TABLE public.<app_table>` · ML-004 `CREATE TABLE` em `zapp` sem `ENABLE RLS` · ML-005 `GRANT EXECUTE TO public/anon` não-stub · ML-006 falta `CREATE SCHEMA IF NOT EXISTS` · ML-007 URL `http://` · ML-008 SECDEF+`GRANT authenticated` sem guard `auth.uid()` |
| `ci.yml` → `scripts/check-migration-gates.mjs` | `EXCEPTION WHEN OTHERS … RAISE NOTICE` que engole falha · `SET <guc>=<função>` (usar `set_config`) · **colisão de versão** (2 arquivos mesmo prefixo 14-díg). Allowlist: `20260804000000_canonical_schema_squash_133_migrations.sql, 20260804150000_fix_secdef_revoke_extended_schemas.sql, 20260804170000_fix_rls_systematic_coverage.sql` — **NÃO mover/renomear/deletar esses 3**. |
| `migration-uniqueness.yml` | prefixo 14-dígitos duplicado no repo |
| `migration-smoke-test.yml` | migration não aplica em smoke (baseline `20260730000000`) |
| `schema-drift.yml` | DDL fora de `supabase/migrations/` ou `infra/migrations/` |
| `db-invariants.yml` / `db-reference-integrity.yml` | invariantes SQL no DB (`check-realtime-publication.sql`, `check-reference-integrity.sql`) |
| `decouple-guard.yml` → `scripts/decouple/sql-gate.mjs` | violação das regras de desacoplamento ZAPP×Evolution |
| `evo-ddl-gate.yml`, `security-invoker-gate.yml`, `zapp-schema-drift-gate.yml`, `health-score-anti-drift.yml` | DDL evo fora de allowlist · views sem `security_invoker` · drift de schema vs snapshot · health-score sem migration versionada |

**Arquivo morto/histórico** → mover para `docs/history/migrations-archive/` (FORA do escopo dos gates). Nunca deixar dentro de `supabase/migrations/` (continua sob CI).

## Template de migration

```sql
-- ============================================================
-- <YYYYMMDDHHMMSS>_<tema>.sql
-- Título: <descrição de 1 linha>
-- Versão: <14 dígitos> · Data: <data> · Autor: <agente>
-- Tema único: <um tema por arquivo>
-- Objetos afetados: <lista>
-- Idempotência: <CREATE OR REPLACE | IF NOT EXISTS | ON CONFLICT>
-- Rollback: <como reverter>
-- Refs: <issue/PR/doc se houver>
-- ============================================================
```

Regras de ouro:
- **Um tema por migration; um commit por tema.**
- `CREATE TABLE` em `zapp` **sempre** com `ENABLE ROW LEVEL SECURITY` + policies.
- SECURITY DEFINER **sempre** com `SET search_path = zapp` (e guard `auth.uid()` quando GRANT authenticated).
- Nunca `GRANT EXECUTE TO public/anon` fora de stub (marcar `-- ignore-lint-ml005` só se stub).
- Realtime: nunca `ALTER PUBLICATION supabase_realtime ADD TABLE public.<app_table>`.
- Rodar ANTES do commit: `CHANGED_FILES="<arquivo>" node scripts/lint-migrations.mjs` + `node scripts/check-migration-gates.mjs --allowlist=<3 da allowlist>` + `node scripts/decouple/sql-gate.mjs --migrations supabase/migrations`.

## Fluxo para um novo agente adicionar migration com segurança

1. `git fetch` + conferir `schema_migrations` (MCP): nenhuma colisão de versão no repo nem no DB.
2. Escrever a migration versionada (14 dígitos, um tema).
3. Rodar os 3 linters acima até 0 FAIL.
4. Aplicar no DB via MCP + registrar em `schema_migrations` (ON CONFLICT DO NOTHING) — ou deixar para o próximo push do `db-migrate` se for ≥ baseline e não preciser aplicar já.
5. PR (nunca commit direto na main). Pós-merge: conferir `gh run list` do `db-migrate` e `schema_migrations` (ground truth é o ledger, não o status do job).

## Operação de limpeza 2026-08-19 (resumo)

- **Antes:** 367 arquivos; **Depois:** 78 (1 canônico + 74 ≥ baseline + 2 allowlist + 1 reconcile).
- **Arquivados:** 281 → `docs/history/migrations-archive/` (índice lá).
- **Deletados:** 9 (drop-only de objetos mortos).
- **Backfill:** 1 reconcile (`20260819155921_reconcile_repo_db_backfill.sql`) com 33 objetos órfãos VIVOS (corpo do snapshot; registrado no DB como no-op).
- **Tombstones documentados:** 206 órfãos com objeto morto (manifest).
- Classificação completa: `docs/ops/migrations-manifest.csv` · Decisões: `docs/ops/MIGRATIONS_CLEANUP_DECISIONS.md` · Drift: `docs/ops/MIGRATIONS-DRIFT.md`.
- **Nenhum objeto de produção foi alterado/dropado.**

## Achados colaterais (p/ o próximo agente)

- Refs a `20260807240000` (migration deletada) em `migration-lint.yml` e `scripts/lint-migrations.sh` são **marcos temporais** (`SAFE_POLICY_EPOCH`), não refs a arquivo — não quebram CI.
- `20260816090000_drop_dead_functions_zapp_evo` foi marcado "não aplicado" na auditoria (verificar se as 33 fns mortas ainda existem no DB antes de qualquer reuso).
- `MIGRATIONS-DRIFT.md` anterior (07/08) estava stale — atualizado nesta operação.