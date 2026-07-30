-- Guard: only run if public.messages is still a base table.
-- In production the table may already have been converted to a VIEW
-- (by 20260703_critical_10_steps_fix.sql or applied manually). When it is a VIEW,
-- DELETE and ALTER TABLE ADD CONSTRAINT are not valid; skip them — the equivalent
-- constraint is added on evo.evolution_messages by the migration that follows.
DO $$
DECLARE
  v_table_type text;
BEGIN
  SELECT table_type INTO v_table_type
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'messages';

  IF v_table_type IS DISTINCT FROM 'BASE TABLE' THEN
    RAISE NOTICE 'public.messages is % (not a base table) — skipping unique constraint creation.', COALESCE(v_table_type, 'missing');
    RETURN;
  END IF;

  -- Remove existing duplicate (external_id, whatsapp_connection_id) pairs before adding
  -- the unique constraint. Keeps the row with the lowest id (earliest INSERT) per pair.
  -- NULL external_id values are excluded: PostgreSQL UNIQUE treats each NULL as distinct,
  -- so placeholder rows (pending sends with external_id=NULL) are unaffected.
  DELETE FROM messages a
  USING messages b
  WHERE a.external_id IS NOT NULL
    AND a.external_id            = b.external_id
    AND a.whatsapp_connection_id = b.whatsapp_connection_id
    AND a.id > b.id;

  -- UNIQUE (external_id, whatsapp_connection_id) ensures that two concurrent webhook
  -- writers racing to INSERT the same outgoing message cannot both succeed.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'messages'
      AND c.conname = 'uq_messages_ext_conn'
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT uq_messages_ext_conn
      UNIQUE (external_id, whatsapp_connection_id);
    RAISE NOTICE 'Added uq_messages_ext_conn on public.messages';
  END IF;
END $$;
