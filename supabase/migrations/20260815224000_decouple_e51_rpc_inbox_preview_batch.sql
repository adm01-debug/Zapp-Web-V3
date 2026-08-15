-- =============================================================================
-- E51 — zapp.rpc_inbox_preview_batch (Fase 3 — Isolamento I1)
-- =============================================================================
-- Objetivo: remover referência direta a evo.evolution_messages (invariante I1).
-- Substituição: evo.evolution_messages → evolution_messages (resolve via search_path=zapp)
-- search_path: 'zapp','evo' → zapp, pg_catalog
-- Nota: LANGUAGE sql mantido (não alterar para plpgsql).
-- Acesso restrito: search_path=zapp,pg_catalog.
-- =============================================================================

CREATE OR REPLACE FUNCTION zapp.rpc_inbox_preview_batch(
  p_remote_jids text[],
  p_instance    text    DEFAULT NULL,
  p_limit       integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE sql
SET search_path = zapp, pg_catalog
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
      FROM evolution_messages
      WHERE remote_jid = ANY(p_remote_jids)
        AND (p_instance IS NULL OR instance_name = p_instance)
        AND deleted_at IS NULL
      ORDER BY remote_jid, created_at DESC
    ) msg
    LIMIT p_limit
  ) sub;
$$;

COMMENT ON FUNCTION zapp.rpc_inbox_preview_batch IS
  'Preview em lote de caixas de entrada por lista de JIDs. '
  'E51 (2026-08-15): evo.evolution_messages → evolution_messages via search_path=zapp (invariante I1). '
  'LANGUAGE sql mantido. Acesso restrito: search_path=zapp,pg_catalog.';
