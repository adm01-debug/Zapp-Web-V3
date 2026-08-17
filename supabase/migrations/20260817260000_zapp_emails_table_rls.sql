-- 20260817260000 — Email viável: tabela zapp.emails + RLS
-- =============================================================================
-- Contexto (EMAIL-02 / tarefa wt-g5 2026-08-17):
--   email-imap-bridge declarava IMAP/SMTP real (fetchInbox/sendMessage) INVIÁVEL
--   em Edge Functions (runtime HTTP-only, sem TCP). Decisão registrada: o caminho
--   VIÁVEL de email é webhook + API HTTP:
--     * INBOUND  → zapp-email-inbound-webhook (webhook de entrada do Resend,
--                  grava aqui em zapp.emails, direction='inbound');
--     * OUTBOUND → zapp-email-send (Resend API + storage email-attachments,
--                  grava aqui direction='outbound').
--   Esta tabela é o registro canônico das duas direções: message_id único do
--   provider garante idempotência no re-delivery do webhook.
--
-- Modelo de ownership (padrão tenant-based do repo, ex.: scheduled_messages):
--   * OUTBOUND: user_id = auth.uid() do remetente → visível ao dono + admin.
--   * INBOUND:  user_id NULL (caixa da empresa) → visível somente a
--     admin/supervisor (a gravação é via service role na edge, RLS não bloqueia).
--
-- Rollback: DROP TABLE zapp.emails;
--           (GRANTs são inócuos de reverter; índices caem junto com a tabela)

BEGIN;

-- ── Tabela ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zapp.emails (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Id do provider (Resend email id / message id). ÚNICO para idempotência.
  message_id   text,
  -- thread_id do provider (Resend Message-Id de resposta), quando disponível.
  thread_id    text,
  direction    text NOT NULL DEFAULT 'inbound'
               CHECK (direction IN ('inbound', 'outbound')),
  provider     text NOT NULL DEFAULT 'resend'
               CHECK (provider IN ('resend', 'gmail')),
  from_email   text NOT NULL,
  from_name    text,
  to_emails    text[] NOT NULL DEFAULT '{}',
  cc_emails    text[] NOT NULL DEFAULT '{}',
  subject      text,
  text_body    text,
  html_body    text,
  -- Metadados de anexos: [{filename, content_type, size_bytes, storage_path}]
  attachments  jsonb NOT NULL DEFAULT '[]'::jsonb,
  status       text NOT NULL DEFAULT 'received'
               CHECK (status IN ('received', 'sent', 'failed', 'read')),
  error_message text,
  -- Dono (outbound = quem enviou; inbound = NULL → caixa da empresa).
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Payload cru do webhook (debug/auditoria; inbound apenas).
  raw_payload  jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE zapp.emails IS
  'Registro canônico de emails (inbound via webhook Resend, outbound via Resend API). '
  'message_id único garante idempotência de webhook. Inbound é admin-only; '
  'outbound é do user_id dono + admin.';

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE zapp.emails ENABLE ROW LEVEL SECURITY;

-- SELECT: dono (outbound) OU admin/supervisor (cobre inbound sem dono).
DROP POLICY IF EXISTS emails_select ON zapp.emails;
CREATE POLICY emails_select ON zapp.emails
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR zapp.is_admin_or_supervisor(auth.uid())
  );

-- INSERT: dono OU admin (o fluxo normal de envio grava via edge com service
-- role; a policy cobre chamadas diretas futuras do front com JWT).
DROP POLICY IF EXISTS emails_insert ON zapp.emails;
CREATE POLICY emails_insert ON zapp.emails
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR zapp.is_admin_or_supervisor(auth.uid())
  );

-- UPDATE: marcar lido/status pelo dono ou admin; nunca trocar o dono.
DROP POLICY IF EXISTS emails_update ON zapp.emails;
CREATE POLICY emails_update ON zapp.emails
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR zapp.is_admin_or_supervisor(auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR zapp.is_admin_or_supervisor(auth.uid())
  );

-- DELETE: apenas admin/supervisor (nunca o dono apaga o registro da caixa).
DROP POLICY IF EXISTS emails_delete ON zapp.emails;
CREATE POLICY emails_delete ON zapp.emails
  FOR DELETE TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid()));

-- ── GRANTs (lição incidente PR #668: policy sem GRANT = 403) ────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.emails TO authenticated;
GRANT EXECUTE ON FUNCTION zapp.is_admin_or_supervisor(uuid) TO authenticated;

-- ── Índices ─────────────────────────────────────────────────────────────────
-- Idempotência do webhook (dedup por message_id do provider).
CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_message_id_unique
  ON zapp.emails (message_id)
  WHERE message_id IS NOT NULL;

-- Listagens por direção (caixa de entrada / enviados) ordenadas por data.
CREATE INDEX IF NOT EXISTS idx_emails_direction_created
  ON zapp.emails (direction, created_at DESC);

-- Outbound por usuário (minha caixa de enviados).
CREATE INDEX IF NOT EXISTS idx_emails_user_id
  ON zapp.emails (user_id);

COMMIT;
