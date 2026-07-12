-- Table to store current health summary (shared state for Edge and Client)
CREATE TABLE IF NOT EXISTS public.gmail_health_summary (
    id TEXT PRIMARY KEY DEFAULT 'current',
    status TEXT NOT NULL DEFAULT 'healthy',
    last_validation TIMESTAMP WITH TIME ZONE DEFAULT now(),
    failure_count_60m INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Table to track revalidation requests (jobs)
CREATE TABLE IF NOT EXISTS public.gmail_revalidation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    completed_at TIMESTAMP WITH TIME ZONE,
    requested_by UUID REFERENCES auth.users(id),
    result JSONB
);

-- Policy to allow viewing health summary
ALTER TABLE public.gmail_health_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read for health summary" ON public.gmail_health_summary FOR SELECT USING (true);

-- Policy for revalidation jobs
ALTER TABLE public.gmail_revalidation_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage revalidation jobs" ON public.gmail_revalidation_jobs
    FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Function to update health state from client
CREATE OR REPLACE FUNCTION public.rpc_update_gmail_health_state(
    p_status TEXT,
    p_failure_count INTEGER,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.gmail_health_summary (id, status, last_validation, failure_count_60m, metadata, updated_at)
    VALUES ('current', p_status, now(), p_failure_count, p_metadata, now())
    ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        last_validation = EXCLUDED.last_validation,
        failure_count_60m = EXCLUDED.failure_count_60m,
        metadata = public.gmail_health_summary.metadata || EXCLUDED.metadata,
        updated_at = now();
END;
$$;