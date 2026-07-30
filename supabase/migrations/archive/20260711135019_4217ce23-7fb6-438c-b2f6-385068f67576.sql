-- Sprint 2 — Consumidor Sicoob via outbox + pg_cron (substitui pg_notify)

CREATE TABLE IF NOT EXISTS public.sicoob_reply_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL,
  message_id UUID NOT NULL,
  agent_id UUID,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed','abandoned')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id)
);

GRANT SELECT ON public.sicoob_reply_outbox TO authenticated;
GRANT ALL ON public.sicoob_reply_outbox TO service_role;

ALTER TABLE public.sicoob_reply_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins can view sicoob outbox"
  ON public.sicoob_reply_outbox FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));

CREATE INDEX IF NOT EXISTS idx_sicoob_outbox_pending
  ON public.sicoob_reply_outbox (next_attempt_at)
  WHERE status IN ('pending','failed');

CREATE TRIGGER trg_sicoob_outbox_updated_at
  BEFORE UPDATE ON public.sicoob_reply_outbox
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Trigger: substituir pg_notify por INSERT idempotente na outbox
CREATE OR REPLACE FUNCTION public.notify_sicoob_on_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_contact_type text;
BEGIN
  IF NEW.sender='agent' AND NEW.channel_type='internal_chat' THEN
    SELECT contact_type INTO v_contact_type FROM public.contacts WHERE id=NEW.contact_id;
    IF v_contact_type='sicoob_gifts' THEN
      INSERT INTO public.sicoob_reply_outbox (contact_id, message_id, agent_id, content)
      VALUES (NEW.contact_id, NEW.id, NEW.agent_id, NEW.content)
      ON CONFLICT (message_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

-- Agendar consumidor a cada 1 minuto (idempotente)
DO $cron$
DECLARE v_url TEXT; v_key TEXT;
BEGIN
  SELECT current_setting('app.settings.supabase_url', true) INTO v_url;
  IF v_url IS NULL OR v_url = '' THEN v_url := 'https://supabase.atomicabr.com.br'; END IF;

  PERFORM cron.unschedule('sicoob-outbox-drain') WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname='sicoob-outbox-drain'
  );

  PERFORM cron.schedule(
    'sicoob-outbox-drain',
    '* * * * *',
    format($job$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json'),
        body := jsonb_build_object('trigger','cron')
      );
    $job$, v_url || '/functions/v1/sicoob-outbox-consumer')
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron scheduling skipped: %', SQLERRM;
END;
$cron$;