-- FIX-08 (S11 - CRITICAL): Audit table permission failures prevention
-- ===================================================================
--
-- PROBLEM S11 - Audit Table Permission Failures:
-- When unmarkEventProcessed fails (e.g., on rate-limit 429 response),
-- it tries to write to idempotency_rollback_failures audit table.
-- However, RLS (Row-Level Security) policies may deny the write:
-- 1. Service role calls unmarkEventProcessed from Edge Function
-- 2. RLS policy checks if user can INSERT into audit table
-- 3. Policy denies write (wrong role, wrong checks, etc.)
-- 4. Audit insert fails silently (caught in nested try/catch)
-- 5. Operators have no record that this event was permanently lost
-- 6. Next time this event is re-delivered: crashes as already-processed
--
-- SCENARIO:
-- - High-load webhook spike → many 429 responses
-- - unmarkEventProcessed tries to audit each rollback failure
-- - RLS denies inserts → audit table remains empty
-- - Operators unaware of data loss until customer reports duplicate
--
-- SOLUTION:
-- 1. Create SECURITY DEFINER wrapper function that bypasses RLS
-- 2. Wrapper function: fn_insert_idempotency_failure_audit()
-- 3. Use SECURITY DEFINER to execute as definer role, not caller
-- 4. Update unmarkEventProcessed to call wrapper instead of direct INSERT
-- 5. Add explicit grant to evolution-webhook Edge Function role
-- 6. Monitor audit table writes separately from RLS policies

CREATE OR REPLACE FUNCTION public.fn_insert_idempotency_failure_audit(
  p_event_id text,
  p_instance text,
  p_event_type text,
  p_error_code text,
  p_error_message text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  INSERT INTO public.idempotency_rollback_failures(
    event_id, instance, event_type, error_code, error_message, created_at
  ) VALUES (
    p_event_id, p_instance, p_event_type, p_error_code, p_error_message, now()
  );
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  -- If audit insert fails for any reason, log to Postgres error log
  -- (Prevents crash but ensures observability via logs)
  RAISE WARNING '[audit] failed to insert idempotency failure: % %', SQLSTATE, SQLERRM;
  -- Return false to indicate audit write failure (caller can log it)
  RETURN false;
END;
$fn$;

-- Grant execute permission to all roles that call unmarkEventProcessed
-- (service_role, anon, authenticated)
GRANT EXECUTE ON FUNCTION public.fn_insert_idempotency_failure_audit(text, text, text, text, text)
  TO service_role, anon, authenticated;

-- Ensure idempotency_rollback_failures table has proper grants
-- Allow authenticated users to INSERT (for audit trails)
ALTER TABLE public.idempotency_rollback_failures ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow inserts from authenticated role (Edge Functions)
CREATE POLICY "Allow audit inserts from authenticated"
  ON public.idempotency_rollback_failures
  FOR INSERT
  TO authenticated, anon, service_role
  WITH CHECK (true);

-- RLS Policy: Allow selects from admin/supervisor users
CREATE POLICY "Allow audit reads from admin"
  ON public.idempotency_rollback_failures
  FOR SELECT
  TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- Update evolution-webhook Edge Function to use new wrapper
-- NOTE: This requires update to evolution-helpers.ts unmarkEventProcessed function
-- Change: await supabase.from('idempotency_rollback_failures').insert(...)
-- To: await supabase.rpc('fn_insert_idempotency_failure_audit', {...})

COMMENT ON FUNCTION public.fn_insert_idempotency_failure_audit IS
  'SECURITY DEFINER wrapper to bypass RLS for audit table inserts.

   Used by unmarkEventProcessed() to log rate-limit rollback failures.
   Executes as definer role, bypassing RLS policies that might otherwise
   deny inserts from Edge Function service roles.

   FIX-08 (2026-07-12): Ensures audit trail is always written, even if
   RLS policies would otherwise deny the insert.

   Returns: true on success, false if audit write failed
   (Failure is logged to Postgres error log but does not crash function)';
