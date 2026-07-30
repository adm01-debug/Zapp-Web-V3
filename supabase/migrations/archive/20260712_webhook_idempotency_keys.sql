-- Webhook Idempotency Table
-- Tracks processed webhook payloads to ensure exactly-once delivery semantics
-- even when webhooks are delivered multiple times by external providers

CREATE TABLE IF NOT EXISTS webhook_idempotency_keys (
  id bigserial PRIMARY KEY,
  idempotency_key text NOT NULL,
  webhook_type text NOT NULL,
  instance_name text,
  user_id uuid,
  processed_at timestamp with time zone NOT NULL DEFAULT now(),

  -- Composite unique constraint: same key + webhook type + instance = duplicate
  CONSTRAINT webhook_idempotency_unique UNIQUE (idempotency_key, webhook_type, instance_name)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_keys_lookup
  ON webhook_idempotency_keys (idempotency_key, webhook_type);

CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_keys_instance
  ON webhook_idempotency_keys (instance_name, webhook_type);

-- TTL cleanup: old keys can be deleted after 24 hours
CREATE INDEX IF NOT EXISTS idx_webhook_idempotency_keys_processed_at
  ON webhook_idempotency_keys (processed_at DESC);

-- RLS: only service role can manage (edge functions use service key)
ALTER TABLE webhook_idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_idempotency_keys_service_only"
  ON webhook_idempotency_keys
  FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE webhook_idempotency_keys IS 'Tracks processed webhook deliveries for idempotency; keys are retained for 24h to detect retries';
COMMENT ON COLUMN webhook_idempotency_keys.idempotency_key IS 'Unique identifier from webhook (X-Idempotency-Key, X-Webhook-Delivery-Id, or event_id)';
COMMENT ON COLUMN webhook_idempotency_keys.webhook_type IS 'Type of webhook (evolution, gmail, whatsapp-cloud, etc.)';
COMMENT ON COLUMN webhook_idempotency_keys.instance_name IS 'Evolution instance or user context; optional';
