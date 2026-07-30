-- Add status_code column to webhook_audit_log.
-- The TypeScript edge function (evolution-webhook/index.ts) passes this field
-- in all auditWebhookEvent() calls. Without the column, PostgREST silently
-- rejects every insert containing it, losing all audit trail data.
ALTER TABLE public.webhook_audit_log
  ADD COLUMN IF NOT EXISTS status_code INT;

COMMENT ON COLUMN public.webhook_audit_log.status_code IS
  'HTTP status code returned to the webhook caller (401, 422, 400, 503, 429, 200, etc.)';
