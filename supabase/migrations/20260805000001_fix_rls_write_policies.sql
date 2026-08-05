-- Migration: fix_rls_write_policies
-- Adds missing INSERT/UPDATE/DELETE RLS policies for 3 tables that currently
-- only have SELECT policies.

-- ============================================================
-- 1. zapp.scheduled_reports
--    Existing: "scheduled_reports_select" (SELECT, authenticated)
--    Add: INSERT for authenticated, UPDATE/DELETE scoped to own rows
-- ============================================================

CREATE POLICY "scheduled_reports_insert"
  ON zapp.scheduled_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "scheduled_reports_update_own"
  ON zapp.scheduled_reports
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "scheduled_reports_delete_own"
  ON zapp.scheduled_reports
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());

-- ============================================================
-- 2. zapp.notification_channels_config
--    Existing: "auth_secure_152" (SELECT, authenticated)
--    Add: INSERT/UPDATE/DELETE for authenticated (admin table, no owner column)
-- ============================================================

CREATE POLICY "notification_channels_config_insert"
  ON zapp.notification_channels_config
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "notification_channels_config_update"
  ON zapp.notification_channels_config
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "notification_channels_config_delete"
  ON zapp.notification_channels_config
  FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- 3. zapp.queue_routing_rules
--    Existing: "auth_secure_178" (SELECT, authenticated), "qr_service" (ALL, service_role)
--    Add: INSERT/UPDATE/DELETE for authenticated (no owner column)
-- ============================================================

CREATE POLICY "queue_routing_rules_insert"
  ON zapp.queue_routing_rules
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "queue_routing_rules_update"
  ON zapp.queue_routing_rules
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "queue_routing_rules_delete"
  ON zapp.queue_routing_rules
  FOR DELETE
  TO authenticated
  USING (true);
