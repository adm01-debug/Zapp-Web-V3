# DATABASE SCHEMA RULES — zapp-web-v3

> **Audience:** Human developers AND AI agents (Claude Code, Lovable, etc.)
> **Purpose:** Prevent regressions, security breaches, and data corruption
> **Authority:** This document is the SINGLE SOURCE OF TRUTH for database operations
> **Last updated:** 2026-07-16 (R24) — Score: 100.0/A+ | 25/25 RT PASS

---

## TABLE OF CONTENTS

1. [Architecture Overview](#1-architecture-overview)
2. [Schema Map](#2-schema-map)
3. [CRITICAL Security Rules](#3-critical-security-rules)
4. [Function Creation Rules](#4-function-creation-rules)
5. [View Creation Rules](#5-view-creation-rules)
6. [Table Creation Rules](#6-table-creation-rules)
7. [Migration Rules](#7-migration-rules)
8. [RLS (Row Level Security) Rules](#8-rls-rules)
9. [Column-Level Access Control](#9-column-level-access-control)
10. [PostgREST Exposure Map](#10-postgrest-exposure-map)
11. [Health Score System](#11-health-score-system)
12. [Regression Test Suite](#12-regression-test-suite)
13. [pg_cron Rules](#13-pg_cron-rules)
14. [Performance Rules](#14-performance-rules)
15. [Enum Types](#15-enum-types)
16. [Trigger Rules](#16-trigger-rules)
17. [Common Pitfalls & Bugs](#17-common-pitfalls--bugs)
18. [Operational Procedures](#18-operational-procedures)
19. [MCP Integration Map](#19-mcp-integration-map)
20. [Quick Reference Checklists](#20-quick-reference-checklists)

---

## 1. ARCHITECTURE OVERVIEW

```
Frontend (React/Vite) ──► PostgREST (Supavisor) ──► PostgreSQL 15.8
                                │
                                ├── Schema: public (ONLY exposed layer)
                                │     └── Views + SECURITY DEFINER RPCs
                                │
Evolution API v2.3.7 ──► RabbitMQ ──► Python consumer ──► Schema: evo
                                                          Schema: zapp
```

**Key architectural invariant:** The frontend MUST NEVER use `.schema('evo')` or `.schema('zapp')` directly. All access goes through `public` schema views and RPCs.

**PostgREST configuration:**
```
PGRST_DB_SCHEMAS=public,zapp,storage,graphql_public,artes,vendas,financeiro
```

**WARNING:** PostgREST exposes `zapp`, `artes`, `vendas`, `financeiro` directly. This means ANY table/view in these schemas with `anon` or `authenticated` grants is accessible via REST API. This is why REVOKE operations are critical.

---

## 2. SCHEMA MAP

| Schema | Tables | Views | MatViews | Purpose |
|--------|--------|-------|----------|---------|
| `public` | 1 | 535 | 0 | **API layer** — views + RPCs only. NEVER create base tables here. |
| `zapp` | 312 | 405 | 5 | **Application layer** — all business tables, functions, triggers |
| `evo` | 189 | 16 | 4 | **Evolution API mirror** — webhook events, messages, contacts |
| `ops` | 20 | 4 | 0 | **Operations** — monitoring, health checks, regression tests. PRIVATE. |
| `vendas` | 14 | 5 | 0 | **Legacy** — sales data. RLS enabled, anon revoked. |
| `financeiro` | 16 | 11 | 0 | **Legacy** — financial data. RLS enabled, anon revoked. |
| `artes` | 3 | 1 | 0 | **Legacy** — artwork data. Anon revoked. |
| `archive` | 25 | 0 | 0 | **Archive** — historical data. No external access. |
| `email_app` | 33 | 0 | 0 | **Email** — Gmail integration. |

**Functions by schema:**

| Schema | Total Functions | SECURITY DEFINER |
|--------|----------------|------------------|
| `zapp` | 1,016 | 658 |
| `public` | 131 | 8 |
| `evo` | 67 | 58 |
| `ops` | 44 | 39 |

---

## 3. CRITICAL SECURITY RULES

### Rule S1: NEVER grant `anon` access to zapp/evo tables

```sql
-- WRONG — CATASTROPHIC
GRANT SELECT ON zapp.contacts TO anon;

-- RIGHT — anon accesses data through public views with security_invoker
CREATE VIEW public.contacts WITH (security_invoker=true) AS
  SELECT ... FROM zapp.contacts;
```

**Why:** `anon` is the unauthenticated role. Any table with `anon` grants is accessible without login via PostgREST.

### Rule S2: REVOKE as the ORIGINAL GRANTOR

```sql
-- WRONG — silent no-op (grantor mismatch)
REVOKE SELECT ON zapp.some_table FROM anon;

-- RIGHT — match the grantor
SET ROLE supabase_admin;
REVOKE SELECT ON zapp.some_table FROM anon;
RESET ROLE;
```

**Why:** PostgreSQL requires the revoker to be the same role that granted the privilege. Check `relacl` to identify the grantor (appears after `/`): `anon=r/supabase_admin` means `supabase_admin` granted it.

### Rule S3: Seal DEFAULT PRIVILEGES after every schema

```sql
-- After creating functions in ANY schema, seal PUBLIC EXECUTE:
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA zapp
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
```

**Why:** PostgreSQL grants `=X/postgres` (PUBLIC EXECUTE) to all new functions by default. Without sealing, every new function is callable by `anon`.

### Rule S4: Verify current DEFAULT PRIVILEGES

```sql
-- Check what defaults exist
SELECT n.nspname, d.defaclrole::regrole::text, d.defaclobjtype,
       array_to_string(d.defaclacl, ', ')
FROM pg_default_acl d
JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE n.nspname IN ('public','zapp','evo')
ORDER BY 1,2,3;
```

### Rule S5: The `prevent_role_escalation` trigger

A BEFORE UPDATE trigger on `zapp.profiles` prevents unauthorized role changes. It:
1. `RAISE LOG` (persists in server log even after rollback)
2. `INSERT INTO audit_logs` (records the attempt)
3. `RAISE EXCEPTION` with ERRCODE 42501 (blocks the change)

**NEVER disable or modify this trigger without Joaquim's explicit approval.**

---

## 4. FUNCTION CREATION RULES

### Rule F1: Always REVOKE PUBLIC EXECUTE after CREATE FUNCTION

```sql
-- CORRECT PATTERN:
CREATE OR REPLACE FUNCTION zapp.my_new_function()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'zapp', 'public', 'pg_catalog'
AS $$ BEGIN /* ... */ END; $$;

-- MANDATORY — immediately after creation:
REVOKE EXECUTE ON FUNCTION zapp.my_new_function() FROM PUBLIC;
```

**Why:** Without this, `anon` can execute the function via PostgREST since `zapp` is in `PGRST_DB_SCHEMAS`.

### Rule F2: Always set `search_path` explicitly

```sql
-- WRONG — uses session search_path, vulnerable to search_path injection
CREATE FUNCTION zapp.my_fn() RETURNS void AS $$ ... $$;

-- RIGHT
CREATE FUNCTION zapp.my_fn() RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'zapp', 'public', 'pg_catalog'
AS $$ ... $$;
```

### Rule F3: NEVER use surgical REPLACE on large functions

```sql
-- WRONG — causes body growth and performance regression
-- (R12 incident: 8KB → 19KB, 48ms → 1200ms)
str_replace old_text with new_text in fn_system_health_score

-- RIGHT — canonical full rewrite
CREATE OR REPLACE FUNCTION zapp.fn_system_health_score()
  -- ... complete function body from scratch ...
```

**Why:** PL/pgSQL overhead scales with function body size. Cumulative replacements bloat the body with dead code paths.

### Rule F4: Public wrapper functions for Lovable parity

When a function exists in `zapp` but Lovable/Cloud expects it in `public`, create a thin wrapper:

```sql
CREATE OR REPLACE FUNCTION public.check_user_permission(p_permission_name text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'zapp', 'pg_catalog'
AS $$ BEGIN RETURN zapp.check_user_permission(p_permission_name); END; $$;

REVOKE EXECUTE ON FUNCTION public.check_user_permission(text) FROM PUBLIC;
```

### Rule F5: Verify no PUBLIC EXECUTE leaks after deployment

```sql
-- Must return 0 rows
SELECT p.proname, n.nspname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'zapp')
  AND EXISTS (
    SELECT 1 FROM aclexplode(COALESCE(p.proacl, '{}')) a
    WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  );
```

---

## 5. VIEW CREATION RULES

### Rule V1: All public views MUST have `security_invoker=true`

```sql
-- WRONG — runs as view owner (postgres), bypasses RLS
CREATE VIEW public.contacts AS SELECT * FROM zapp.contacts;

-- RIGHT — runs as calling role, respects RLS
CREATE VIEW public.contacts WITH (security_invoker=true) AS
  SELECT * FROM zapp.contacts;
```

### Rule V2: `security_invoker` storage format

PostgreSQL stores the option value literally as set:
- `ALTER VIEW v SET (security_invoker = on)` → stores `'on'`
- `ALTER VIEW v SET (security_invoker = true)` → stores `'true'`

Both are semantically identical. Any check function MUST handle both:

```sql
-- CORRECT check
WHERE option_name = 'security_invoker'
  AND option_value IN ('on', 'true')
```

### Rule V3: NEVER expose sensitive columns in public views

```sql
-- WRONG
CREATE VIEW public.whatsapp_connections AS
  SELECT * FROM zapp.whatsapp_connections;  -- exposes api_key!

-- RIGHT — omit sensitive columns
CREATE VIEW public.whatsapp_connections WITH (security_invoker=true) AS
  SELECT id, name, phone_number, instance_name, status, ...
    -- api_key OMITTED (credential)
  FROM zapp.whatsapp_connections;
```

**Sensitive columns to NEVER expose in public views:**
- `api_key` (any table)
- `instance_token`
- `access_token`, `app_secret`, `verify_token` (OAuth credentials)
- `proxy_pass` (infrastructure secrets)

### Rule V4: Dropping columns from views requires DROP+RECREATE

```sql
-- WRONG — PostgreSQL error: "cannot drop columns from view"
CREATE OR REPLACE VIEW public.my_view AS SELECT id, name FROM zapp.t;
-- (if previous version had more columns)

-- RIGHT — check dependencies first, then DROP + CREATE
SELECT dependent_view.relname FROM pg_class dependent_view
JOIN pg_depend ON pg_depend.objid = dependent_view.oid
JOIN pg_class source_view ON source_view.oid = pg_depend.refobjid
WHERE source_view.relname = 'my_view'
  AND source_view.relnamespace = 'public'::regnamespace;
-- If 0 dependencies:
DROP VIEW public.my_view;
CREATE VIEW public.my_view WITH (security_invoker=true) AS ...;
```

---

## 6. TABLE CREATION RULES

### Rule T1: Every new table MUST have RLS enabled

```sql
-- CORRECT PATTERN (atomic — no zero-policy window):
BEGIN;
CREATE TABLE zapp.new_table (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ...);
ALTER TABLE zapp.new_table ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_full ON zapp.new_table FOR ALL TO service_role USING (true);
CREATE POLICY auth_full_access ON zapp.new_table FOR ALL TO authenticated USING (true);
COMMIT;
```

**Why:** The `rls_auto_enable` trigger protects against missing RLS, but the window between CREATE TABLE and trigger execution is dangerous.

### Rule T2: NEVER create base tables in `public` schema

The `public` schema is the API layer — views and RPCs only. The only base table allowed is `audit_logs` (legacy).

### Rule T3: FK indexes on small tables are unnecessary

```sql
-- DON'T create FK indexes on tables < 40kB
-- Sequential scans are faster at that size
-- Check: SELECT pg_total_relation_size('zapp.small_table');
```

---

## 7. MIGRATION RULES

### Rule M1: Migration file naming

```
supabase/migrations/YYYYMMDDHHMMSS_rNN_description.sql
```

Example: `20260716210200_r24_rt10_webhook_pipeline_score.sql`

### Rule M2: Every migration MUST be idempotent

```sql
-- Use IF NOT EXISTS, CREATE OR REPLACE, DO $$ blocks
CREATE TABLE IF NOT EXISTS ...;
CREATE OR REPLACE FUNCTION ...;
DO $$ BEGIN
  IF NOT EXISTS (...) THEN ...;
  END IF;
END $$;
```

### Rule M3: Include verification SELECTs as comments

```sql
-- Verify: expects 0
-- SELECT count(*) FROM pg_proc WHERE proname='my_fn'
--   AND has_function_privilege('anon', oid, 'EXECUTE');
```

### Rule M4: RLS migrations MUST be atomic

```sql
-- WRONG — zero-policy exposure window between ENABLE and CREATE POLICY
ALTER TABLE zapp.t ENABLE ROW LEVEL SECURITY;
CREATE POLICY p ON zapp.t ...;

-- RIGHT — atomic block
BEGIN;
ALTER TABLE zapp.t ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_full ON zapp.t FOR ALL TO service_role USING (true);
CREATE POLICY auth_full_access ON zapp.t FOR ALL TO authenticated USING (true);
COMMIT;
```

### Rule M5: Commit format

```
fix(db): R24 RT10 - description [25/25 PASS]
perf(db): description
test(db): description
docs(db): description
```

### Rule M6: Push via GITHUB MCP FOREVER only

The VPS GitHub PAT is expired. ALL pushes go through the `GITHUB - MCP - FOREVER` Cloudflare Worker at `github-mcp-server.adm01.workers.dev`. No exceptions.

---

## 8. RLS RULES

### Current RLS coverage: 100%

| Schema | Tables | RLS ON |
|--------|--------|--------|
| evo | 193 | 193 (100%) |
| zapp | 312 | 312 (100%) |
| public | 1 | 1 (100%) |

### Rule R1: Standard RLS policy pattern

```sql
-- Minimum 2 policies per table:
CREATE POLICY service_role_full ON schema.table
  FOR ALL TO service_role USING (true);
CREATE POLICY auth_full_access ON schema.table
  FOR ALL TO authenticated USING (true);
```

### Rule R2: NEVER disable RLS temporarily

```sql
-- CATASTROPHIC — opens table to anon during the window
ALTER TABLE zapp.t DISABLE ROW LEVEL SECURITY;
-- ... do work ...
ALTER TABLE zapp.t ENABLE ROW LEVEL SECURITY;
```

### Rule R3: Tables with RLS but zero policies = locked out

```sql
-- This query must return 0:
SELECT count(*) FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND n.nspname IN ('evo','zapp')
  AND c.relrowsecurity = true
  AND c.relname NOT LIKE '%_202%'  -- exclude partitions
  AND (SELECT count(*) FROM pg_policies pp
       WHERE pp.schemaname = n.nspname AND pp.tablename = c.relname) = 0;
```

---

## 9. COLUMN-LEVEL ACCESS CONTROL

### Rule C1: Excluding a column from SELECT requires table-level REVOKE + column-level GRANT

```sql
-- Remove api_key from authenticated SELECT:
REVOKE SELECT ON zapp.whatsapp_connections FROM authenticated;
GRANT SELECT (id, name, phone_number, instance_name, status, ...)
  ON zapp.whatsapp_connections TO authenticated;
-- Note: INSERT/UPDATE/DELETE preserved — only SELECT affected
```

**Why:** `information_schema.column_privileges` shows table-level grants as column-level entries. The ONLY way to exclude a specific column is this pattern.

### Rule C2: Columns currently excluded from `authenticated` SELECT

| Table | Excluded Column | Reason |
|-------|----------------|--------|
| `zapp.whatsapp_connections` | `api_key` | Evolution API credential |
| `zapp.instance_registry` | `api_key` | Evolution API credential |
| `public.whatsapp_connections` (view) | `api_key` | Not in view definition |
| `public.evolution_instance_credentials` (view) | `api_key`, `instance_token` | Credentials |

---

## 10. POSTGREST EXPOSURE MAP

PostgREST exposes schemas listed in `PGRST_DB_SCHEMAS`. Currently:

```
public, zapp, storage, graphql_public, artes, vendas, financeiro
```

**This means:** Any object in these schemas with appropriate grants is accessible via REST API.

### What is safe

- `public` views with `security_invoker=true` — safe, RLS applies
- `public` SECURITY DEFINER RPCs — safe if properly permissioned
- Schemas with ALL grants revoked from `anon` — safe

### What is DANGEROUS

- Tables in `zapp` with `anon` SELECT — **exposed without auth**
- Functions in `zapp` with `anon` EXECUTE — **callable without auth**
- Any object in `artes/vendas/financeiro` with `anon` grants — **exposed**

### Current state: ALL `anon` grants removed from zapp/artes/vendas/financeiro/logistica/cron/net

---

## 11. HEALTH SCORE SYSTEM

### Function: `zapp.fn_system_health_score()`

Returns JSONB with `score` (0-100), `grade` (A+/A/B/C/F), `breakdown` (21 dimensions).

### 21 Dimensions (160 max points)

| # | Dimension | Max | What it measures |
|---|-----------|-----|------------------|
| 1 | wpp2_connection | 20 | WhatsApp instance status + stale detection |
| 2 | webhook_pipeline | 15 | Pipeline health via `fn_webhook_pipeline_score()` |
| 3 | partition_indexes | 10 | Evolution message partition indexes present |
| 4 | dead_tuples | 10 | Dead tuple percentage on hot tables |
| 5 | vault_secrets | 10 | webhook_secret_evolution in vault |
| 6 | r2_storage | 10 | Cloudflare R2 configuration status |
| 7 | ghost_instances | 5 | Active instances without phone number |
| 8 | cron_health | 5 | pg_cron failure count (1h window) |
| 9 | audit_log_bloat | 5 | webhook_audit_log size (<300MB) |
| 10 | idle_connections | 5 | Idle connection count (<35) |
| 11 | cron_log_size | 5 | cron.job_run_details size (<50MB) |
| 12 | pk_integrity | 5 | Tables without primary key |
| 13 | rls_coverage | 5 | Tables with RLS disabled |
| 14 | security_posture | 5 | Anon grants on zapp/evo objects |
| 15 | redis_health | 5 | Redis memory policy + usage |
| 16 | evolution_db | 5 | Evolution DB accessibility |
| 17 | observability | 5 | Bridge views present (7 expected) |
| 18 | backup_freshness | 10 | Backup age (<12h = full, <24h = ok) |
| 19 | security_acl | 5 | 14-vector security ACL check |
| 20 | wal_slot_health | 5 | WAL replication slot lag |
| 21 | v2_mirror_pipeline | 10 | V2 webhook pipeline health |

### CRITICAL RULE: R13 Arbitration (permanent)

`fn_system_health_score` uses a 1-hour window with NO message filters. This was arbitrated by Joaquim on 2026-07-11. **Do NOT reintroduce any alternative configuration.**

### CRITICAL RULE: Never modify via surgical REPLACE

Any modification to `fn_system_health_score` MUST be a complete canonical rewrite from scratch. See Rule F3.

---

## 12. REGRESSION TEST SUITE

### Function: `ops.fn_regression_tests()`

Returns 25 tests (RT01-RT25). **ALL must pass for score to be valid.**

| Test | What it checks | FAIL action |
|------|---------------|-------------|
| RT01 | 7 bridge views have security_invoker | Fix view options |
| RT02 | api_key column not accessible by auth/anon | REVOKE + column-level GRANT |
| RT03 | anon has zero grants on zapp tables | REVOKE all anon grants |
| RT04 | 100% RLS coverage in public+zapp | ENABLE RLS + policies |
| RT05 | ops checks (lovable_parity + schema_drift + critical_fks) | Fix missing objects |
| RT06 | Bridge parity (data consistency) | Fix view definitions |
| RT07 | Health score >= 85 | Fix degraded dimensions |
| RT08 | Guardrails catalog clean | Fix catalog issues |
| RT09 | 3 INSTEAD OF triggers on app_notifications | Create triggers |
| RT10 | fn_system_health_score references webhook_audit_log only in comments | Use fn_webhook_pipeline_score() |
| RT11 | Infrastructure check >= 85% | Fix infra issues |
| RT12 | Zero tables without PK | Add primary keys |
| RT13 | Health score has 18+ dimensions | Fix missing dimensions |
| RT14 | No broken vacuum cron job | Remove vacuum_critical_tables |
| RT15 | Schema changelog has 20+ entries | Populate changelog |
| RT16 | Edge function registry >= 100 active | Register functions |
| RT17 | Mirror integrity zero CRITICAL | Fix mirror checks |
| RT18 | api_key not in plain SELECT grants (zapp/evo) | Column-level REVOKE |
| RT19 | evolution_instance_credentials view no secrets | Recreate view without api_key/instance_token |
| RT20 | ops schema not accessible by anon/auth | REVOKE ops grants |
| RT21 | idle_in_transaction_session_timeout on 3 roles | Configure timeouts |
| RT22 | vendas G1 RLS fix | Enable RLS on vendas tables |
| RT23 | G8 legacy sentinel | Revoke anon from legacy schemas |
| RT24 | All matviews populated | REFRESH MATERIALIZED VIEW |
| RT25 | Guardian heartbeat fresh (<30 min) | Check guardian service |

---

## 13. PG_CRON RULES

### Rule CR1: Multi-statement jobs FAIL

```sql
-- WRONG — "VACUUM cannot run inside a transaction block"
SELECT cron.schedule('my-job', '0 3 * * *',
  'VACUUM zapp.table1; VACUUM zapp.table2;');

-- RIGHT — separate jobs
SELECT cron.schedule('vacuum-t1', '0 3 * * *', 'VACUUM zapp.table1');
SELECT cron.schedule('vacuum-t2', '5 3 * * *', 'VACUUM zapp.table2');
```

### Rule CR2: VACUUM via `fn_force_autovacuum`

pg_cron cannot run VACUUM directly. Use the helper function:

```sql
SELECT zapp.fn_force_autovacuum('zapp', 'my_table');
-- This runs ANALYZE + sets aggressive autovacuum thresholds
-- A second cron job 2 minutes later restores defaults
```

### Rule CR3: dblink calls need explicit casts

```sql
-- WRONG — "function dblink(text, unknown) does not exist"
SELECT public.dblink(v_conn, $q$SELECT 1$q$);

-- RIGHT — cast both arguments
SELECT public.dblink(v_conn::text, ($q$SELECT 1$q$)::text);
```

---

## 14. PERFORMANCE RULES

### Rule P1: Never run 5+ concurrent `fn_system_health_score()` calls

Causes connection contention and anomalous scores. Sequential calls only.

### Rule P2: VACUUM via portainer, not Supavisor

```bash
# Supavisor wraps in transaction → VACUUM fails
# Use portainer_exec_container with direct psql:
psql -U postgres -d postgres -c "VACUUM zapp.my_table"
```

### Rule P3: DROP INDEX requires CONCURRENTLY outside transaction

```sql
-- Via portainer_exec_container:
DROP INDEX CONCURRENTLY IF EXISTS evo.idx_name;
-- Cannot be inside BEGIN/COMMIT
```

### Rule P4: GIN tsvector index on `evolution_messages_wpp2` — DO NOT DROP

This is a partition of `evolution_messages`. `rpc_search_messages` uses the parent table for FTS. Zero scans means the feature hasn't been called recently, NOT that the index is unused.

---

## 15. ENUM TYPES

Enums MUST exist in BOTH `zapp` (canonical) and `public` (for search_path resolution):

| Enum | Values |
|------|--------|
| `channel_type` | whatsapp, instagram, telegram, messenger, webchat, email |
| `ai_provider_type` | lovable_ai, openai_compatible, google_gemini, custom_webhook, custom_agent |
| `app_role` | admin, manager, supervisor, agent, special_agent, dev |
| `service_account_type` | google_sheets, google_docs, google_calendar, google_drive, dropbox |

**If adding a new enum value:** Add to BOTH schemas.

---

## 16. TRIGGER RULES

### Rule TR1: INSTEAD OF triggers for public views

When a public view wraps a zapp table and the frontend does INSERT/UPDATE/DELETE, create INSTEAD OF triggers:

```sql
CREATE FUNCTION zapp.fn_my_view_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'zapp', 'public', 'pg_catalog'
AS $$ BEGIN
  INSERT INTO zapp.my_table (...) VALUES (NEW...);
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_my_view_insert
  INSTEAD OF INSERT ON public.my_view
  FOR EACH ROW EXECUTE FUNCTION zapp.fn_my_view_insert();
```

### Rule TR2: `updated_at` triggers

Every table with an `updated_at` column should have:

```sql
CREATE TRIGGER trg_updated_at
  BEFORE UPDATE ON zapp.my_table
  FOR EACH ROW EXECUTE FUNCTION zapp.fn_set_updated_at();
```

---

## 17. COMMON PITFALLS & BUGS

### Pitfall 1: `REVOKE EXECUTE FROM PUBLIC` executed as wrong role

```sql
-- If function was created by postgres, this is correct:
REVOKE EXECUTE ON FUNCTION zapp.fn() FROM PUBLIC;

-- But if created by supabase_admin:
SET ROLE supabase_admin;
REVOKE EXECUTE ON FUNCTION zapp.fn() FROM PUBLIC;
RESET ROLE;
```

### Pitfall 2: `ALTER DEFAULT PRIVILEGES` doesn't affect existing objects

Only affects FUTURE objects. Must also run explicit REVOKE on existing objects:

```sql
-- Fix future:
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA zapp
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- Fix existing:
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA zapp FROM PUBLIC;
```

### Pitfall 3: `pg_get_function_identity_arguments` vs `pg_get_function_arguments`

Use `pg_get_function_identity_arguments(p.oid)` for precise REVOKE statements. The other includes OUT parameters which cause mismatches.

### Pitfall 4: `aclexplode` grantee=0 means PUBLIC

```sql
-- grantee=0 in aclexplode = PUBLIC pseudo-role
SELECT * FROM aclexplode(COALESCE(p.proacl, '{}')) a
WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE';
```

### Pitfall 5: Supavisor wraps everything in transactions

Any SQL sent via Supavisor (PostgREST, Supabase client) is wrapped in a transaction. This blocks VACUUM, DROP INDEX CONCURRENTLY, and other DDL that requires being outside a transaction.

**Solution:** Use `portainer_exec_container` for direct psql access.

### Pitfall 6: Creating functions in ANY schema inherits PUBLIC EXECUTE

This is a PostgreSQL base behavior, not a Supabase issue. Applies to `zapp`, `public`, `evo`, `ops` — ALL schemas.

### Pitfall 7: `information_schema.column_privileges` includes table-level grants

A table-level `GRANT SELECT ON table TO role` appears as individual column entries in `information_schema.column_privileges`. This can make it seem like column-level grants exist when they don't.

---

## 18. OPERATIONAL PROCEDURES

### 18.1 Running Health Score

```sql
-- Single run:
SELECT zapp.fn_system_health_score();

-- 5 consecutive (stability check):
SELECT (x::jsonb)->>'score' FROM (SELECT zapp.fn_system_health_score()::text AS x) _;
-- Repeat 5 times sequentially. NEVER in parallel.
```

### 18.2 Running Regression Tests

```sql
SELECT test_name, status, detail FROM ops.fn_regression_tests() ORDER BY status, test_name;
```

### 18.3 Checking Security ACL

```sql
SELECT zapp.fn_score_security_acl();
-- Returns 14 vectors, all should be 0, score should be 5/5
```

### 18.4 Testing with Automatic Rollback

```sql
DO $$ DECLARE r jsonb;
BEGIN
  -- ... your test operations ...
  r := jsonb_build_object('result', 'data');
  RAISE EXCEPTION 'TEST|%', r;  -- embeds result in error, auto-rollback
END $$;
```

### 18.5 VACUUM Operations

```bash
# Via portainer_exec_container (container ID may change — always verify first):
psql -U postgres -d postgres -c "VACUUM ANALYZE zapp.my_table"
```

### 18.6 Checking for Security Drift

```sql
-- New anon grants since last audit:
SELECT n.nspname, c.relname, c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('zapp','evo')
  AND c.relacl IS NOT NULL
  AND EXISTS (SELECT 1 FROM unnest(c.relacl) acl
              WHERE acl::text LIKE 'anon=%' OR acl::text ~ '^=');

-- New PUBLIC EXECUTE functions:
SELECT n.nspname, p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public','zapp')
  AND EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl,'{}')) a
              WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE');
```

---

## 19. MCP INTEGRATION MAP

| MCP | Usage | Key Limitation |
|-----|-------|----------------|
| SUPABASE SELF HOSTED | `supabase_db_query` for SQL, `supabase_db_batch_query` for parallel reads | Cannot run VACUUM (Supavisor wraps in tx) |
| PORTAINER | `portainer_exec_container` for direct psql/shell | Container IDs change on restart — always list first |
| GITHUB MCP FOREVER | `github_push_files` for commits | Payload limit: 1 file per call for >10kB |
| EVO API MCP | `evo_instance_info/connect` | `evo_instance_connect` ignores `number` param |

### Container IDs (current — may change on restart)

| Service | Container ID |
|---------|-------------|
| Supabase DB | `8e3c226f7f1e` |
| PostgREST | `f4414a70053c` |

**Always run `portainer_list_containers` before using container IDs.**

---

## 20. QUICK REFERENCE CHECKLISTS

### Before Creating a New Table

- [ ] Schema is `zapp` (never `public`)
- [ ] RLS enabled in atomic BEGIN/COMMIT block
- [ ] At least 2 policies (service_role_full + auth_full_access)
- [ ] Primary key defined
- [ ] `created_at` and `updated_at` columns with defaults
- [ ] `updated_at` trigger created
- [ ] No `anon` grants (verify with `relacl`)

### Before Creating a New Function

- [ ] `SECURITY DEFINER` set (if needed)
- [ ] `SET search_path` explicit
- [ ] `REVOKE EXECUTE FROM PUBLIC` after creation
- [ ] Verify `has_function_privilege('anon', oid, 'EXECUTE')` returns false
- [ ] If in `public`: is it a wrapper or direct implementation?

### Before Creating a New View in `public`

- [ ] `WITH (security_invoker=true)` set
- [ ] No sensitive columns (api_key, tokens, secrets)
- [ ] INSTEAD OF triggers if frontend does DML
- [ ] Verify in `pg_options_to_table` that security_invoker is set

### Before Deploying a Migration

- [ ] Migration file follows naming convention
- [ ] SQL is idempotent (IF NOT EXISTS, CREATE OR REPLACE)
- [ ] Verification SELECTs included as comments
- [ ] RLS changes are atomic (BEGIN/COMMIT)
- [ ] No direct `anon` grants anywhere
- [ ] REVOKE PUBLIC EXECUTE for any new functions
- [ ] Run `ops.fn_regression_tests()` after — all 25 must PASS
- [ ] Run `zapp.fn_system_health_score()` — must be ≥ 95.0

### After Any Database Change

- [ ] Run regression tests: `SELECT * FROM ops.fn_regression_tests()`
- [ ] Run health score: `SELECT zapp.fn_system_health_score()`
- [ ] Check for PUBLIC EXECUTE leaks
- [ ] Check for anon grant drift
- [ ] Commit migration to GitHub via GITHUB MCP FOREVER

---

## APPENDIX A: Key Function Baselines (R24)

| Function | Schema | Size | Description |
|----------|--------|------|-------------|
| `fn_system_health_score` | zapp | ~15KB | 21-dimension health score |
| `fn_score_security_acl` | zapp | ~7.2KB | 14-vector security check |
| `fn_score_v2_pipeline` | zapp | ~725B | V2 webhook pipeline |
| `fn_webhook_pipeline_score` | zapp | ~3.5KB | Webhook audit log queries (RT10) |
| `fn_regression_tests` | ops | ~11.2KB | 25 regression tests |
| `check_mirror_integrity` | ops | v1.2 | 7 mirror integrity checks |
| `check_critical_fks` | ops | Cenário B | 20 FK pairs verified |
| `check_lovable_parity` | ops | v2.1 | Lovable parity verification |
| `check_schema_drift` | ops | — | Expected tables/columns check |

---

## APPENDIX B: Security ACL Vectors (14 total)

All must be 0 for score=5/5:

1. `anon_email_execute` — anon can execute rpc_email_* functions
2. `anon_email_view_select` — anon can SELECT email views
3. `anon_rpc_all_execute` — anon can execute ANY rpc_* function
4. `anon_sensitive_execute` — anon can execute sensitive functions
5. `views_no_si_anon` — public views without security_invoker that anon can SELECT
6. `open_critical` — unresolved CRITICAL security alerts
7. `open_high` — unresolved HIGH security alerts
8. `anon_any_execute` — anon can execute ANY function in public
9. `public_grant_execute` — PUBLIC (grantee=0) can execute functions
10. `auth_purge_no_guard` — authenticated can execute purge functions
11. `evo_views_no_si` — public views pointing to evo without security_invoker
12. `rls_zero_policy` — tables with RLS enabled but zero policies
13. `anon_exe_evo_zapp_breach` — anon can execute functions in evo/zapp with USAGE
14. `legacy_rls_off_anon` — legacy schema tables with RLS=OFF and anon SELECT

---

*This document is maintained alongside the codebase. Any database schema change MUST be validated against these rules before deployment.*
