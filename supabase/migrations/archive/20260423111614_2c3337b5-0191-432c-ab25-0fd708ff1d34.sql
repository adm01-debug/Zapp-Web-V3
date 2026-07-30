-- QR attempts log: tracks each QR Code generation per WhatsApp instance
CREATE TABLE public.qr_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  connection_id UUID REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  instance_id TEXT NOT NULL,
  connection_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'connected', 'expired', 'error')),
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  connected_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_qr_attempts_instance_created ON public.qr_attempts (instance_id, created_at DESC);
CREATE INDEX idx_qr_attempts_status ON public.qr_attempts (status, created_at DESC);
CREATE INDEX idx_qr_attempts_created_at ON public.qr_attempts (created_at DESC);

ALTER TABLE public.qr_attempts ENABLE ROW LEVEL SECURITY;

-- Admins/supervisors can view all attempts
CREATE POLICY "Admins and supervisors can view QR attempts"
  ON public.qr_attempts FOR SELECT
  TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()));

-- Authenticated users can insert their own attempts
CREATE POLICY "Authenticated users can insert their QR attempts"
  ON public.qr_attempts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND (requested_by IS NULL OR requested_by = auth.uid()));

-- Authenticated users can update their own attempts (to mark connected/expired)
CREATE POLICY "Users can update their QR attempts"
  ON public.qr_attempts FOR UPDATE
  TO authenticated
  USING (requested_by = auth.uid() OR public.is_admin_or_supervisor(auth.uid()));

-- Auto-update updated_at
CREATE TRIGGER trg_qr_attempts_updated_at
  BEFORE UPDATE ON public.qr_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Periodic cleanup helper (keeps last 60 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_qr_attempts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.qr_attempts WHERE created_at < now() - interval '60 days';
END;
$$;

-- When a whatsapp_connection becomes connected, mark its most recent pending QR as connected
CREATE OR REPLACE FUNCTION public.fn_mark_qr_attempt_connected()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'connected' AND (OLD.status IS DISTINCT FROM 'connected') THEN
    UPDATE public.qr_attempts
       SET status = 'connected',
           connected_at = now()
     WHERE connection_id = NEW.id
       AND status = 'pending'
       AND created_at > now() - interval '15 minutes';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_qr_connected ON public.whatsapp_connections;
CREATE TRIGGER trg_mark_qr_connected
  AFTER UPDATE OF status ON public.whatsapp_connections
  FOR EACH ROW EXECUTE FUNCTION public.fn_mark_qr_attempt_connected();