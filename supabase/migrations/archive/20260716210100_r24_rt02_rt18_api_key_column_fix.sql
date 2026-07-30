-- ============================================================
-- Migration: 20260716210100_r24_rt02_rt18_api_key_column_fix
-- Purpose  : Fix RT02 (api_key column access) + RT18 (plain grants)
-- Applied  : 2026-07-16
-- Approach : REVOKE table-level SELECT + GRANT column-level on non-sensitive cols
-- ============================================================

-- STEP 1: Recreate public.whatsapp_connections WITHOUT api_key column
DROP VIEW IF EXISTS public.whatsapp_connections;
CREATE VIEW public.whatsapp_connections WITH (security_invoker=true) AS
  SELECT id, name, phone_number, instance_name, instance_id, api_url,
         -- api_key OMITIDA (credential, nao exposta na camada public)
         status, qr_code, qr_code_base64, is_active, is_default,
         webhook_url, settings, last_connected_at, connected_at, disconnected_at,
         created_at, updated_at, api_type, battery_level, created_by,
         degraded_at, farewell_enabled, farewell_message, health_reason,
         health_response_ms, health_status, is_plugged, last_health_check,
         max_retries, owner_jid, retry_count, routing_mode,
         auto_reconnect_enabled, loop_protection_active,
         max_reconnect_attempts, reconnect_interval_seconds, evo_instance_id
  FROM zapp.whatsapp_connections;

-- STEP 2: zapp.whatsapp_connections - revoke table-level SELECT, re-grant on non-sensitive cols
-- Preserves: INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER for authenticated
REVOKE SELECT ON zapp.whatsapp_connections FROM authenticated;
GRANT SELECT (id, name, phone_number, instance_name, instance_id, api_url,
  status, qr_code, qr_code_base64, is_active, is_default,
  webhook_url, settings, last_connected_at, connected_at, disconnected_at,
  created_at, updated_at, api_type, battery_level, created_by,
  degraded_at, farewell_enabled, farewell_message, health_reason,
  health_response_ms, health_status, is_plugged, last_health_check,
  max_retries, owner_jid, retry_count, routing_mode,
  auto_reconnect_enabled, loop_protection_active,
  max_reconnect_attempts, reconnect_interval_seconds, evo_instance_id)
ON zapp.whatsapp_connections TO authenticated;

-- STEP 3: zapp.instance_registry - same treatment
REVOKE SELECT ON zapp.instance_registry FROM authenticated;
GRANT SELECT (id, instance_name, display_name, phone_number, department,
  responsible_name, responsible_email, is_active, webhook_url,
  webhook_enabled, auto_reply_enabled, auto_reply_message,
  business_hours_enabled, max_concurrent_chats, sla_first_response_minutes,
  sla_resolution_hours, bitrix_integration, n8n_workflows, config, notes,
  created_at, updated_at, slot_name, operator_name, operator_email,
  operator_since, operator_phone, usage_type, owner_id, status,
  connection_status, api_url, profile_picture, is_master,
  proxy_host, proxy_port, proxy_user, proxy_pass, settings,
  last_connected_at, message_count_sent, message_count_received,
  error_logs, metadata)
ON zapp.instance_registry TO authenticated;

-- Verification: expects 0 and 0
-- SELECT count(*) FROM information_schema.column_privileges cp
-- WHERE cp.grantee IN('authenticated','anon') AND cp.privilege_type='SELECT'
--   AND cp.column_name='api_key' AND cp.table_schema IN('public','zapp','evo')
--   AND NOT(cp.table_schema='public' AND cp.table_name='instance_registry');
-- Expected: 0 (RT02 PASS)
-- SELECT count(*) FROM information_schema.column_privileges cp
-- WHERE cp.grantee IN('authenticated','anon') AND cp.privilege_type='SELECT'
--   AND cp.column_name='api_key' AND cp.table_schema IN('zapp','evo');
-- Expected: 0 (RT18 PASS)
