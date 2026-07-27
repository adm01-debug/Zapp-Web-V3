# INDEXES — Estratégia e governança

> Ultimo snapshot: 2026-07-16. 2176 índices, 91% não utilizados.

---

## Duplicate indexes identificados (Step 27)

| Tabela | Index A | Index B | Ação |
|--------|---------|---------|------|
| `evo.contact_id_graveyard` | duplicate | | Drop dup após quarantine |
| `financeiro.colaboradores` | duplicate | | Drop dup após quarantine |
| `financeiro.vendas_unificadas` | duplicate | | Drop dup após quarantine |

---

## Índice de quarantine (30 dias)

```sql
-- Candidatos: idx_scan = 0, não PK, não UNIQUE, não partial
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan,
    pg_relation_size(indexrelid) AS index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexrelid NOT IN (
      SELECT conindid FROM pg_constraint WHERE contype IN ('p','u')
  )
  AND schemaname NOT IN ('pg_catalog','cron')
ORDER BY pg_relation_size(indexrelid) DESC;
```

---

## Missing index candidates (Step 28)

| Tabela | Coluna | Tipo | Motivo |
|--------|--------|------|--------|
| `zapp.contatos` | nome, sobrenome | trigram | Busca fuzzy por nome |
| `zapp.empresas` | nome_fantasia | trigram | Busca fuzzy por empresa |
| `evo.evolution_contacts` | created_at | btree | Cursor pagination |
| `evo.failed_messages` | created_at | btree | Cursor pagination |
| `logistica.dispatch_error_logs` | created_at | btree | Cursor pagination |

---

## Queries de diagnóstico

```sql
-- Top 20 indexes por tamanho
SELECT
    schemaname, tablename, indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 20;

-- Top 20 indexes por scans
SELECT
    schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE idx_scan > 0
ORDER BY idx_scan DESC
LIMIT 20;

-- Tamanho total de índices
SELECT pg_size_pretty(sum(pg_relation_size(indexrelid)))
FROM pg_stat_user_indexes;
```

---

## Nuances importantes

- Índices em **tabelas particionadas** (evo.evolution_*) são criados na root table
  e propagados para todas as 25 partições
- `CREATE INDEX CONCURRENTLY` **não funciona dentro de transactions**
- `DROP INDEX CONCURRENTLY` **não funciona dentro de transactions**
- Sempre usar ambas as variants para mudanças em produção
- Partial indexes: usar `WHERE active = true` para índices em colunas esparsas
- BRIN indexes: ideal para timestamps com ordenação natural (created_at)
