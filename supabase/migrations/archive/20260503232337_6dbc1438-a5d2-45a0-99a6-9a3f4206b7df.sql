-- Criar tabela de fila de upload de mídias
CREATE TABLE IF NOT EXISTS public.media_upload_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    contact_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size BIGINT,
    storage_path TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'uploading', 'uploaded', 'sending_api', 'completed', 'failed'
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    error_message TEXT,
    progress INTEGER DEFAULT 0,
    agent_id UUID REFERENCES auth.users(id),
    caption TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Habilitar RLS
ALTER TABLE public.media_upload_queue ENABLE ROW LEVEL SECURITY;

-- Políticas
CREATE POLICY "Users can manage their own uploads" 
ON public.media_upload_queue 
FOR ALL 
TO authenticated
USING (auth.uid() = agent_id)
WITH CHECK (auth.uid() = agent_id);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_media_upload_queue_updated_at
    BEFORE UPDATE ON public.media_upload_queue
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
