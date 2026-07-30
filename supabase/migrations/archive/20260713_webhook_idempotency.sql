-- Migration: Webhook idempotency tracking
-- Purpose: Ensure duplicate webhooks don't cause double-processing
-- Impact: Prevents status poisoning, duplicate messages, race conditions

-- Table to track processed webhook events
CREATE TABLE IF NOT EXISTS webhook_idempotency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Webhook source and identifier
  source VARCHAR(50) NOT NULL,  -- 'whatsapp', 'gmail', 'evolution', etc.
  webhook_id VARCHAR(255) NOT NULL,  -- Meta message ID, Gmail message ID, etc.

  -- Processing metadata
  status VARCHAR(20) NOT NULL DEFAULT 'processing',  -- 'processing', 'success', 'failed'
  error_message TEXT,

  -- Timestamps
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW() + INTERVAL '24 hours',

  CONSTRAINT webhook_idempotency_key UNIQUE(source, webhook_id)
);

-- Index for fast lookup during webhook processing
CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_source_id
  ON webhook_idempotency(source, webhook_id);

-- Index for cleanup of expired entries
CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_expires_at
  ON webhook_idempotency(expires_at)
  WHERE status != 'success';

-- Enable RLS
ALTER TABLE webhook_idempotency ENABLE ROW LEVEL SECURITY;

-- Service role can manage idempotency tracking
CREATE POLICY "service_role_manage_webhook_idempotency"
  ON webhook_idempotency
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Add webhook_idempotency column to messages table for reference
ALTER TABLE messages ADD COLUMN IF NOT EXISTS webhook_idempotency_id UUID
  REFERENCES webhook_idempotency(id) ON DELETE SET NULL;

-- Add webhook_idempotency column to evolution_messages table
ALTER TABLE evo.evolution_messages ADD COLUMN IF NOT EXISTS webhook_idempotency_id UUID;

-- Cleanup job: remove idempotency records older than 24 hours
CREATE OR REPLACE FUNCTION cleanup_expired_webhook_idempotency()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM webhook_idempotency
  WHERE expires_at < NOW() AND status != 'processing';
END;
$$;
