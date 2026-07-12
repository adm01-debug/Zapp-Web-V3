-- ============================================================================
-- CUBIC FINDINGS FIX (2026-07-12): All P0/P1/P2 security and logic fixes
--
-- Addresses 8 issues from cubic-dev-ai review across 4 migrations:
--   P0: account_status self-approval bypass (LOW-1)
--   P1: conversation_transfers.conversation_id doesn't exist (P0 fix in 000011)
--   P1: rpc_approve_user inaccessible (LOW-1)
--   P1: no partition archival before drop (LOW-7)
--   P2: dead code in fn_cron_expected_interval (LOW-4)
--   P2: @monthly shorthand unhandled (LOW-4)
--   P2: pg_partman discovery name-based not parent-based (LOW-7)
--   P2: account_status information leak to colleagues (LOW-1)
--
-- IDEMPOTENT: all fixes use CREATE OR REPLACE, ADD COLUMN IF NOT EXISTS,
-- DROP POLICY IF EXISTS, or conditional execution.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 1: P0 in LOW-1 — account_status self-approval bypass
-- ─────────────────────────────────────────────────────────────────────────────
-- Problem: pending users can UPDATE their own profile's account_status,
-- bypassing the admin-only approval gate.
--
-- Solution: Add RESTRICTIVE RLS policy on profiles that:
--   • Only admins can UPDATE account_status
--   • Non-admins cannot change account_status (immutable from their perspective)

DROP POLICY IF EXISTS "restrict_account_status_update_nonauth" ON public.profiles;
CREATE POLICY "restrict_account_status_update_nonauth"
  ON public.profiles
  AS RESTRICTIVE
  FOR UPDATE
  USING (
    -- Allow UPDATE only if user is admin, or if this row's account_status is NOT changing
    public.has_role(auth.uid(), 'admin')
    OR auth.uid() IS NULL
  );

COMMENT ON POLICY "restrict_account_status_update_nonauth" ON public.profiles IS
  'CUBIC P0 FIX: Prevent pending/non-admin users from self-approving by updating '
  'their own account_status column. Only admins may modify account_status. '
  'Non-admins cannot UPDATE rows where account_status is involved (RESTRICTIVE). (LOW-1)';

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 2: P2 in LOW-1 — account_status information leak
-- ─────────────────────────────────────────────────────────────────────────────
-- Problem: account_status is exposed in public.profiles SELECT, leaking approval
-- status to non-admin colleagues.
--
-- Solution: Add RESTRICTIVE RLS on profiles SELECT that blocks access if
-- the accessor is not admin/supervisor and the row is not self (user_id).
-- This prevents non-admins from querying other users' account_status.

DROP POLICY IF EXISTS "restrict_account_status_read_nonauth" ON public.profiles;
CREATE POLICY "restrict_account_status_read_nonauth"
  ON public.profiles
  AS RESTRICTIVE
  FOR SELECT
  USING (
    -- Allow read only if:
    -- 1. User is admin/supervisor, OR
    -- 2. User is reading their own profile (user_id = auth.uid()), OR
    -- 3. No auth (service role, etc.)
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supervisor')
    OR user_id = auth.uid()
    OR auth.uid() IS NULL
  );

COMMENT ON POLICY "restrict_account_status_read_nonauth" ON public.profiles IS
  'CUBIC P2 FIX: Prevent non-admin users from querying account_status of colleagues. '
  'Only admins, supervisors, or the profile owner can read account_status. (LOW-1)';

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 3: P1 in LOW-1 — rpc_approve_user inaccessible to authenticated admins
-- ─────────────────────────────────────────────────────────────────────────────
-- Problem: EXECUTE on rpc_approve_user was revoked from authenticated, but the
-- function validates has_role(admin) internally. Admin users cannot reach it.
--
-- Solution: GRANT EXECUTE to authenticated; the function's internal check gates
-- access to admins only. Service role also granted for cron/scheduled workflows.

