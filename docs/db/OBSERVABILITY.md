# Observability Dashboard

> Visão consolidada de métricas e health checks do banco de dados.

---

## Health Check Functions

```sql
-- Health check rápido
SELECT * FROM ops.fn_health_check();

-- DDL violations
SELECT * FROM ops.v_ddl_violations_unresolved;

-- RLS gaps
SELECT * FROM ops.fn_ci_check_rls_coverage();

-- FK violations
SELECT * FROM ops.fn_ci_check_forbidden_fks();

-- Migration versions
SELECT * FROM ops.fn_ci_check_migration_versions();

-- Cron health
SELECT * FROM ops.v_cron_consecutive_failures;

-- Matview staleness
SELECT * FROM ops.v_matview_stale;

-- Slow queries
SELECT * FROM ops.v_slow_queries LIMIT 20;

-- Index quarantine candidates
SELECT * FROM ops.v_index_quarantine_candidates;

-- Storage policy gaps
SELECT * FROM ops.v_storage_policy_gaps;

-- Cron status
SELECT * FROM ops.v_cron_status;
```

---

## Dashboards recomendados (Grafana)

| Dashboard | Datasource | Panels |
|-----------|-----------|--------|
| PostgreSQL Overview | pg_stat_activity | Connections, queries, locks |
| Slow Queries | pg_stat_statements | Top 20 queries by mean time |
| Replication | pg_replication | WAL lag, slot status |
| Storage | storage.buckets | Bucket sizes, growth rate |
| Cron Jobs | ops.v_cron_status | Job success/failure rate |
| Matview Health | ops.matview_governance | Staleness, refresh duration |

---

## Alerting (Grafana/PagerDuty)

| Condição | Severidade | Ação |
|----------|-----------|------|
| WAL slot behind > 1GB | critical | Page DBA |
| Cron failure x3 consecutive | warning | Slack #alerts |
| Matview stale > 60 min | warning | Slack #alerts |
| Disk usage > 80% | critical | Page DBA |
| RLS violation detected | critical | Page DBA |
| Slow query > 5s | warning | Slack #db-metrics |
| Connection pool > 80% | warning | Slack #db-metrics |
```

---

## Queries úteis de troubleshooting

```sql
-- Queries em execução agora
SELECT pid, now() - query_start AS duration, state, LEFT(query, 100)
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC;

-- Locks bloqueando
SELECT l.locktype, l.relation::regclass, l.granted, l.pid,
       left(a.query, 100) AS blocking_query
FROM pg_locks l
JOIN pg_stat_activity a ON a.pid = l.pid
WHERE NOT l.granted
ORDER BY l.relation;

-- Tables com mais dead tuples
SELECT schemaname, tablename, n_dead_tup, n_live_tup,
       round(n_dead_tup::numeric / nullif(n_live_tup + n_dead_tup, 0) * 100, 1) AS dead_pct
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;

-- Connections por database/role
SELECT datname, usename, count(*)
FROM pg_stat_activity
GROUP BY datname, usename
ORDER BY count DESC;
```
