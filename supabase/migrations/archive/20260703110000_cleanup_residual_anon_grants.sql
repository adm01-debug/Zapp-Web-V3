-- =============================================================================
-- Clean up residual anon grants discovered during exhaustive validation
-- Applied to production 2026-07-03. Idempotent.
-- =============================================================================
-- Items:
--   1) public.workspaces: anon had table-level SELECT grant. RLS is ON with 0 anon
--      policies so anon gets 0 rows (deny by default), but the grant is dirty and
--      represents unnecessary attack surface. Clean up.
--   2) net.http_get / net.http_post explicit anon/authenticated grants: documented
--      and handled in 20260703100000_harden_net_ssrf_block.sql. Referenced here for
--      audit traceability only.
-- =============================================================================

-- 1) Revoke dirty anon grant on workspaces (RLS already denies; belt-and-suspenders)
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.workspaces', 'SELECT') THEN
    REVOKE SELECT ON public.workspaces FROM anon;
  END IF;
END $$;

-- Validation
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.workspaces', 'SELECT') THEN
    RAISE EXCEPTION 'ASSERT FAIL: anon still has SELECT on public.workspaces';
  END IF;
  RAISE NOTICE 'Residual grant cleanup assertions PASSED';
END $$;
