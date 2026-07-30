-- Evolution API Audit 2026-07-24: PostgreSQL Performance Tuning
--
-- Audit findings (PostgreSQL 15.8, 12 vCPU, 24 GB RAM):
--
--   shared_buffers          = 2 GB   → target 4 GB  (requires PG restart)
--   effective_cache_size    = 4 GB   → target 18 GB (SIGHUP)
--   autovacuum_vacuum_sf    = 0.2    → target 0.02  (SIGHUP) ← already done per-table in melhoria5
--   autovacuum_analyze_sf   = 0.1    → target 0.01  (SIGHUP)
--   wal_compression         = pglz   → target lz4   (SIGHUP, PG15 supports lz4)
--   max_parallel_workers_per_gather = 2 → 4        (SIGHUP)
--   track_functions         = none   → all          (SIGHUP)
--   max_parallel_workers    = 8      → 10           (SIGHUP)
--   parallel_setup_cost     = 1000   → 500          (SIGHUP)
--   parallel_tuple_cost     = 0.1    → 0.05         (SIGHUP)
--
-- IMPORTANT: shared_buffers and wal_init_zero require a full PostgreSQL restart
--            to take effect.  All other settings activate via pg_reload_conf().
--
-- This migration is idempotent (ALTER SYSTEM SET is always idempotent).

-- ── 1. Settings that require a restart ───────────────────────────────────────
-- Will be written to postgresql.auto.conf and applied on next restart.
-- Current value: shared_buffers = 2 GB  (target: 4 GB = ~16% of 24 GB RAM)
ALTER SYSTEM SET shared_buffers = '4GB';

-- Restore WAL init zero (often disabled for speed, but write-security matters)
-- PG15 default is on; confirm it is not accidentally off
ALTER SYSTEM SET wal_init_zero = on;

-- ── 2. Settings that activate on SIGHUP / pg_reload_conf() ───────────────────

-- Planner cost model: tell PG how much RAM the OS will cache
-- 24 GB RAM − 4 GB shared_buffers − ~2 GB OS = ~18 GB available for OS cache
ALTER SYSTEM SET effective_cache_size = '18GB';

-- WAL compression: lz4 is ~3× faster than pglz on this CPU, same ratio
ALTER SYSTEM SET wal_compression = 'lz4';

-- Parallel query: 12 vCPU → allow up to 4 workers per gather, 10 total
ALTER SYSTEM SET max_parallel_workers_per_gather = 4;
ALTER SYSTEM SET max_parallel_workers           = 10;

-- Reduce parallel overhead to encourage parallel plans on medium tables
ALTER SYSTEM SET parallel_setup_cost  = 500;
ALTER SYSTEM SET parallel_tuple_cost  = 0.05;

-- Track function call stats (needed for pg_stat_user_functions slow-query analysis)
ALTER SYSTEM SET track_functions = 'all';

-- Global autovacuum defaults (per-table overrides in melhoria5 take precedence
--  but these cover tables not yet individually tuned)
ALTER SYSTEM SET autovacuum_vacuum_scale_factor   = 0.02;
ALTER SYSTEM SET autovacuum_analyze_scale_factor  = 0.01;
ALTER SYSTEM SET autovacuum_vacuum_cost_delay     = 2;   -- ms; reduce I/O pressure
ALTER SYSTEM SET autovacuum_max_workers           = 4;   -- up from 3 (12-vCPU machine)

-- JIT: enable for complex analytical queries (safe on PG15)
ALTER SYSTEM SET jit = on;

-- Statement timeout guard for long-running queries from application layer
-- (do not set on pg_cron connections — they ignore this via superuser role)
ALTER SYSTEM SET statement_timeout = '120s';   -- 2 min guard; apps reset if needed

-- ── 3. Reload all SIGHUP-capable settings immediately ────────────────────────
SELECT pg_reload_conf();

-- ── 4. Verify what we just set ───────────────────────────────────────────────
SELECT name, setting, unit, context, short_desc
FROM pg_settings
WHERE name IN (
  'shared_buffers',
  'effective_cache_size',
  'wal_compression',
  'max_parallel_workers_per_gather',
  'max_parallel_workers',
  'parallel_setup_cost',
  'parallel_tuple_cost',
  'track_functions',
  'autovacuum_vacuum_scale_factor',
  'autovacuum_analyze_scale_factor',
  'autovacuum_vacuum_cost_delay',
  'autovacuum_max_workers',
  'jit',
  'statement_timeout',
  'wal_init_zero'
)
ORDER BY name;
