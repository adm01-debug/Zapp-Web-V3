-- 1. Extend whatsapp_connections for history and fine-grained webhooks
ALTER TABLE public.whatsapp_connections 
ADD COLUMN IF NOT EXISTS event_history JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS webhook_events TEXT[] DEFAULT '{ready,disconnected,disconnecting}'::text[];

-- 2. Create reprocessing queue for failed webhooks
CREATE TABLE IF NOT EXISTS public.webhook_reprocess_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  last_error TEXT,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  next_retry_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'failed', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.webhook_reprocess_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage webhook queue" ON public.webhook_reprocess_queue FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 3. Function to log history events automatically
CREATE OR REPLACE FUNCTION public.fn_log_connection_event()
RETURNS TRIGGER AS $$
DECLARE
  new_event JSONB;
BEGIN
  IF (OLD.status IS DISTINCT FROM NEW.status) THEN
    new_event = jsonb_build_object(
      'type', 'status_change',
      'from', OLD.status,
      'to', NEW.status,
      'timestamp', now(),
      'details', NEW.health_reason
    );
    
    UPDATE public.whatsapp_connections 
    SET event_history = (event_history || new_event)
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_connection_event ON public.whatsapp_connections;
CREATE TRIGGER trg_log_connection_event
AFTER UPDATE OF status ON public.whatsapp_connections
FOR EACH ROW
EXECUTE FUNCTION public.fn_log_connection_event();