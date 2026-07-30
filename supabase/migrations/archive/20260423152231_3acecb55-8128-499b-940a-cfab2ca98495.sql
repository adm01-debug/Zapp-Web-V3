
-- Dead-letter queue for failed WhatsApp message sends
CREATE TABLE IF NOT EXISTS public.failed_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name TEXT NOT NULL,
  remote_jid TEXT,
  payload JSONB NOT NULL,
  error_code TEXT,
  error_message TEXT,
  http_status INTEGER,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','retrying','succeeded','failed','abandoned')),
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ DEFAULT now(),
  succeeded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_failed_messages_status_next ON public.failed_messages(status, next_attempt_at) WHERE status IN ('pending','retrying');
CREATE INDEX IF NOT EXISTS idx_failed_messages_instance ON public.failed_messages(instance_name);
CREATE INDEX IF NOT EXISTS idx_failed_messages_created ON public.failed_messages(created_at DESC);

ALTER TABLE public.failed_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view failed messages"
  ON public.failed_messages FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert failed messages"
  ON public.failed_messages FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update failed messages"
  ON public.failed_messages FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete failed messages"
  ON public.failed_messages FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_failed_messages_updated_at
  BEFORE UPDATE ON public.failed_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
