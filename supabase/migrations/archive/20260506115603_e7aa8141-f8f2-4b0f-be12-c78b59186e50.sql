-- Enum for voice conversion status
DO $$ BEGIN
    CREATE TYPE public.voice_conversion_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Main queue table
CREATE TABLE IF NOT EXISTS public.voice_conversion_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL,
    contact_id UUID NOT NULL,
    user_id UUID DEFAULT auth.uid(), -- The agent user ID
    preset_id TEXT NOT NULL,
    status public.voice_conversion_status DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    error_message TEXT,
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Telemetry for monitoring and dashboards
CREATE TABLE IF NOT EXISTS public.voice_conversion_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_id UUID REFERENCES public.voice_conversion_queue(id) ON DELETE SET NULL,
    preset_id TEXT NOT NULL,
    duration_ms INTEGER,
    status public.voice_conversion_status NOT NULL,
    error_type TEXT,
    error_detail TEXT,
    agent_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.voice_conversion_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_conversion_telemetry ENABLE ROW LEVEL SECURITY;

-- Re-create policies using user_id
CREATE POLICY "Agents can view their queue items" ON public.voice_conversion_queue
    FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view all telemetry" ON public.voice_conversion_telemetry
    FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Optimization indexes
CREATE INDEX IF NOT EXISTS idx_vc_queue_status_pending ON public.voice_conversion_queue(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_vc_telemetry_preset ON public.voice_conversion_telemetry(preset_id);
CREATE INDEX IF NOT EXISTS idx_vc_telemetry_created ON public.voice_conversion_telemetry(created_at);

-- Atomic RPC for worker processing
CREATE OR REPLACE FUNCTION public.claim_next_voice_task(p_worker_id TEXT)
RETURNS SETOF public.voice_conversion_queue
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    UPDATE public.voice_conversion_queue
    SET 
        status = 'processing',
        updated_at = now(),
        attempts = attempts + 1,
        payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object('worker_id', p_worker_id)
    WHERE id = (
        SELECT id 
        FROM public.voice_conversion_queue 
        WHERE status = 'pending' 
        AND attempts < max_attempts
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    RETURNING *;
END;
$$;
