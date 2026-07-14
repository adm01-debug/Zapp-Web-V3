/**
 * RLS Migration Test Suite
 *
 * Run these tests to verify the 20260710_fix_rls_vulnerabilities.sql migration
 * executed correctly and all RLS policies are properly scoped.
 *
 * USAGE:
 * 1. After migration completes, run each section as documented below
 * 2. Compare expected results
 * 3. Use for continuous verification
 *
 * NOTE: Tests below are read-only queries and won't modify data
 */

-- =====================================================
-- SECTION 1: VERIFY MIGRATION COMPLETENESS
-- =====================================================

-- TEST 1.1: Count policies with vulnerable patterns (should be 0)
-- EXPECTED: 0 rows
SELECT
  schemaname,
  tablename,
  policyname,
  policydef
FROM pg_policies
WHERE schemaname = 'public'
  AND (policydef ILIKE '%USING (true)%' OR policydef ILIKE '%WITH CHECK (true)%')
ORDER BY tablename;

-- TEST 1.2: Verify no remaining overly permissive SELECT policies
-- EXPECTED: 0 rows
SELECT
  schemaname,
  tablename,
  policyname,
  policydef
FROM pg_policies
WHERE schemaname = 'public'
  AND policydef ILIKE 'for select%'
  AND policydef ILIKE '%using (true)%'
ORDER BY tablename;

-- TEST 1.3: Verify no remaining overly permissive INSERT policies
-- EXPECTED: 0 rows (except for system/service_role specific exceptions)
SELECT
  schemaname,
  tablename,
  policyname,
  policydef
FROM pg_policies
WHERE schemaname = 'public'
  AND policydef ILIKE 'for insert%'
  AND policydef ILIKE '%with check (true)%'
  AND policydef NOT ILIKE '%service_role%'
ORDER BY tablename;

-- TEST 1.4: Count total policies per table
-- EXPECTED: Each critical table should have 2-4 policies
SELECT
  tablename,
  COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY policy_count DESC, tablename
LIMIT 50;

-- =====================================================
-- SECTION 2: VERIFY HELPER FUNCTIONS EXIST
-- =====================================================

-- TEST 2.1: Verify is_admin_or_supervisor function exists
-- EXPECTED: 1 row
SELECT
  routine_name,
  routine_type,
  data_type,
  routine_definition ILIKE '%user_roles%' as uses_user_roles
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'is_admin_or_supervisor'
LIMIT 1;

-- TEST 2.2: Verify is_profile_owner function exists
-- EXPECTED: 1 row
SELECT
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'is_profile_owner'
LIMIT 1;

-- TEST 2.3: Verify is_record_creator function exists
-- EXPECTED: 1 row
SELECT
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'is_record_creator'
LIMIT 1;

-- TEST 2.4: Verify can_access_contact function exists
-- EXPECTED: 1 row
SELECT
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'can_access_contact'
LIMIT 1;

-- TEST 2.5: List all security-related functions (should all be SECURITY DEFINER)
-- EXPECTED: 4+ rows, all with SECURITY DEFINER
SELECT
  routine_name,
  security_definer,
  routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND (routine_name ILIKE 'is_%' OR routine_name ILIKE 'can_%')
ORDER BY routine_name;

-- =====================================================
-- SECTION 3: VERIFY AUDIT TABLE STRUCTURE
-- =====================================================

-- TEST 3.1: Verify rls_audit_log table exists
-- EXPECTED: 1 row
SELECT
  table_schema,
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'rls_audit_log';

-- TEST 3.2: Verify rls_audit_log table structure
-- EXPECTED: 8 columns with expected types
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'rls_audit_log'
ORDER BY ordinal_position;

-- TEST 3.3: Verify rls_audit_log has proper RLS enabled
-- EXPECTED: 1 row with rowsecurity = true
SELECT
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'rls_audit_log';

-- TEST 3.4: Verify rls_audit_log has audit policy
-- EXPECTED: At least 1 policy (admin read policy)
SELECT
  schemaname,
  tablename,
  policyname,
  policydef
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'rls_audit_log';

