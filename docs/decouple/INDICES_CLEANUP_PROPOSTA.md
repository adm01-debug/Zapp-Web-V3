# PROPOSTA — Limpeza de Índices Redundantes em `evo.evolution_webhook_events_v2` (partições)

**Status:** PROPOSTA (aguardando revisão sênior — aplicação **NÃO** autorizada por este documento)
**Data do levantamento:** 2026-08-15
**Autor:** CORRETOR 4 (auditoria read-only via MCP `supabase_db_query`)
**Escopo:** índices das partições de `evo.evolution_webhook_events_v2` com sufixos `_idx1` a `_idx8` e nomes com typo/truncamento (`_2026__`, `_2026_1`, `_2027_0`, `defaul`)
**Arquivo de destino da migration (quando aprovada):** `supabase/migrations/20260815120000_cleanup_evo_webhook_v2_redundant_idx.sql` (padrão `YYYYMMDDHHMMSS_descricao.sql`)

---

## 1. Contexto

As partições mensais de `evo.evolution_webhook_events_v2` carregam uma família de índices
`(instance_name, created_at DESC)` com nomes **gerados por script e truncados pelo limite de 63 bytes**
do PostgreSQL (sufixos `_idx1`…`_idx8`), além de typos no nome (`_2026__` sem o mês, `_2026_1`, `_2027_0`,
`defaul`). São 13 cópias da mesma definição, espalhadas pelas partições, duplicando a definição canônica
já existente no pai (`evo_whk_v2_instance_date`) e **nunca usadas** (`idx_scan = 0` em todas, desde a
criação — a mais antiga, `2026_07`, existe há mais de 12 meses).

**Regras da casa aplicáveis** (AGENTS.md raiz, docs/db/AGENTS.md, docs/db/INDEXES.md):
- **NUNCA** dropar PK / UNIQUE / índice de suporte de FK em limpeza de índice — mesmo com `idx_scan=0`.
- `DROP INDEX` em produção: **sempre `CONCURRENTLY`** e **fora de transação**.
- Só são candidatos índices **secundários não-únicos** confirmados sem uso.
- Política de quarentena: ≥30 dias com `idx_scan=0` antes de dropar (cumprida folgadamente).
- Partições-filhas de `evolution_webhook_events` estão na lista **"NÃO MEXA"** → exige **revisão sênior explícita** antes de aplicar.

---

## 2. Metodologia (100% read-only)

Consultas executadas via MCP `supabase_db_query` (nenhum DDL/DML):

| Fonte | Uso |
|---|---|
| `pg_index` + `pg_class` + `pg_namespace` | inventário: tabela, índice, colunas, `indisprimary`, `indisunique`, `pg_get_indexdef`, partições attachadas (`attached_parts`) |
| `pg_stat_user_indexes` | uso real: `idx_scan`, `idx_tup_read`, `idx_tup_fetch` (colunas reais: `relname`/`indexrelname`) |
| `pg_constraint` | constraints por tabela (`p`/`u`/`f`/`c`) e qual índice as suporta (`conindid`) |
| `pg_proc` | origem das partições: `evo.fn_auto_create_next_partitions` / `fn_create_monthly_partition` |

---

## 3. Inventário agrupado por tabela + colunas (58 índices / 14 tabelas)

Tabela pai `evo.evolution_webhook_events_v2` + 12 partições mensais (`2026_07`…`2027_06`) + `_default`.

### 3.1 Famílias por definição (agrupamento por colunas)

