# Índices — Inventário e Política

**Retrato de:** 27/07/2026 · **2.176 índices** · **159 MB** · **1.987 (91%) com `idx_scan=0`** · **77 MB** potencialmente ociosos.

> Regenerar: `SELECT schemaname, relname, indexrelname, idx_scan, pg_relation_size(indexrelid) FROM pg_stat_user_indexes ORDER BY 4;`
> Ferramentas disponíveis no banco: `index_advisor`, `hypopg`, e a tabela `evo.idx_usage_audit`.

---

## ⚠️ NUANCE CRÍTICA: `idx_scan=0` NÃO significa "pode dropar"

Entre os "não usados" há **índices UNIQUE e PRIMARY KEY** (ex.: `zapp.webhook_events_processed_event_id_uq` = 20 MB, `..._pkey` = 6 MB). Eles aparecem com `idx_scan=0` porque:
- **PK/UNIQUE** existem para **impor constraint** e servem a `ON CONFLICT` / FKs — o uso nem sempre incrementa `idx_scan`.
- As estatísticas podem ter sido **resetadas** recentemente (confirmar quando `pg_stat_reset` rodou).
- **Tabelas particionadas**: 91% dos índices estão em partições `evolution_*` — `idx_scan` da partição ≠ `idx_scan` da raiz.

**Regra:** **NUNCA** dropar PK, UNIQUE ou índice de suporte de FK numa "limpeza". Só são candidatos a remoção índices **secundários não-únicos** confirmados sem uso por ≥30 dias.

---

## Ociosos por Schema

| Schema | Não usados | Total | Espaço |
|---|---:|---:|---:|
| `zapp` | 798 | 836 | 44 MB |
| `evo` | 684 | 781 | 21 MB |
| `financeiro` | 51 | 71 | ~1,9 MB |
| `email_app` | 98 | 98 | ~1,4 MB |
| `ops` | 26 | 30 | ~1,7 MB |
| `vendas` | 46 | 54 | ~1,2 MB |
| `bpm` | 62 | 62 | ~0,5 MB |
| `ai` | 39 | 39 | ~0,3 MB |
| `archive` | 19 | 19 | ~0,16 MB |

---

## Índices Duplicados Conhecidos (etapa 27)

| Tabela | Índice A | Índice B | Ação |
|---|---|---|---|
| `evo.contact_id_graveyard` | idx_contact_id_graveyard_jid | idx_contact_id_graveyard_jid_2 | Dropar o menor/mais recente |
| `financeiro.colaboradores` | idx_colaboradores_email | idx_colaboradores_email_2 | Dropar o menor/mais recente |
| `financeiro.vendas_unificadas` | idx_vendas_unificadas_data | idx_vendas_unificadas_data_2 | Dropar o menor/mais recente |

---

## Processo de Quarentena de Índices (etapa 26)

Antes de dropar qualquer índice secundário não-único:

1. **Marcar**: adicionar comentário `QUARANTINE` no índice
2. **Observar**: 30 dias com `idx_scan` monitorado
3. **Confirmar**: se `idx_scan=0` após 30 dias E não é PK/UNIQUE/FK support
4. **Dropar**: `DROP INDEX CONCURRENTLY`

```sql
-- Ver índices em quarentena:
SELECT schemaname, tablename, indexname, idx_scan,
       pg_size_pretty(pg_relation_size(indexrelid)) AS size,
       obj_description(indexrelid) AS quarantine_note
FROM pg_stat_user_indexes
WHERE obj_description(indexrelid) ILIKE '%QUARANTINE%'
ORDER BY idx_scan, pg_relation_size(indexrelid) DESC;
```

---

## Índices Faltantes (etapa 28)

A varredura de 27/07 não encontrou seq scan pesado em tabela quente. As queries críticas identificadas:

| Tabela | Coluna(s) | Tipo de Query | Índice Necessário |
|---|---|---|---|
| `zapp.contatos` | `(workspace_id, nome)` | trigram search | GIN trigram (quando `pg_trgm` estiver em `extensions`) |
| `zapp.empresas` | `(workspace_id, razao_social)` | trigram search | GIN trigram |
| `evo.evolution_contacts` | `(remote_jid, updated_at DESC)` | cursor pagination | btree composto |
| `zapp.failed_messages` | `(workspace_id, created_at DESC)` | cursor pagination | btree composto |
| `zapp.dispatch_error_logs` | `(workspace_id, occurred_at DESC)` | cursor pagination | btree composto |

---

## Política de Índice

1. **Criar** índice só com evidência: query lenta real (>50ms em `pg_stat_statements`) ou `index_advisor`
2. **Antes de remover**: `idx_scan=0` por ≥30 dias E confirmado não-PK/UNIQUE/FK
3. **Quarentena** 30 dias antes de dropar qualquer índice secundário
4. **Monitorar**: `slow_query_monitor` (cron 102) + `index_advisor` sob demanda
5. **CONCURRENTLY**: todo `CREATE INDEX` e `DROP INDEX` em produção deve usar `CONCURRENTLY`

---

## Queries de Diagnóstico

```sql
-- Índices mais pesados sem uso (candidatos a quarentena):
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan,
    pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND schemaname IN ('zapp','evo','financeiro','email_app')
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 20;

-- Verificar se é PK/UNIQUE (não dropar):
SELECT i.relname, ix.indisunique, ix.indisprimary
FROM pg_index ix
JOIN pg_class i ON i.oid = ix.indexrelid
WHERE i.relname = 'nome_do_indice';
```
