-- ==========================================================================
-- Mask de api_key em rpc_resolve_* + REVOKE EXECUTE das administrativas
-- Espelho versionado da onda de correção executada em 2026-08-07 (DB-as-source:
-- objetos JÁ aplicados em produção via psql; esta migration é NO-OP idempotente
-- que alinha o repo com o banco canônico).
-- Fonte: .hermes/audit-db-exaustiva/20260807/ (exec-01..14, fix_*.sql)
-- ==========================================================================

-- exec-11: mascarar wc.api_key nas RPCs zapp.rpc_resolve_* (P1 vazamento Evolution key)
-- shape e guarda preservados; único delta: api_key -> '********' (NULL se NULL)

CREATE OR REPLACE FUNCTION zapp.rpc_resolve_instance_by_phone(p_phone text)
 RETURNS TABLE(instance_name text, api_url text, api_key text, connection_id uuid, contact_phone text, remote_jid text, contact_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$
DECLARE
  cleaned text;
BEGIN
  PERFORM zapp.fn_require_app_user();

  cleaned := zapp.fn_normalize_br_phone(p_phone);
  RETURN QUERY
  SELECT 
    ec.instance_name::text,
    wc.api_url,
    CASE WHEN wc.api_key IS NULL THEN NULL ELSE '********' END AS api_key,
    wc.id AS connection_id,
    COALESCE(ec.phone_number, split_part(ec.remote_jid, '@', 1))::text,
    ec.remote_jid::text,
    ec.id AS contact_id
  FROM evolution_contacts ec
  JOIN zapp.whatsapp_connections wc ON wc.instance_name = ec.instance_name AND wc.is_active = true
  WHERE ec.deleted_at IS NULL
    AND (
      ec.phone_number = cleaned
      OR split_part(ec.remote_jid, '@', 1) = cleaned
      OR ec.phone_number = p_phone
      OR split_part(ec.remote_jid, '@', 1) = p_phone
    )
  ORDER BY ec.last_message_at DESC NULLS LAST
  LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION zapp.rpc_resolve_whatsapp_instance(p_contact_id uuid)
 RETURNS TABLE(instance_name text, api_url text, api_key text, connection_id uuid, contact_phone text, remote_jid text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$
BEGIN
  PERFORM zapp.fn_require_app_user();

  RETURN QUERY
  SELECT 
    ec.instance_name::text,
    wc.api_url,
    CASE WHEN wc.api_key IS NULL THEN NULL ELSE '********' END AS api_key,
    wc.id AS connection_id,
    COALESCE(ec.phone_number, split_part(ec.remote_jid, '@', 1))::text AS contact_phone,
    ec.remote_jid::text
  FROM evolution_contacts ec
  JOIN zapp.whatsapp_connections wc ON wc.instance_name = ec.instance_name AND wc.is_active = true
  WHERE ec.id = p_contact_id AND ec.deleted_at IS NULL
  LIMIT 1;
END;
$function$;

-- REVOKE EXECUTE de authenticated/anon/PUBLIC nas funções administrativas (onda 2026-08-07, CORR-02)
REVOKE EXECUTE ON FUNCTION zapp.fn_webhook_purge_consolidated(integer, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.fn_security_self_audit_daily() FROM authenticated;
REVOKE EXECUTE ON FUNCTION ops.fn_auto_classify_check_type() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.fn_host_disk_collector_guard() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.fn_mirror_warroom_criticals(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION zapp.rpc_schema_tables(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.rpc_schema_columns(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.rpc_delete_contact(text, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.rpc_resolve_instance_by_phone(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.rpc_resolve_whatsapp_instance(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION zapp.fn_count_total_rows(text, text) FROM authenticated;
