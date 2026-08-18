-- 20260818120000_fix_ambiguous_out_cols_contact_summary_avatar
-- Causa raiz dos 400 no front: OUT params de RETURNS TABLE (contact_id /
-- remote_jid) colidem com colunas homonimas referenciadas sem qualificacao
-- no corpo -> "column reference X is ambiguous" em TODA chamada.
-- Diff minimo: alias + qualificacao. Zero mudanca de contrato/semantica.
-- Nota: zapp.evolution_contacts e VIEW com remote_jid varchar(50);
-- RETURN QUERY nao coage varchar->text no RETURNS TABLE, cast ::text obrigatorio.
-- Aplicado no self-hosted em 2026-08-18 via MCP; testado com dados reais.

CREATE OR REPLACE FUNCTION zapp.rpc_get_contact_summary_batch(p_contact_ids uuid[])
 RETURNS TABLE(contact_id uuid, unread_whispers integer, pending_tasks integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp'
AS $function$
BEGIN
  PERFORM zapp.fn_require_app_user();
  RETURN QUERY
WITH unread_w AS (
  SELECT w.contact_id AS cid, COUNT(*)::int AS cnt
  FROM zapp.whisper_messages w
  WHERE w.contact_id = ANY(p_contact_ids) AND w.is_read = false
  GROUP BY w.contact_id
), pending_t AS (
  SELECT t.contact_id AS cid, COUNT(*)::int AS cnt
  FROM zapp.conversation_tasks t
  WHERE t.contact_id = ANY(p_contact_ids) AND t.status = 'pending'
  GROUP BY t.contact_id
)
SELECT ids.id AS contact_id, COALESCE(uw.cnt, 0) AS unread_whispers, COALESCE(pt.cnt, 0) AS pending_tasks
FROM unnest(p_contact_ids) AS ids(id)
LEFT JOIN unread_w uw ON uw.cid = ids.id
LEFT JOIN pending_t pt ON pt.cid = ids.id;
END;
$function$;

CREATE OR REPLACE FUNCTION zapp.get_avatars_by_jids_batch(p_jids text[])
 RETURNS TABLE(remote_jid text, avatar_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'monitoring'
AS $function$
BEGIN
  PERFORM zapp.fn_require_app_user();
  RETURN QUERY
  SELECT ec.remote_jid::text, COALESCE(ec.profile_picture_url,'')::text
  FROM evolution_contacts ec
  WHERE ec.remote_jid = ANY(p_jids);
END;
$function$;
