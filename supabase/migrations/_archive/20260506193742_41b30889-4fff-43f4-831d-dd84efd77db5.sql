-- Table for instance-specific credentials
CREATE TABLE IF NOT EXISTS public.evolution_instance_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_name TEXT NOT NULL UNIQUE,
    api_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    last_health_check TIMESTAMP WITH TIME ZONE,
    health_status TEXT DEFAULT 'unknown', -- 'healthy', 'unhealthy', 'error', 'unknown'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Table for detailed health logs/audit
CREATE TABLE IF NOT EXISTS public.evolution_health_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_name TEXT NOT NULL,
    status TEXT NOT NULL, -- 'success', 'failure'
    error_message TEXT,
    response_time_ms INTEGER,
    online_instances INTEGER,
    total_instances INTEGER,
    performed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.evolution_instance_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolution_health_logs ENABLE ROW LEVEL SECURITY;

-- Policies (Admin only for management, Manager+ for viewing)
CREATE POLICY "Admins can manage evolution credentials" 
ON public.evolution_instance_credentials 
FOR ALL 
TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can view evolution credentials" 
ON public.evolution_instance_credentials 
FOR SELECT 
TO authenticated 
USING (public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view health logs" 
ON public.evolution_health_logs 
FOR SELECT 
TO authenticated 
USING (true);

-- Function to update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_evolution_credentials_updated_at
BEFORE UPDATE ON public.evolution_instance_credentials
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_evolution_health_logs_instance ON public.evolution_health_logs(instance_name, performed_at DESC);
