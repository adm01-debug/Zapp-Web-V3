-- Migration: REVOKE EXECUTE from authenticated on rate-limit + audit functions
-- Date: 2026-08-03
-- Context: Prevents authenticated users from manipulating webhook rate-limit counters
--          and spamming the RLS denied audit log via PostgREST.
-- Edge functions call these via service_role — REVOKE from authenticated is safe.
-- Applied in production 2026-08-03; this migration ensures persistence across DB restores.

BEGIN;

-- Revoke from public schema (exposed via PGRST_DB_SCHEMAS)
REVOKE EXECUTE ON FUNCTION public.increment_webhook_rate_limit(
  text, text, timestamptz, integer
) FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.log_rls_denied(
  text, text, jsonb
) FROM authenticated;

-- Revoke from zapp schema (underlying implementations)
REVOKE EXECUTE ON FUNCTION zapp.increment_webhook_rate_limit(
  text, text, timestamptz, integer
) FROM authenticated;

REVOKE EXECUTE ON FUNCTION zapp.log_rls_denied(
  text, text, jsonb
) FROM authenticated;

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- GRANT EXECUTE ON FUNCTION public.increment_webhook_rate_limit(text,text,timestamptz,integer) TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.log_rls_denied(text,text,jsonb) TO authenticated;
-- GRANT EXECUTE ON FUNCTION zapp.increment_webhook_rate_limit(text,text,timestamptz,integer) TO authenticated;
-- GRANT EXECUTE ON FUNCTION zapp.log_rls_denied(text,text,jsonb) TO authenticated;
-- COMMIT;