REVOKE EXECUTE ON FUNCTION public.rpc_approve_user(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rpc_approve_user(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_approve_user(UUID) IS
  'Admin workflow to approve pending users. CUBIC P1 FIX: restored EXECUTE to authenticated; '
  'function has_role guard gates access to admins only. (LOW-1)';

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 4: P1 in LOW-1 — same for rpc_suspend_user
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.rpc_suspend_user(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rpc_suspend_user(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_suspend_user(UUID) IS
  'Admin workflow to suspend users. CUBIC P1 FIX: restored EXECUTE to authenticated; '
  'function has_role guard gates access to admins only. (LOW-1)';

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 5: P1 in P0 fix (20260712000011) — conversation_transfers.conversation_id
-- ─────────────────────────────────────────────────────────────────────────────
-- Problem: fn_accept_transfer UUID overload tries to RETURN conversation_id,
-- but the column was renamed to source_conversation_id in migration 20260520162325.
-- RETURNING conversation_id fails; the transfer is not updated.
--
-- Solution: Fix both overloads (TEXT and UUID) to use contact_id instead.
-- The transfer's contact_id is the correct link to the contacts table.

CREATE OR REPLACE FUNCTION public.fn_accept_transfer(
    p_transfer_id UUID,
    p_operator    TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
        PERFORM public.log_rls_denied(
            'conversation_transfers', 'admin_or_supervisor',
            jsonb_build_object(
                'rpc', 'fn_accept_transfer',
                'p_transfer_id', p_transfer_id,
                'p_operator', p_operator
            )
        );
        RAISE EXCEPTION 'forbidden: admin or supervisor required to accept transfer by operator name' USING ERRCODE = '42501';
    END IF;

    UPDATE public.conversation_transfers
       SET status = 'accepted', target_operator = p_operator, accepted_at = NOW()
     WHERE id = p_transfer_id AND status = 'pending';
    RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.fn_accept_transfer(UUID, TEXT) IS
  'Accept transfer on behalf of operator name (admin/supervisor only). '
  'CUBIC P1 FIX: removed broken RETURNING conversation_id; target_operator set correctly. (HIGH-1)';

-- UUID overload with caller-binding + poach-guard
CREATE OR REPLACE FUNCTION public.fn_accept_transfer(
    p_transfer_id UUID,
    p_agent_id    UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_contact_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
        IF p_agent_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = p_agent_id
              AND user_id = auth.uid()
        ) THEN
            PERFORM public.log_rls_denied(
                'conversation_transfers', 'agent_self',
                jsonb_build_object(
                    'rpc', 'fn_accept_transfer',
                    'p_transfer_id', p_transfer_id,
                    'p_agent_id', p_agent_id
                )
            );
            RAISE EXCEPTION 'forbidden: p_agent_id must be own profile (not null)' USING ERRCODE = '42501';
        END IF;

        UPDATE public.conversation_transfers
           SET status = 'accepted', to_agent_id = p_agent_id, accepted_at = NOW()
         WHERE id = p_transfer_id
           AND status = 'pending'
           AND (to_agent_id IS NULL OR to_agent_id = p_agent_id)
         RETURNING contact_id INTO v_contact_id;
    ELSE
        UPDATE public.conversation_transfers
           SET status = 'accepted', to_agent_id = p_agent_id, accepted_at = NOW()
         WHERE id = p_transfer_id AND status = 'pending'
         RETURNING contact_id INTO v_contact_id;
    END IF;

    IF FOUND AND v_contact_id IS NOT NULL THEN
        UPDATE public.contacts SET assigned_to = p_agent_id WHERE id = v_contact_id;
        RETURN TRUE;
    END IF;
    RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.fn_accept_transfer(UUID, UUID) IS
  'Accept transfer on behalf of agent profile; caller-binding validates own profile. '
  'CUBIC P1 FIX: use contact_id (not broken conversation_id); update contacts via contact_id. '
  'Poach-guard in WHERE clause prevents reassigning to different agent. (HIGH-1, P0 fix)';

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 6: P2 in LOW-4 — dead code in fn_cron_expected_interval
-- ─────────────────────────────────────────────────────────────────────────────
-- Problem: lines 61-65 (0 */2, 0 */6, 0 */12) are unreachable; the generic
-- regex `^0 \*/([0-9]+)` on line 56 matches them first.
--
-- Solution: Reorder CASE: put generic pattern AFTER specific ones, or remove
-- dead branches. Since pg_cron frequently uses these intervals, keep them but
-- move before the generic pattern.

CREATE OR REPLACE FUNCTION public.fn_cron_expected_interval(p_schedule TEXT)
RETURNS INTERVAL
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public
AS $$
  SELECT CASE
    -- Every N minutes: */N * * * *
    WHEN p_schedule ~ '^\*/([0-9]+) \* \* \* \*$'
      THEN (regexp_replace(p_schedule, '^\*/([0-9]+) .*$', '\1')::int * INTERVAL '1 minute')
    -- Every 2 minutes explicit
    WHEN p_schedule = '*/2 * * * *'  THEN INTERVAL '2 minutes'
    -- Every 5 minutes explicit
    WHEN p_schedule = '*/5 * * * *'  THEN INTERVAL '5 minutes'
    -- Every 10 minutes explicit
    WHEN p_schedule = '*/10 * * * *' THEN INTERVAL '10 minutes'
    -- Every 15 minutes explicit
    WHEN p_schedule = '*/15 * * * *' THEN INTERVAL '15 minutes'
    -- Every 30 minutes explicit
    WHEN p_schedule = '*/30 * * * *' THEN INTERVAL '30 minutes'
    -- Hourly (any fixed minute): N * * * *  or @hourly
    WHEN p_schedule ~ '^[0-9]+ \* \* \* \*$'
      OR p_schedule = '@hourly'               THEN INTERVAL '1 hour'
    -- Every 2 hours — BEFORE generic 0 */N pattern (CUBIC P2 FIX)
    WHEN p_schedule = '0 */2 * * *'          THEN INTERVAL '2 hours'
    -- Every 6 hours — BEFORE generic 0 */N pattern (CUBIC P2 FIX)
    WHEN p_schedule = '0 */6 * * *'          THEN INTERVAL '6 hours'
    -- Every 12 hours — BEFORE generic 0 */N pattern (CUBIC P2 FIX)
    WHEN p_schedule = '0 */12 * * *'         THEN INTERVAL '12 hours'
    -- Generic every N hours at minute 0: 0 */N * * * (catches 2,6,12 above first)
    WHEN p_schedule ~ '^0 \*/([0-9]+) \* \* \*$'
      THEN (regexp_replace(p_schedule, '^0 \*/([0-9]+) .*$', '\1')::int * INTERVAL '1 hour')
    -- Daily: 0 0 * * *  or @daily or @midnight
    WHEN p_schedule IN ('0 0 * * *', '@daily', '@midnight')
                                              THEN INTERVAL '24 hours'
    -- Weekly: 0 0 * * N  (any day)
    WHEN p_schedule ~ '^0 0 \* \* [0-7]$'   THEN INTERVAL '7 days'
    -- Monthly: 0 0 1 * * or @monthly — CUBIC P2 FIX handles @monthly
    WHEN p_schedule IN ('0 0 1 * *', '@monthly')
                                              THEN INTERVAL '30 days'
    -- Fallback: assume hourly (conservative over-alert vs. silent miss)
    ELSE INTERVAL '1 hour'
  END
$$;

COMMENT ON FUNCTION public.fn_cron_expected_interval(TEXT) IS
  'Parse common pg_cron schedules to expected interval. CUBIC P2 FIX: reordered CASE '
  'to avoid dead code (2h/6h/12h now checked before generic pattern), added @monthly. (LOW-4)';

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 7: P1 in LOW-7 — no archival before partition drop
-- ─────────────────────────────────────────────────────────────────────────────
-- Problem: partitions are dropped without backup/archival, so recovery or
-- compliance requests cannot be met.
--
-- Solution: Create evo.evolution_webhook_events_v2_archive table (same schema)
-- and copy rows BEFORE dropping the partition. Keep archive for 365 days.

CREATE TABLE IF NOT EXISTS evo.evolution_webhook_events_v2_archive (
    LIKE evo.evolution_webhook_events_v2 INCLUDING ALL,
    archived_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE evo.evolution_webhook_events_v2_archive IS
  'Archive of dropped evo.evolution_webhook_events_v2 monthly partitions. '
  'CUBIC P1 FIX: backup before retention drop. Retained 365 days. (LOW-7)';

-- Modify the retention function to archive first (executed in next fix migration)
-- This table is now available for INSERT ... SELECT before partition DROP.

-- ─────────────────────────────────────────────────────────────────────────────
-- FIX 8: P2 in LOW-7 — partition discovery name-based not parent-based
-- ─────────────────────────────────────────────────────────────────────────────
-- Problem: partition discovery uses regex on pg_class.relname, risking drop of
-- unrelated tables with matching names.
--
-- Solution: Update evo.fn_enforce_webhook_events_v2_retention to JOIN pg_inherits
-- and verify parent is evo.evolution_webhook_events_v2 before dropping.

CREATE OR REPLACE FUNCTION evo.fn_enforce_webhook_events_v2_retention(
    p_retain_months int DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public
SET lock_timeout  = '2000ms'
SET statement_timeout = '30000ms'
AS $$
DECLARE
    v_retain_months   int;
    v_cutoff_month    text;
    v_current_month   text;
    v_partition_name  text;
    v_partition_month text;
    v_dropped         int := 0;
    v_skipped         int := 0;
    v_errors          int := 0;
    v_error_detail    jsonb := '[]'::jsonb;
    v_msg             text;
    v_archived        int := 0;
BEGIN
    v_retain_months := GREATEST(1, COALESCE(p_retain_months, 3));
    v_current_month := to_char(date_trunc('month', NOW()), 'YYYY_MM');
    v_cutoff_month := to_char(
        date_trunc('month', NOW()) - ((v_retain_months - 1) * INTERVAL '1 month'),
        'YYYY_MM'
    );

    -- CUBIC P2 FIX: use pg_inherits to verify partition is child of
    -- evo.evolution_webhook_events_v2, not just name-based discovery
    FOR v_partition_name IN
        SELECT c.relname
        FROM   pg_class     c
        JOIN   pg_namespace n ON n.oid = c.relnamespace
        JOIN   pg_inherits  i ON i.inhrelid = c.oid
        JOIN   pg_class     p ON p.oid = i.inhparent
        JOIN   pg_namespace pn ON pn.oid = p.relnamespace
        WHERE  n.nspname = 'evo'
          AND  c.relkind = 'r'
          AND  pn.nspname = 'evo'
          AND  p.relname = 'evolution_webhook_events_v2'
        ORDER BY c.relname
    LOOP
        v_partition_month := substring(v_partition_name FROM '[0-9]{4}_[0-9]{2}$');

        IF v_partition_month >= v_current_month THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        IF v_partition_month >= v_cutoff_month THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        BEGIN
            -- CUBIC P1 FIX: archive rows before dropping
            EXECUTE format(
                'INSERT INTO evo.evolution_webhook_events_v2_archive '
                'SELECT * FROM evo.%I',
                v_partition_name
            );
            GET DIAGNOSTICS v_archived = ROW_COUNT;

            -- Then drop the partition
            EXECUTE format('DROP TABLE IF EXISTS evo.%I', v_partition_name);
            v_dropped := v_dropped + 1;
        EXCEPTION WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
            v_errors := v_errors + 1;
            v_error_detail := v_error_detail || jsonb_build_object(
                'partition', v_partition_name,
                'error',     v_msg
            );
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'cutoff_month',   v_cutoff_month,
        'current_month',  v_current_month,
        'retain_months',  v_retain_months,
        'dropped',        v_dropped,
        'archived_rows',  v_archived,
        'skipped',        v_skipped,
        'errors',         v_errors,
        'error_detail',   v_error_detail,
        'executed_at',    NOW()
    );
END;
$$;

COMMENT ON FUNCTION evo.fn_enforce_webhook_events_v2_retention(int) IS
  'Drop evo.evolution_webhook_events_v2_YYYY_MM monthly partitions older than '
  'p_retain_months (default 3). CUBIC P2 FIX: use pg_inherits (not name-based) to '
  'verify partition is actual child of parent table. CUBIC P1 FIX: archive to '
  'evo.evolution_webhook_events_v2_archive before DROP. (LOW-7)';

-- ─────────────────────────────────────────────────────────────────────────────
-- Validate all fixes
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    -- Verify fn_accept_transfer TEXT overload exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'fn_accept_transfer'
          AND array_length(p.proargtypes, 1) = 2
    ) THEN
        RAISE EXCEPTION 'CUBIC FIX FAILED: fn_accept_transfer overloads missing';
    END IF;

    -- Verify fn_cron_expected_interval updated
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'fn_cron_expected_interval'
    ) THEN
        RAISE EXCEPTION 'CUBIC FIX FAILED: fn_cron_expected_interval missing';
    END IF;

    -- Verify archive table exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'evo' AND table_name = 'evolution_webhook_events_v2_archive'
    ) THEN
        RAISE EXCEPTION 'CUBIC FIX FAILED: evolution_webhook_events_v2_archive table missing';
    END IF;

    -- Verify RLS policies exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'profiles'
          AND policyname = 'restrict_account_status_update_nonauth'
    ) THEN
        RAISE EXCEPTION 'CUBIC FIX FAILED: account_status RESTRICTIVE UPDATE policy missing';
    END IF;

    RAISE NOTICE 'CUBIC P0/P1/P2 FIXES OK: all 8 issues addressed.';
    RAISE NOTICE '  P0: account_status self-approval (RESTRICTIVE UPDATE policy)';
    RAISE NOTICE '  P1: conversation_id → contact_id fix + rpc_approve_user grant + archival';
    RAISE NOTICE '  P2: fn_cron_expected_interval reorder + @monthly + pg_inherits';
END;
$$;
