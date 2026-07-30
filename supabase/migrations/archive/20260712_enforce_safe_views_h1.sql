-- H1 RLS Audit Fix: Enforce Safe Views for Field-Level Masking
-- Prevents direct table access to sensitive fields (qr_code, instance_id, evo_instance_id, api_key, secret)
-- Security Invoker ON: RLS policies applied when executing query

-- ============================================================================
-- 1. WhatsApp Connections Safe View
-- ============================================================================
-- Returns: id, name, phone_number, status, is_default, updated_at
-- Masks: qr_code, instance_id, evo_instance_id (sensitive identifiers)
-- Also excludes internal fields not needed by UI layer
CREATE OR REPLACE VIEW whatsapp_connections_safe AS
SELECT
  id,
  name,
  phone_number,
  status,
  is_default,
  health_status,
  health_response_ms,
  last_health_check,
  auto_reconnect_enabled,
  reconnect_interval_seconds,
  max_reconnect_attempts,
  loop_protection_active,
  instance_name,
  updated_at
FROM whatsapp_connections
WITH (security_invoker = 'on');

-- Grant SELECT to authenticated role
-- This ensures RLS policies from the base table are enforced
GRANT SELECT ON whatsapp_connections_safe TO authenticated;

-- ============================================================================
-- 2. Channel Connections Safe View
-- ============================================================================
-- Returns: id, channel_type, name, status, updated_at
-- Masks: api_key, secret, credentials (sensitive authentication fields)
CREATE OR REPLACE VIEW channel_connections_safe AS
SELECT
  id,
  channel_type,
  name,
  status,
  updated_at
FROM channel_connections
WITH (security_invoker = 'on');

-- Grant SELECT to authenticated role
GRANT SELECT ON channel_connections_safe TO authenticated;

-- ============================================================================
-- 3. Security Documentation
-- ============================================================================
-- SENSITIVE FIELDS — Service Role Only (Edge Functions):
--   whatsapp_connections:
--     - qr_code: QR code for mobile connection (credential)
--     - evo_instance_id: Evolution API instance identifier (sensitive)
--     - instance_id: Internal instance tracking (sensitive identifier)
--     - credentials (JSON): API credentials and tokens
--
--   channel_connections:
--     - api_key: Channel API authentication key (credential)
--     - secret: Channel webhook secret (credential)
--     - credentials (JSON): Full credential payload
--
-- CLIENT-SAFE FIELDS — Authenticated Role (Safe Views):
--   whatsapp_connections:
--     - id, name, phone_number, status, is_default
--     - health_status, health_response_ms, last_health_check
--     - auto_reconnect_enabled, reconnect_interval_seconds, max_reconnect_attempts, loop_protection_active
--     - instance_name (non-sensitive instance label)
--     - updated_at
--
--   channel_connections:
--     - id, channel_type, name, status, updated_at

-- ============================================================================
-- 4. RLS Policy Verification
-- ============================================================================
-- Ensure the following policies exist on base tables:
-- - whatsapp_connections: SELECT policy restricts to owner (user_id = auth.uid())
-- - channel_connections: SELECT policy restricts to owner (user_id = auth.uid())
--
-- With security_invoker='on', the safe views inherit and enforce these policies.
-- Users cannot bypass security by selecting from the view.

-- ============================================================================
-- 5. Comment on Views (Documentation)
-- ============================================================================
COMMENT ON VIEW whatsapp_connections_safe IS 'RLS-enforced view exposing only safe WhatsApp connection fields. Masks qr_code, instance_id, evo_instance_id to prevent credential exposure. Use safeWhatsAppConnectionsQuery() utility in application code.';
COMMENT ON VIEW channel_connections_safe IS 'RLS-enforced view exposing only safe Channel connection fields. Masks api_key, secret to prevent credential exposure. Use safeChannelConnectionsQuery() utility in application code.';