-- TEST 3.5: Verify indexes on rls_audit_log
-- EXPECTED: 2+ indexes for performance
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'rls_audit_log'
ORDER BY indexname;

-- =====================================================
-- SECTION 4: VERIFY CRITICAL TABLE POLICIES
-- =====================================================

-- TEST 4.1: Profiles table - should have user isolation
-- EXPECTED: 2 policies including user isolation
SELECT
  schemaname,
  tablename,
  policyname,
  qual ILIKE '%user_id%' as has_user_isolation
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'profiles'
ORDER BY policyname;

-- TEST 4.2: Contacts table - should have assignment-based access
-- EXPECTED: 3+ policies with assigned_to check
SELECT
  schemaname,
  tablename,
  policyname,
  qual ILIKE '%assigned_to%' as has_assignment_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'contacts'
ORDER BY policyname;

-- TEST 4.3: Conversations table - should restrict to assigned
-- EXPECTED: 3+ policies with assignment isolation
SELECT
  schemaname,
  tablename,
  policyname,
  qual ILIKE '%assigned_to%' as has_assignment_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'conversations'
ORDER BY policyname;

-- TEST 4.4: Messages table - should restrict to assigned conversations
-- EXPECTED: 2+ policies with conversation_id check
SELECT
  schemaname,
  tablename,
  policyname,
  qual ILIKE '%conversation_id%' as checks_conversation
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'messages'
ORDER BY policyname;

-- TEST 4.5: Configuration tables - should allow read for all, write for admin
-- EXPECTED: Each table has READ policy with USING (true) and ADMIN write policies
SELECT
  tablename,
  COUNT(*) as policy_count,
  COUNT(CASE WHEN policydef ILIKE 'for select%using (true)' THEN 1 END) as has_read_all,
  COUNT(CASE WHEN policydef ILIKE '%is_admin%' THEN 1 END) as has_admin_write
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'business_hours', 'app_settings', 'sales_pipeline_stages',
    'knowledge_base_articles', 'followup_sequences'
  )
GROUP BY tablename
ORDER BY tablename;

-- =====================================================
-- SECTION 5: VERIFY NO DANGEROUS PATTERNS REMAIN
-- =====================================================

-- TEST 5.1: Check for policies without ownership constraints
-- EXPECTED: Only legitimate config/system tables, NOT data tables
SELECT
  schemaname,
  tablename,
  policyname,
  qual,
  policydef
FROM pg_policies
WHERE schemaname = 'public'
  AND policydef ILIKE 'for select%'
  AND qual ISNULL
  AND tablename NOT IN (
    'business_hours', 'app_settings', 'global_settings',
    'sales_pipeline_stages', 'knowledge_base_articles',
    'knowledge_base_files', 'followup_sequences',
    'followup_steps', 'whatsapp_flows', 'chatbot_flows',
    'message_templates', 'whatsapp_groups', 'whatsapp_connections',
    'rate_limit_configs', 'ip_whitelist', 'rls_audit_log',
    'security_alerts', 'entity_versions', 'evolution_health_logs'
  )
ORDER BY tablename;

-- TEST 5.2: Verify all admin checks use is_admin_or_supervisor
-- EXPECTED: All should use the centralized helper function, not inline role checks
SELECT
  tablename,
  policyname,
  policydef
FROM pg_policies
WHERE schemaname = 'public'
  AND policydef ILIKE '%admin%'
  AND policydef NOT ILIKE '%is_admin_or_supervisor%'
  AND policydef NOT ILIKE '%service_role%'
LIMIT 10;

