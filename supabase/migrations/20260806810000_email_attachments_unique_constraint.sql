-- migration: 20260806810000_email_attachments_unique_constraint.sql
-- ALTO: adiciona constraint UNIQUE (email_message_id, gmail_attachment_id) em email_app.email_attachments
--
-- Contexto: a edge function gmail-sync usa upsert com onConflict='email_message_id,gmail_attachment_id'
-- mas a constraint não existia na tabela real (email_app.email_attachments), causando duplicatas a cada sync.
-- Nota: em zapp.email_attachments existe apenas uma view auto-updatable (DDL não aplicável em views).
-- A migration 20260805170000 referenciava erroneamente o schema zapp e nunca foi aplicada porque
-- o slot de versão estava ocupado por rpc_contract_inventory.
--
-- Idempotente: usa IF NOT EXISTS guard para re-execução segura.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE c.conname = 'email_attachments_email_message_id_gmail_attachment_id_key'
      AND n.nspname = 'email_app'
      AND t.relname = 'email_attachments'
  ) THEN
    ALTER TABLE email_app.email_attachments
      ADD CONSTRAINT email_attachments_email_message_id_gmail_attachment_id_key
      UNIQUE (email_message_id, gmail_attachment_id);
  END IF;
END $$;
