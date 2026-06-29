
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_meta jsonb,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS media_mimetype text,
  ADD COLUMN IF NOT EXISTS link_preview jsonb,
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_messages_reply_to_id ON public.messages(reply_to_id) WHERE reply_to_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_deleted_at ON public.messages(deleted_at) WHERE deleted_at IS NOT NULL;