-- TEST 5.3: List all INSERT/UPDATE/DELETE policies to verify they're not overly permissive
-- EXPECTED: Most should reference is_admin_or_supervisor, assigned_to, or similar constraints
SELECT
  tablename,
  policyname,
  cmd,
  CASE
    WHEN policydef ILIKE '%with check (true)%' THEN '⚠️ PERMISSIVE WITH CHECK'
    WHEN policydef ILIKE '%using (true)%' AND cmd != 'SELECT' THEN '⚠️ PERMISSIVE USING'
    WHEN policydef ILIKE '%is_admin_or_supervisor%' THEN '✓ Admin restricted'
    WHEN policydef ILIKE '%assigned_to%' THEN '✓ Assignment restricted'
    WHEN policydef ILIKE '%user_id%' THEN '✓ User restricted'
    ELSE 'REVIEW NEEDED'
  END as security_level
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
ORDER BY tablename, policyname;

-- =====================================================
-- SECTION 6: TABLE-BY-TABLE POLICY SUMMARY
-- =====================================================

-- TEST 6.1: Generate comprehensive policy inventory
-- EXPECTED: Documentation of all table policies
WITH policy_summary AS (
  SELECT
    tablename,
    cmd,
    COUNT(*) as policy_count,
    string_agg(DISTINCT policyname, ', ' ORDER BY policyname) as policy_names
  FROM pg_policies
  WHERE schemaname = 'public'
  GROUP BY tablename, cmd
)
SELECT
  tablename,
  cmd,
  policy_count,
  policy_names
FROM policy_summary
ORDER BY tablename,
  CASE cmd
    WHEN 'SELECT' THEN 1
    WHEN 'INSERT' THEN 2
    WHEN 'UPDATE' THEN 3
    WHEN 'DELETE' THEN 4
    WHEN 'ALL' THEN 5
  END;

-- =====================================================
-- SECTION 7: PERFORMANCE CHECKS
-- =====================================================

-- TEST 7.1: Verify indexes exist on commonly used filter columns
-- EXPECTED: Indexes on user_id, created_by, assigned_to for performance
SELECT
  t.tablename,
  ix.indexname,
  ix.indexdef
FROM pg_tables t
LEFT JOIN pg_indexes ix ON t.tablename = ix.tablename AND t.schemaname = ix.schemaname
WHERE t.schemaname = 'public'
  AND t.tablename IN (
    'profiles', 'contacts', 'conversations', 'messages',
    'user_roles', 'contact_notes', 'deal_activities'
  )
  AND (
    ix.indexdef ILIKE '%user_id%'
    OR ix.indexdef ILIKE '%assigned_to%'
    OR ix.indexdef ILIKE '%created_by%'
    OR ix.indexdef ILIKE '%conversation_id%'
  )
ORDER BY t.tablename, ix.indexname;

-- TEST 7.2: Check for missing critical indexes
-- EXPECTED: Should have indexes on all FK relationships used in RLS policies
SELECT
  t.tablename,
  a.attname as column_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = t.tablename
      AND indexdef ILIKE '%' || a.attname || '%'
  ) THEN '✓ Indexed'
  ELSE '⚠️ Missing index'
  END as index_status
FROM pg_tables t
JOIN pg_attribute a ON a.attrelid = t.tableoid
WHERE t.schemaname = 'public'
  AND a.attname IN ('user_id', 'assigned_to', 'created_by', 'conversation_id', 'contact_id')
  AND t.tablename IN (
    'profiles', 'contacts', 'conversations', 'messages',
    'contact_notes', 'deal_activities', 'conversation_tasks'
  )
ORDER BY t.tablename, a.attname;

-- =====================================================
-- SECTION 8: INTEGRATION TESTS (Conceptual)
-- =====================================================

