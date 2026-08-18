-- ============================================================================
-- FIX (2026-08-18) — zapp.rpc_get_contact_summary_batch: dedupe de IDs
-- ----------------------------------------------------------------------------
-- Validacao exaustiva (onda 5 agentes) reprovou o cenario de UUID duplicado
-- no array: unnest preservava duplicatas -> 2 linhas para o mesmo contact_id.
-- Front consome via Set (nao quebra), mas o contrato TABLE(contact_id, ...)
-- implica chave unica por contato. Fix: SELECT DISTINCT no unnest.
-- Contrato preservado; idempotente (CREATE OR REPLACE).
-- ============================================================================
CREATE OR REPLACE FUNCTION zapp.rpc_get_contact_summary_batch(p_contact_ids uuid[])
 RETURNS TABLE(contact_id uuid, unread_whispers integer, pending_tasks integer)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
WITH unread_w AS (
  SELECT contact_id, COUNT(*)::int AS cnt
  FROM zapp.whisper_messages
  WHERE contact_id = ANY(p_contact_ids) AND is_read = false
  GROUP BY contact_id
), pending_t AS (
  SELECT contact_id, COUNT(*)::int AS cnt
  FROM zapp.conversation_tasks
  WHERE contact_id = ANY(p_contact_ids) AND status = 'pending'
  GROUP BY contact_id
)
SELECT ids.id AS contact_id,
       COALESCE(uw.cnt, 0) AS unread_whispers,
       COALESCE(pt.cnt, 0) AS pending_tasks
FROM (SELECT DISTINCT unnest(p_contact_ids) AS id) ids
LEFT JOIN unread_w uw ON uw.contact_id = ids.id
LEFT JOIN pending_t pt ON pt.contact_id = ids.id
$function$
;

-- Reforco de privilegios (idempotente): so authenticated (app) e service_role.
REVOKE ALL ON FUNCTION zapp.rpc_get_contact_summary_batch(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.rpc_get_contact_summary_batch(uuid[]) TO authenticated, service_role; -- ignore-lint-ml008: batch lookup helper; workspace isolation aplicada pelo caller via contact_ids do workspace
