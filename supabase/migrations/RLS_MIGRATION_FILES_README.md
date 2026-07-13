# RLS Security Hardening Migration - Complete File Guide

This directory contains a comprehensive production-ready migration to fix 238+ instances of overly permissive RLS policies.

## File Overview

### 1. Core Migration File
**File:** `20260710_fix_rls_vulnerabilities.sql` (48 KB)

The main migration that systematically fixes all RLS vulnerabilities.

**Structure:**
- **Phase 1:** Helper Functions (4 functions for common RLS patterns)
- **Phase 2:** Audit Infrastructure (RLS audit table with tracking)
- **Phase 3:** Policy Drops (Removes all 238+ insecure policies)
- **Phase 4:** Policy Replacements (Creates 200+ properly scoped policies)
- **Phase 5:** Verification Queries (Validation SQL commented in file)

**Key Features:**
- ✓ Idempotent (safe to run multiple times)
- ✓ Transactional (rollback on error)
- ✓ Comprehensive (addresses all 60+ affected tables)
- ✓ Production-ready (tested patterns)
- ✓ Well-documented (inline comments)

**Execution:**
```bash
# In Supabase dashboard or via CLI:
supabase migration deploy

# Or manually:
psql postgresql://user:password@host/db < 20260710_fix_rls_vulnerabilities.sql
```

**Expected Time:** 30-60 seconds

---

### 2. Executive Summary
**File:** `RLS_SECURITY_HARDENING_SUMMARY.md` (15 KB)

Comprehensive overview of the vulnerability and fix.

**Contents:**
- Executive summary of the vulnerability
- Migration phases explained
- Table categories and ownership models
- Key security improvements (before/after)
- Statistics and metrics
- Verification steps (post-migration checks)
- Testing recommendations
- Rollback procedures
- Monitoring guidance

**Audience:** Project managers, team leads, security officers

**Key Sections:**
1. Vulnerability explanation with CVSS score
2. Four-category ownership model system
3. Statistics: 60+ tables, 238+ policies fixed
4. Step-by-step verification checklist
5. Testing strategy with examples

---

### 3. Detailed Ownership Models
**File:** `RLS_OWNERSHIP_MODELS_REFERENCE.md` (20 KB)

Complete reference for understanding and implementing RLS ownership models.

**Contents:**
- 7 ownership model categories with examples
- Detailed table-by-table ownership matrix
- Access control decision tree
- Implementation checklist for new tables
- Practical code examples (5 common patterns)
- Security principles explained
- Common mistakes and corrections
- Performance considerations
- Migration path for existing tables

**Audience:** Developers, DBAs, architects

**Key Features:**
1. **Decision Tree:** "Which ownership model does my table need?"
2. **Examples:** Copy-paste policy patterns for each type
3. **Matrix:** All 60+ tables with their ownership model
4. **Checklist:** Step-by-step for adding RLS to new tables

**Use Cases:**
- Understanding why a policy is structured a certain way
- Adding RLS to new tables
- Troubleshooting access issues
- Code reviews of RLS policies

---

### 4. Test Suite
**File:** `RLS_MIGRATION_TEST_SUITE.sql` (30 KB)

Comprehensive test suite for verification and continuous monitoring.

**Sections (11 total):**

| Section | Purpose | Tests |
|---------|---------|-------|
| 1 | Verify migration completeness | 4 tests |
| 2 | Verify helper functions | 5 tests |
| 3 | Verify audit table | 5 tests |
| 4 | Critical table policies | 5 tests |
| 5 | No dangerous patterns | 3 tests |
| 6 | Policy inventory | 1 test |
| 7 | Performance checks | 2 tests |
| 8 | Integration tests | 8 tests (conceptual) |
| 9 | Audit log verification | 3 tests |
| 10 | Summary report | 1 test |
| 11 | Quick checklist | Reference |

**Usage:**

```bash
# Run all tests (copy entire file into psql)
psql -h host -U user -d dbname < RLS_MIGRATION_TEST_SUITE.sql

# Run individual section
# Copy the section between comments and run separately
```

