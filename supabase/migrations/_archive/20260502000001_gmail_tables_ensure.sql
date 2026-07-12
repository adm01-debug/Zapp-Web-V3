-- ============================================================
-- GMAIL TABLES ENSURE — Migration Idempotente
-- Criada em: 2026-05-02 | Auditoria Email Chat
-- Garante que todas as tabelas do módulo Gmail Chat existam
-- com RLS, índices, políticas e estrutura completa.
-- ============================================================

-- ------------------------------------
-- 1. gmail_accounts — Contas conectadas por usuário
-- ------------------------------------
CREATE TABLE IF NOT EXISTS public.gmail_accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email            TEXT NOT NULL,
  display_name     TEXT,
  picture_url      TEXT,
  access_token     TEXT NOT NULL,          -- criptografado via pgcrypto em prod
  refresh_token    TEXT NOT NULL,
  token_expiry     TIMESTAMPTZ NOT NULL,
  scope            TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  watch_expiry     TIMESTAMPTZ,            -- Google Pub/Sub watch expiration
  watch_resource   TEXT,                   -- resourceId do watch ativo
  history_id       TEXT,                   -- último historyId processado
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, email)
);

COMMENT ON TABLE public.gmail_accounts IS
  'Contas Gmail conectadas via OAuth2. Tokens armazenados para refresh automático.';

-- Índices
CREATE INDEX IF NOT EXISTS idx_gmail_accounts_user_id   ON public.gmail_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_gmail_accounts_email     ON public.gmail_accounts (email);
CREATE INDEX IF NOT EXISTS idx_gmail_accounts_active    ON public.gmail_accounts (user_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_gmail_accounts_watch_exp ON public.gmail_accounts (watch_expiry) WHERE watch_expiry IS NOT NULL;

-- RLS
ALTER TABLE public.gmail_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gmail_accounts_select ON public.gmail_accounts;
DROP POLICY IF EXISTS gmail_accounts_insert ON public.gmail_accounts;
DROP POLICY IF EXISTS gmail_accounts_update ON public.gmail_accounts;
DROP POLICY IF EXISTS gmail_accounts_delete ON public.gmail_accounts;

CREATE POLICY gmail_accounts_select ON public.gmail_accounts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY gmail_accounts_insert ON public.gmail_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY gmail_accounts_update ON public.gmail_accounts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY gmail_accounts_delete ON public.gmail_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_gmail_accounts_updated_at ON public.gmail_accounts;
CREATE TRIGGER trg_gmail_accounts_updated_at
  BEFORE UPDATE ON public.gmail_accounts
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ------------------------------------
-- 2. gmail_threads — Threads de conversa
-- ------------------------------------
CREATE TABLE IF NOT EXISTS public.gmail_threads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID NOT NULL REFERENCES public.gmail_accounts(id) ON DELETE CASCADE,
  thread_id        TEXT NOT NULL,          -- ID da thread no Gmail
  subject          TEXT,
  snippet          TEXT,
  participant_emails TEXT[],
  label_ids        TEXT[],
  unread_count     INT NOT NULL DEFAULT 0,
  message_count    INT NOT NULL DEFAULT 0,
  last_message_at  TIMESTAMPTZ,
  is_starred       BOOLEAN NOT NULL DEFAULT false,
  is_important     BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, thread_id)
);

COMMENT ON TABLE public.gmail_threads IS 'Threads Gmail sincronizadas, usadas no Email Chat.';

