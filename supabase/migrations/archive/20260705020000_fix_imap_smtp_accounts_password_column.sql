-- Fix: imap_smtp_accounts had two conflicting column names across migrations.
-- platform_finalization.sql created the table with password_hash NOT NULL,
-- while create_missing_tables.sql used password_encrypted.
-- Standardize on password_encrypted for AES-GCM encrypted credentials,
-- and add password_hash as an alias column for deployments that already have it.

-- Ensure password_encrypted column exists (the canonical column name)
ALTER TABLE public.imap_smtp_accounts
  ADD COLUMN IF NOT EXISTS password_encrypted text;

-- If password_hash exists and password_encrypted is still null, migrate data
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'imap_smtp_accounts'
      AND column_name  = 'password_hash'
  ) THEN
    UPDATE public.imap_smtp_accounts
    SET password_encrypted = password_hash
    WHERE password_encrypted IS NULL AND password_hash IS NOT NULL;
  END IF;
END $$;