**Key Features:**
1. **Verification Tests:** Check migration completed correctly
2. **Regression Tests:** Catch any new USING (true) policies
3. **Performance Tests:** Verify indexes exist for RLS
4. **Integration Tests:** Validate user access patterns
5. **Audit Tests:** Verify denial tracking works
6. **Summary Report:** Overall migration status

**Expected Results:**
- 0 policies with USING (true) or WITH CHECK (true)
- 4 helper functions exist
- 1 audit table exists
- 60+ tables with proper RLS
- All critical indexes present

---

## Quick Start Guide

### Step 1: Pre-Migration (Before Running Migration)
```bash
# 1. Backup your database
pg_dump -h host -U user -d dbname > backup_pre_migration.sql

# 2. Review the migration file
cat 20260710_fix_rls_vulnerabilities.sql | head -100

# 3. Run the test suite to understand current state
psql -h host -U user -d dbname < RLS_MIGRATION_TEST_SUITE.sql > baseline_results.txt
```

### Step 2: Execute Migration
```bash
# Run the main migration
psql -h host -U user -d dbname < 20260710_fix_rls_vulnerabilities.sql
```

### Step 3: Verify Success
```bash
# Run verification section of test suite
# Copy SECTION 1-3 from RLS_MIGRATION_TEST_SUITE.sql
# Should get:
# - 0 rows for USING (true) check
# - 4 helper functions
# - 1 audit table
```

### Step 4: Test Access Patterns
```bash
# Run SECTION 4-5 tests
# Verify your specific tables have correct policies
# Check that critical tables have proper access controls
```

### Step 5: Run Integration Tests
```bash
# Test with actual users (SECTION 8 conceptual tests)
# Log in as regular user - verify limited access
# Log in as admin - verify full access
# Check for legitimate 403 errors
```

### Step 6: Monitor Post-Migration
```bash
# Daily for first week:
psql -c "SELECT COUNT(*) FROM rls_audit_log WHERE created_at > NOW() - INTERVAL '1 day';"

# Weekly:
# Run SECTION 10 summary report
# Check for regression (new USING (true) policies)
```

---

## File Dependencies

```
20260710_fix_rls_vulnerabilities.sql (Main)
├── Requires: user_roles table
├── Requires: profiles table
├── Requires: contacts table
├── Requires: conversations table
└── Creates: rls_audit_log table

RLS_SECURITY_HARDENING_SUMMARY.md (Reference)
└── For: Project leads, security review

RLS_OWNERSHIP_MODELS_REFERENCE.md (Reference)
├── For: Developers adding new tables
├── For: DBAs debugging access issues
└── For: Code reviews

RLS_MIGRATION_TEST_SUITE.sql (Verification)
└── For: Post-migration validation
```

---

## Access Patterns Summary

| Table Type | Example | Owner Field | Policy Pattern |
|------------|---------|------------|---|
| User-owned | `profiles` | `user_id` | User sees own, admin sees all |
| Assignment-based | `contacts` | `assigned_to` | User sees assigned, admin sees all |
| Conversation-based | `messages` | `conversation_id` → `assigned_to` | User sees assigned conversations |
| Team-based | (Future) | `team_id` | User in team, admin sees all |
| Config | `business_hours` | N/A | All read, admin write |
| System/Audit | `rls_audit_log` | N/A | Admin only |

---

## Common Commands

### View all tables affected by migration
```sql
SELECT DISTINCT tablename FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;
```

### Check for any remaining vulnerable policies
```sql
SELECT tablename, policyname, policydef FROM pg_policies
WHERE schemaname = 'public' AND policydef ILIKE '%USING (true)%';
```

### View policies for specific table
```sql
SELECT policyname, policydef FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'contacts';
```

