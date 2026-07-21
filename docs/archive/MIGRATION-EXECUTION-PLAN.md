# Round 15 Migration Execution Plan - Step-by-Step Deployment

**Status**: READY FOR EXECUTION  
**Date**: 2026-07-12  
**Target Environment**: Staging Database  
**Total Migrations**: 6  
**Total Lines of SQL**: 1,351  
**Estimated Execution Time**: 8-12 minutes  
**Risk Level**: LOW (all backward-compatible, immutable structures)

---

## Pre-Execution Validation Checklist

- [x] All 6 migration files present and valid
- [x] SQL syntax verified for all migrations
- [x] No circular dependencies detected
- [x] Backward compatibility confirmed
- [x] Rollback procedures documented
- [x] Monitoring dashboards prepared
- [x] Team sign-off checklist created

---

## MIGRATION #1: Contact ID Reuse Prevention (CRITICAL GAP #1)

**File**: `20260712160000_fix_contact_id_reuse_critical.sql` (151 lines)  
**Problem**: Deleted contact IDs can be reassigned to new users, inheriting deletion history  
**Solution**: Immutable graveyard table prevents ID reuse for 7 years  
**Risk**: MINIMAL - creates new tables only, no breaking changes  

### Step 1.1: Pre-Execution Validation

Run these queries BEFORE applying migration to establish baseline:

```sql
-- Check current contacts table structure
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'contacts' 
ORDER BY ordinal_position;

-- Check for existing contact_id_graveyard table (should not exist)
SELECT COUNT(*) as graveyard_exists 
FROM information_schema.tables 
WHERE table_name = 'contact_id_graveyard';

-- Verify no prior DELETE triggers on contacts
SELECT trigger_name 
FROM information_schema.triggers 
WHERE event_object_table = 'contacts' 
AND trigger_name LIKE '%graveyard%';

-- Record current contacts count
SELECT COUNT(*) as total_contacts FROM contacts;
```

### Step 1.2: Execute Migration

**Option A: Via psql CLI**
```bash
# Set connection string
export DB_URL="postgresql://user:password@host:5432/database"

# Execute migration
psql "$DB_URL" < supabase/migrations/20260712160000_fix_contact_id_reuse_critical.sql

# Expected output: No errors, all CREATE/ALTER statements succeed
```

**Option B: Via Supabase CLI**
```bash
# Authenticate first
supabase auth

# Push migration to staging
supabase db push --remote staging

# Verify applied
supabase db list-migrations --remote staging
```

**Option C: Via Supabase Dashboard**
1. Open Supabase Project → SQL Editor
2. Copy entire migration content
3. Paste into SQL Editor
4. Click "Run" button
5. Verify success message

### Step 1.3: Post-Execution Validation

Run these queries IMMEDIATELY after migration succeeds:

```sql
-- Verify graveyard table created
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'contact_id_graveyard';
-- Expected: contact_id_graveyard

-- Verify graveyard indexes
SELECT indexname FROM pg_indexes 
WHERE tablename = 'contact_id_graveyard';
-- Expected: 2 indexes (lookup + expiration)

-- Verify trigger created
SELECT trigger_name, event_manipulation 
FROM information_schema.triggers 
WHERE event_object_table = 'contacts' 
AND trigger_name = 'trigger_prevent_contact_id_reuse';
-- Expected: trigger_prevent_contact_id_reuse, BEFORE INSERT

-- Verify functions exist
SELECT proname, proleakproofs 
FROM pg_proc p 
JOIN pg_namespace n ON n.oid = p.pronamespace 
WHERE n.nspname = 'public' 
AND proname IN ('is_contact_id_available', 'add_to_contact_id_graveyard', 'prevent_contact_id_reuse', 'cleanup_expired_contact_ids');
-- Expected: 4 functions returned

-- Verify pg_cron job scheduled
SELECT cron_name, schedule 
FROM cron.job 
WHERE cron_name = 'cleanup_expired_contact_ids';
-- Expected: '0 2 * * *' (2 AM UTC daily)

-- Verify RLS policy on graveyard
SELECT policyname, cmd 
FROM pg_policies 
WHERE tablename = 'contact_id_graveyard';
-- Expected: graveyard_no_direct_access, ALL
```

