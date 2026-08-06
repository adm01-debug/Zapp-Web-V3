-- EMAIL-04: Ensure unique constraint on email_attachments for upsert support.
--
-- gmail-sync edge function calls:
--   adminClient.from('email_attachments').upsert(..., { onConflict: 'email_message_id,gmail_attachment_id' })
--
-- PostgREST upsert requires a unique constraint (or primary key) on the conflict
-- column(s).  Without it the upsert falls back to an INSERT that fails on
-- duplicate data, or silently inserts duplicate rows depending on client version.
--
-- This migration is idempotent: the DO block checks for the constraint before
-- attempting to add it, so re-running is safe.
--
-- NOTE: zapp.email_attachments is a VIEW; the physical table lives in the
-- email_app schema. The constraint must be added to the base table.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint c
    JOIN   pg_class      t  ON c.conrelid   = t.oid
    JOIN   pg_namespace  n  ON t.relnamespace = n.oid
    WHERE  c.conname   = 'email_attachments_email_message_id_gmail_attachment_id_key'
      AND  n.nspname   = 'email_app'
      AND  t.relname   = 'email_attachments'
  ) THEN
    ALTER TABLE email_app.email_attachments
      ADD CONSTRAINT email_attachments_email_message_id_gmail_attachment_id_key
      UNIQUE (email_message_id, gmail_attachment_id);
  END IF;
END $$;
