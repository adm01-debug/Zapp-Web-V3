-- Partial index covering the placeholder-claim lookup in handleSendMessage:
--   SELECT id FROM messages
--   WHERE contact_id = $1 AND sender = 'agent' AND message_type = $2
--     AND external_id IS NULL AND created_at >= $3
--   ORDER BY created_at LIMIT 1
--
-- The WHERE external_id IS NULL partial clause keeps the index small (only
-- unclaimed placeholder rows qualify) and disappears once each row is claimed.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_placeholder
  ON messages (contact_id, sender, message_type, created_at)
  WHERE external_id IS NULL;
