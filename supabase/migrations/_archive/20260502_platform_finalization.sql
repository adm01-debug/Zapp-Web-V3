-- ============================================================
-- 20260502_platform_finalization.sql
-- Finalizacao da plataforma ZAPP WEB para producao 10/10
-- ============================================================

-- 1. Garantir todas as tabelas de contatos
-- (Idempotente -- CREATE IF NOT EXISTS)

-- contact_phones (multi-telefone)
CREATE TABLE IF NOT EXISTS public.contact_phones (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id   UUID NOT NULL REFERENCES public.evolution_contacts(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  phone_type   TEXT NOT NULL DEFAULT 'whatsapp',
  is_primary   BOOLEAN NOT NULL DEFAULT false,
  is_verified  BOOLEAN NOT NULL DEFAULT false,
  country_code TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contact_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_contact_phones_contact ON public.contact_phones (contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_phones_number  ON public.contact_phones (phone_number);
CREATE INDEX IF NOT EXISTS idx_contact_phones_primary ON public.contact_phones (contact_id) WHERE is_primary = true;
ALTER TABLE public.contact_phones ENABLE ROW LEVEL SECURITY;

-- contact_audit_log
CREATE TABLE IF NOT EXISTS public.contact_audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id   UUID NOT NULL REFERENCES public.evolution_contacts(id) ON DELETE CASCADE,
  action       TEXT NOT NULL,
  field_name   TEXT,
  old_value    TEXT,
  new_value    TEXT,
  changed_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata     JSONB
);

CREATE INDEX IF NOT EXISTS idx_contact_audit_contact ON public.contact_audit_log (contact_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_audit_action  ON public.contact_audit_log (action, changed_at DESC);
ALTER TABLE public.contact_audit_log ENABLE ROW LEVEL SECURITY;

-- system_settings
CREATE TABLE IF NOT EXISTS public.system_settings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,
  value       JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  category    TEXT NOT NULL DEFAULT 'general',
  is_public   BOOLEAN NOT NULL DEFAULT false,
  updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- imap_smtp_accounts
CREATE TABLE IF NOT EXISTS public.imap_smtp_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  provider      TEXT NOT NULL DEFAULT 'custom',
  imap_host     TEXT NOT NULL,
  imap_port     INT  NOT NULL DEFAULT 993,
  imap_use_ssl  BOOLEAN NOT NULL DEFAULT true,
  smtp_host     TEXT NOT NULL,
  smtp_port     INT  NOT NULL DEFAULT 587,
  smtp_use_tls  BOOLEAN NOT NULL DEFAULT true,
  username      TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_sync_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, email)
);
ALTER TABLE public.imap_smtp_accounts ENABLE ROW LEVEL SECURITY;

-- 2. Colunas extras em evolution_contacts
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'evolution_contacts' AND column_name = 'version') THEN
    ALTER TABLE public.evolution_contacts ADD COLUMN version INT NOT NULL DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'evolution_contacts' AND column_name = 'pii_masked_at') THEN
    ALTER TABLE public.evolution_contacts ADD COLUMN pii_masked_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'evolution_contacts' AND column_name = 'dedup_hash') THEN
    ALTER TABLE public.evolution_contacts ADD COLUMN dedup_hash TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'evolution_contacts' AND column_name = 'lgpd_consent_at') THEN
    ALTER TABLE public.evolution_contacts ADD COLUMN lgpd_consent_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'evolution_contacts' AND column_name = 'lgpd_deletion_requested_at') THEN
    ALTER TABLE public.evolution_contacts ADD COLUMN lgpd_deletion_requested_at TIMESTAMPTZ;
  END IF;
END $$;

-- 3. Índices de performance
CREATE INDEX IF NOT EXISTS idx_contacts_dedup_hash ON public.evolution_contacts (dedup_hash) WHERE dedup_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_lgpd_request ON public.evolution_contacts (lgpd_deletion_requested_at) WHERE lgpd_deletion_requested_at IS NOT NULL;

-- Inbox
CREATE INDEX IF NOT EXISTS idx_conversations_inbox_list ON public.evolution_conversations (instance_name, status, unread_count DESC, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_unread ON public.evolution_conversations (unread_count DESC) WHERE unread_count > 0;

-- Messages
CREATE INDEX IF NOT EXISTS idx_messages_conversation_recent ON public.evolution_messages (remote_jid, created_at DESC) WHERE deleted_at IS NULL;

-- 4. Configuracoes padrao LGPD
INSERT INTO public.system_settings (key, value, description, category, is_public) VALUES
  ('lgpd.data_retention_days', '730', 'Retencao de dados LGPD (dias)', 'lgpd', false),
  ('lgpd.anonymize_on_delete', 'true', 'Anonimizar dados em vez de deletar', 'lgpd', false),
  ('sla.default_threshold_minutes', '480', 'SLA padrao em minutos', 'sla', true),
  ('sla.business_hours_only', 'true', 'SLA apenas horario comercial', 'sla', true)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.contact_phones IS 'Multiplos telefones por contato WhatsApp';
COMMENT ON TABLE public.contact_audit_log IS 'Audit log automatico de mudancas em contatos';
COMMENT ON TABLE public.system_settings IS 'Configuracoes globais do sistema ZAPP WEB';
COMMENT ON TABLE public.imap_smtp_accounts IS 'Contas de email IMAP/SMTP (provedores nao-Gmail)';
