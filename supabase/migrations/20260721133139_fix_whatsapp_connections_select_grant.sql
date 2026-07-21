-- Fix: authenticated não tinha GRANT SELECT em zapp.whatsapp_connections,
-- apesar de existir a policy wconn_select_auth (USING true). Resultado: 28 leituras
-- legítimas no frontend falhavam com "permission denied".
--
-- Correção segura (column-level): concede SELECT em TODAS as colunas EXCETO os
-- segredos api_key (chave da Evolution API) e qr_code_base64 (imagem de pareamento).
-- Assim as telas voltam a funcionar SEM expor credenciais ao cliente autenticado.
-- Fronteira idêntica à documentada no código (useDiagnosticsData.ts) e às views
-- seguras (whatsapp_connections_safe).
--
-- Reversível: REVOKE SELECT ON zapp.whatsapp_connections FROM authenticated;

GRANT SELECT (
  id, name, phone_number, status, is_default, is_active, is_plugged,
  instance_id, instance_name, evo_instance_id, owner_jid,
  api_type, api_url, webhook_url, routing_mode, settings,
  qr_code,
  farewell_enabled, farewell_message,
  battery_level, health_status, health_reason, health_response_ms, last_health_check,
  auto_reconnect_enabled, loop_protection_active, max_reconnect_attempts,
  reconnect_interval_seconds, retry_count, max_retries,
  connected_at, disconnected_at, degraded_at, last_connected_at,
  created_at, updated_at, created_by
) ON zapp.whatsapp_connections TO authenticated;

-- Defensivo: garante que os segredos NUNCA fiquem legíveis por authenticated.
-- (Auditoria encontrou um GRANT antigo vazando qr_code_base64.)
REVOKE SELECT (qr_code_base64, api_key) ON zapp.whatsapp_connections FROM authenticated;
