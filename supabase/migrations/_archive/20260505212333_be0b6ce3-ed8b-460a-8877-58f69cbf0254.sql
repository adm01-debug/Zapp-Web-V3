-- Fix audit function to match existing schema
CREATE OR REPLACE FUNCTION public.process_settings_audit()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    INSERT INTO public.audit_logs (
      action,
      entity_type,
      entity_id,
      details,
      user_id
    ) VALUES (
      'UPDATE',
      'app_setting',
      NEW.id,
      jsonb_build_object('old', row_to_json(OLD), 'new', row_to_json(NEW)),
      auth.uid()
    );
    RETURN NEW;
  ELSIF (TG_OP = 'INSERT') THEN
    INSERT INTO public.audit_logs (
      action,
      entity_type,
      entity_id,
      details,
      user_id
    ) VALUES (
      'INSERT',
      'app_setting',
      NEW.id,
      jsonb_build_object('new', row_to_json(NEW)),
      auth.uid()
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-run the retry queue creation now that trigger is fixed
CREATE TABLE IF NOT EXISTS public.message_retry_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 5,
    last_error TEXT,
    payload JSONB,
    next_retry_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.message_retry_queue ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can view all retries' AND tablename = 'message_retry_queue') THEN
        CREATE POLICY "Admins can view all retries" ON public.message_retry_queue FOR SELECT USING (true);
    END IF;
END $$;

INSERT INTO public.app_settings (key, value, description)
VALUES 
('feature_v2_audio_recorder', '{"enabled": false, "percentage": 0}', 'Novo gravador de áudio com waveform e cancelamento/desfazer.'),
('feature_message_queue_retry', '{"enabled": true}', 'Fila de re-tentativa automática para mensagens falhas.')
ON CONFLICT (key) DO NOTHING;