| Família | Definição | Onde existe | Uso (`idx_scan`) | Verdict |
|---|---|---|---|---|
| **A — `instance_name, created_at DESC`** | btree, não-único | pai (`evo_whk_v2_instance_date`, `ON ONLY`) + **13 cópias nas partições** | **0 em todas as 13** | 🔴 **CANDIDATAS A DROP (13)** |
| **B — `created_at DESC`** | btree, não-único | pai (`idx_evo_v2_events_created_at`, `ON ONLY`) + 13 nas partições (`<part>_created_at_idx`) | **>0 em todas** (346–1826) | 🟢 MANTER |
| **C — `(status, created_at) WHERE status IN ('pending','failed')`** | btree parcial, não-único | pai (`evo_whk_v2_pending`, `ON ONLY`) + 13 nas partições (`<part>_status_created_at_idx`) | >0 em `2026_07`/`2026_08` (626 cada); 0 nas demais | 🟢 MANTER (1 por partição — não duplicado; é o índice funcional do padrão pending/failed) |
| **D — `event_type, status, created_at DESC`** | btree, não-único | apenas `2026_07` e `_default` (`<part>_event_type_status_idx`) | 263 em `2026_07`; 0 em `_default` | 🟢 MANTER (criado pelo cron de partições; não duplicado) |
| **E — PK `(id, created_at)` UNIQUE** | btree único | pai + 13 partições (`<part>_pkey`) | 0 em todas | 🛡️ **PROTEGIDO — nunca dropar** (AGENTS.md) |

> Constraints confirmadas via `pg_constraint` nas 14 tabelas: somente `p` (pkey, família E) e `c`
> (`evolution_webhook_events_v2_status_check`). **Não há nenhuma FK** (nem de entrada nem de saída)
> envolvendo estas tabelas → nenhum índice de suporte de FK em risco.

### 3.2 Nuance crítica (índices do pai `ON ONLY`)

Os 4 índices do pai foram criados com `ON ONLY` e têm **0 partições attachadas** (`attached_parts = 0`):
funcionam como **definição/template canônica**, não cobrem scans de partição. Os índices que de fato
servem queries são os **por-partição**. Por isso:
- famílias B/C/D por-partição são o **conjunto funcional** e ficam;
- a família A por-partição é redundante **entre si** (13 cópias idênticas) e **com a definição do pai**,
  e está com `idx_scan=0` desde sempre → alvo da limpeza.

---

## 4. Candidatos a DROP — evidências (13 índices)

Todos: btree `(instance_name, created_at DESC)`, **não-únicos, não-PK, sem constraint, `idx_scan = 0`**.

| # | Partição | Índice (nome atual) | Anomalia no nome |
|---|---|---|---|
| 1 | `2026_07` | `evolution_webhook_events_v2_2026__instance_name_created_at_idx4` | truncado + `_idx4`; falta `07` |
| 2 | `2026_08` | `evolution_webhook_events_v2_2026__instance_name_created_at_idx5` | truncado + `_idx5`; falta `08` |
| 3 | `2026_09` | `evolution_webhook_events_v2_2026__instance_name_created_at_idx6` | truncado + `_idx6`; falta `09` |
| 4 | `2026_10` | `evolution_webhook_events_v2_2026_1_instance_name_created_at_idx` | truncado (`2026_1`) |
| 5 | `2026_11` | `evolution_webhook_events_v2_2026__instance_name_created_at_idx7` | truncado + `_idx7`; falta `11` |
| 6 | `2026_12` | `evolution_webhook_events_v2_2026__instance_name_created_at_idx8` | truncado + `_idx8`; falta `12` |
| 7 | `2027_01` | `evolution_webhook_events_v2_2027_0_instance_name_created_at_idx` | truncado (`2027_0`) |
| 8 | `2027_02` | `evolution_webhook_events_v2_2027__instance_name_created_at_idx1` | truncado + `_idx1`; falta `02` |
| 9 | `2027_03` | `evolution_webhook_events_v2_2027__instance_name_created_at_idx2` | truncado + `_idx2`; falta `03` |
| 10 | `2027_04` | `evolution_webhook_events_v2_2027__instance_name_created_at_idx3` | truncado + `_idx3`; falta `04` |
| 11 | `2027_05` | `evolution_webhook_events_v2_2027__instance_name_created_at_idx4` | truncado + `_idx4`; falta `05` |
| 12 | `2027_06` | `evolution_webhook_events_v2_2027__instance_name_created_at_idx5` | truncado + `_idx5`; falta `06` |
| 13 | `_default` | `evolution_webhook_events_v2_defaul_instance_name_created_at_idx` | typo (`defaul`) |

**Origem:** o cron atual (`evo.fn_create_monthly_partition`) só cria `_event_type_status_idx` — a família A é
**artefato legado** (script/migração anterior que gerava nomes > 63 bytes; o PG truncou e numerou `_idxN`).

