-- Remove existing duplicate (external_id, whatsapp_connection_id) pairs before adding
-- the unique constraint. Keeps the row with the lowest id (earliest INSERT) per pair.
-- NULL external_id values are excluded: PostgreSQL UNIQUE treats each NULL as distinct,
-- so placeholder rows (pending sends with external_id=NULL) are unaffected.
DELETE FROM messages a
USING messages b
WHERE a.external_id IS NOT NULL
  AND a.external_id    = b.external_id
  AND a.whatsapp_connection_id = b.whatsapp_connection_id
  AND a.id > b.id;

-- UNIQUE (external_id, whatsapp_connection_id) ensures that two concurrent webhook
-- writers racing to INSERT the same outgoing message cannot both succeed: the second
-- INSERT triggers ON CONFLICT DO NOTHING and is silently discarded at the DB layer,
-- closing the residual TOCTOU window that exists between the application-level
-- raceCheck SELECT and the INSERT statement.
ALTER TABLE messages
  ADD CONSTRAINT uq_messages_ext_conn
  UNIQUE (external_id, whatsapp_connection_id);