CREATE INDEX IF NOT EXISTS idx_gmail_threads_account    ON public.gmail_threads (account_id);
CREATE INDEX IF NOT EXISTS idx_gmail_threads_last_msg   ON public.gmail_threads (account_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_gmail_threads_unread     ON public.gmail_threads (account_id, unread_count) WHERE unread_count > 0;
CREATE INDEX IF NOT EXISTS idx_gmail_threads_tsvector   ON public.gmail_threads USING gin (to_tsvector('portuguese', coalesce(subject,'') || ' ' || coalesce(snippet,'')));

ALTER TABLE public.gmail_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gmail_threads_policy ON public.gmail_threads;
CREATE POLICY gmail_threads_policy ON public.gmail_threads
  USING (account_id IN (SELECT id FROM public.gmail_accounts WHERE user_id = auth.uid()));

DROP TRIGGER IF EXISTS trg_gmail_threads_updated_at ON public.gmail_threads;
CREATE TRIGGER trg_gmail_threads_updated_at
  BEFORE UPDATE ON public.gmail_threads
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ------------------------------------
-- 3. gmail_messages — Mensagens individuais
-- ------------------------------------
CREATE TABLE IF NOT EXISTS public.gmail_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id_ref    UUID NOT NULL REFERENCES public.gmail_threads(id) ON DELETE CASCADE,
  account_id       UUID NOT NULL REFERENCES public.gmail_accounts(id) ON DELETE CASCADE,
  message_id       TEXT NOT NULL,          -- ID da mensagem no Gmail
  from_email       TEXT,
  from_name        TEXT,
  to_emails        TEXT[],
  cc_emails        TEXT[],
  bcc_emails       TEXT[],
  subject          TEXT,
  body_plain       TEXT,
  body_html        TEXT,
  snippet          TEXT,
  label_ids        TEXT[],
  is_read          BOOLEAN NOT NULL DEFAULT false,
  is_sent          BOOLEAN NOT NULL DEFAULT false,
  is_draft         BOOLEAN NOT NULL DEFAULT false,
  has_attachments  BOOLEAN NOT NULL DEFAULT false,
  internal_date    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, message_id)
);

COMMENT ON TABLE public.gmail_messages IS 'Mensagens Gmail individuais. body_html permite renderização rica no Email Chat.';

CREATE INDEX IF NOT EXISTS idx_gmail_messages_thread    ON public.gmail_messages (thread_id_ref, internal_date DESC);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_account   ON public.gmail_messages (account_id);
CREATE INDEX IF NOT EXISTS idx_gmail_messages_unread    ON public.gmail_messages (account_id, is_read) WHERE NOT is_read;
CREATE INDEX IF NOT EXISTS idx_gmail_messages_fts       ON public.gmail_messages USING gin (to_tsvector('portuguese', coalesce(subject,'') || ' ' || coalesce(body_plain,'')));

ALTER TABLE public.gmail_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gmail_messages_policy ON public.gmail_messages;
CREATE POLICY gmail_messages_policy ON public.gmail_messages
  USING (account_id IN (SELECT id FROM public.gmail_accounts WHERE user_id = auth.uid()));

-- ------------------------------------
-- 4. gmail_attachments — Anexos
-- ------------------------------------
CREATE TABLE IF NOT EXISTS public.gmail_attachments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id_ref   UUID NOT NULL REFERENCES public.gmail_messages(id) ON DELETE CASCADE,
  account_id       UUID NOT NULL REFERENCES public.gmail_accounts(id) ON DELETE CASCADE,
  attachment_id    TEXT NOT NULL,          -- attachmentId do Gmail
  filename         TEXT NOT NULL,
  mime_type        TEXT,
  size_bytes       INT,
  storage_url      TEXT,                   -- URL no Supabase Storage após download
  downloaded       BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gmail_attachments_msg ON public.gmail_attachments (message_id_ref);

ALTER TABLE public.gmail_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gmail_attachments_policy ON public.gmail_attachments;
CREATE POLICY gmail_attachments_policy ON public.gmail_attachments
  USING (account_id IN (SELECT id FROM public.gmail_accounts WHERE user_id = auth.uid()));

-- ------------------------------------
-- 5. gmail_drafts — Rascunhos locais
-- ------------------------------------
CREATE TABLE IF NOT EXISTS public.gmail_drafts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID NOT NULL REFERENCES public.gmail_accounts(id) ON DELETE CASCADE,
  thread_id_ref    UUID REFERENCES public.gmail_threads(id) ON DELETE SET NULL,
  gmail_draft_id   TEXT,                   -- ID do rascunho no Gmail se já sincronizado
  to_emails        TEXT[],
  cc_emails        TEXT[],
  bcc_emails       TEXT[],
  subject          TEXT,
  body_html        TEXT,
  last_saved_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gmail_drafts_account ON public.gmail_drafts (account_id);

