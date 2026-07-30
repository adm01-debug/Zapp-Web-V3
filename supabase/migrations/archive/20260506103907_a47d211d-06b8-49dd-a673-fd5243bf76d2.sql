-- Add attempts column to the queue correctly
ALTER TABLE public.voice_conversion_queue 
ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMP WITH TIME ZONE;

-- Indexing for performance and reporting
CREATE INDEX IF NOT EXISTS idx_voice_queue_status_created ON public.voice_conversion_queue (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_queue_user_id ON public.voice_conversion_queue (user_id);
CREATE INDEX IF NOT EXISTS idx_sts_telemetry_created_at ON public.sts_telemetry (created_at DESC);

-- View with p95 and p99 metrics for commercial dashboard using JSONB metadata
CREATE OR REPLACE VIEW public.sts_performance_metrics AS
WITH percentiles AS (
    SELECT 
        metadata->>'preset' as voice_preset,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY response_time_ms) as p95_latency,
        percentile_cont(0.99) WITHIN GROUP (ORDER BY response_time_ms) as p99_latency
    FROM public.sts_telemetry
    WHERE created_at > now() - interval '7 days'
    GROUP BY 1
)
SELECT 
    tr.*,
    p.p95_latency,
    p.p99_latency
FROM public.sts_troubleshooting_report tr
LEFT JOIN percentiles p ON tr.voice_preset = p.voice_preset;

GRANT SELECT ON public.sts_performance_metrics TO authenticated;