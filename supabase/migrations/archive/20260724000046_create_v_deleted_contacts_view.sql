-- Migration: 20260724000046_create_v_deleted_contacts_view.sql
-- Fixes: ContactRecycleBin PGRST205 — dbFrom('deleted_contacts') resolves to
-- zapp.v_deleted_contacts which was never created in any migration.
-- Every render of ContactRecycleBin fails with "relation v_deleted_contacts not found".
--
-- The view maps soft-delete columns (name→display_name, phone→phone_number) and
-- computes days_remaining (30-day purge window) for the recycle-bin UI.

CREATE OR REPLACE VIEW zapp.v_deleted_contacts
  WITH (security_invoker = on)
AS
SELECT
  c.id,
  c.name                                                                           AS display_name,
  c.phone                                                                          AS phone_number,
  c.email,
  COALESCE(w.instance_name, w.name, 'default')                                    AS instance_name,
  c.deleted_at,
  c.deleted_reason,
  GREATEST(
    0,
    30 - EXTRACT(EPOCH FROM (now() - c.deleted_at)) / 86400
  )::int                                                                           AS days_remaining
FROM contacts c
LEFT JOIN whatsapp_connections w ON w.id = c.whatsapp_connection_id
WHERE c.deleted_at IS NOT NULL
  AND c.deleted_at >= now() - INTERVAL '30 days';

GRANT SELECT ON zapp.v_deleted_contacts TO authenticated;
GRANT ALL   ON zapp.v_deleted_contacts TO service_role;