### Step 1.4: Functional Testing

Test the ID reuse prevention mechanism:

```sql
-- Create test contact
INSERT INTO contacts (user_id, name, email, phone)
VALUES ('test-user-uuid', 'Test User', 'test@example.com', '555-0001')
RETURNING id::BIGINT as contact_id;
-- Expected: Returns a contact ID (e.g., 12345)

-- Record the ID for next steps
-- Let's assume ID is 12345

-- Delete the contact (trigger will add ID to graveyard)
SELECT delete_contact_completely('contact-uuid-here');
-- Expected: Notice message "Contact ... deleted, ID marked in graveyard until ..."

-- Verify ID is in graveyard
SELECT deleted_contact_id, expiration_date 
FROM contact_id_graveyard 
WHERE deleted_contact_id = 12345;
-- Expected: 12345, future date ~7 years from now

-- Test: Attempt to reuse the same ID (should fail)
BEGIN;
  INSERT INTO contacts (id, user_id, name, email, phone)
  VALUES (12345, 'test-user-2', 'test2@example.com', '555-0002');
-- Expected: ERROR unique_violation "Contact ID ... was previously deleted..."
ROLLBACK;

-- Test: Create new contact with different ID (should succeed)
INSERT INTO contacts (user_id, name, email, phone)
VALUES ('test-user-3', 'Test User 3', 'test3@example.com', '555-0003')
RETURNING id::BIGINT as new_contact_id;
-- Expected: Returns new ID (different from 12345)
```

### Step 1.5: Performance Impact

Measure performance impact of new trigger:

```sql
-- Baseline: Insert 100 contacts without graveyard validation
EXPLAIN ANALYZE
INSERT INTO contacts (user_id, name, email, phone)
SELECT 'user-' || s, 'Name ' || s, 'email' || s || '@test.com', '555-' || s
FROM generate_series(1, 100) s;
-- Expected: <500ms total (includes trigger overhead)

-- Verify no unexpected queries added
SELECT query, calls, mean_exec_time 
FROM pg_stat_statements 
WHERE query LIKE '%contact_id_graveyard%' 
ORDER BY calls DESC;
-- Expected: Minimal calls, <5ms mean execution time
```

---

## MIGRATION #2: Snapshot Consistency (SERIALIZABLE Isolation)

**File**: `20260712160100_fix_serializable_snapshot_consistency.sql` (210 lines)  
**Depends On**: Migration #1 (can theoretically run independently, but recommended after #1)  
**Creates**: _snapshot_version_state table + version tracking triggers  

### Pre-Execution (After Migration #1 succeeds)

```sql
-- Verify snapshot table does not exist yet
SELECT COUNT(*) as snap_table_exists 
FROM information_schema.tables 
WHERE table_name = '_snapshot_version_state';
-- Expected: 0
```

### Execute Migration #2

Same execution methods as Migration #1 (psql / Supabase CLI / Dashboard)

### Post-Execution Validation

```sql
-- Verify snapshot table exists
SELECT * FROM _snapshot_version_state;
-- Expected: contacts, version_number=1

-- Verify triggers on contacts
SELECT trigger_name 
FROM information_schema.triggers 
WHERE event_object_table = 'contacts' 
AND trigger_name LIKE '%snapshot%';
-- Expected: 3 triggers (insert, update, delete)

-- Test snapshot versioning
BEGIN;
  SELECT get_snapshot_version('contacts') as v1;
  -- Expected: 1
  
  INSERT INTO contacts (user_id, name, email) VALUES ('test', 'Test', 'test@x.com');
  
  SELECT get_snapshot_version('contacts') as v2;
  -- Expected: 2 (incremented)
COMMIT;

-- Test snapshot validation
SELECT validate_snapshot_freshness('contacts', 1);
-- Expected: FALSE (version changed to 2)

SELECT validate_snapshot_freshness('contacts', 2);
-- Expected: TRUE (current version is 2)
```

