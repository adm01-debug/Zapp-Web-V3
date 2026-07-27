# PARTITIONS — Tabelas particionadas do banco

> Critico: nunca criar partições manualmente. Realtime usa root table.

---

## Tabelas particionadas

| Tabela | Partition Key | Partitions | Interval |
|--------|--------------|------------|----------|
| `evo.evolution_messages` | `created_at` | 25 | mensal |
| `evo.evolution_conversations` | `created_at` | 25 | mensal |
| `evo.evolution_webhook_events_v2` | `created_at` | 25 | mensal |

---

## Queries de diagnóstico

```sql
-- Listar partições
SELECT
    parent.relname     AS parent_table,
    child.relname      AS partition_name,
    pg_size_pretty(pg_relation_size(child.oid)) AS size
FROM pg_inherits
JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
JOIN pg_class child  ON child.oid  = pg_inherits.inhrelid
ORDER BY parent.relname, child.relname;

-- Verificar tamanho total por tabela particionada
SELECT
    parent.relname,
    pg_size_pretty(sum(pg_relation_size(child.oid))) AS total_size,
    count(child.oid) AS partition_count
FROM pg_inherits
JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
JOIN pg_class child  ON child.oid  = pg_inherits.inhrelid
GROUP BY parent.relname;
```

---

## Regras operacionais

1. **Nunca criar partições manualmente** — o sistema de particionamento
   automático do Evolution API gerencia isso

2. **Realtime**: `publish_via_partition_root = true` — subscribe na root table,
   não nas partições individuais

3. **VACUUM**: VACUUM na root table atinge todas as partições

4. **Índices**: CREATE INDEX na root table cria índices em todas as 25 partições

5. **DROP INDEX CONCURRENTLY**: Funciona na root table, remove de todas as partições

---

## TypeScript — Realtime subscription

```typescript
// ✅ CORRETO: subscribe na root table
supabase
  .channel('evolution_messages')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'evo',
      table: 'evolution_messages',  // root table
    },
    (payload) => handleMessage(payload)
  )
  .subscribe();

// ❌ ERRADO: subscribe em partição específica
.on(
  'postgres_changes',
  {
    event: 'INSERT',
    schema: 'evo',
    table: 'evolution_messages_2026_07',  // partição — NÃO FAÇA ISSO
  },
  ...
);
```
