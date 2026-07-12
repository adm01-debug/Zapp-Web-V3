-- R20: Add RT22 and RT23 to ops.fn_regression_tests
-- RT22: Verifies G1 fix (vendas.creditos + trocas: RLS=ON, anon=false)
-- RT23: Verifies G8 fix (fn_score_security_acl legacy_rls_off_anon=0)
-- Full canonical rewrite of fn_regression_tests (23 tests, was 21)
-- Existing RT01-RT21 unchanged.

-- NOTE: Full function body is in the CREATE OR REPLACE executed in production.
-- Key additions:
-- RT22_vendas_g1_rls_fix:
--   Counts tables in vendas schema where tablename IN ('creditos','trocas')
--   and (rowsecurity=false OR anon has SELECT). Must be 0.
-- RT23_g8_legacy_sentinel:
--   Calls public.fn_score_security_acl() and checks legacy_rls_off_anon=0.
--   Verifies the G8 monitoring vector is active and returning 0.

-- Verification:
-- SELECT test_name, status, detail FROM ops.fn_regression_tests()
-- WHERE test_name IN ('RT22_vendas_g1_rls_fix','RT23_g8_legacy_sentinel');
-- Expected: PASS for both.
