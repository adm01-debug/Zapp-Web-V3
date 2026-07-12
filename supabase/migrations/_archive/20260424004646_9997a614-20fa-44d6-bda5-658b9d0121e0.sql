ALTER TABLE public.failed_messages
  ADD COLUMN IF NOT EXISTS last_retry_reason text;

CREATE INDEX IF NOT EXISTS idx_failed_messages_last_retry_reason
  ON public.failed_messages(last_retry_reason)
  WHERE status IN ('pending', 'retrying');