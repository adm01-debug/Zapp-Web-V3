-- Create enum for conversion status
DO $$ BEGIN
    CREATE TYPE public.conversion_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create table for voice conversion queue
CREATE TABLE IF NOT EXISTS public.voice_conversion_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    input_audio_url TEXT NOT NULL,
    output_audio_url TEXT,
    voice_preset TEXT NOT NULL,
    status public.conversion_status DEFAULT 'pending' NOT NULL,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.voice_conversion_queue ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own conversion tasks" 
ON public.voice_conversion_queue FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create conversion tasks" 
ON public.voice_conversion_queue FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create table for STS telemetry
CREATE TABLE IF NOT EXISTS public.sts_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES public.voice_conversion_queue(id),
    provider TEXT DEFAULT 'elevenlabs' NOT NULL,
    response_time_ms INTEGER,
    status_code INTEGER,
    error_type TEXT,
    input_size_bytes INTEGER,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS for telemetry (Admin only or system level)
ALTER TABLE public.sts_telemetry ENABLE ROW LEVEL SECURITY;

-- Simple policy for authenticated users to insert (if client reports errors)
CREATE POLICY "Authenticated users can insert telemetry" 
ON public.sts_telemetry FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Function and trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_voice_queue_updated_at
BEFORE UPDATE ON public.voice_conversion_queue
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();