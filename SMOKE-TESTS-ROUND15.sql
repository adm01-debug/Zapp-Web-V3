-- Round 15 Smoke Test Suite
-- Comprehensive validation of all 6 migrations
-- Run this AFTER all migrations are applied to staging database
-- Total: 20 critical test scenarios
-- Expected: All tests PASS with no errors

\set ON_ERROR_STOP on

BEGIN;

-- ============================================================================
-- TEST SET 1: Contact ID Reuse Prevention (Migration #1)
-- ============================================================================

\echo '=== TEST 1.1: Verify graveyard table exists ==='
SELECT
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END as test_1_1
FROM information_schema.tables
WHERE table_name = 'contact_id_graveyard';

\echo '=== TEST 1.2: Verify prevent_contact_id_reuse trigger ==='
SELECT
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END as test_1_2
FROM information_schema.triggers
WHERE event_object_table = 'contacts'
  AND trigger_name = 'trigger_prevent_contact_id_reuse';

\echo '=== TEST 1.3: Test contact deletion adds to graveyard ==='
DO $$
DECLARE
  v_contact_id UUID;
  v_graveyard_count INT;
BEGIN
  -- Create test contact
  INSERT INTO contacts (user_id, name, email, phone)
  VALUES (auth.uid(), 'Test Graveyard', 'graveyard@test.com', '555-0001')
  RETURNING id INTO v_contact_id;

  -- Delete it
  PERFORM delete_contact_completely(v_contact_id);

  -- Check graveyard
  SELECT COUNT(*) INTO v_graveyard_count
  FROM contact_id_graveyard
  WHERE original_user_id = auth.uid();

  IF v_graveyard_count > 0 THEN
    RAISE NOTICE 'TEST 1.3 PASS: Contact added to graveyard';
  ELSE
    RAISE EXCEPTION 'TEST 1.3 FAIL: Contact not in graveyard';
  END IF;
END;
$$ LANGUAGE plpgsql;

\echo '=== TEST 1.4: Test ID reuse prevention ==='
DO $$
DECLARE
  v_test_id BIGINT := 999999;
  v_available BOOLEAN;
BEGIN
  -- Manually add to graveyard
  INSERT INTO contact_id_graveyard (deleted_contact_id, original_user_id, reason)
  VALUES (v_test_id, auth.uid(), 'test_reuse_prevention')
  ON CONFLICT DO NOTHING;

  -- Check availability (should be FALSE)
  SELECT is_contact_id_available(v_test_id) INTO v_available;

  IF v_available = FALSE THEN
    RAISE NOTICE 'TEST 1.4 PASS: ID correctly marked unavailable';
  ELSE
    RAISE EXCEPTION 'TEST 1.4 FAIL: ID should be unavailable';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TEST SET 2: Snapshot Consistency (Migration #2)
-- ============================================================================

\echo '=== TEST 2.1: Verify _snapshot_version_state table ==='
SELECT
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END as test_2_1
FROM _snapshot_version_state
WHERE table_name = 'contacts';

\echo '=== TEST 2.2: Verify snapshot triggers on contacts ==='
SELECT
  CASE WHEN COUNT(*) >= 3 THEN 'PASS' ELSE 'FAIL' END as test_2_2
FROM information_schema.triggers
WHERE event_object_table = 'contacts'
  AND trigger_name LIKE '%snapshot%';

\echo '=== TEST 2.3: Test snapshot version increments ==='
DO $$
DECLARE
  v_version_before BIGINT;
  v_version_after BIGINT;
  v_contact_id UUID;
BEGIN
  SELECT version_number INTO v_version_before FROM _snapshot_version_state WHERE table_name = 'contacts';

  -- Create contact (should trigger version increment)
  INSERT INTO contacts (user_id, name, email, phone)
  VALUES (auth.uid(), 'Snapshot Test', 'snapshot@test.com', '555-0002')
  RETURNING id INTO v_contact_id;

  SELECT version_number INTO v_version_after FROM _snapshot_version_state WHERE table_name = 'contacts';

  IF v_version_after > v_version_before THEN
    RAISE NOTICE 'TEST 2.3 PASS: Version incremented from % to %', v_version_before, v_version_after;
  ELSE
    RAISE EXCEPTION 'TEST 2.3 FAIL: Version not incremented';
  END IF;
END;
$$ LANGUAGE plpgsql;

\echo '=== TEST 2.4: Test snapshot freshness validation ==='
DO $$
DECLARE
  v_fresh BOOLEAN;
BEGIN
  -- Get current version
  v_fresh := validate_snapshot_freshness('contacts', (SELECT version_number FROM _snapshot_version_state WHERE table_name = 'contacts'));

  IF v_fresh THEN
    RAISE NOTICE 'TEST 2.4 PASS: Current snapshot is fresh';
  ELSE
    RAISE EXCEPTION 'TEST 2.4 FAIL: Current snapshot should be fresh';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TEST SET 3: Consent Audit Archival (Migration #3)
-- ============================================================================

\echo '=== TEST 3.1: Verify lgpd_consent_audit_archive table ==='
SELECT
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END as test_3_1
FROM information_schema.tables
WHERE table_name = 'lgpd_consent_audit_archive';

\echo '=== TEST 3.2: Verify retention policy table ==='
SELECT
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END as test_3_2
FROM consent_audit_retention_policy
WHERE active = true;

\echo '=== TEST 3.3: Verify archival functions exist ==='
SELECT
  CASE WHEN COUNT(*) >= 2 THEN 'PASS' ELSE 'FAIL' END as test_3_3
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN ('archive_old_consent_records', 'apply_consent_audit_retention_policy');

\echo '=== TEST 3.4: Test archival cron jobs ==='
SELECT
  CASE WHEN COUNT(*) >= 2 THEN 'PASS' ELSE 'FAIL' END as test_3_4
FROM cron.job
WHERE cron_name IN ('consent_audit_archival_daily', 'consent_audit_metrics_daily');

-- ============================================================================
-- TEST SET 4: RLS Hardening (Migration #4)
-- ============================================================================

\echo '=== TEST 4.1: Verify RLS functions exist ==='
SELECT
  CASE WHEN COUNT(*) >= 3 THEN 'PASS' ELSE 'FAIL' END as test_4_1
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN ('get_contacts_via_cte_safe', 'get_conversations_safe_join', 'safe_execute_query');

\echo '=== TEST 4.2: Verify error masking function ==='
DO $$
BEGIN
  BEGIN
    -- Try to access nonexistent table via safe function
    PERFORM * FROM safe_execute_query('SELECT * FROM nonexistent_table');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%nonexistent_table%' THEN
      RAISE NOTICE 'TEST 4.2 PASS: Error message masked';
    ELSE
      RAISE EXCEPTION 'TEST 4.2 FAIL: Error message leaked table name';
    END IF;
  END;
END;
$$ LANGUAGE plpgsql;

\echo '=== TEST 4.3: Verify information_schema access restricted ==='
SELECT
  CASE WHEN NOT has_schema_privilege('public', 'information_schema', 'USAGE')
    THEN 'PASS' ELSE 'FAIL' END as test_4_3;

\echo '=== TEST 4.4: Test CTE RLS wrapper ==='
DO $$
DECLARE
  v_results INT;
BEGIN
  -- Create test contact as current user
  INSERT INTO contacts (user_id, name, email)
  VALUES (auth.uid(), 'CTE RLS Test', 'cte@test.com');

  -- Query via safe wrapper should return rows
  SELECT COUNT(*) INTO v_results FROM get_contacts_via_cte_safe('name', 'CTE RLS Test');

  IF v_results > 0 THEN
    RAISE NOTICE 'TEST 4.4 PASS: CTE RLS wrapper returned rows';
  ELSE
    RAISE EXCEPTION 'TEST 4.4 FAIL: CTE RLS wrapper returned no rows';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TEST SET 5: Query Performance & Pagination (Migration #5)
-- ============================================================================

\echo '=== TEST 5.1: Verify partial indexes created ==='
SELECT
  CASE WHEN COUNT(*) >= 3 THEN 'PASS' ELSE 'FAIL' END as test_5_1
FROM pg_indexes
WHERE tablename = 'contacts'
  AND (indexname LIKE '%email%' OR indexname LIKE '%phone%' OR indexname LIKE '%name_lower%');

\echo '=== TEST 5.2: Verify pagination table ==='
SELECT
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END as test_5_2
FROM information_schema.tables
WHERE table_name = '_pagination_state';

\echo '=== TEST 5.3: Test cursor creation ==='
DO $$
DECLARE
  v_cursor VARCHAR(64);
BEGIN
  SELECT create_pagination_cursor('contacts', '00000000-0000-0000-0000-000000000000'::UUID) INTO v_cursor;

  IF v_cursor IS NOT NULL AND LENGTH(v_cursor) = 64 THEN
    RAISE NOTICE 'TEST 5.3 PASS: Cursor created, length = %', LENGTH(v_cursor);
  ELSE
    RAISE EXCEPTION 'TEST 5.3 FAIL: Invalid cursor format';
  END IF;
END;
$$ LANGUAGE plpgsql;

\echo '=== TEST 5.4: Test OR-clause query performance ==='
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT COUNT(*) FROM contacts
WHERE email = 'nonexistent@example.com'
   OR phone = '555-9999'
   OR LOWER(name) LIKE '%nonexistent%'
   AND deleted_at IS NULL;
-- Note: Should use index scans, not full table scan

-- ============================================================================
-- TEST SET 6: Input Validation & Crypto (Migration #6)
-- ============================================================================

\echo '=== TEST 6.1: Verify normalization cache ==='
SELECT
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END as test_6_1
FROM information_schema.tables
WHERE table_name = '_input_normalization_cache';

\echo '=== TEST 6.2: Verify encryption keys table ==='
SELECT
  CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END as test_6_2
FROM information_schema.tables
WHERE table_name = '_encryption_keys';

\echo '=== TEST 6.3: Test NFKC normalization ==='
DO $$
DECLARE
  v_normalized TEXT;
BEGIN
  SELECT normalize_input_nfkc('Test™') INTO v_normalized;

  -- Should be lowercase and accents removed
  IF v_normalized = 'test' OR v_normalized LIKE 'test%' THEN
    RAISE NOTICE 'TEST 6.3 PASS: NFKC normalization working, result: %', v_normalized;
  ELSE
    RAISE EXCEPTION 'TEST 6.3 FAIL: Normalization failed, got: %', v_normalized;
  END IF;
END;
$$ LANGUAGE plpgsql;

\echo '=== TEST 6.4: Test HTML entity decoding ==='
DO $$
DECLARE
  v_decoded TEXT;
BEGIN
  SELECT decode_html_entities('&lt;script&gt;') INTO v_decoded;

  IF v_decoded = '<script>' THEN
    RAISE NOTICE 'TEST 6.4 PASS: Entity decoding working';
  ELSE
    RAISE EXCEPTION 'TEST 6.4 FAIL: Got %', v_decoded;
  END IF;
END;
$$ LANGUAGE plpgsql;

\echo '=== TEST 6.5: Test authoritative time ==='
DO $$
DECLARE
  v_server_time TIMESTAMPTZ;
BEGIN
  SELECT get_server_time() INTO v_server_time;

  IF v_server_time IS NOT NULL AND v_server_time > now() - INTERVAL '5 seconds' THEN
    RAISE NOTICE 'TEST 6.5 PASS: Server time is recent: %', v_server_time;
  ELSE
    RAISE EXCEPTION 'TEST 6.5 FAIL: Server time invalid';
  END IF;
END;
$$ LANGUAGE plpgsql;

\echo '=== TEST 6.6: Test timestamp freshness validation ==='
DO $$
DECLARE
  v_fresh BOOLEAN;
BEGIN
  -- Recent timestamp (now) should pass
  SELECT validate_timestamp_freshness(now(), 5) INTO v_fresh;

  IF v_fresh THEN
    RAISE NOTICE 'TEST 6.6 PASS: Recent timestamp validated';
  ELSE
    RAISE EXCEPTION 'TEST 6.6 FAIL: Recent timestamp rejected';
  END IF;
END;
$$ LANGUAGE plpgsql;

\echo '=== TEST 6.7: Test input sanitization ==='
DO $$
DECLARE
  v_sanitized TEXT;
BEGIN
  -- Test 1: Entity-encoded script tag should be removed
  SELECT sanitize_user_input('&#60;script&#62;alert(1)&#60;/script&#62;') INTO v_sanitized;

  IF v_sanitized = '' THEN
    RAISE NOTICE 'TEST 6.7 PASS (1/3): Entity-encoded script removed';
  ELSE
    RAISE NOTICE 'TEST 6.7 PARTIAL: Got %', v_sanitized;
  END IF;

  -- Test 2: Normal text should be preserved (trimmed)
  SELECT sanitize_user_input('  Hello World  ') INTO v_sanitized;

  IF v_sanitized = 'Hello World' THEN
    RAISE NOTICE 'TEST 6.7 PASS (2/3): Normal text preserved';
  ELSE
    RAISE NOTICE 'TEST 6.7 FAIL: Normal text not preserved, got: %', v_sanitized;
  END IF;

  -- Test 3: Control characters should be rejected
  BEGIN
    SELECT sanitize_user_input('Test'||CHR(0)||'Null') INTO v_sanitized;
    RAISE EXCEPTION 'TEST 6.7 FAIL (3/3): Null byte should be rejected';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%control characters%' THEN
      RAISE NOTICE 'TEST 6.7 PASS (3/3): Control character rejected';
    ELSE
      RAISE NOTICE 'TEST 6.7 FAIL (3/3): Unexpected error: %', SQLERRM;
    END IF;
  END;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FINAL SUMMARY
-- ============================================================================

\echo '
╔══════════════════════════════════════════════════════════════╗
║  ROUND 15 SMOKE TEST SUITE COMPLETE                         ║
║  All 20+ test scenarios executed                            ║
║  Review results above for any FAIL or EXCEPTION             ║
║                                                              ║
║  Status: Ready for production deployment if all PASS         ║
╚══════════════════════════════════════════════════════════════╝
'

COMMIT;
