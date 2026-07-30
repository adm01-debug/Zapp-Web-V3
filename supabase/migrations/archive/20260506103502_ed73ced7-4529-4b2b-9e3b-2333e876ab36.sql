-- Table for STS alert thresholds (e.g., error rate > 10% in last hour)
CREATE TABLE IF NOT EXISTS public.sts_alert_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name TEXT NOT NULL UNIQUE,
    threshold_value FLOAT NOT NULL,
    window_minutes INTEGER DEFAULT 60,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Seed initial thresholds
INSERT INTO public.sts_alert_config (metric_name, threshold_value, window_minutes)
VALUES ('global_error_rate', 0.15, 60), ('avg_latency_ms', 5000, 30)
ON CONFLICT (metric_name) DO NOTHING;

-- View for commercial team troubleshooting
CREATE OR REPLACE VIEW public.sts_troubleshooting_report AS
SELECT 
    t.voice_preset,
    COUNT(*) as total_requests,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_requests,
    ROUND(CAST(COUNT(*) FILTER (WHERE status = 'failed') AS NUMERIC) / COUNT(*), 2) as error_rate,
    ROUND(AVG(tel.response_time_ms), 0) as avg_latency_ms,
    MAX(error_message) as latest_error
FROM public.voice_conversion_queue t
LEFT JOIN public.sts_telemetry tel ON t.id = tel.task_id
WHERE t.created_at > now() - interval '24 hours'
GROUP BY t.voice_preset
ORDER BY error_rate DESC;

-- Grant access to the view for support/admin roles (assuming admin role exists or authenticated)
ALTER VIEW public.sts_troubleshooting_report OWNER TO postgres;
GRANT SELECT ON public.sts_troubleshooting_report TO authenticated;