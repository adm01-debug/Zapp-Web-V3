-- Create a table to persist Gmail health metrics and failures
CREATE TABLE IF NOT EXISTS public.gmail_health_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
    status TEXT NOT NULL, -- 'healthy', 'degraded', 'error'
    operation TEXT, -- 'from', 'rpc', 'validation'
    resource TEXT, -- table or function name
    request_id TEXT,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_failure BOOLEAN DEFAULT false
);

-- Enable RLS
ALTER TABLE public.gmail_health_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view logs (admins/supervisors in practice, but keeping standard authenticated for now)
CREATE POLICY "Authenticated users can view gmail health logs"
ON public.gmail_health_logs
FOR SELECT
TO authenticated
USING (true);

-- Allow system/users to insert logs
CREATE POLICY "Authenticated users can insert gmail health logs"
ON public.gmail_health_logs
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_gmail_health_logs_timestamp ON public.gmail_health_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_gmail_health_logs_request_id ON public.gmail_health_logs (request_id);

-- Function to log health status
CREATE OR REPLACE FUNCTION public.rpc_log_gmail_health(
    p_status TEXT,
    p_operation TEXT DEFAULT NULL,
    p_resource TEXT DEFAULT NULL,
    p_request_id TEXT DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_is_failure BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.gmail_health_logs (
        status, operation, resource, request_id, error_message, metadata, is_failure
    ) VALUES (
        p_status, p_operation, p_resource, p_request_id, p_error_message, p_metadata, p_is_failure
    ) RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$$;

-- Function to get aggregated health status
CREATE OR REPLACE FUNCTION public.rpc_get_gmail_health_summary(p_window_minutes INTEGER DEFAULT 60)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_calls INTEGER;
    v_failure_count INTEGER;
    v_current_status TEXT;
    v_last_validation TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Get count of failures in the window
    SELECT COUNT(*) INTO v_failure_count
    FROM public.gmail_health_logs
    WHERE is_failure = true
      AND timestamp > now() - (p_window_minutes || ' minutes')::interval;

    -- Get last validation timestamp
    SELECT MAX(timestamp) INTO v_last_validation
    FROM public.gmail_health_logs
    WHERE operation = 'validation';

    -- Simple threshold logic
    IF v_failure_count > 10 THEN
        v_current_status := 'error';
    ELSIF v_failure_count > 0 THEN
        v_current_status := 'degraded';
    ELSE
        v_current_status := 'healthy';
    END IF;

    RETURN jsonb_build_object(
        'status', v_current_status,
        'failure_count_window', v_failure_count,
        'last_validation', v_last_validation,
        'window_minutes', p_window_minutes
    );
END;
$$;