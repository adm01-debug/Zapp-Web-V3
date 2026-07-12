-- Add retry and webhook configuration to connections
ALTER TABLE public.whatsapp_connections 
ADD COLUMN IF NOT EXISTS retry_strategy JSONB DEFAULT '{"max_attempts": 3, "initial_backoff_ms": 1000, "multiplier": 2}'::jsonb,
ADD COLUMN IF NOT EXISTS webhook_url TEXT;

-- Create function for status change notifications
CREATE OR REPLACE FUNCTION public.fn_notify_status_change()
RETURNS TRIGGER AS $$
DECLARE
  payload JSONB;
BEGIN
  IF (OLD.status IS DISTINCT FROM NEW.status) THEN
    payload = jsonb_build_object(
      'connection_id', NEW.id,
      'instance_name', NEW.instance_id,
      'old_status', OLD.status,
      'new_status', NEW.status,
      'timestamp', now()
    );
    
    -- If a webhook URL is configured, we could trigger an edge function here
    -- For now, we log to audit for visibility
    PERFORM public.fn_safe_audit_log(
      'whatsapp_connection',
      NEW.id,
      'status_change_notification',
      'system',
      payload
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add trigger
DROP TRIGGER IF EXISTS trg_whatsapp_status_change ON public.whatsapp_connections;
CREATE TRIGGER trg_whatsapp_status_change
AFTER UPDATE OF status ON public.whatsapp_connections
FOR EACH ROW
EXECUTE FUNCTION public.fn_notify_status_change();