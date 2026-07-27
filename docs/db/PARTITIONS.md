# Particionamento — Guia Operacional

**Versão:** 1.0 · **Data:** 27/07/2026 · **Etapa 24 do plano DB.**

---

## Tabelas Particionadas

| Tabela Raiz | Schema | Tipo de Partição | # Partições | Chave |
|---|---|---|---:|---|
| `evolution_messages` | `evo` | PARTITION BY LIST | 25 | `instance_name` |
| `evolution_conversations` | `evo` | PARTITION BY LIST | 25 | `instance_name` |
| `evolution_webhook_events_v2` | `evo` | PARTITION BY RANGE | ~17 | `created_at` (mensal) |

---

## Estrutura de Partições — `evolution_messages`

| Partição | Instância | Uso |
|---|---|---|
| `evolution_messages_wpp2` | `wpp2` | Instância principal |
| `evolution_messages_artes` | `artes` | Instância artes |
| `evolution_messages_comercial_01..15` | `comercial_01` a `comercial_15` | 15 instâncias comerciais |
| `evolution_messages_compras` | `compras` | Instância compras |
| `evolution_messages_financeiro` | `financeiro` | Instância financeiro |
| `evolution_messages_logistica` | `logistica` | Instância logística |
| `evolution_messages_marketing` | `marketing` | Instância marketing |
| `evolution_messages_gravacao` | `gravacao` | Instância gravação |
| `evolution_messages_default` | DEFAULT | Fallback para instâncias não mapeadas |

---

## Criação Automática de Partições

O cron `auto-create-monthly-partitions` chama `evo.fn_auto_create_next_partitions()` mensalmente. Esta função cria antecipadamente as partições do próximo mês para `evolution_webhook_events_v2`.

**Verificação:**
```sql
-- Ver partições existentes e seus ranges:
SELECT
    nmsp_parent.nspname AS parent_schema,
    parent.relname      AS parent_table,
    nmsp_child.nspname  AS child_schema,
    child.relname       AS child_table,
    pg_get_expr(child.relpartbound, child.oid) AS partition_bound
FROM pg_inherits
JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
JOIN pg_class child  ON pg_inherits.inhrelid  = child.oid
JOIN pg_namespace nmsp_parent ON nmsp_parent.oid = parent.relnamespace
JOIN pg_namespace nmsp_child  ON nmsp_child.oid  = child.relnamespace
WHERE parent.relname IN ('evolution_messages','evolution_conversations','evolution_webhook_events_v2')
ORDER BY parent.relname, child.relname;
```

---

## Regras Críticas

### 1. NUNCA criar/dropar partição-filha manualmente
Use sempre `evo.fn_auto_create_next_partitions()` ou o cron. Criar partições avulsas pode quebrar o plano de partição do ORM da Evolution API.

### 2. Realtime usa a tabela RAIZ
A publicação `supabase_realtime` tem `publish_via_partition_root = true`. Eventos CDC saem pela tabela raiz, NUNCA pela partição-filha.

```typescript
// CORRETO — assinar a raiz:
supabase.channel('messages')
  .on('postgres_changes', {
    event: '*',
    schema: 'evo',
    table: 'evolution_messages'  // ← raiz
  }, handler)
  .subscribe();

// ERRADO — nunca assinar a partição:
// table: 'evolution_messages_wpp2'  // ← partição = zero eventos
```

### 3. Queries em partições específicas (SELECT)
Para SELECTs, é possível (e mais performático) consultar uma partição diretamente quando a instância é conhecida:

```sql
-- Equivalente mas sem partition pruning overhead:
SELECT * FROM evo.evolution_messages_wpp2 WHERE ...;

-- Alternativa (com partition pruning automático):
SELECT * FROM evo.evolution_messages WHERE instance_name = 'wpp2' AND ...;
```

### 4. VACUUM em tabelas particionadas
`VACUUM ANALYZE evo.evolution_messages` vacuumiza a raiz + todas as partições. Equivalente a:
```sql
VACUUM ANALYZE evo.evolution_messages_wpp2;
VACUUM ANALYZE evo.evolution_messages_artes;
-- ... (todas as 25 partições)
```
Ver cron `vacuum-evolution-partitions` para agendamento.

---

## Índices em Partições

Índices criados na tabela raiz são automaticamente herdados pelas partições:
```sql
-- Criar índice na raiz (aplica a todas as partições):
CREATE INDEX CONCURRENTLY ON evo.evolution_messages (remote_jid, created_at DESC);
-- Resultado: 25 índices criados (um por partição)
```

**Portanto:** o número de índices reportado (2.176 total) inclui **25x multiplicação** para cada índice criado na raiz de tabelas particionadas.

---

## Monitoramento de Partições

```sql
-- Ver tamanho de cada partição:
SELECT
    child.relname AS partition,
    pg_size_pretty(pg_relation_size(child.oid)) AS size,
    pg_size_pretty(pg_total_relation_size(child.oid)) AS total_size
FROM pg_inherits
JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
JOIN pg_class child  ON pg_inherits.inhrelid  = child.oid
JOIN pg_namespace n  ON n.oid = parent.relnamespace
WHERE n.nspname = 'evo'
  AND parent.relname = 'evolution_messages'
ORDER BY pg_total_relation_size(child.oid) DESC;
```
