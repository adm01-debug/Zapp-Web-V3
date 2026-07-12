-- RPC: get_last_team_messages
-- Returns the single most-recent message for each conversation in the provided
-- list using DISTINCT ON so that even a heavily-active conversation never
-- pushes out the last message of a quieter one. This replaces the fragile
-- client-side approach of fetching N*2 rows and picking per conversation_id,
-- which fails whenever one conversation dominates the global time-ordered
-- result set.

CREATE OR REPLACE FUNCTION get_last_team_messages(conversation_ids uuid[])
RETURNS TABLE (
  id              uuid,
  conversation_id uuid,
  content         text,
  sender_id       uuid,
  created_at      timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT ON (tm.conversation_id)
    tm.id,
    tm.conversation_id,
    tm.content,
    tm.sender_id,
    tm.created_at
  FROM team_messages tm
  WHERE tm.conversation_id = ANY(conversation_ids)
  ORDER BY tm.conversation_id, tm.created_at DESC, tm.id DESC;
$$;
