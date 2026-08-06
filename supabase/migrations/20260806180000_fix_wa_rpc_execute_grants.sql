-- Correção: 4 RPCs WhatsApp sem EXECUTE grant para authenticated
-- Identificadas durante auditoria da Evolution API (2026-08-06).
-- Todas são SECURITY DEFINER — o grant apenas autoriza a chamada,
-- a execução ocorre com privilégios do owner (postgres/service_role).

GRANT EXECUTE ON FUNCTION zapp.rpc_instance_stats(text)
  TO authenticated;

GRANT EXECUTE ON FUNCTION zapp.rpc_resolve_whatsapp_instance(uuid)
  TO authenticated;

GRANT EXECUTE ON FUNCTION zapp.rpc_resolve_instance_by_phone(text)
  TO authenticated;

GRANT EXECUTE ON FUNCTION zapp.get_connection_instance(uuid)
  TO authenticated;
