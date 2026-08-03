-- Creates a security-invoker view in schema "zapp" that proxies
-- public.evolution_retry_metrics.
--
-- Why: The main Supabase client uses db.schema='zapp' (PostgREST header
-- Accept-Profile: zapp). Querying .from('evolution_retry_metrics') on this
-- client routes to zapp.evolution_retry_metrics, which previously did not
-- exist, causing a 42P01 error. The underlying data lives in public schema.
--
-- security_invoker = true: RLS policies on public.evolution_retry_metrics
-- (authenticated admin/supervisor only) are enforced on the caller's role,
-- not the view definer. This preserves row-level access control.

CREATE OR REPLACE VIEW zapp.evolution_retry_metrics
WITH (security_invoker = true) AS
SELECT
  id,
  action,
  method,
  instance_name,
  idempotency_key,
  attempt_count,
  final_status,
  final_http_status,
  retry_reasons,
  total_duration_ms,
  created_at
FROM public.evolution_retry_metrics;

GRANT SELECT ON zapp.evolution_retry_metrics TO authenticated, service_role;
