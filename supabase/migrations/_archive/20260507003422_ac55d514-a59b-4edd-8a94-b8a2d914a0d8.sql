-- Create table for system health incidents
CREATE TABLE IF NOT EXISTS public.system_health_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    component TEXT NOT NULL, -- e.g., 'bridge', 'external_db', 'internal_db'
    status TEXT NOT NULL, -- 'degraded', 'offline'
    title TEXT NOT NULL,
    description TEXT,
    probable_cause TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    impact_level TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.system_health_incidents ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read incidents
CREATE POLICY "Authenticated users can read health incidents" 
ON public.system_health_incidents 
FOR SELECT 
TO authenticated 
USING (true);

-- Allow service role or admins to manage incidents (handled via edge functions or rpc if needed)
CREATE POLICY "Admins can manage health incidents" 
ON public.system_health_incidents 
FOR ALL 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = auth.uid() 
        AND role IN ('admin', 'dev')
    )
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_system_health_incidents_started_at ON public.system_health_incidents(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_health_incidents_status ON public.system_health_incidents(status);