ALTER TABLE public.gmail_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gmail_drafts_policy ON public.gmail_drafts;
CREATE POLICY gmail_drafts_policy ON public.gmail_drafts
  USING (account_id IN (SELECT id FROM public.gmail_accounts WHERE user_id = auth.uid()));

-- ------------------------------------
-- 6. gmail_signatures — Assinaturas por conta
-- ------------------------------------
CREATE TABLE IF NOT EXISTS public.gmail_signatures (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID NOT NULL REFERENCES public.gmail_accounts(id) ON DELETE CASCADE,
  name             TEXT NOT NULL DEFAULT 'Padrão',
  html_content     TEXT NOT NULL DEFAULT '',
  is_default       BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gmail_signatures_default
  ON public.gmail_signatures (account_id) WHERE is_default = true;

ALTER TABLE public.gmail_signatures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gmail_signatures_policy ON public.gmail_signatures;
CREATE POLICY gmail_signatures_policy ON public.gmail_signatures
  USING (account_id IN (SELECT id FROM public.gmail_accounts WHERE user_id = auth.uid()));

DROP TRIGGER IF EXISTS trg_gmail_signatures_updated_at ON public.gmail_signatures;
CREATE TRIGGER trg_gmail_signatures_updated_at
  BEFORE UPDATE ON public.gmail_signatures
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ------------------------------------
-- 7. gmail_labels — Labels sincronizadas
-- ------------------------------------
CREATE TABLE IF NOT EXISTS public.gmail_labels (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID NOT NULL REFERENCES public.gmail_accounts(id) ON DELETE CASCADE,
  label_id         TEXT NOT NULL,          -- ID do label no Gmail
  name             TEXT NOT NULL,
  type             TEXT,                    -- 'system' | 'user'
  color_bg         TEXT,
  color_fg         TEXT,
  messages_total   INT DEFAULT 0,
  messages_unread  INT DEFAULT 0,
  UNIQUE (account_id, label_id)
);

CREATE INDEX IF NOT EXISTS idx_gmail_labels_account ON public.gmail_labels (account_id);

ALTER TABLE public.gmail_labels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gmail_labels_policy ON public.gmail_labels;
CREATE POLICY gmail_labels_policy ON public.gmail_labels
  USING (account_id IN (SELECT id FROM public.gmail_accounts WHERE user_id = auth.uid()));

-- ------------------------------------
-- 8. View: gmail_inbox_summary
-- ------------------------------------
CREATE OR REPLACE VIEW public.v_gmail_inbox_summary AS
SELECT
  ga.user_id,
  ga.id          AS account_id,
  ga.email       AS account_email,
  ga.display_name,
  ga.is_active,
  ga.watch_expiry,
  ga.token_expiry,
  ga.token_expiry < now() AS token_expired,
  ga.token_expiry < now() + interval '10 minutes' AS token_expiring_soon,
  COUNT(DISTINCT gt.id) FILTER (WHERE gt.unread_count > 0) AS threads_unread,
  COUNT(DISTINCT gt.id) AS threads_total,
  MAX(gt.last_message_at) AS last_activity
FROM public.gmail_accounts ga
LEFT JOIN public.gmail_threads gt ON gt.account_id = ga.id
WHERE ga.is_active = true
GROUP BY ga.user_id, ga.id, ga.email, ga.display_name, ga.is_active,
         ga.watch_expiry, ga.token_expiry;

COMMENT ON VIEW public.v_gmail_inbox_summary IS
  'Resumo do inbox Gmail por conta: threads, não lidos, status do token e watch.';

-- ------------------------------------
-- 9. Realtime para threads
-- ------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.gmail_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.gmail_messages;