---

## MIGRATION #3: Consent Audit Archival

**File**: `20260712160200_fix_consent_audit_growth.sql` (227 lines)  
**Creates**: lgpd_consent_audit_archive + retention policy  
**Performance Impact**: 90% table size reduction expected  

### Execute Migration #3

### Post-Execution Validation

```sql
-- Verify archive table exists
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_name = 'lgpd_consent_audit_archive';
-- Expected: 1

-- Verify retention policy table
SELECT retention_days, archive_after_days, active 
FROM consent_audit_retention_policy 
WHERE active = true;
-- Expected: 90, 90, true

-- Verify cron jobs scheduled
SELECT cron_name, schedule 
FROM cron.job 
WHERE cron_name IN ('consent_audit_archival_daily', 'consent_audit_metrics_daily');
-- Expected: 2 jobs, schedules at 3 AM and 4 AM UTC

-- Test archival (manual trigger)
SELECT archive_old_consent_records(90);
-- Expected: archived_records, batch_id, archive_timestamp
```

---

## MIGRATION #4: RLS Hardening (CTE + JOIN Introspection)

**File**: `20260712160300_fix_rls_cte_join_introspection.sql` (221 lines)  
**Security Impact**: CRITICAL - prevents schema introspection attacks  

### Execute Migration #4

### Post-Execution Validation

```sql
-- Verify information_schema access revoked
SELECT has_schema_privilege('public', 'information_schema', 'USAGE');
-- Expected: FALSE for public role

-- Verify safe functions created
SELECT proname FROM pg_proc p 
JOIN pg_namespace n ON n.oid = p.pronamespace 
WHERE n.nspname = 'public' 
AND proname LIKE '%safe%';
-- Expected: get_contacts_via_cte_safe, get_conversations_safe_join, safe_execute_query

-- Test RLS CTE wrapper
SELECT * FROM get_contacts_via_cte_safe('email', 'test@example.com');
-- Expected: Only contacts owned by current user

-- Test error masking
SELECT safe_execute_query('SELECT * FROM nonexistent_table');
-- Expected: 'Resource not found' (not revealing schema)
```

---

## MIGRATION #5: Query DoS Prevention & Performance

**File**: `20260712160400_fix_query_dos_and_performance.sql` (234 lines)  
**Indexes**: 3 new partial indexes for OR optimization  
**Pagination**: Cursor-based replacement for OFFSET  

### Execute Migration #5

### Post-Execution Validation - Performance Critical

```sql
-- Verify indexes created
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'contacts' 
AND indexname LIKE '%idx_contacts%';
-- Expected: email_deleted_at, phone_deleted_at, name_lower_deleted_at, or_search

-- Test OR-clause performance (SHOULD BE <50ms)
EXPLAIN ANALYZE
SELECT * FROM contacts 
WHERE email = 'test@example.com' 
   OR phone = '555-0001' 
   OR LOWER(name) LIKE '%smith%';
-- Expected: Index Scan(s), execution time <50ms

-- Verify pagination table exists
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_name = '_pagination_state';
-- Expected: 1

-- Test cursor pagination
SELECT create_pagination_cursor('contacts', '00000000-0000-0000-0000-000000000000'::UUID) as cursor_id;
-- Expected: 64-character hex string

SELECT get_page_via_cursor(cursor_id_from_above, 50);
-- Expected: row_count, cursor_id, next_cursor_id
```

---

## MIGRATION #6: Input Validation & Cryptographic Hardening

**File**: `20260712160500_fix_input_validation_clock_crypto.sql` (308 lines)  
**Features**: NFKC normalization, entity decoding, authoritative time, key versioning  

### Execute Migration #6

### Post-Execution Validation