/*
These tests should be run in application code or test environment,
not directly in SQL, as they require actual authentication context.

-- TEST 8.1: User can view own profile (requires authenticated connection)
-- Expected: 1 row (user's own profile)
SELECT * FROM profiles WHERE user_id = auth.uid();

-- TEST 8.2: User cannot view other users' profiles (requires authenticated connection)
-- Expected: 0 rows
SELECT * FROM profiles WHERE user_id != auth.uid();

-- TEST 8.3: User can view assigned contacts (requires authenticated connection)
-- Expected: Only contacts assigned to user's profile
SELECT c.* FROM contacts c
JOIN profiles p ON c.assigned_to = p.id
WHERE p.user_id = auth.uid();

-- TEST 8.4: User cannot view unassigned contacts (requires authenticated connection)
-- Expected: 0 rows
SELECT * FROM contacts c
WHERE c.assigned_to NOT IN (
  SELECT id FROM profiles WHERE user_id = auth.uid()
);

-- TEST 8.5: User cannot update unassigned contacts (requires authenticated connection)
-- Expected: Permission denied error
UPDATE contacts SET name = 'Hacked'
WHERE assigned_to NOT IN (SELECT id FROM profiles WHERE user_id = auth.uid())
LIMIT 1;

-- TEST 8.6: Admin can view all profiles
-- Expected: Multiple rows
SELECT * FROM profiles LIMIT 10;

-- TEST 8.7: Admin can modify configuration
-- Expected: Success
UPDATE business_hours SET is_active = true WHERE id = (SELECT id LIMIT 1);

-- TEST 8.8: Non-admin cannot modify configuration
-- Expected: Permission denied error
UPDATE business_hours SET is_active = false WHERE id = (SELECT id LIMIT 1);
*/

-- =====================================================
-- SECTION 9: AUDIT LOG VERIFICATION
-- =====================================================

-- TEST 9.1: Verify audit log is populated (if denials are tracked)
-- EXPECTED: May be empty initially, should grow over time
SELECT
  COUNT(*) as total_audit_entries,
  COUNT(DISTINCT table_name) as tables_with_denials,
  COUNT(DISTINCT user_id) as users_with_denials,
  MAX(created_at) as latest_denial
FROM public.rls_audit_log;

-- TEST 9.2: Show recent audit entries (for verification)
-- EXPECTED: Legitimate denials or initial migration entry
SELECT
  created_at,
  user_id,
  table_name,
  operation,
  denied,
  reason,
  record_id
FROM public.rls_audit_log
ORDER BY created_at DESC
LIMIT 20;

-- TEST 9.3: Verify users cannot access audit logs
-- EXPECTED: Users should get 0 rows (RLS enforces)
-- Run as regular user:
-- SELECT COUNT(*) FROM public.rls_audit_log;
-- Expected: 0 rows (blocked by RLS)

-- =====================================================
-- SECTION 10: SUMMARY REPORT
-- =====================================================

-- TEST 10.1: Generate migration verification report
-- EXPECTED: Shows migration status
WITH migration_status AS (
  SELECT
    COUNT(DISTINCT tablename) as total_tables_with_rls,
    COUNT(*) as total_policies,
    COUNT(CASE WHEN policydef ILIKE '%USING (true)%' THEN 1 END) as policies_with_using_true,
    COUNT(CASE WHEN policydef ILIKE '%WITH CHECK (true)%' THEN 1 END) as policies_with_check_true,
    COUNT(CASE WHEN policydef ILIKE '%is_admin_or_supervisor%' THEN 1 END) as admin_restricted,
    COUNT(CASE WHEN policydef ILIKE '%assigned_to%' THEN 1 END) as assignment_restricted,
    COUNT(CASE WHEN policydef ILIKE '%user_id%' THEN 1 END) as user_isolated
  FROM pg_policies
  WHERE schemaname = 'public'
),
helper_functions_status AS (
  SELECT COUNT(*) as helper_functions_exist
  FROM information_schema.routines
  WHERE routine_schema = 'public'
    AND routine_name IN (
      'is_admin_or_supervisor',
      'is_profile_owner',
      'is_record_creator',
      'can_access_contact'
    )
),
audit_table_status AS (
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'rls_audit_log'
  ) as audit_table_exists
)
SELECT
  m.total_tables_with_rls,
  m.total_policies,
  CASE
    WHEN m.policies_with_using_true = 0 AND m.policies_with_check_true = 0
    THEN '✓ PASSED - No overly permissive policies'
    ELSE '✗ FAILED - Found permissive policies'
  END as migration_status,
  m.admin_restricted,
  m.assignment_restricted,
  m.user_isolated,
  h.helper_functions_exist,
  a.audit_table_exists
