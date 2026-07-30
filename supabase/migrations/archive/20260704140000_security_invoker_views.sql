-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: security_invoker for public views missing the setting
--
-- Without security_invoker, a view runs as its owner and bypasses RLS on the
-- underlying tables. Enabling it makes the view run as the calling session
-- user, so RLS and permissions on the base tables are enforced.
-- ─────────────────────────────────────────────────────────────────────────────

-- public.contacts (the Evolution-backed view created in critical_10_steps_fix)
ALTER VIEW public.contacts SET (security_invoker = on);

-- public.audit_log (created in qa_user_devices_defaults_audit_log_view migration)
ALTER VIEW IF EXISTS public.audit_log SET (security_invoker = on);

-- public.v_contacts_masked (PII-masking view; calls can_see_pii which checks auth.uid)
ALTER VIEW IF EXISTS public.v_contacts_masked SET (security_invoker = on);

-- Analytics / reporting views
ALTER VIEW IF EXISTS public.v_operator_unread_summary  SET (security_invoker = on);
ALTER VIEW IF EXISTS public.v_sla_breach_alerts         SET (security_invoker = on);
ALTER VIEW IF EXISTS public.v_operator_efficiency       SET (security_invoker = on);
ALTER VIEW IF EXISTS public.v_transfer_audit_full       SET (security_invoker = on);
ALTER VIEW IF EXISTS public.sts_performance_metrics     SET (security_invoker = on);
ALTER VIEW IF EXISTS public.sts_troubleshooting_report  SET (security_invoker = on);
