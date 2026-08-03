-- Migration: rpc_inbox_preview_batch — batch inbox preview for multiple conversations
-- Replaces N individual rpc_list_messages_lite calls with 1 batch call for inbox preview
-- Created: 2026-08-03

CREATE OR REPLACE FUNCTION zapp.rpc_inbox_preview_batch(
  p_remote_jids text[],
  p_instance    text    DEFAULT NULL,
  p_limit       integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'zapp', 'evo'
AS $$
  SELECT jsonb_build_object(
    'previews', COALESCE(jsonb_agg(preview), '[]'::jsonb)
  )
  FROM (
    SELECT DISTINCT ON (remote_jid)
      jsonb_build_object(
        'remote_jid', remote_jid,
        'latest',     row_to_json(msg.*)
      ) AS preview
    FROM (
      SELECT DISTINCT ON (remote_jid) *
      FROM evo.evolution_messages
      WHERE remote_jid = ANY(p_remote_jids)
        AND (p_instance IS NULL OR instance_name = p_instance)
        AND deleted_at IS NULL
      ORDER BY remote_jid, created_at DESC
    ) msg
    LIMIT p_limit  -- limits number of JIDs returned, applied per-DISTINCT batch
  ) sub;
$$;
