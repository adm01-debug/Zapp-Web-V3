# Runbook — Evolution API PostgreSQL
**Versão:** 2026-08-07 | **Ambiente:** AtomicaBR VPS, supabase_db (stack 35)

## Acesso
- Host: 10.0.1.98:5432 (interno Docker Swarm)
- DB: postgres
- Schema: evo + zapp + ops
- MCP: https://supabase-mcp.atomicabr.com.br/s-a50174164e4b03ef181a29db65d2db80/mcp

## Monitoramento Diário

### Alertas ativos
```sql
SELECT alert_type, severity, title, created_at
FROM evo.evolution_alerts WHERE resolved IS NOT TRUE
ORDER BY severity, created_at DESC LIMIT 20;
```

### Status dos crôns
```sql
SELECT j.jobname, jrd.start_time, jrd.status
FROM cron.job_run_details jrd JOIN cron.job j ON j.jobid=jrd.jobid
WHERE jrd.start_time > now()-interval '2 hours' ORDER BY jrd.start_time DESC;
```

### Mensagens stuck
```sql
SELECT status, count(*) FROM evo.evolution_messages_wpp2
WHERE status IN ('pending','failed') GROUP BY status;
```

### Slots WAL
```sql
SELECT slot_name, active,
  pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)) AS wal_retido
FROM pg_replication_slots;
```

## Mensagens Pendentes

### Marcar expiradas como failed (>7 dias)
```sql
UPDATE evo.evolution_messages_wpp2 SET status='failed'
WHERE status='pending' AND created_at < now()-interval '7 days';
```

### Verificar reconcile
```sql
SELECT max(applied_at), avg(CASE WHEN http_status BETWEEN 200 AND 299 THEN 1.0 ELSE 0 END)
FROM evo.evolution_reconcile_jobs WHERE applied_at > now()-interval '1 hour';
```

## Manutenção Mensal (Automática)

Cron 'retention_webhook_partitions' roda dia 1 de cada mês às 02:00 BRT.
Dry-run: SELECT * FROM evo.fn_retention_webhook_partitions(TRUE, 3);
Executar: SELECT * FROM evo.fn_retention_webhook_partitions(FALSE, 3);

## Rollback de Índices

```sql
SELECT ddl_create FROM ops.evo_index_ddl_backup WHERE table_name='evolution_contacts';
```

## Slots WAL

| Slot | Plugin | Status |
|---|---|---|
| cainophile_jbs0ipam | pgoutput | Ativo |
| supabase_realtime_slot_realtime_ | wal2json | Ativo |

Se cainophile parar e reter WAL: verificar antes de dropar o slot.

## Componentes

| Componente | Container | Stack |
|---|---|---|
| PostgreSQL 15.8 | supabase_db | 35 |
| PostgREST 14.12 | supabase_rest | 35 |
| Evolution API | evolution_evolution | 25 |
| Consumer Rabbit | evolution-rabbit-consumer | 113 |
