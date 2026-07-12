-- Drop existing function if exists to change signature
DROP FUNCTION IF EXISTS public.claim_next_voice_task(uuid);

-- Re-create telemetry table with clear structure
CREATE TABLE IF NOT EXISTS public.sts_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID,
    input_size_bytes BIGINT,
    status_code INTEGER,
    response_time_ms INTEGER,
    error_type TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Ensure voice_conversion_queue exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'voice_conversion_queue') THEN
        CREATE TABLE public.voice_conversion_queue (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID REFERENCES auth.users(id),
            message_id UUID,
            conversation_id UUID,
            input_audio_url TEXT,
            output_audio_url TEXT,
            voice_preset TEXT,
            status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
            error_message TEXT,
            attempts INTEGER DEFAULT 0,
            last_attempt_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        );
    END IF;
END $$;

-- Add indexes for performance monitoring
CREATE INDEX IF NOT EXISTS idx_sts_telemetry_created_at ON public.sts_telemetry(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sts_telemetry_preset ON public.sts_telemetry((metadata->>'preset'));
CREATE INDEX IF NOT EXISTS idx_sts_telemetry_status ON public.sts_telemetry(status_code);
CREATE INDEX IF NOT EXISTS idx_voice_queue_status ON public.voice_conversion_queue(status) WHERE status IN ('pending', 'processing');

-- Function to claim next task (FIFO with locking)
CREATE OR REPLACE FUNCTION public.claim_next_voice_task(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
    v_task_id UUID;
BEGIN
    -- Select oldest pending task and lock it to prevent double processing
    SELECT id INTO v_task_id
    FROM public.voice_conversion_queue
    WHERE status = 'pending'
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF v_task_id IS NOT NULL THEN
        UPDATE public.voice_conversion_queue
        SET 
            status = 'processing',
            last_attempt_at = now(),
            attempts = attempts + 1,
            updated_at = now()
        WHERE id = v_task_id;
    END IF;

    RETURN v_task_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS and setup policies
ALTER TABLE public.sts_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_conversion_queue ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can view telemetry') THEN
        CREATE POLICY "Admins can view telemetry" ON public.sts_telemetry FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own queue') THEN
        CREATE POLICY "Users can view their own queue" ON public.voice_conversion_queue FOR SELECT USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can create queue tasks') THEN
        CREATE POLICY "Users can create queue tasks" ON public.voice_conversion_queue FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;