**Espaço recuperável:** não medido nesta passada (query de `pg_relation_size` deu timeout no MCP) —
capturar no pré-check (SQL na seção 8). Estimativa conservadora: 13 índices btree pequenos; o ganho
principal é **higiene/gov de índices**, não espaço.

---

## 5. PROPOSTA de migration (TEXTO — aplicar só após revisão sênior)

Arquivo sugerido: `supabase/migrations/20260815120000_cleanup_evo_webhook_v2_redundant_idx.sql`

### 5.1 Pré-checks (read-only, antes de aplicar)

```sql
-- (a) confirmar que os 13 candidatos seguem com idx_scan = 0:
SELECT schemaname, relname AS tablename, indexrelname AS indexname, idx_scan,
       pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE schemaname = 'evo'
  AND indexrelname IN (
    'evolution_webhook_events_v2_2026__instance_name_created_at_idx4',
    'evolution_webhook_events_v2_2026__instance_name_created_at_idx5',
    'evolution_webhook_events_v2_2026__instance_name_created_at_idx6',
    'evolution_webhook_events_v2_2026_1_instance_name_created_at_idx',
    'evolution_webhook_events_v2_2026__instance_name_created_at_idx7',
    'evolution_webhook_events_v2_2026__instance_name_created_at_idx8',
    'evolution_webhook_events_v2_2027_0_instance_name_created_at_idx',
    'evolution_webhook_events_v2_2027__instance_name_created_at_idx1',
    'evolution_webhook_events_v2_2027__instance_name_created_at_idx2',
    'evolution_webhook_events_v2_2027__instance_name_created_at_idx3',
    'evolution_webhook_events_v2_2027__instance_name_created_at_idx4',
    'evolution_webhook_events_v2_2027__instance_name_created_at_idx5',
    'evolution_webhook_events_v2_defaul_instance_name_created_at_idx'
  )
ORDER BY relname, indexrelname;

-- (b) confirmar que NENHUM é PK/UNIQUE/constraint (todos devem retornar f/f):
SELECT i.relname, ix.indisunique, ix.indisprimary
FROM pg_index ix JOIN pg_class i ON i.oid = ix.indexrelid
WHERE i.relname IN ('evolution_webhook_events_v2_2026__instance_name_created_at_idx4', /* …13 nomes… */);
```

### 5.2 Migration (DROP INDEX CONCURRENTLY IF EXISTS — NUNCA em transação)

```sql
-- 20260815120000_cleanup_evo_webhook_v2_redundant_idx.sql
-- Limpeza de 13 índices redundantes (instance_name, created_at DESC) em partições de
-- evo.evolution_webhook_events_v2: nomes truncados/typo (_idx1.._idx8, _2026__, defaul),
-- idx_scan=0 em todas, não-únicos, sem suporte de constraint. Definição canônica preservada
-- no pai (evo_whk_v2_instance_date). Aprovado em revisão sênior em: ____________
-- ⚠️ DROP INDEX CONCURRENTLY NÃO roda dentro de bloco transacional — executar statement a statement.

DROP INDEX CONCURRENTLY IF EXISTS evo.evolution_webhook_events_v2_2026__instance_name_created_at_idx4;
DROP INDEX CONCURRENTLY IF EXISTS evo.evolution_webhook_events_v2_2026__instance_name_created_at_idx5;
DROP INDEX CONCURRENTLY IF EXISTS evo.evolution_webhook_events_v2_2026__instance_name_created_at_idx6;
DROP INDEX CONCURRENTLY IF EXISTS evo.evolution_webhook_events_v2_2026_1_instance_name_created_at_idx;
DROP INDEX CONCURRENTLY IF EXISTS evo.evolution_webhook_events_v2_2026__instance_name_created_at_idx7;
DROP INDEX CONCURRENTLY IF EXISTS evo.evolution_webhook_events_v2_2026__instance_name_created_at_idx8;
DROP INDEX CONCURRENTLY IF EXISTS evo.evolution_webhook_events_v2_2027_0_instance_name_created_at_idx;
DROP INDEX CONCURRENTLY IF EXISTS evo.evolution_webhook_events_v2_2027__instance_name_created_at_idx1;
DROP INDEX CONCURRENTLY IF EXISTS evo.evolution_webhook_events_v2_2027__instance_name_created_at_idx2;
DROP INDEX CONCURRENTLY IF EXISTS evo.evolution_webhook_events_v2_2027__instance_name_created_at_idx3;
DROP INDEX CONCURRENTLY IF EXISTS evo.evolution_webhook_events_v2_2027__instance_name_created_at_idx4;
DROP INDEX CONCURRENTLY IF EXISTS evo.evolution_webhook_events_v2_2027__instance_name_created_at_idx5;
DROP INDEX CONCURRENTLY IF EXISTS evo.evolution_webhook_events_v2_defaul_instance_name_created_at_idx;
```