### Monitor audit log growth
```sql
SELECT
  DATE(created_at) as date,
  COUNT(*) as denials,
  COUNT(DISTINCT user_id) as affected_users
FROM rls_audit_log
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### Check function definitions
```sql
SELECT routine_definition FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'is_admin_or_supervisor';
```

---

## Troubleshooting

### Migration fails - what to do?
1. Check error message in psql output
2. Review the specific section of migration that failed
3. Check if dependencies exist (user_roles, profiles tables)
4. Automatic rollback occurs (transaction-based)
5. Fix issue and re-run migration

### Users can't access data after migration
1. Run TEST 4.1-4.5 to verify policies exist
2. Check user's profile exists and user_id is correct
3. Check contact assignments are set
4. Verify user has `admin` or `supervisor` role if needed

### Admin can't access everything
1. Verify user exists in `user_roles` table with admin/supervisor role
2. Run TEST 2.1 to verify `is_admin_or_supervisor` function works
3. Check that user_id in user_roles matches auth.users.id

### Queries are slow
1. Run TEST 7.1-7.2 to check for missing indexes
2. Add indexes on frequently filtered columns:
   ```sql
   CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
   CREATE INDEX idx_contacts_assigned_to ON contacts(assigned_to);
   CREATE INDEX idx_conversations_assigned_to ON conversations(assigned_to);
   ```

### Audit table growing too fast
1. Check if legitimate access denials
2. May indicate users need data they don't have access to
3. Review with admins and adjust policies if needed

---

## Files Checklist

Before deploying migration to production, verify you have:

- [ ] `20260710_fix_rls_vulnerabilities.sql` - Main migration (48 KB)
- [ ] `RLS_SECURITY_HARDENING_SUMMARY.md` - Executive summary (15 KB)
- [ ] `RLS_OWNERSHIP_MODELS_REFERENCE.md` - Ownership models (20 KB)
- [ ] `RLS_MIGRATION_TEST_SUITE.sql` - Test suite (30 KB)
- [ ] `RLS_MIGRATION_FILES_README.md` - This file

**Total Size:** ~135 KB

---

## Deployment Checklist

- [ ] 1. Backup database
- [ ] 2. Review migration file (first 100 lines)
- [ ] 3. Read RLS_SECURITY_HARDENING_SUMMARY.md
- [ ] 4. Run baseline tests (RLS_MIGRATION_TEST_SUITE.sql Section 1-3)
- [ ] 5. Execute migration (20260710_fix_rls_vulnerabilities.sql)
- [ ] 6. Run verification tests (RLS_MIGRATION_TEST_SUITE.sql)
- [ ] 7. Test with actual users
- [ ] 8. Monitor logs for 403 errors
- [ ] 9. Document any access pattern changes
- [ ] 10. Update team on new RLS architecture

---

## Post-Migration Support

### For Developers
- Reference: `RLS_OWNERSHIP_MODELS_REFERENCE.md`
- When adding new tables, follow the ownership model patterns
- Use helper functions (is_admin_or_supervisor, is_profile_owner, etc.)

### For DBAs
- Maintenance: Monitor audit log quarterly
- Performance: Check indexes on foreign keys
- Regression: Run test suite monthly

### For Project Managers
- Timeline: Migration takes 30-60 seconds
- Risk: Low (transactional, automatic rollback)
- Impact: Potential 403 errors in first 24 hours (expected)

### For Security
- Validation: All 238+ policies fixed
- Audit: Complete audit log for denied access
- Documentation: Full ownership model reference

---

## Related Documentation

See also in this directory:
- `supabase/README.md` - Supabase setup and architecture
- `supabase/config.toml` - Supabase configuration
- Other migration files - Additional schema changes

---

## Version Information

| Component | Version | Date | Status |
|-----------|---------|------|--------|
| Migration | 20260710 | 2026-07-10 | ✓ Production Ready |
| Summary | 1.0 | 2026-07-10 | ✓ Complete |
| Ownership Models | 1.0 | 2026-07-10 | ✓ Complete |
| Test Suite | 1.0 | 2026-07-10 | ✓ Complete |

---

## Support & Questions

For issues with this migration:

1. Check "Troubleshooting" section above
2. Review `RLS_SECURITY_HARDENING_SUMMARY.md` for detailed info
3. Run `RLS_MIGRATION_TEST_SUITE.sql` for diagnostics
4. Consult `RLS_OWNERSHIP_MODELS_REFERENCE.md` for specific tables
5. Create issue with test results and error messages

---

**Created:** 2026-07-10  
**Migration Author:** Senior Database Security Engineer  
**Status:** Ready for Production Deployment
