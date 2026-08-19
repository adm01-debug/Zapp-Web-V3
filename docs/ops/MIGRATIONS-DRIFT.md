# MIGRATIONS-DRIFT — repo × DB (`schema_migrations`)

> **Data da medição:** 2026-08-19 · **Branch:** `chore/migrations-cleanup-20260819`
> **Escopo:** drift entre `supabase/migrations/*.sql` (repo) e `supabase_migrations.schema_migrations` (DB de produção self-hosted).
> **Modelo vigente:** DB-as-source (ver `AGENTS.md`). O repo é o *registro histórico*; o DB é a fonte de verdade dos objetos.

---

## Estado pós-limpeza (2026-08-19)

| Métrica | Valor |
|---|---|
| Arquivos `supabase/migrations/*.sql` (main) | **78** (1 canônico + 74 ≥ baseline + 2 allowlist + 1 reconcile) |
| Arquivos arquivados em `docs/history/migrations-archive/` | **281** (efeito já no snapshot/canônico; < baseline, nunca reaplicados) |
| Deletados (drop-only, objetos mortos) | **9** |
| Registros `schema_migrations` (DB) | **754** (88 pré-canônico + 666 pós-canônico) |
| ├─ registros com arquivo correspondente (pós-limpeza) | 78 + droppados/arquivados (histórico) |
| ├─ órfãos VIVOS (B5a) → reconcile `20260819155921` | 94 (33 objetos únicos backfillados; demais cobertos por snapshot/canônico) |
| └─ órfãos MORTOS (B5b/Tombstone) | 206 (documentados no manifest) |
| Colisões de versão no repo | **0** |
| Nomes inválidos (`^[0-9]{14}_`) | **0** |
| Violações de lint (ML-001/004/005/008) | **0** (78/78 limpos) |
| Gates (`check-migration-gates`, `sql-gate`) | **0 FAIL** |

## Drift residual (esperado no modelo DB-as-source)

1. **88 registros pré-canônico** (`version < 20260804000000`) — histórico de migração
   anterior ao squash canônico. Sem arquivos (consolidados no canônico). NÃO apagar:
   são o ledger da evolução pré-squash.
2. **206 órfãos tombstone** — registros de migrations aplicadas cujo objeto foi dropado
   ou eram operações pontuais (comments/índices one-shot). Sem arquivo por decisão
   (não reintroduzir código morto). Ver manifest `action=TOMBSTONE`.
3. **órfãos vivos não-backfillados individualmente** — 94 marcados B5a, mas agrupados no
   **1 arquivo de reconciliação** (`20260819155921_reconcile_repo_db_backfill.sql`, 33
   objetos DISTINTOS extraídos do snapshot; os demais nomes eram variações/duplicados na
   evidência ou objetos já cobertos). Corpo = o que JÁ roda no DB. Registrado no ledger
   como no-op (`INSERT ... ON CONFLICT DO NOTHING`).

## Por que o drift é NORMAL aqui

- O aplicador (`infra/db-migrate/apply-migrations.sh`) só considera **versão ≥
  `20260817000000` ausentes no ledger** — arquivos antigos são irrelevantes para produção.
- Objetos vivos podem ter sido criados por migrations cujo arquivo foi deletado do repo
  (limpeza anterior) — a fonte de verdade é o snapshot de rebuild
  (`scripts/decouple/snapshots/zapp_schema_snapshot.sql`, gerado do DB vivo).
- **Regra**: para decidir se um objeto "sumido" do repo ainda importa, olhar o SNAPSHOT,
  não o arquivo. Se está no snapshot → vivo e reconstruível; arquivo é opcional (cosmético).

## Comparando com a medição anterior (07/08, stale)

- A versão anterior reportava "299 DB × 154 arquivos" e estava defasada (07/08).
- A medição atual (19/08, pós-operação de limpeza) é a referência: **78 arquivos / 754
  registros / 281 arquivados / 206 tombstones / 1 reconcile**.

## Como re-medir (passo a passo)

```bash
# Arquivos (sempre contra refs da main, nunca working tree sujo)
git ls-tree origin/main --name-only supabase/migrations/ | grep -c '\.sql$'

# Registros DB (MCP Supabase self-hosted; 1 statement por chamada)
SELECT count(*) FROM supabase_migrations.schema_migrations;
SELECT count(*) FILTER (WHERE version >= '20260804000000') FROM supabase_migrations.schema_migrations;

# Órfãos (união arquivos ∪ DB, por prefixo de 14 dígitos)
# Ver C:/tmp/mig-work/consolidate.py + docs/ops/migrations-manifest.csv
```

## Decisão de arquivamento (artefatos)

- Manifest completo: `docs/ops/migrations-manifest.csv` (667 versões: 367 arquivos originais + 300 órfãos).
- Decisões CP-2: `docs/ops/MIGRATIONS_CLEANUP_DECISIONS.md`.
- Índice do arquivo: `docs/history/migrations-archive/README.md`.