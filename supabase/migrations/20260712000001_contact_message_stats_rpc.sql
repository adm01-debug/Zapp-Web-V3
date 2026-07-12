-- RPC: get_contact_message_stats
-- Returns per-contact message count and most-recent message timestamp for a
-- given set of contact IDs. Runs with SECURITY INVOKER so RLS still applies.
-- Avoids materialising all message rows client-side (PostgREST max_rows would
-- silently truncate large histories, producing wrong counts and timestamps).

CREATE OR REPLACE FUNCTION get_contact_message_stats(contact_ids uuid[])
RETURNS TABLE (
  contact_id     uuid,
  message_count  bigint,
  last_message_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    m.contact_id,
    COUNT(*)::bigint          AS message_count,
    MAX(m.created_at)         AS last_message_at
  FROM messages m
  WHERE m.contact_id = ANY(contact_ids)
  GROUP BY m.contact_id;
$$;
