-- ============================================================
-- Gmail SLA tracking — adiciona colunas à gmail_threads
-- e nova tabela de métricas de email por conta
-- ============================================================

-- Adicionar colunas SLA à gmail_threads (IF NOT EXISTS via DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gmail_threads' AND column_name = 'first_reply_at') THEN
    ALTER TABLE public.gmail_threads ADD COLUMN first_reply_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gmail_threads' AND column_name = 'frt_minutes') THEN
    ALTER TABLE public.gmail_threads ADD COLUMN frt_minutes INT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gmail_threads' AND column_name = 'sla_status') THEN
    ALTER TABLE public.gmail_threads ADD COLUMN sla_status TEXT DEFAULT 'ok';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gmail_threads' AND column_name = 'assigned_agent_id') THEN
    ALTER TABLE public.gmail_threads ADD COLUMN assigned_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gmail_threads' AND column_name = 'tags') THEN
    ALTER TABLE public.gmail_threads ADD COLUMN tags TEXT[];
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gmail_threads' AND column_name = 'priority') THEN
    ALTER TABLE public.gmail_threads ADD COLUMN priority TEXT DEFAULT 'normal';
  END IF;
END $$;

-- Índice para busca por agente
CREATE INDEX IF NOT EXISTS idx_gmail_threads_agent ON public.gmail_threads (assigned_agent_id) WHERE assigned_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gmail_threads_sla ON public.gmail_threads (sla_status);
CREATE INDEX IF NOT EXISTS idx_gmail_threads_priority ON public.gmail_threads (priority);

-- ── email_metrics por conta / dia ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.gmail_daily_metrics (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID NOT NULL REFERENCES public.gmail_accounts(id) ON DELETE CASCADE,
  date             DATE NOT NULL,
  received         INT NOT NULL DEFAULT 0,
  sent             INT NOT NULL DEFAULT 0,
  avg_frt_minutes  NUMERIC(10,2),       -- avg first response time
  sla_ok           INT NOT NULL DEFAULT 0,
  sla_warning      INT NOT NULL DEFAULT 0,
  sla_breached     INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, date)
);

COMMENT ON TABLE public.gmail_daily_metrics IS 'Métricas diárias de email por conta Gmail. Alimentadas por trigger e Edge Function.';

CREATE INDEX IF NOT EXISTS idx_gmail_metrics_account_date ON public.gmail_daily_metrics (account_id, date DESC);

ALTER TABLE public.gmail_daily_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gmail_metrics_policy ON public.gmail_daily_metrics;
CREATE POLICY gmail_metrics_policy ON public.gmail_daily_metrics
  USING (account_id IN (SELECT id FROM public.gmail_accounts WHERE user_id = auth.uid()));

-- ── Trigger: atualiza first_reply_at e frt_minutes ao enviar email ────

CREATE OR REPLACE FUNCTION public.fn_gmail_mark_first_reply()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Quando uma mensagem enviada é inserida, verifica se a thread ainda não teve resposta
  IF NEW.is_sent = true THEN
    UPDATE public.gmail_threads t
    SET
      first_reply_at = NEW.internal_date,
      frt_minutes    = EXTRACT(EPOCH FROM (NEW.internal_date - t.last_message_at)) / 60,
      sla_status     = 'ok'
    WHERE t.id = NEW.thread_id_ref
      AND t.first_reply_at IS NULL
      AND t.unread_count > 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gmail_first_reply ON public.gmail_messages;
CREATE TRIGGER trg_gmail_first_reply
  AFTER INSERT ON public.gmail_messages
  FOR EACH ROW EXECUTE FUNCTION public.fn_gmail_mark_first_reply();

-- ── View: métricas em tempo real do inbox ────────────────────────────

CREATE OR REPLACE VIEW public.v_gmail_sla_dashboard AS
SELECT
  ga.user_id,
  ga.id    AS account_id,
  ga.email AS account_email,
  COUNT(gt.id)                                             AS total_threads,
  COUNT(gt.id) FILTER (WHERE gt.unread_count > 0)          AS unread_threads,
  COUNT(gt.id) FILTER (WHERE gt.sla_status = 'ok')         AS sla_ok,
  COUNT(gt.id) FILTER (WHERE gt.sla_status = 'warning')    AS sla_warning,
  COUNT(gt.id) FILTER (WHERE gt.sla_status = 'breached')   AS sla_breached,
  ROUND(AVG(gt.frt_minutes) FILTER (WHERE gt.frt_minutes IS NOT NULL), 1) AS avg_frt_minutes,
  COUNT(gt.id) FILTER (WHERE gt.first_reply_at IS NULL AND gt.unread_count > 0) AS pending_reply
FROM public.gmail_accounts ga
LEFT JOIN public.gmail_threads gt ON gt.account_id = ga.id
WHERE ga.is_active = true
GROUP BY ga.user_id, ga.id, ga.email;

COMMENT ON VIEW public.v_gmail_sla_dashboard IS 'Dashboard de SLA de email: threads por status, avg FRT e pendências.';

-- Realtime para métricas
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.gmail_daily_metrics;
