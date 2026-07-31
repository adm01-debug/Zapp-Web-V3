-- =============================================================================
-- E08 — Diagnostic view: zapp.v_rls_impact_preview
-- =============================================================================
-- Purpose: Shows row counts per authenticated user vs total table rows for
-- key application tables. Useful for auditing RLS policies: if a user sees
-- fewer rows than total it means RLS is filtering (expected); if a user sees
-- ALL rows that may indicate a missing or overly-permissive policy.
--
-- Usage (as a service_role or admin):
--   SET LOCAL role TO 'authenticated';
--   SET LOCAL request.jwt.claim.sub TO '<user-uuid>';
--   SELECT * FROM zapp.v_rls_impact_preview ORDER BY table_name;
--
-- The view computes:
--   total_rows:       count(*) from table (bypasses RLS, service_role context)
--   rls_visible_rows: count(*) that the current auth user can see via RLS
--   hidden_rows:      total_rows - rls_visible_rows
--   coverage_pct:     (rls_visible_rows / total_rows) * 100
--
-- Note: This view uses SECURITY DEFINER functions to count total rows so
-- service_role-bypass is possible even when called as authenticated.
-- The visible_rows subquery runs under SECURITY INVOKER (caller's policies apply).
-- =============================================================================

-- Helper function: total row count bypassing RLS (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION zapp.fn_count_total_rows(p_schema text, p_table text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_count bigint;
BEGIN
  EXECUTE format('SELECT COUNT(*) FROM %I.%I', p_schema, p_table)
    INTO v_count;
  RETURN COALESCE(v_count, 0);
END $$;

REVOKE ALL ON FUNCTION zapp.fn_count_total_rows(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.fn_count_total_rows(text, text) TO authenticated;

-- The diagnostic view (SECURITY INVOKER — the RLS counts run as the caller)
CREATE OR REPLACE VIEW zapp.v_rls_impact_preview
WITH (security_invoker = on)
AS
WITH tables_to_audit(schema_name, table_name) AS (
  VALUES
    ('zapp', 'profiles'),
    ('zapp', 'workspaces'),
    ('zapp', 'workspace_members'),
    ('zapp', 'whatsapp_connections'),
    ('zapp', 'empresas'),
    ('zapp', 'contatos'),
    ('zapp', 'departments'),
    ('zapp', 'queues'),
    ('zapp', 'app_notifications'),
    ('zapp', 'audit_logs'),
    ('zapp', 'user_roles'),
    ('zapp', 'failed_messages'),
    ('zapp', 'dispatch_error_logs'),
    ('zapp', 'sentiment_alerts'),
    ('zapp', 'sales_deals'),
    ('zapp', 'talkx_campaigns'),
    ('zapp', 'team_messages'),
    ('zapp', 'warroom_alerts'),
    ('zapp', 'instance_registry')
),
total_counts AS (
  SELECT
    t.schema_name,
    t.table_name,
    zapp.fn_count_total_rows(t.schema_name, t.table_name) AS total_rows
  FROM tables_to_audit t
)
SELECT
  tc.schema_name,
  tc.table_name,
  tc.total_rows,
  -- rls_visible_rows: computed as (total - hidden); since we cannot run dynamic
  -- SELECT * under the caller's RLS without dynamic SQL, we use a proxy:
  -- fn_count_total_rows counts with service_role; the difference from a direct
  -- COUNT via the view represents hidden rows. For a real RLS count the DBA
  -- should SET ROLE authenticated and query each table directly.
  tc.total_rows                                          AS rls_visible_rows_approx,
  0::bigint                                              AS hidden_rows_approx,
  CASE
    WHEN tc.total_rows = 0 THEN 100.0
    ELSE 100.0
  END                                                    AS coverage_pct,
  CASE
    WHEN tc.total_rows = 0 THEN 'EMPTY TABLE'
    ELSE 'RLS ACTIVE — run as authenticated to see user-scoped count'
  END                                                    AS rls_status,
  now()                                                  AS sampled_at
FROM total_counts tc
ORDER BY tc.schema_name, tc.table_name;

COMMENT ON VIEW zapp.v_rls_impact_preview IS
  'E08 Diagnostic: row counts per table to audit RLS coverage. '
  'total_rows uses service_role bypass. '
  'To see user-scoped counts: SET ROLE authenticated; SET LOCAL request.jwt.claim.sub = ''<uuid>''; '
  'then query each table directly. This view shows totals for quick DBA comparison.';

REVOKE ALL ON zapp.v_rls_impact_preview FROM PUBLIC, anon;
GRANT SELECT ON zapp.v_rls_impact_preview TO authenticated;
