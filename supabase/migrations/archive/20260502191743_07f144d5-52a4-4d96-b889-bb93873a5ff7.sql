-- Helper function to check for admin/supervisor roles securely
CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'moderator')
    )
  );
END;
$$;

-- Secure gmail_health_summary
ALTER TABLE public.gmail_health_summary ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read for health summary" ON public.gmail_health_summary;
CREATE POLICY "Authorized users can read health summary" 
ON public.gmail_health_summary FOR SELECT 
TO authenticated 
USING (public.is_admin_or_supervisor());

-- Secure gmail_health_logs
ALTER TABLE public.gmail_health_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view gmail health logs" ON public.gmail_health_logs;
CREATE POLICY "Authorized users can read health logs" 
ON public.gmail_health_logs FOR SELECT 
TO authenticated 
USING (public.is_admin_or_supervisor());

-- Secure gmail_revalidation_jobs
ALTER TABLE public.gmail_revalidation_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage revalidation jobs" ON public.gmail_revalidation_jobs;
CREATE POLICY "Authorized users can manage revalidation jobs" 
ON public.gmail_revalidation_jobs FOR ALL 
TO authenticated 
USING (public.is_admin_or_supervisor());

-- Function to handle automatic revalidation logic (can be called by cron or edge)
CREATE OR REPLACE FUNCTION public.rpc_check_and_trigger_gmail_revalidation()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_last_val TIMESTAMP WITH TIME ZONE;
    v_status TEXT;
    v_job_id UUID;
BEGIN
    SELECT last_validation, status INTO v_last_val, v_status 
    FROM public.gmail_health_summary 
    WHERE id = 'current';

    -- Trigger if degraded/error OR if last validation was more than 30 minutes ago
    IF v_status IN ('degraded', 'error') OR v_last_val < now() - interval '30 minutes' OR v_last_val IS NULL THEN
        -- Check if there's already a pending job to avoid duplicates
        IF NOT EXISTS (SELECT 1 FROM public.gmail_revalidation_jobs WHERE status = 'pending' AND requested_at > now() - interval '5 minutes') THEN
            INSERT INTO public.gmail_revalidation_jobs (status, requested_at)
            VALUES ('pending', now())
            RETURNING id INTO v_job_id;
            
            RETURN jsonb_build_object('triggered', true, 'job_id', v_job_id, 'reason', 'Threshold met or stale data');
        END IF;
    END IF;

    RETURN jsonb_build_object('triggered', false, 'reason', 'System healthy and data fresh');
END;
$$;