-- Add status_code column to webhook_audit_log so auditWebhookEvent()
-- can record the HTTP response code alongside the status text.
-- Safe to apply on existing tables: IF NOT EXISTS prevents duplicate errors.
ALTER TABLE public.webhook_audit_log
  ADD COLUMN IF NOT EXISTS status_code integer;

COMMENT ON COLUMN public.webhook_audit_log.status_code IS
  'HTTP status code returned to the Evolution caller (e.g. 200, 401, 429, 503).';
