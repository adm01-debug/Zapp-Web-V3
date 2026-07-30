ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS request_id text;
ALTER TABLE public.talkx_recipients ADD COLUMN IF NOT EXISTS request_id text;
CREATE INDEX IF NOT EXISTS idx_messages_request_id ON public.messages(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_talkx_recipients_request_id ON public.talkx_recipients(request_id) WHERE request_id IS NOT NULL;