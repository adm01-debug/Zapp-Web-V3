-- =============================================================================
-- Harden the last SECURITY DEFINER function missing an explicit search_path.
-- Applied to production 2026-07-02. Idempotent.
-- =============================================================================
-- Guarded: function may not exist in CI if earlier migrations failed.
DO $sp6_guards$ BEGIN
  BEGIN
    ALTER FUNCTION public.log_security_event(text, text, text, text, jsonb)
      SET search_path = '';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'SKIP log_security_event SET search_path: %', SQLERRM;
  END;
END $sp6_guards$;