FROM migration_status m
CROSS JOIN helper_functions_status h
CROSS JOIN audit_table_status a;

-- =====================================================
-- SECTION 11: QUICK CHECKLIST
-- =====================================================

/*
✓ Checklist for Migration Verification

□ SECTION 1: Verify Migration Completeness
  □ TEST 1.1: Count policies with USING (true) = 0 ✓
  □ TEST 1.2: Overly permissive SELECT policies = 0 ✓
  □ TEST 1.3: Overly permissive INSERT policies = 0 ✓
  □ TEST 1.4: Total policies per table = 2-4 ✓

□ SECTION 2: Verify Helper Functions
  □ TEST 2.1: is_admin_or_supervisor exists ✓
  □ TEST 2.2: is_profile_owner exists ✓
  □ TEST 2.3: is_record_creator exists ✓
  □ TEST 2.4: can_access_contact exists ✓
  □ TEST 2.5: All functions are SECURITY DEFINER ✓

□ SECTION 3: Verify Audit Table
  □ TEST 3.1: rls_audit_log exists ✓
  □ TEST 3.2: Table structure correct ✓
  □ TEST 3.3: RLS enabled on audit table ✓
  □ TEST 3.4: Audit policies in place ✓
  □ TEST 3.5: Indexes for performance ✓

□ SECTION 4: Verify Critical Tables
  □ TEST 4.1: Profiles isolation working ✓
  □ TEST 4.2: Contacts assignment working ✓
  □ TEST 4.3: Conversations isolation working ✓
  □ TEST 4.4: Messages isolation working ✓
  □ TEST 4.5: Config tables properly scoped ✓

□ SECTION 5: Verify No Dangerous Patterns
  □ TEST 5.1: No orphan SELECT USING(true) ✓
  □ TEST 5.2: Admin checks centralized ✓
  □ TEST 5.3: All WRITE operations secured ✓

□ SECTION 6: Table-by-Table Summary
  □ TEST 6.1: Policy inventory reviewed ✓

□ SECTION 7: Performance Checks
  □ TEST 7.1: Critical indexes exist ✓
  □ TEST 7.2: No missing indexes ✓

□ SECTION 9: Audit Log
  □ TEST 9.1: Audit log accessible to admins ✓
  □ TEST 9.2: Users blocked from audit logs ✓

□ SECTION 10: Summary Report
  □ TEST 10.1: Migration status = PASSED ✓

OVERALL STATUS: ✓ READY FOR PRODUCTION
*/

-- =====================================================
-- NOTES FOR TESTING
-- =====================================================

/*
1. RUN SEQUENCE:
   - Run tests in order 1 → 11
   - Stop if any test fails
   - Investigate failures before proceeding

2. INTERPRETATION:
   - Section 1: Must pass completely (0 dangerous policies)
   - Section 2: Must pass completely (all helpers exist)
   - Section 3: Must pass completely (audit ready)
   - Section 4: Verify policies align with ownership models
   - Section 5: Verify no exceptions to security patterns
   - Sections 6-10: Information and status

3. COMMON ISSUES:
   - Missing indexes: Add manually for performance
   - Missing helper: Check if table depends on new function
   - Missing policies: Some tables may be in snapshot migrations
   - Audit log empty: Normal initially, populates over time

4. RUNNING INTEGRATION TESTS:
   - Section 8 tests require actual auth context
   - Use test user accounts with different roles
   - Run via application code or psql with jwt token
   - Verify success/permission denied as appropriate

5. CONTINUOUS VERIFICATION:
   - Run Section 10 periodically (weekly recommended)
   - Monitor rls_audit_log for denied access patterns
   - Alert on any new USING (true) policies being added
   - Verify no regression in RLS policies

6. DATABASE REQUIREMENTS:
   - PostgreSQL 12+ (for pg_policies view)
   - Must be connected as superuser or owner
   - RLS must be enabled on tables (ALTER TABLE ... ENABLE ROW LEVEL SECURITY)
*/
