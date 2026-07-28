-- Migration: idx_webhook_audit_log_processed
CREATE INDEX IF NOT EXISTS idx_webhook_audit_log_processed_at
  ON zapp.webhook_audit_log (created_at DESC)
  WHERE status='processed';

CREATE INDEX IF NOT EXISTS idx_webhook_audit_log_success_at
  ON zapp.webhook_audit_log (created_at DESC)
  WHERE status='success';
