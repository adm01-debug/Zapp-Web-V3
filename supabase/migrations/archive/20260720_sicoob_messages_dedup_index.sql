-- Partial unique index to prevent TOCTOU duplicate inserts in sicoob-bridge.
-- The existing UNIQUE constraint on (external_id, whatsapp_connection_id) does not
-- prevent duplicates when whatsapp_connection_id IS NULL because PostgreSQL treats
-- NULL != NULL in unique constraints. This partial index closes that gap.
CREATE UNIQUE INDEX IF NOT EXISTS messages_external_id_sicoob_uidx
  ON zapp.messages (external_id)
  WHERE whatsapp_connection_id IS NULL;