```sql
-- Verify normalization cache table
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_name = '_input_normalization_cache';
-- Expected: 1

-- Test NFKC normalization
SELECT normalize_input_nfkc('Test™');
-- Expected: 'test' (normalized form)

-- Test entity decoding
SELECT decode_html_entities('&lt;script&gt;');
-- Expected: '<script>'

-- Verify authoritative time table
SELECT server_time FROM _authoritative_time WHERE id = 1;
-- Expected: Current timestamp

-- Test server time enforcement
SELECT get_server_time() as server_time;
-- Expected: Current server timestamp (not client time)

-- Verify encryption keys table
SELECT COUNT(*) FROM _encryption_keys;
-- Expected: At least 1 (v1 key)

-- Test timestamp freshness validation
SELECT validate_timestamp_freshness(now() - INTERVAL '2 minutes', 5);
-- Expected: TRUE (within 5-minute window)

SELECT validate_timestamp_freshness(now() - INTERVAL '10 minutes', 5);
-- Expected: EXCEPTION (outside 5-minute window)

-- Test comprehensive input sanitization
SELECT sanitize_user_input('&#60;script&#62;alert(1)&#60;/script&#62;');
-- Expected: '' (all sanitized)

SELECT sanitize_user_input('  Normal Text  ');
-- Expected: 'Normal Text' (trimmed)

SELECT sanitize_user_input('Test with null byte'||CHR(0)||'here');
-- Expected: EXCEPTION (control character rejected)
```

---

## Complete Deployment Execution Command

**For production-grade execution in order:**

```bash
#!/bin/bash
# Comprehensive execution script

echo "Starting Round 15 Staging Deployment..."

DB_URL="postgresql://..."  # Set your staging DB URL

for migration in \
  "20260712160000_fix_contact_id_reuse_critical.sql" \
  "20260712160100_fix_serializable_snapshot_consistency.sql" \
  "20260712160200_fix_consent_audit_growth.sql" \
  "20260712160300_fix_rls_cte_join_introspection.sql" \
  "20260712160400_fix_query_dos_and_performance.sql" \
  "20260712160500_fix_input_validation_clock_crypto.sql"
do
  echo "Applying: $migration"
  psql "$DB_URL" -f "supabase/migrations/$migration"
  if [ $? -ne 0 ]; then
    echo "FAILED at $migration - aborting"
    exit 1
  fi
  echo "✓ $migration applied successfully"
done

echo "✓ All migrations applied successfully"
echo "Next: Run smoke tests"
```

---

## Rollback Procedures (If Needed)

If any migration fails, rollback in REVERSE order:

**Rollback #6** (Input Validation):
```sql
DROP FUNCTION sanitize_user_input(TEXT, INT);
DROP FUNCTION rotate_encryption_key(BYTEA);
DROP FUNCTION get_active_encryption_key();
DROP TABLE _encryption_keys;
ALTER TABLE contacts DROP CONSTRAINT check_pii_masked_at_not_future;
DROP TABLE _authoritative_time;
DROP FUNCTION validate_timestamp_freshness(TIMESTAMPTZ, INT);
DROP FUNCTION get_server_time();
DROP FUNCTION decode_html_entities(TEXT);
DROP FUNCTION normalize_input_nfkc(TEXT);
DROP TABLE _input_normalization_cache;
```

**Rollback #5** (Query Performance):
```sql
DROP FUNCTION get_page_via_cursor(VARCHAR, INT);
DROP FUNCTION create_pagination_cursor(VARCHAR, UUID);
DROP TABLE _pagination_state;
DROP INDEX idx_contacts_or_search;
DROP INDEX idx_contacts_name_lower_deleted_at;
DROP INDEX idx_contacts_phone_deleted_at;
DROP INDEX idx_contacts_email_deleted_at;
```

*(Continue in reverse for #4, #3, #2, #1)*

---

## Sign-Off Checklist

- [ ] All 6 migrations executed successfully
- [ ] Post-execution validation queries all passed
- [ ] Performance metrics within SLA (<50ms OR queries, <10ms pagination)
- [ ] No unexpected errors in logs
- [ ] Database integrity verified (no orphaned records)
- [ ] Smoke tests prepared and ready
- [ ] Team sign-off obtained

**Status**: READY FOR STAGING DEPLOYMENT ✓

