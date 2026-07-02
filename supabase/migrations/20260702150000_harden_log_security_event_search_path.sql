-- =============================================================================
-- Harden the last SECURITY DEFINER function missing an explicit search_path.
-- Applied to production 2026-07-02. Idempotent.
-- =============================================================================
-- A SECURITY DEFINER function without a pinned search_path is vulnerable to
-- search_path injection. public.log_security_event already fully-qualifies
-- everything it references (public.audit_logs, auth.uid()), so pinning an EMPTY
-- search_path is safe and non-breaking.
-- =============================================================================

ALTER FUNCTION public.log_security_event(text, text, text, text, jsonb)
    SET search_path = '';
