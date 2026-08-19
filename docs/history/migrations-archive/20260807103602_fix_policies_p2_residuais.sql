-- ESPELHO repo×DB — migration aplicada via MCP (supabase_apply_migration) na auditoria Hermes 2026-08-06/07.
-- Registro em supabase_migrations.schema_migrations; este arquivo é o registro histórico (DB-as-source).
-- Onda 3 final (guardrails AG-09): 6 policies P2 residuais.
DROP POLICY IF EXISTS auth_access ON ai.knowledge_bases;
CREATE POLICY kb_workspace_select ON ai.knowledge_bases FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM zapp.workspace_members WHERE user_id = auth.uid()));
CREATE POLICY kb_admin_write ON ai.knowledge_bases FOR ALL TO authenticated
  USING (is_admin_or_supervisor()) WITH CHECK (is_admin_or_supervisor());
DROP POLICY IF EXISTS amc_service_all ON zapp.audio_meme_categories;
CREATE POLICY amc_service_all ON zapp.audio_meme_categories FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY amc_auth_read ON zapp.audio_meme_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY amc_admin_write ON zapp.audio_meme_categories FOR ALL TO authenticated USING (is_admin_or_supervisor()) WITH CHECK (is_admin_or_supervisor());
DROP POLICY IF EXISTS warroom_alerts_insert_policy ON zapp.warroom_alerts;
CREATE POLICY warroom_alerts_insert_policy ON zapp.warroom_alerts FOR INSERT TO authenticated WITH CHECK (is_admin_or_supervisor());
DROP POLICY IF EXISTS auth_secure_70 ON zapp.hmac_selftest_audit;
DROP POLICY IF EXISTS scheduled_reports_insert ON zapp.scheduled_reports;
CREATE POLICY scheduled_reports_insert ON zapp.scheduled_reports FOR INSERT TO authenticated
  WITH CHECK ((created_by = auth.uid()) OR is_admin_or_supervisor());
DROP POLICY IF EXISTS voice_insert ON zapp.voice_conversion_queue;
CREATE POLICY voice_insert ON zapp.voice_conversion_queue FOR INSERT TO authenticated
  WITH CHECK ((requested_by = auth.uid()) OR is_admin_or_supervisor());
