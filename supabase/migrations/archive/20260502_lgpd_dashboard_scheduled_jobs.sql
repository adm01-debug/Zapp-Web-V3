-- ============================================================
-- Migration: LGPD Dashboard + Automated Scheduled Jobs
-- Purpose: Complete LGPD compliance infrastructure
-- ============================================================

-- 1. LGPD compliance dashboard view
CREATE OR REPLACE VIEW public.v_lgpd_dashboard AS
SELECT
  workspace_id,
  COUNT(*)                                                          AS total_contacts,
  COUNT(*) FILTER (WHERE lgpd_consent_at IS NOT NULL AND lgpd_opt_out_at IS NULL) AS with_consent,
  COUNT(*) FILTER (WHERE lgpd_opt_out_at IS NOT NULL)              AS opted_out,
  COUNT(*) FILTER (WHERE lgpd_consent_at IS NULL AND lgpd_opt_out_at IS NULL) AS no_consent,
  COUNT(*) FILTER (WHERE lgpd_marketing_consent = true AND lgpd_opt_out_at IS NULL) AS marketing_enabled,
  COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)                   AS soft_deleted,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE lgpd_consent_at IS NOT NULL AND lgpd_opt_out_at IS NULL)
    / NULLIF(COUNT(*), 0), 1
  )                                                                 AS consent_rate_pct,
  MAX(updated_at)                                                   AS last_updated
FROM public.contacts
GROUP BY workspace_id;

-- 2. Table to track scheduled job runs
CREATE TABLE IF NOT EXISTS public.scheduled_job_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name     text        NOT NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  status       text        CHECK (status IN ('running', 'success', 'error')),
  rows_affected integer,
  error_msg    text
);

CREATE INDEX IF NOT EXISTS idx_job_log_name_started
  ON public.scheduled_job_log (job_name, started_at DESC);

-- 3. RPC: run_lgpd_purge — purges soft-deleted contacts > 30 days old
CREATE OR REPLACE FUNCTION public.run_lgpd_purge()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count    integer;
  v_job_id   uuid;
  v_start    timestamptz := now();
BEGIN
  -- Log job start
  INSERT INTO public.scheduled_job_log (job_name, status)
  VALUES ('lgpd_purge', 'running')
  RETURNING id INTO v_job_id;

  -- Delete contacts deleted > 30 days ago
  DELETE FROM public.contacts
  WHERE deleted_at IS NOT NULL
    AND deleted_at < now() - interval '30 days';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Update log
  UPDATE public.scheduled_job_log
  SET
    finished_at   = now(),
    status        = 'success',
    rows_affected = v_count
  WHERE id = v_job_id;

  RETURN jsonb_build_object(
    'job_id',       v_job_id,
    'rows_purged',  v_count,
    'duration_ms',  EXTRACT(EPOCH FROM (now() - v_start)) * 1000
  );
EXCEPTION WHEN OTHERS THEN
  UPDATE public.scheduled_job_log
  SET finished_at = now(), status = 'error', error_msg = SQLERRM
  WHERE id = v_job_id;
  RAISE;
END;
$$;

-- 4. RPC: run_pii_access_log_purge — purge PII access logs > 90 days
CREATE OR REPLACE FUNCTION public.run_pii_log_purge()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM public.pii_access_log WHERE accessed_at < now() - interval '90 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('rows_purged', v_count);
END;
$$;

-- 5. RPC: run_audit_log_purge — purge audit logs > 2 years (LGPD max retention)
CREATE OR REPLACE FUNCTION public.run_audit_log_purge()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- LGPD: maximum 2 years for audit retention
  DELETE FROM public.contact_audit_log
  WHERE changed_at < now() - interval '2 years';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('rows_purged', v_count);
END;
$$;

-- 6. LGPD opt-out bulk action
CREATE OR REPLACE FUNCTION public.bulk_lgpd_optout(
  p_contact_ids uuid[],
  p_reason      text DEFAULT 'user_request'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.contacts
  SET
    lgpd_opt_out_at        = now(),
    lgpd_marketing_consent = false,
    lgpd_data_sharing      = false,
    lgpd_profiling         = false,
    lgpd_last_updated_at   = now(),
    updated_at             = now()
  WHERE id = ANY(p_contact_ids)
    AND workspace_id = (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    )
    AND lgpd_opt_out_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 7. Contact export log (for audit trail of data exports)
CREATE TABLE IF NOT EXISTS public.contact_export_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  exported_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  workspace_id  uuid        NOT NULL,
  exported_at   timestamptz NOT NULL DEFAULT now(),
  contact_count integer,
  export_format text        DEFAULT 'csv',
  filters_used  jsonb
);

ALTER TABLE public.contact_export_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "export_log_insert"
  ON public.contact_export_log FOR INSERT
  TO authenticated
  WITH CHECK (exported_by = auth.uid());

CREATE POLICY "export_log_managers_read"
  ON public.contact_export_log FOR SELECT
  TO authenticated
  USING (
    workspace_id = (SELECT workspace_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'manager'))
  );