> Segurança embutida: se algum dos índices estiver `ATTACHED` a um índice do pai, o `DROP` falha com erro
> (não destrói nada); `IF EXISTS` torna a migration idempotente. Nenhum `_pkey` / UNIQUE / FK é tocado.

### 5.3 Pós-checks

```sql
-- Nenhum índice da família A deve restar; famílias B/C/D e pkeys intactas:
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'evo' AND tablename LIKE 'evolution_webhook_events_v2%'
  AND indexname ILIKE '%instance_name_created_at_idx%';

SELECT count(*) AS pkeys_restantes
FROM pg_indexes
WHERE schemaname = 'evo' AND tablename LIKE 'evolution_webhook_events_v2%'
  AND indexname LIKE '%_pkey';
```

### 5.4 Registro

Após aplicação no DB (modelo DB-as-source): registrar em `supabase_migrations.schema_migrations`
(`version` = `20260815120000`, `name` = `cleanup_evo_webhook_v2_redundant_idx`) e espelhar o arquivo
em `supabase/migrations/` (registro histórico do repo). Rodar gates de CI do repo antes do merge (PR).

---

## 6. Critérios de segurança (checklist de aprovação)

- [ ] Revisão sênior explícita (partições-filhas de `evolution_webhook_events` estão na lista "NÃO MEXA" do AGENTS.md)
- [ ] Pré-check (a): os 13 candidatos com `idx_scan = 0` no momento da aplicação
- [ ] Pré-check (b): `indisunique = false` e `indisprimary = false` para todos
- [ ] `pg_constraint`: nenhuma FK/UNIQUE usando estes índices (verificado em 2026-08-15: zero FKs nas 14 tabelas)
- [ ] `DROP INDEX CONCURRENTLY` — nunca dentro de transação; `IF EXISTS` para idempotência
- [ ] Janela de baixo tráfego (CONCURRENTLY ainda toma lock `SHARE UPDATE EXCLUSIVE` curto + varredura)
- [ ] Monitorar `pg_stat_user_indexes`/`pg_stat_statements` por 7 dias após: nenhuma query nova com seq scan pesado em `instance_name`
- [ ] Testar em **staging** antes de produção (fluxo obrigatório AGENTS.md)

---

## 7. Rollback

Recriar com **nomes canônicos corretos** (≤ 63 bytes), `CONCURRENTLY`, fora de transação:

```sql
CREATE INDEX CONCURRENTLY evolution_webhook_events_v2_2026_07_instance_name_created_at_idx ON evo.evolution_webhook_events_v2_2026_07 (instance_name, created_at DESC);
CREATE INDEX CONCURRENTLY evolution_webhook_events_v2_2026_08_instance_name_created_at_idx ON evo.evolution_webhook_events_v2_2026_08 (instance_name, created_at DESC);
CREATE INDEX CONCURRENTLY evolution_webhook_events_v2_2026_09_instance_name_created_at_idx ON evo.evolution_webhook_events_v2_2026_09 (instance_name, created_at DESC);
CREATE INDEX CONCURRENTLY evolution_webhook_events_v2_2026_10_instance_name_created_at_idx ON evo.evolution_webhook_events_v2_2026_10 (instance_name, created_at DESC);
CREATE INDEX CONCURRENTLY evolution_webhook_events_v2_2026_11_instance_name_created_at_idx ON evo.evolution_webhook_events_v2_2026_11 (instance_name, created_at DESC);
CREATE INDEX CONCURRENTLY evolution_webhook_events_v2_2026_12_instance_name_created_at_idx ON evo.evolution_webhook_events_v2_2026_12 (instance_name, created_at DESC);
CREATE INDEX CONCURRENTLY evolution_webhook_events_v2_2027_01_instance_name_created_at_idx ON evo.evolution_webhook_events_v2_2027_01 (instance_name, created_at DESC);
CREATE INDEX CONCURRENTLY evolution_webhook_events_v2_2027_02_instance_name_created_at_idx ON evo.evolution_webhook_events_v2_2027_02 (instance_name, created_at DESC);
CREATE INDEX CONCURRENTLY evolution_webhook_events_v2_2027_03_instance_name_created_at_idx ON evo.evolution_webhook_events_v2_2027_03 (instance_name, created_at DESC);
CREATE INDEX CONCURRENTLY evolution_webhook_events_v2_2027_04_instance_name_created_at_idx ON evo.evolution_webhook_events_v2_2027_04 (instance_name, created_at DESC);
CREATE INDEX CONCURRENTLY evolution_webhook_events_v2_2027_05_instance_name_created_at_idx ON evo.evolution_webhook_events_v2_2027_05 (instance_name, created_at DESC);
CREATE INDEX CONCURRENTLY evolution_webhook_events_v2_2027_06_instance_name_created_at_idx ON evo.evolution_webhook_events_v2_2027_06 (instance_name, created_at DESC);
CREATE INDEX CONCURRENTLY evolution_webhook_events_v2_default_instance_name_created_at_idx ON evo.evolution_webhook_events_v2_default (instance_name, created_at DESC);
```

Se no futuro houver demanda real por `instance_name`, o caminho **correto** é criar o índice **no pai sem
`ON ONLY`** (propaga para partições novas automaticamente), em vez de recriar por-partição.

---

## 8. Fora de escopo / observações

- **Família C (`_status_created_at_idx`)** com `idx_scan=0` em partições novas (`2026_09`+): **mantidas** —
  1 por partição, não duplicadas; são o índice funcional do padrão pending/failed (usado em `2026_07`/`2026_08`).
  Podem entrar em quarentena futura, fora desta proposta.
- **Família D (`_event_type_status_idx`)** em `_default` com `idx_scan=0`: mantida (não duplicada; criada pelo
  cron `fn_create_monthly_partition`; o irmão em `2026_07` é usado).
- **Família E (pkeys)**: `idx_scan=0` em todas — **mesmo assim nunca dropar** (PK; serve `ON CONFLICT`/unicidade).
- **Causa raiz:** o cron atual não gera mais a família A; apenas o histórico legado ficou. Sem ação no cron.
- Tamanho exato dos índices: capturar no pré-check (seção 5.1) — medição via MCP deu timeout em 2026-08-15.
- Nenhum arquivo de migration foi criado/aplicado; nenhum DDL executado (auditoria 100% read-only).

---

## 9. Queries de re-auditoria (prontas)

```sql
-- Inventário completo (mesma query do levantamento):
SELECT n.nspname AS schemaname, t.relname AS tablename, i.relname AS indexname,
       ix.indisprimary, ix.indisunique,
       (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
          FROM unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
         WHERE k.attnum > 0) AS columns
FROM pg_index ix
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_class t ON t.oid = ix.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'evo' AND t.relname LIKE 'evolution_webhook_events_v2%'
ORDER BY t.relname, i.relname;

-- Uso:
SELECT schemaname, relname AS tablename, indexrelname AS indexname, idx_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'evo' AND relname LIKE 'evolution_webhook_events_v2%'
ORDER BY relname, indexrelname;

-- Constraints (FK/PK/UNIQUE) por tabela:
SELECT conrelid::regclass::text AS tbl, conname, contype, conindid::regclass::text AS index_name
FROM pg_constraint
WHERE connamespace = 'evo'::regnamespace
  AND (conrelid IN (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                     WHERE n.nspname = 'evo' AND c.relname LIKE 'evolution_webhook_events_v2%')
    OR confrelid IN (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                     WHERE n.nspname = 'evo' AND c.relname LIKE 'evolution_webhook_events_v2%'));
```
