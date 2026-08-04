# Rollback Test Report — supabase/migrations (últimos 30 dias)

Data: 2026-08-03 13:51 | Migrations testadas: 129 | DB schema_migrations: 87

Método: down-script gerado por análise estática do arquivo, executado em transação `BEGIN;...;ROLLBACK;` (nada persiste). PASS = down roda limpo; PASS_CASCADE = requer CASCADE (dependentes existem); FAIL = down falha mesmo com CASCADE; MANUAL = sem DDL estrutural reversível automaticamente (funções REPLACE, data migrations, drops).

## Resumo

| Verdict | Qtd |
|---|---|
| PASS | 62 |
| MANUAL | 58 |
| PASS_CASCADE | 8 |
| FAIL | 1 |

## Detalhe

| Migration | Verdict | Notas |
|---|---|---|
| 20260716_fix_cloud_url_hardcodes.sql | MANUAL | no structural DDL — DO $$
BEGIN
  PERFORM set_config('app.settings.supabase_url', 'https://supabase.atomicabr.; DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
   CONTROL/NOOP: DO $$
BEGIN
  PERFORM set_config('app.settings.supabase_url', 'https://supabase.atomicabr.; CONTROL/NOOP: DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
   |
| 20260716_fix_dispatch_error_logs_grant.sql | MANUAL | no structural DDL — DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p CONTROL/NOOP: DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p |
| 20260716_fix_messages_insert_trigger_return_id.sql | PASS |  REPLACE_FUNCTION: zapp.fn_messages_view_insert_handler replaced prior def — restore old def from git history |
| 20260716_fix_public_to_zapp_schema.sql | MANUAL | no structural DDL — DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'pub; DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'pub; DO $$ BEGIN
  IF CONTROL/NOOP: DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'pub; CONTROL/NOOP: DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'pub; CONTROL/NOOP: DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE tab |
| 20260716_fix_rpc_list_failed_messages_cursor_columns.sql | PASS |  REPLACE_FUNCTION: zapp.rpc_list_failed_messages_cursor replaced prior def — restore old def from git history; MANUAL: DROP FUNCTION DROP FUNCTION IF EXISTS public.rpc_list_failed_messages_cursor(text[], text, text, timesta — down = re-create (def in git history); MANUAL: DROP FUNCTION DROP FUNCTION  |
| 20260716_harden_security_definer_search_path.sql | MANUAL | no structural DDL — DO $harden_sp$ BEGIN
  BEGIN
    ALTER FUNCTION public.create_partitions_if_not_exists() S; DO $harden_revoke$ BEGIN
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.create_partitions_i; DO $$
BEGIN
  IF CONTROL/NOOP: DO $harden_sp$ BEGIN
  BEGIN
    ALTER FUNCTION public.create_partitions_if_not_exists() S; CONTROL/NOOP: DO $harden_revoke$ BEGIN
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.create_partitions_i; CONTROL/NOOP: DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
          |
| 20260716_rls_service_role_only_tables.sql | MANUAL | no structural DDL — COMMENT ON TABLE zapp._authoritative_time IS
  'Internal clock reference table. RLS enabled with no ; COMMENT ON TABLE zapp.dept_mapping IS
  'Department mapping configuration. RLS enabled with no pol COMMENT: COMMENT ON TABLE zapp._authoritative_time IS
  'Internal clock reference table. RLS enabled with no ; COMMENT: COMMENT ON TABLE zapp.dept_mapping IS
  'Department mapping configuration. RLS enabled with no polic; COMMENT: COMMENT ON TABLE zapp.message_audit_log IS
  'Message audit trail. RL |
| 20260716_schema_hardening.sql | PASS |  CONTROL/NOOP: BEGIN; CONTROL/NOOP: COMMIT; MANUAL: DATA UPDATE zapp.storage_cleanup_logs SET created_at = now() WHERE created_at IS NULL — down = inverse data op (manual); MANUAL: DATA UPDATE zapp.webhook_reprocess_queue SET created_at = now() WHERE created_at IS NULL — down = inverse data op (manua |
| 20260716_schema_hardening_v2.sql | PASS |   |
| 20260716_schema_hardening_v3.sql | PASS |  MANUAL: ALTER ALTER POLICY auth_user_select_search_history
  ON zapp.search_history
  USING (true) — down = reverse alter (manual); MANUAL: ALTER ALTER POLICY auth_user_write_search_history
  ON zapp.search_history
  USING (true)
  WITH CHECK (tr — down = reverse alter (manual); MANUAL: ALTER ALTER  |
| 20260716_security_revoke_anon_cookies_update.sql | MANUAL | no structural DDL — DROP POLICY DROP POLICY IF EXISTS allow_anon_update_health ON zapp.cookies_config — down = re-create (def in git history); DROP POLICY DROP POLICY IF EXISTS allow_anon_select_cookies ON zapp.cookies_c MANUAL: DROP POLICY DROP POLICY IF EXISTS allow_anon_update_health ON zapp.cookies_config — down = re-create (def in git history); MANUAL: DROP POLICY DROP POLICY IF EXISTS allow_anon_select_cookies ON zapp.cookies_config — down = re-create (def in git history); MANUAL: DROP POLICY DROP POLICY IF EX |
| 20260716_zapp_evolution_retry_metrics_view.sql | PASS |  REPLACE_VIEW: ZAPP.EVOLUTION_RETRY_METRICS replaced prior def — restore old def from git history; MANUAL: PRIV GRANT SELECT ON zapp.evolution_retry_metrics TO authenticated, service_role — down = reverse grant (manual) |
| 20260717_fix_dlq_mutation_rpcs_zapp_schema.sql | PASS |  REPLACE_FUNCTION: zapp.rpc_dlq_retry_now replaced prior def — restore old def from git history; REPLACE_FUNCTION: zapp.rpc_dlq_abandon replaced prior def — restore old def from git history; REPLACE_FUNCTION: zapp.rpc_dlq_bulk_abandon replaced prior def — restore old def from git history; REPLACE_FUN |
| 20260717_fix_dlq_read_rpcs_zapp_schema.sql | PASS |  REPLACE_FUNCTION: zapp.rpc_list_dispatch_error_logs replaced prior def — restore old def from git history; REPLACE_FUNCTION: zapp.rpc_dlq_list_audit replaced prior def — restore old def from git history; MANUAL: PRIV REVOKE EXECUTE ON FUNCTION zapp.rpc_list_dispatch_error_logs(
  TIMESTAMPTZ, TIMEST |
| 20260717_fix_dlq_rpc_schema_drift.sql | PASS |  REPLACE_FUNCTION: zapp.rpc_dlq_stats replaced prior def — restore old def from git history; MANUAL: DROP FUNCTION DROP FUNCTION IF EXISTS zapp.rpc_list_failed_messages(
  text, text, text, timestamptz, ti — down = re-create (def in git history); MANUAL: DROP FUNCTION DROP FUNCTION IF EXISTS zapp.rpc |
| 20260717_fix_dlq_security_and_audit_gaps.sql | PASS |  REPLACE_FUNCTION: zapp.rpc_dlq_retry_now replaced prior def — restore old def from git history; REPLACE_FUNCTION: zapp.rpc_dlq_abandon replaced prior def — restore old def from git history; REPLACE_FUNCTION: zapp.rpc_dlq_bulk_abandon replaced prior def — restore old def from git history; REPLACE_FUN |
| 20260717_fix_missing_zapp_functions.sql | PASS |  MANUAL: DROP FUNCTION DROP FUNCTION IF EXISTS zapp.rpc_dlq_bulk_retry_now(uuid[], text) — down = re-create (def in git history); MANUAL: PRIV REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_bulk_retry_now(uuid[], text) FROM PUBLIC, anon — down = reverse grant (manual); MANUAL: PRIV GRANT  EXECUTE ON FUNCTIO |
| 20260717_schema_hardening_v4.sql | PASS |   |
| 20260717_schema_hardening_v5.sql | PASS |  MANUAL: DROP INDEX DROP INDEX IF EXISTS zapp.idx_contact_id_graveyard_lookup — down = re-create (def in git history); MANUAL: DROP INDEX DROP INDEX IF EXISTS zapp.idx_email_watch_history_account — down = re-create (def in git history); MANUAL: DROP INDEX DROP INDEX IF EXISTS zapp.idx_stickers_owner_ |
| 20260717_schema_hardening_v6.sql | PASS |   |
| 20260720000006_fix_settings_realtime_publication.sql | PASS |  CONTROL/NOOP: DO $$
DECLARE v_user int; v_workspace int;
BEGIN
  SELECT count(*) INTO v_user
  FROM pg_p |
| 20260724000001_evo_drop_unused_indexes.sql | MANUAL | no structural DDL — DROP INDEX DROP INDEX IF EXISTS evo_whk_v2_remote_jid — down = re-create (def in git history); DROP INDEX DROP INDEX IF EXISTS pidx_msgs_unread_contact — down = re-create (def in git history); DROP IN CONTROL/NOOP: SET search_path TO evo; MANUAL: DROP INDEX DROP INDEX IF EXISTS evo_whk_v2_remote_jid — down = re-create (def in git history); MANUAL: DROP INDEX DROP INDEX IF EXISTS pidx_msgs_unread_contact — down = re-create (def in git history); MANUAL: DROP INDEX DROP INDEX IF EXISTS idx_evolution |
| 20260724000003_evo_schema_housekeeping.sql | PASS |  OTHER: ALTER TABLE evo.evolution_daily_metrics SET (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum; OTHER: ALTER TABLE evo.evolution_reactions SET (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_ana; OTHER: ALTER TABLE evo.evolution_calls SET (
  autovacuum_vacuum_scale_factor  = 0 |
| 20260724000004_fix_missing_realtime_publications.sql | MANUAL | no structural DDL — DO $$
DECLARE
  tbl         text;
  schema_name text;
  table_name  text;
BEGIN
  FOR tbl  CONTROL/NOOP: DO $$
DECLARE
  tbl         text;
  schema_name text;
  table_name  text;
BEGIN
  FOR tbl  |
| 20260724000005_fix_critical_sql_bugs.sql | PASS |  OTHER: ALTER SYSTEM RESET statement_timeout; CONTROL/NOOP: SELECT pg_reload_conf(); REPLACE_FUNCTION: zapp.initiate_gmail_oauth replaced prior def — restore old def from git history; REPLACE_FUNCTION: zapp.complete_gmail_oauth replaced prior def — restore old def from git history; REPLACE_FUNCTION:  |
| 20260724000006_fix_realtime_payment_links_correct_schema.sql | MANUAL | no structural DDL — DO $$
DECLARE
  t         TEXT[];
  v_schema  TEXT;
  v_table   TEXT;
  targets   TEXT[][]; DO $$
DECLARE
  missing  TEXT[] := ARRAY[]::TEXT[];
  t        TEXT[];
  targets  TEXT[][] CONTROL/NOOP: DO $$
DECLARE
  t         TEXT[];
  v_schema  TEXT;
  v_table   TEXT;
  targets   TEXT[][]; CONTROL/NOOP: DO $$
DECLARE
  missing  TEXT[] := ARRAY[]::TEXT[];
  t        TEXT[];
  targets  TEXT[][] |
| 20260724000007_create_evolution_sentiment_analysis.sql | MANUAL | no structural DDL — DO $$
DECLARE
  v_schema  TEXT;
  v_relkind CHAR;
BEGIN
  SELECT c.relkind INTO v_relkind
; DO $$
DECLARE
  v_schema TEXT;
BEGIN
  SELECT n.nspname INTO v_schema
  FROM pg_class c
   CONTROL/NOOP: DO $$
DECLARE
  v_schema  TEXT;
  v_relkind CHAR;
BEGIN
  SELECT c.relkind INTO v_relkind
; CONTROL/NOOP: DO $$
DECLARE
  v_schema TEXT;
BEGIN
  SELECT n.nspname INTO v_schema
  FROM pg_class c
   |
| 20260724000011_fix_evo_schema_blanket_auth_policies.sql | MANUAL | no structural DDL — DO $$
DECLARE
  tbl  TEXT;
  prec RECORD;
BEGIN

  FOR tbl IN SELECT unnest(ARRAY[
    'ev CONTROL/NOOP: DO $$
DECLARE
  tbl  TEXT;
  prec RECORD;
BEGIN

  FOR tbl IN SELECT unnest(ARRAY[
    'ev |
| 20260724000014_fix_secdef_search_path_bulk.sql | MANUAL | no structural DDL — DO $$
DECLARE
  r             RECORD;
  v_oldpath     TEXT;
  v_parts       TEXT[];
  v_ne; DO $$
DECLARE
  v_remaining INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_remaining
  FROM pg_pr CONTROL/NOOP: DO $$
DECLARE
  r             RECORD;
  v_oldpath     TEXT;
  v_parts       TEXT[];
  v_ne; CONTROL/NOOP: DO $$
DECLARE
  v_remaining INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_remaining
  FROM pg_pr |
| 20260724000015_add_external_message_id_to_sentiment_analysis.sql | MANUAL | no structural DDL — DO $$
DECLARE
  v_schema TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN p CONTROL/NOOP: DO $$
DECLARE
  v_schema TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN p |
| 20260724000016_additional_realtime_publications.sql | MANUAL | no structural DDL — DO $$
DECLARE
  tbl text;
  schema_name text;
  table_name text;
BEGIN
  FOR tbl IN SELECT; DO $$
DECLARE
  missing_tables TEXT[] := ARRAY[]::TEXT[];
  tbl            TEXT;
  schema_ CONTROL/NOOP: DO $$
DECLARE
  tbl text;
  schema_name text;
  table_name text;
BEGIN
  FOR tbl IN SELECT; CONTROL/NOOP: DO $$
DECLARE
  missing_tables TEXT[] := ARRAY[]::TEXT[];
  tbl            TEXT;
  schema_ |
| 20260727120000_qa_round_2_3_corrigido_consolidado.sql | PASS |  REPLACE_FUNCTION: zapp.fn_evolution_status_unknown replaced prior def — restore old def from git history; REPLACE_FUNCTION: zapp.fn_normalize_phone replaced prior def — restore old def from git history; REPLACE_FUNCTION: zapp.fn_refresh_role_permissions_mv replaced prior def — restore old def from g |
| 20260727200001_idx_evolution_contacts_instance_phone.sql | PASS |  COMMENT: COMMENT ON INDEX evo.idx_ec_instance_phone IS
  'Compound index for upsertContact() lookup by instan; COMMENT: COMMENT ON INDEX evo.idx_ec_instance_jid IS
  'Compound index for upsertContact() lookup by instance |
| 20260727200002_rpc_get_pipeline_health.sql | PASS |  REPLACE_FUNCTION: zapp.rpc_get_pipeline_health replaced prior def — restore old def from git history; MANUAL: PRIV GRANT EXECUTE ON FUNCTION zapp.rpc_get_pipeline_health() TO authenticated, service_role — down = reverse grant (manual) |
| 20260727200003_fix_contact_audit_log_action_check.sql | MANUAL | no structural DDL — DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHE CONTROL/NOOP: DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHE |
| 20260727200004_idx_pipeline_health_gaps.sql | PASS |  COMMENT: COMMENT ON INDEX zapp.idx_messages_status_created IS
  'Supports pipeline health dashboard and recon |
| 20260727200005_rpc_bulk_repair_dedup_hashes.sql | PASS |  REPLACE_FUNCTION: zapp.rpc_bulk_repair_dedup_hashes replaced prior def — restore old def from git history; MANUAL: PRIV GRANT EXECUTE ON FUNCTION zapp.rpc_bulk_repair_dedup_hashes(INT,BOOLEAN) TO service_role — down = reverse grant (manual) |
| 20260727200006_rpc_get_pipeline_health_v2.sql | PASS |  REPLACE_FUNCTION: zapp.rpc_get_pipeline_health_v2 replaced prior def — restore old def from git history; MANUAL: PRIV GRANT EXECUTE ON FUNCTION zapp.rpc_get_pipeline_health_v2(TEXT) TO authenticated, service_role — down = reverse grant (manual) |
| 20260727200007_rpc_backfill_messages_contact_id.sql | PASS |  REPLACE_FUNCTION: zapp.rpc_backfill_messages_contact_id replaced prior def — restore old def from git history; MANUAL: PRIV GRANT EXECUTE ON FUNCTION zapp.rpc_backfill_messages_contact_id(INT,BOOLEAN) TO service_role — down = reverse grant (manual) |
| 20260727200008_harden_secdef_search_paths.sql | MANUAL | no structural DDL — DO $do$
DECLARE r RECORD;
DECLARE v_fixed INT := 0;
BEGIN
  FOR r IN
    SELECT n.nspname  CONTROL/NOOP: DO $do$
DECLARE r RECORD;
DECLARE v_fixed INT := 0;
BEGIN
  FOR r IN
    SELECT n.nspname  |
| 20260727200009_idx_webhook_audit_log_processed.sql | PASS |   |
| 20260728000001_ddl_event_trigger_auto_security_invoker.sql | PASS |  REPLACE_FUNCTION: zapp.fn_trg_auto_security_invoker replaced prior def — restore old def from git history; MANUAL: DROP EVENT TRIGGER DROP EVENT TRIGGER IF EXISTS trg_auto_security_invoker_on_ddl — down = re-create (def in git history) |
| 20260728000002_expand_autofix_all_schemas.sql | PASS |  REPLACE_FUNCTION: zapp.fn_autofix_security_invoker replaced prior def — restore old def from git history |
| 20260728000003_rate_limit_null_guard_and_bridge_auth.sql | PASS_CASCADE | culprit w/o CASCADE: DROP FUNCTION IF EXISTS public.fn_messages_bridge_insert(); -> ❌ Erro: cannot drop function fn_messages_bridge_insert() because other objects depend on it REPLACE_FUNCTION: zapp.fn_rate_limit_check replaced prior def — restore old def from git history; REPLACE_FUNCTION: public.fn_messages_bridge_insert replaced prior def — restore old def from git history; REPLACE_FUNCTION: public.fn_messages_bridge_update replaced prior def — restore old def from git |
| 20260728000004_explicit_policies_and_default_privileges.sql | MANUAL | no structural DDL — ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA artes REVOKE ALL ON TABLES FROM PUBLIC — down = reverse alter (manual); ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA artes REVOKE ALL ON TABLES FROM anon — down =  CONTROL/NOOP: DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND ; MANUAL: ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA artes REVOKE ALL ON TABLES FROM PUBLIC — down = reverse alter (manual); MANUAL: ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA artes REVOKE ALL ON TABL |
| 20260728000005_security_monitoring_rate_limit_hardening.sql | PASS_CASCADE | culprit w/o CASCADE: DROP FUNCTION IF EXISTS zapp.fn_trg_auto_security_invoker(); -> ❌ Erro: cannot drop function fn_trg_auto_security_invoker() because other objects depend on it CONTROL/NOOP: DO $fix$
DECLARE r record; v_fixed int := 0;
BEGIN
  FOR r IN
    SELECT c.relname
    FRO; CONTROL/NOOP: DO $rev$
DECLARE r record; v_cnt int := 0;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_f; REPLACE_FUNCTION: zapp.fn_rate_limit_check replaced prior def — restore old def from git |
| 20260728000006_pgbouncer_get_auth_search_path_hardening.sql | MANUAL | no structural DDL — ALTER ALTER FUNCTION pgbouncer.get_auth(p_usename text)
  SET search_path = pg_catalog, pg_temp — down = reverse alter (manual) CONTROL/NOOP: DO $gate$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid; MANUAL: ALTER ALTER FUNCTION pgbouncer.get_auth(p_usename text)
  SET search_path = pg_catalog, pg_temp — down = reverse alter (manual) |
| 20260728130001_revoke_anon_usage_financeiro_artes.sql | MANUAL | no structural DDL — PRIV REVOKE USAGE ON SCHEMA financeiro FROM anon — down = reverse grant (manual); PRIV REVOKE USAGE ON SCHEMA artes FROM anon — down = reverse grant (manual); ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA  MANUAL: PRIV REVOKE USAGE ON SCHEMA financeiro FROM anon — down = reverse grant (manual); MANUAL: PRIV REVOKE USAGE ON SCHEMA artes FROM anon — down = reverse grant (manual); MANUAL: ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA financeiro REVOKE ALL ON TABLES FROM anon — down = reverse alter (manual); M |
| 20260729190001_drop_evo_to_zapp_foreign_keys.sql | MANUAL | no structural DDL — ALTER TABLE evo.evolution_contacts
  DROP CONSTRAINT IF EXISTS evolution_contacts_queue_id_fkey; ALTER TABLE evo.evolution_health_logs
  DROP CONSTRAINT IF EXISTS evolution_health_logs_connection_i; A OTHER: ALTER TABLE evo.evolution_contacts
  DROP CONSTRAINT IF EXISTS evolution_contacts_queue_id_fkey; OTHER: ALTER TABLE evo.evolution_health_logs
  DROP CONSTRAINT IF EXISTS evolution_health_logs_connection_i; OTHER: ALTER TABLE evo.evolution_instance_credentials
  DROP CONSTRAINT IF EXISTS evolu |
| 20260729190003_harden_secdef_search_path.sql | MANUAL | no structural DDL — ALTER ALTER FUNCTION public.fn_apply_connection_update(p_event jsonb)
  SET search_path TO zapp, pg_catalo — down = reverse alter (manual); ALTER ALTER FUNCTION public.fn_contacts_proxy_delete()
  SET CONTROL/NOOP: DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg; MANUAL: ALTER ALTER FUNCTION public.fn_apply_connection_update(p_event jsonb)
  SET search_path TO zapp, pg_catalo — down = reverse alter (manual); MANUAL: ALTER ALTER FUNCTION public.fn_contact |
| 20260729190004_reactivate_cron_analytics_log_retention.sql | MANUAL | no structural DDL — DATA UPDATE cron.job
SET active = true
WHERE jobid = 100 AND jobname = 'analytics-log-retention' — down = inverse data op (manual) CONTROL/NOOP: DO $$
DECLARE v_active boolean;
BEGIN
  SELECT active INTO v_active FROM cron.job WHERE jo; MANUAL: DATA UPDATE cron.job
SET active = true
WHERE jobid = 100 AND jobname = 'analytics-log-retention' — down = inverse data op (manual) |
| 20260729190005_harden_secdef_search_path_remaining.sql | MANUAL | no structural DDL — ALTER ALTER FUNCTION archive.fn_refresh_schema_dependency_map() SET search_path TO archive, pg_catalog — down = reverse alter (manual); ALTER ALTER FUNCTION archive.fn_schema_migration_readiness(p_sch MANUAL: ALTER ALTER FUNCTION archive.fn_refresh_schema_dependency_map() SET search_path TO archive, pg_catalog — down = reverse alter (manual); MANUAL: ALTER ALTER FUNCTION archive.fn_schema_migration_readiness(p_schema text) SET search_path TO archive, pg_c — down = reverse alter (manual); MANUAL:  |
| 20260729190006_harden_secdef_artes_monitoring.sql | MANUAL | no structural DDL — ALTER ALTER FUNCTION artes.listar_pedidos_novos(text)
  SET search_path TO vendas, artes — down = reverse alter (manual); ALTER ALTER FUNCTION artes.notificar_bitrix_novo_pedido()
  SET search_path TO CONTROL/NOOP: DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg; MANUAL: ALTER ALTER FUNCTION artes.listar_pedidos_novos(text)
  SET search_path TO vendas, artes — down = reverse alter (manual); MANUAL: ALTER ALTER FUNCTION artes.notificar_bitrix_novo_pedido( |
| 20260730000000_baseline_schema.sql | MANUAL | no structural DDL — DO $$
BEGIN
  RAISE NOTICE 'Baseline 2026-07-30: schema documentado em 53 migrations ativa CONTROL/NOOP: DO $$
BEGIN
  RAISE NOTICE 'Baseline 2026-07-30: schema documentado em 53 migrations ativa |
| 20260730120000_r25_fix_rt05_rt21_fk_and_timeout.sql | MANUAL | no structural DDL — ALTER ALTER ROLE postgres      SET idle_in_transaction_session_timeout = '60s' — down = reverse alter (manual); ALTER ALTER ROLE authenticated SET idle_in_transaction_session_timeout = '60s' — down =  CONTROL/NOOP: DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint k
    JOIN pg_class bc ON bc; MANUAL: ALTER ALTER ROLE postgres      SET idle_in_transaction_session_timeout = '60s' — down = reverse alter (manual); MANUAL: ALTER ALTER ROLE authenticated SET idle_in_transaction_session_tim |
| 20260730130000_batch_rpcs_bootstrap_dashboard.sql | PASS |  REPLACE_FUNCTION: public.rpc_app_bootstrap replaced prior def — restore old def from git history; REPLACE_FUNCTION: public.rpc_dashboard_init replaced prior def — restore old def from git history; MANUAL: PRIV REVOKE EXECUTE ON FUNCTION public.rpc_app_bootstrap() FROM PUBLIC — down = reverse grant ( |
| 20260730140000_batch_rpcs_v2_canonical_fixes.sql | PASS |  REPLACE_FUNCTION: public.rpc_app_bootstrap replaced prior def — restore old def from git history; REPLACE_FUNCTION: public.rpc_dashboard_init replaced prior def — restore old def from git history; MANUAL: PRIV REVOKE EXECUTE ON FUNCTION public.rpc_app_bootstrap() FROM PUBLIC — down = reverse grant ( |
| 20260730150000_perf_notifications_partial_index.sql | PASS |   |
| 20260731000001_e06_assert_realtime_publication.sql | MANUAL | no structural DDL — DO $$
DECLARE
  v_pub_exists   boolean;
  v_msgs_in_pub  boolean;
  v_convs_in_pub boolean; COMMENT ON TABLE evo.evolution_messages IS
  'Partitioned root table for WhatsApp messages. 25 leaf ; COMMEN CONTROL/NOOP: DO $$
DECLARE
  v_pub_exists   boolean;
  v_msgs_in_pub  boolean;
  v_convs_in_pub boolean; COMMENT: COMMENT ON TABLE evo.evolution_messages IS
  'Partitioned root table for WhatsApp messages. 25 leaf ; COMMENT: COMMENT ON TABLE evo.evolution_conversations IS
  'Partitioned root table  |
| 20260731000002_e08_rls_impact_preview_view.sql | PASS |  REPLACE_FUNCTION: zapp.fn_count_total_rows replaced prior def — restore old def from git history; REPLACE_VIEW: ZAPP.V_RLS_IMPACT_PREVIEW replaced prior def — restore old def from git history; COMMENT: COMMENT ON VIEW zapp.v_rls_impact_preview IS
  'E08 Diagnostic: row counts per table to audit RLS  |
| 20260731000003_e09_revoke_excessive_privileges.sql | MANUAL | no structural DDL — ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA zapp
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authen — down = reverse alter (manual); ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA zapp
  REVOKE ALL O CONTROL/NOOP: DO $$
DECLARE
  v_schema text;
  v_table  text;
  v_schemas text[] := ARRAY[
    'zapp', '; CONTROL/NOOP: DO $$
DECLARE
  v_count int;
  v_rows  text;
BEGIN
  SELECT COUNT(*), string_agg(
    form; MANUAL: ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA zapp
  REVOKE TRUNCATE, REFERENCES, TRI |
| 20260731000004_e10_anon_hardening.sql | MANUAL | no structural DDL — DO $$
DECLARE
  v_sensitive_tables text[][] := ARRAY[
    ARRAY['zapp', 'contatos'],
    A; DO $$
DECLARE
  v_schemas text[] := ARRAY['zapp', 'public'];
  v_schema  text;
  v_exists ; DO $$
DECLARE
   CONTROL/NOOP: DO $$
DECLARE
  v_sensitive_tables text[][] := ARRAY[
    ARRAY['zapp', 'contatos'],
    A; CONTROL/NOOP: DO $$
DECLARE
  v_schemas text[] := ARRAY['zapp', 'public'];
  v_schema  text;
  v_exists ; CONTROL/NOOP: DO $$
DECLARE
  v_view      record;
  v_si_ok     boolean;
  v_violation t |
| 20260801000001_p0_prevent_privilege_escalation.sql | PASS |  CONTROL/NOOP: BEGIN; CONTROL/NOOP: COMMIT; MANUAL: DROP TRIGGER DROP TRIGGER IF EXISTS on_profile_update_prevent_escalation ON zapp.profiles — down = re-create (def in git history) |
| 20260801000002_p0_rls_security_tables.sql | PASS |  CONTROL/NOOP: BEGIN; CONTROL/NOOP: COMMIT; MANUAL: DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.audit_logs — down = re-create (def in git history); MANUAL: DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.blocked_ips — down = re-create (def in git history); MANUAL: DROP POLIC |
| 20260801010002_warroom_alert_type_enum.sql | PASS |  CONTROL/NOOP: BEGIN; OTHER: ALTER TABLE zapp._warroom_alerts_backup_20260801 ENABLE ROW LEVEL SECURITY; OTHER: ALTER TABLE zapp.warroom_alerts DROP CONSTRAINT IF EXISTS chk_warroom_alert_type; CONTROL/NOOP: DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnam; O |
| 20260801010003_p23_p26_omissions_decision.sql | MANUAL | no structural DDL — COMMENT ON TABLE zapp.profiles IS
  E'Perfis de usuários da plataforma ZAPP.\n'
  'Campo onboarding_; COMMENT ON TYPE public.app_role IS
  E'Papéis de usuário da plataforma.\n'
  'Ordem dos valores: a COMMENT: COMMENT ON TABLE zapp.profiles IS
  E'Perfis de usuários da plataforma ZAPP.\n'
  'Campo onboarding_; COMMENT: COMMENT ON TYPE public.app_role IS
  E'Papéis de usuário da plataforma.\n'
  'Ordem dos valores: adm |
| 20260801010004_unique_constraints.sql | PASS |   |
| 20260801010005_archive_cutover_backups.sql | MANUAL | no structural DDL — BEGIN; ALTER TABLE zapp._grant_backup_20260730 SET SCHEMA archive; ALTER TABLE zapp._rls_backup_20260731 SET SCHEMA archive CONTROL/NOOP: BEGIN; OTHER: ALTER TABLE zapp._grant_backup_20260730 SET SCHEMA archive; OTHER: ALTER TABLE zapp._rls_backup_20260731 SET SCHEMA archive; COMMENT: COMMENT ON TABLE archive._rls_backup_20260731 IS 'Backup pre-cutover. Retencao ate 2026-10-31.'; CONTROL/NOOP: COMMIT |
| 20260801020001_merge_duplicate_contacts.sql | PASS |  CONTROL/NOOP: BEGIN; OTHER: ALTER TABLE zapp._contact_merge_map_20260801 ENABLE ROW LEVEL SECURITY; CONTROL/NOOP: DO $$
DECLARE
  rec record;
  uk record;
  extra_cols text;
BEGIN
  FOR rec IN (
    SELEC; CONTROL/NOOP: COMMIT; MANUAL: DATA INSERT INTO zapp._contact_merge_map_20260801 (survivor_id,  |
| 20260801020002_unique_contact_phone_instance.sql | PASS |   |
| 20260801040001_rls_lote1_conversas.sql | PASS |  CONTROL/NOOP: BEGIN; CONTROL/NOOP: COMMIT; MANUAL: DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.conversation_analyses — down = re-create (def in git history); MANUAL: DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.conversation_closures — down = re-create (def in git history |
| 20260801040002_rls_lote2_contatos.sql | PASS |  CONTROL/NOOP: BEGIN; CONTROL/NOOP: COMMIT; MANUAL: DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.contact_custom_fields — down = re-create (def in git history); MANUAL: DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.contact_notes — down = re-create (def in git history); MANUA |
| 20260801040003_rls_lote3_time_usuario.sql | PASS |  CONTROL/NOOP: BEGIN; CONTROL/NOOP: COMMIT; MANUAL: DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.user_settings — down = re-create (def in git history); MANUAL: DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.saved_filters — down = re-create (def in git history); MANUAL: DROP  |
| 20260801040004_rls_lote4_campanhas.sql | PASS |  CONTROL/NOOP: BEGIN; CONTROL/NOOP: COMMIT; MANUAL: DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.campaigns — down = re-create (def in git history); MANUAL: DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.campaign_contacts — down = re-create (def in git history); MANUAL: DROP  |
| 20260801040005_rls_lote5_config_filas.sql | PASS |  CONTROL/NOOP: BEGIN; CONTROL/NOOP: COMMIT; MANUAL: DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.queues — down = re-create (def in git history); MANUAL: DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.queue_members — down = re-create (def in git history); MANUAL: DROP POLICY  |
| 20260801040006_feature_flags_anon_public.sql | PASS |  CONTROL/NOOP: BEGIN; CONTROL/NOOP: COMMIT; MANUAL: DROP POLICY DROP POLICY IF EXISTS "Anon can read flags" ON zapp.feature_flags — down = re-create (def in git history) |
| 20260801050001_blindar_triggers_auth_artes.sql | PASS_CASCADE | culprit w/o CASCADE: DROP FUNCTION IF EXISTS artes.handle_new_auth_user(); -> ❌ Erro: cannot drop function artes.handle_new_auth_user() because other objects depend on it CONTROL/NOOP: BEGIN; REPLACE_FUNCTION: artes.handle_new_auth_user replaced prior def — restore old def from git history; REPLACE_FUNCTION: artes.garantir_auth_tokens_nao_null replaced prior def — restore old def from git history; CONTROL/NOOP: COMMIT |
| 20260801050002_webhook_logs_retention.sql | PASS |  CONTROL/NOOP: BEGIN; REPLACE_FUNCTION: zapp.purge_webhook_logs replaced prior def — restore old def from git history; CONTROL/NOOP: SELECT cron.schedule('purge-webhook-logs', '15 3 * * *', $$SELECT zapp.purge_webhook_logs(; CONTROL/NOOP: COMMIT; MANUAL: PRIV REVOKE ALL ON FUNCTION zapp.purge_webhook |
| 20260801050003_triagem_security_definer.sql | MANUAL | no structural DDL — DO $$
DECLARE r record; v_count integer := 0;
BEGIN
  FOR r IN
    SELECT n.nspname, p.pro; DO $$
DECLARE r record; v_count integer := 0;
BEGIN
  FOR r IN
    SELECT n.nspname, p.pro CONTROL/NOOP: DO $$
DECLARE r record; v_count integer := 0;
BEGIN
  FOR r IN
    SELECT n.nspname, p.pro; CONTROL/NOOP: DO $$
DECLARE r record; v_count integer := 0;
BEGIN
  FOR r IN
    SELECT n.nspname, p.pro |
| 20260801060001_buckets_privados_lgpd.sql | MANUAL | no structural DDL — DROP TRIGGER DROP TRIGGER IF EXISTS trg_enforce_whatsapp_media_public ON storage.objects — down = re-create (def in git history); DROP FUNCTION DROP FUNCTION IF EXISTS storage.fn_enforce_public_bucket CONTROL/NOOP: BEGIN; CONTROL/NOOP: COMMIT; MANUAL: DROP TRIGGER DROP TRIGGER IF EXISTS trg_enforce_whatsapp_media_public ON storage.objects — down = re-create (def in git history); MANUAL: DROP FUNCTION DROP FUNCTION IF EXISTS storage.fn_enforce_public_buckets CASCADE — down = re-create (def in git  |
| 20260801060002_authoritative_time_fix.sql | MANUAL | no structural DDL — DATA INSERT INTO zapp._authoritative_time (id, server_time)
VALUES (1, NOW())
ON CONFLICT (id) DO UPDATE  — down = inverse data op (manual) CONTROL/NOOP: BEGIN; CONTROL/NOOP: COMMIT; MANUAL: DATA INSERT INTO zapp._authoritative_time (id, server_time)
VALUES (1, NOW())
ON CONFLICT (id) DO UPDATE  — down = inverse data op (manual) |
| 20260801140000_rls_gaps_validador_exaustivo.sql | PASS |  CONTROL/NOOP: DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION zapp.rpc_dispatch_error_stats(p_hours integer) FR; MANUAL: DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON email_app.meta_capi_events — down = re-create (def in git history); MANUAL: DROP POLICY DROP POLICY IF EXISTS "system_connections_ |
| 20260801141500_r25_p0_fix_rls_exec_grants.sql | MANUAL | no structural DDL — PRIV GRANT EXECUTE ON FUNCTION zapp.current_user_is_privileged() TO authenticated — down = reverse grant (manual); PRIV GRANT EXECUTE ON FUNCTION zapp.is_admin_painel()            TO authenticated — d CONTROL/NOOP: DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch, p.proname, pg_get_fu; MANUAL: PRIV GRANT EXECUTE ON FUNCTION zapp.current_user_is_privileged() TO authenticated — down = reverse grant (manual); MANUAL: PRIV GRANT EXECUTE ON FUNCTION zapp.is_admin_painel()           |
| 20260801150000_r25_p1_cron_health_fixes.sql | PASS |  OTHER: ALTER TABLE zapp.instance_registry DROP CONSTRAINT IF EXISTS instance_registry_status_check; CONTROL/NOOP: DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname='; REPLACE_FUNCTION: zapp.fn_archive_old_wpp2_messages replaced prior def — restore old def from  |
| 20260801150001_r25_p1_pk_integrity.sql | MANUAL | no structural DDL — DO $$
BEGIN
  IF to_regclass('evo._evolution_contacts_backup_20260801') IS NOT NULL
     A CONTROL/NOOP: DO $$
BEGIN
  IF to_regclass('evo._evolution_contacts_backup_20260801') IS NOT NULL
     A |
| 20260801150500_r25_p1_rt26_rt27_regression.sql | PASS |  REPLACE_FUNCTION: ops.fn_auth_can_read_front_views replaced prior def — restore old def from git history; MANUAL: PRIV REVOKE ALL ON FUNCTION ops.fn_auth_can_read_front_views() FROM PUBLIC, anon, authenticated — down = reverse grant (manual) |
| 20260801150501_r25_p1_fn_regression_tests_rt26_rt27.sql | PASS |  REPLACE_FUNCTION: ops.fn_regression_tests replaced prior def — restore old def from git history |
| 20260801150600_r25_p1_security_acl_auth_rls_fn_denied.sql | PASS |  REPLACE_FUNCTION: zapp.fn_score_security_acl replaced prior def — restore old def from git history; MANUAL: PRIV REVOKE ALL ON FUNCTION zapp.fn_score_security_acl() FROM PUBLIC, anon, authenticated — down = reverse grant (manual) |
| 20260801171115_r26_resolve_stale_acl_alert_100pct.sql | MANUAL | no structural DDL — DATA UPDATE zapp.security_acl_alerts
SET
  resolved_at = NOW(),
  resolved_by = 'R26-auto: anon_can_execu — down = inverse data op (manual) CONTROL/NOOP: DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM zapp.security_acl_alerts
    WHERE id = 2074
 ; MANUAL: DATA UPDATE zapp.security_acl_alerts
SET
  resolved_at = NOW(),
  resolved_by = 'R26-auto: anon_can_execu — down = inverse data op (manual) |
| 20260801180000_infra01_consolidate_messages_view_triggers.sql | PASS_CASCADE | culprit w/o CASCADE: DROP FUNCTION IF EXISTS zapp.messages_update_trigger(); -> ❌ Erro: cannot drop function messages_update_trigger() because other objects depend on it REPLACE_FUNCTION: zapp.messages_update_trigger replaced prior def — restore old def from git history; MANUAL: PRIV REVOKE EXECUTE ON FUNCTION zapp.messages_update_trigger() FROM PUBLIC — down = reverse grant (manual); MANUAL: PRIV REVOKE EXECUTE ON FUNCTION zapp.messages_update_trigger() FROM authen |
| 20260801184500_r28_fix_health_status_constraint_add_down.sql | PASS |  OTHER: ALTER TABLE zapp.whatsapp_connections
  DROP CONSTRAINT IF EXISTS whatsapp_connections_health_status; CONTROL/NOOP: DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'zapp.w |
| 20260801184600_r28_cleanup_constraint_cron_failure_runid_583822.sql | MANUAL | no structural DDL — DATA DELETE FROM cron.job_run_details
WHERE runid = 583822
  AND status = 'failed'
  AND return_message L — down = inverse data op (manual) CONTROL/NOOP: DO $$
DECLARE v_cnt int;
BEGIN
  SELECT COUNT(*) INTO v_cnt FROM cron.job_run_details
  WH; MANUAL: DATA DELETE FROM cron.job_run_details
WHERE runid = 583822
  AND status = 'failed'
  AND return_message L — down = inverse data op (manual) |
| 20260801185259_r29_grant_execute_security_invoker_views.sql | MANUAL | no structural DDL — PRIV GRANT EXECUTE ON FUNCTION zapp.get_default_workspace_id() TO authenticated — down = reverse grant (manual); PRIV GRANT EXECUTE ON FUNCTION zapp.get_connection_id_for_instance(text) TO authenticat CONTROL/NOOP: DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    ; CONTROL/NOOP: DO $$
DECLARE
  v_missing text[];
BEGIN
  SELECT array_agg(p.proname) INTO v_missing
  FRO; MANUAL: PRIV GRANT EXECUTE ON FUNCTION zapp.get_default_workspace_id() TO authenticated  |
| 20260801185500_r27_security_workspace_isolation_rt28_31.sql | MANUAL | no structural DDL — no structural DDL  |
| 20260801185500_r28c_create_e2e_user_profile.sql | MANUAL | no structural DDL — DO $$
DECLARE
  v_user_id uuid := '5ef9741e-a80f-489f-a6a1-06162737eda6';
  v_profile_id u; SELECT u.email, p.id AS profile_id, p.role, p.is_active
FROM auth.users u
LEFT JOIN zapp.p CONTROL/NOOP: DO $$
DECLARE
  v_user_id uuid := '5ef9741e-a80f-489f-a6a1-06162737eda6';
  v_profile_id u; CONTROL/NOOP: SELECT u.email, p.id AS profile_id, p.role, p.is_active
FROM auth.users u
LEFT JOIN zapp.p |
| 20260801185700_r28d_fix_handle_new_user_agent_stats_wrong_id.sql | PASS_CASCADE | culprit w/o CASCADE: DROP FUNCTION IF EXISTS zapp.handle_new_user(); -> ❌ Erro: cannot drop function handle_new_user() because other objects depend on it REPLACE_FUNCTION: zapp.handle_new_user replaced prior def — restore old def from git history; CONTROL/NOOP: DO $$
DECLARE v_body text;
BEGIN
  SELECT prosrc INTO v_body FROM pg_proc
  WHERE proname=; MANUAL: PRIV REVOKE EXECUTE ON FUNCTION zapp.handle_new_user() FROM PUBLIC — down = reverse grant (m |
| 20260801190000_r27b_reconcile_health_status_fix.sql | MANUAL | no structural DDL — no structural DDL  |
| 20260801194500_r27_audit_gap_fix_rt32.sql | MANUAL | no structural DDL — no structural DDL  |
| 20260801200000_infra01_v2_trigger_body_fixes.sql | PASS_CASCADE | culprit w/o CASCADE: DROP FUNCTION IF EXISTS zapp.messages_update_trigger(); -> ❌ Erro: cannot drop function messages_update_trigger() because other objects depend on it REPLACE_FUNCTION: zapp.messages_update_trigger replaced prior def — restore old def from git history; MANUAL: PRIV REVOKE EXECUTE ON FUNCTION zapp.messages_update_trigger() FROM PUBLIC — down = reverse grant (manual); MANUAL: PRIV REVOKE EXECUTE ON FUNCTION zapp.messages_update_trigger() FROM authen |
| 20260801200000_r27_deep_audit_p0_gaps_rt33.sql | MANUAL | no structural DDL — no structural DDL  |
| 20260801210000_rls_consolidated_production_sync.sql | PASS |  CONTROL/NOOP: DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION zapp.rpc_dispatch_error_stats(p_hours integer) FR; MANUAL: DROP FUNCTION DROP FUNCTION IF EXISTS zapp.rpc_insert_message(text, text, text, boolean, text, text, tex — down = re-create (def in git history); MANUAL: PRIV GRANT EXECUTE ON FUNCTION z |
| 20260802000001_financeiro_auth_guards.sql | MANUAL | no structural DDL — DO $$
DECLARE
  v_count INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace ; DO $$
DECLARE
  v_rec       RECORD;
  v_def       TEXT;
  v_new_def   TEXT;
  v_guard     ; DO $$
DECLARE
   CONTROL/NOOP: DO $$
DECLARE
  v_count INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace ; CONTROL/NOOP: DO $$
DECLARE
  v_rec       RECORD;
  v_def       TEXT;
  v_new_def   TEXT;
  v_guard     ; CONTROL/NOOP: DO $$
DECLARE
  v_rec RECORD;
  v_def TEXT;
  v_missing INT := 0;
BEGIN
   |
| 20260802000001_fix_audio_messages_bucket_bug38.sql | MANUAL | no structural DDL — DATA UPDATE storage.buckets
SET    public = true
WHERE  name = 'audio-messages' — down = inverse data op (manual); DATA UPDATE storage.buckets
SET    allowed_mime_types = ARRAY[
         'audio/ogg',
 CONTROL/NOOP: BEGIN; CONTROL/NOOP: DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE  schemaname = 'stora; CONTROL/NOOP: DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE  schemaname = 'stora; CONTROL/NOOP: DO $$
BEGIN
  RAISE NOTICE 'BUG-38: audio-messages bu |
| 20260802000001_r28e_executable_security_fixes.sql | PASS |  CONTROL/NOOP: BEGIN; REPLACE_FUNCTION: public.fn_reconcile_apply replaced prior def — restore old def from git history; CONTROL/NOOP: DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION vendas.fn_listar_bling_tokens() FROM PUBLIC;
  RE; CONTROL/NOOP: DO $$ BEGIN
  REVOKE EXECUTE ON FUNCTION financeiro.apagar_n |
| 20260802000002_fix_rpc_dlq_audit_cursor_grant.sql | MANUAL | no structural DDL — PRIV REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_list_audit_cursor(integer, text, uuid)
  FROM PUBLIC, anon — down = reverse grant (manual); PRIV GRANT EXECUTE ON FUNCTION zapp.rpc_dlq_list_audit_cursor(i MANUAL: PRIV REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_list_audit_cursor(integer, text, uuid)
  FROM PUBLIC, anon — down = reverse grant (manual); MANUAL: PRIV GRANT EXECUTE ON FUNCTION zapp.rpc_dlq_list_audit_cursor(integer, text, uuid)
  TO authenticated — down = reverse grant (manual) |
| 20260802000002_r28f_workspace_isolation_and_security_fixes.sql | PASS |  CONTROL/NOOP: BEGIN; REPLACE_FUNCTION: zapp.bulk_auto_merge_duplicates replaced prior def — restore old def from git history; REPLACE_FUNCTION: zapp.get_contact_360_by_phone replaced prior def — restore old def from git history; REPLACE_FUNCTION: zapp.get_companies_by_phones_batch replaced prior def |
| 20260802000002_realtime_publication_all_gaps.sql | MANUAL | no structural DDL — DO $$
DECLARE
  v_target        RECORD;
  v_schema        TEXT;
  v_table         TEXT;
   CONTROL/NOOP: DO $$
DECLARE
  v_target        RECORD;
  v_schema        TEXT;
  v_table         TEXT;
   |
| 20260802000003_fix_evolution_retry_metrics_realtime.sql | MANUAL | no structural DDL — DO $$
DECLARE
  v_relkind "char";
  v_in_pub  BOOLEAN;
BEGIN
  SELECT c.relkind
    INTO v CONTROL/NOOP: DO $$
DECLARE
  v_relkind "char";
  v_in_pub  BOOLEAN;
BEGIN
  SELECT c.relkind
    INTO v |
| 20260802000003_fix_search_contacts_cursor_v2.sql | PASS |  REPLACE_FUNCTION: zapp.search_contacts_cursor replaced prior def — restore old def from git history; MANUAL: PRIV REVOKE EXECUTE ON FUNCTION zapp.search_contacts_cursor(
  text, text, text, text, text, timestamptz, — down = reverse grant (manual); MANUAL: PRIV GRANT EXECUTE ON FUNCTION zapp.search_c |
| 20260802000004_fix_bug37_edge_function_view_proxies.sql | FAIL | culprit: DROP VIEW IF EXISTS ZAPP.VOICE_CONVERSION_QUEUE; -> ❌ Erro: "voice_conversion_queue" is not a view \| full+CASCADE: ❌ Erro: "voice_conversion_queue" is not a view REPLACE_VIEW: ZAPP.GMAIL_ACCOUNTS replaced prior def — restore old def from git history; REPLACE_VIEW: ZAPP.GMAIL_THREADS replaced prior def — restore old def from git history; REPLACE_VIEW: ZAPP.GMAIL_MESSAGES replaced prior def — restore old def from git history; REPLACE_VIEW: ZAPP.GMAIL_HEALTH_LO |
| 20260802180000_etapa3_jwt_credentials.sql | MANUAL | no structural DDL — ALTER ALTER ROLE authenticated SET statement_timeout = '15s' — down = reverse alter (manual); ALTER ALTER ROLE service_role SET statement_timeout = '60s' — down = reverse alter (manual); ALTER ALTER D MANUAL: ALTER ALTER ROLE authenticated SET statement_timeout = '15s' — down = reverse alter (manual); MANUAL: ALTER ALTER ROLE service_role SET statement_timeout = '60s' — down = reverse alter (manual); MANUAL: ALTER ALTER DATABASE postgres RESET app.settings.jwt_secret — down = reverse alter (manua |
| 20260802181000_etapa4_multi_tenant.sql | PASS_CASCADE | culprit w/o CASCADE: DROP FUNCTION IF EXISTS zapp.get_default_workspace_id(); -> ❌ Erro: cannot drop function get_default_workspace_id() because other objects depend on it REPLACE_FUNCTION: zapp.get_default_workspace_id replaced prior def — restore old def from git history; MANUAL: ALTER ALTER POLICY wconn_insert_auth ON zapp.whatsapp_connections
  WITH CHECK (created_by = auth.uid()) — down = reverse alter (manual) |
| 20260802181500_etapa5_security_definer.sql | MANUAL | no structural DDL — PRIV REVOKE EXECUTE ON FUNCTION public.fn_contacts_proxy_delete() FROM authenticated — down = reverse grant (manual); PRIV REVOKE EXECUTE ON FUNCTION public.fn_contacts_proxy_insert() FROM authenticat MANUAL: PRIV REVOKE EXECUTE ON FUNCTION public.fn_contacts_proxy_delete() FROM authenticated — down = reverse grant (manual); MANUAL: PRIV REVOKE EXECUTE ON FUNCTION public.fn_contacts_proxy_insert() FROM authenticated — down = reverse grant (manual); MANUAL: PRIV REVOKE EXECUTE ON FUNCTION public.f |
| 20260802182000_etapa9_alert_noise.sql | MANUAL | no structural DDL — DATA DELETE FROM evo.evolution_alerts
WHERE resolved = true AND created_at < NOW() - INTERVAL '7 days' — down = inverse data op (manual) CONTROL/NOOP: SELECT cron.schedule(
  'alert-retention-daily',
  '0 4 * * *',
  $$DELETE FROM evo.evolut; MANUAL: DATA DELETE FROM evo.evolution_alerts
WHERE resolved = true AND created_at < NOW() - INTERVAL '7 days' — down = inverse data op (manual) |
| 20260802182500_etapa10_dblink_deadman.sql | MANUAL | no structural DDL — SELECT cron.alter_job(193, command := $$
  INSERT INTO zapp.evolution_guardian_heartbeat ( CONTROL/NOOP: SELECT cron.alter_job(193, command := $$
  INSERT INTO zapp.evolution_guardian_heartbeat ( |
| 20260802183000_etapa6_contacts_view_soft_delete.sql | PASS_CASCADE | culprit w/o CASCADE: DROP FUNCTION IF EXISTS zapp.fn_contacts_view_delete_handler(); -> ❌ Erro: cannot drop function fn_contacts_view_delete_handler() because other objects depend on it REPLACE_FUNCTION: zapp.fn_contacts_view_delete_handler replaced prior def — restore old def from git history |
| 20260802183500_etapa7_contact_rpcs.sql | PASS |  REPLACE_FUNCTION: zapp.add_contact_note replaced prior def — restore old def from git history; REPLACE_FUNCTION: zapp.bulk_soft_delete_contacts replaced prior def — restore old def from git history |
| 20260802184000_etapa12_crons.sql | MANUAL | no structural DDL — SELECT cron.unschedule(198); SELECT cron.alter_job(190, schedule := '0 3 * * *') CONTROL/NOOP: SELECT cron.unschedule(198); CONTROL/NOOP: SELECT cron.alter_job(190, schedule := '0 3 * * *') |
| 20260802193000_etapa7_merge_contacts_implement.sql | PASS |  REPLACE_FUNCTION: zapp.merge_contacts replaced prior def — restore old def from git history |
| 20260802194500_etapa17_search_contacts.sql | PASS |  FUNCTION_UNPARSED: zapp.search_contacts_cursor(...) — sig parse failed |
| 20260802202000_etapa11_drop_legacy_webhook_tables.sql | MANUAL | no structural DDL — DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events CASCADE — down = re-create (def in git history); DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events_wpp2 CASCADE — down = re-crea CONTROL/NOOP: SELECT cron.unschedule(87); MANUAL: DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events CASCADE — down = re-create (def in git history); MANUAL: DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events_wpp2 CASCADE — down = re-create (def in git history); MANUAL: DROP TABL |
| 20260802203000_etapa14_connections.sql | MANUAL | no structural DDL — DATA DELETE FROM evo.evolution_reconcile_jobs
WHERE applied_at < dispatched_at - INTERVAL '1 day' AND app — down = inverse data op (manual) MANUAL: DATA DELETE FROM evo.evolution_reconcile_jobs
WHERE applied_at < dispatched_at - INTERVAL '1 day' AND app — down = inverse data op (manual) |
| 20260802205000_etapa15_onda2_notes.sql | MANUAL | no structural DDL — no structural DDL  |
| 20260802213000_f6-06_fn_alert_wpp2_disconnection_dynamic.sql | PASS |  REPLACE_FUNCTION: zapp.fn_alert_wpp2_disconnection replaced prior def — restore old def from git history; MANUAL: DROP FUNCTION DROP FUNCTION IF EXISTS zapp.fn_alert_wpp2_disconnection() — down = re-create (def in git history) |
| 20260803000000_f4-18_evolution_messages_retry_columns.sql | PASS |   |
| 20260803072000_etapa17_f5_19_intelligence_multinstance.sql | PASS |  REPLACE_FUNCTION: zapp.get_contact_intelligence_by_phone replaced prior def — restore old def from git history |
| 20260803_deprecate_lovable_parity_functions.sql | PASS |  COMMENT: COMMENT ON FUNCTION ops.check_lovable_parity(p_raise boolean) IS
'DEPRECATED (2026-08-03). Mantida p; REPLACE_FUNCTION: ops.check_schema_parity replaced prior def — restore old def from git history; COMMENT: COMMENT ON FUNCTION ops.check_schema_parity(p_raise boolean) IS
'Wrapper (2026-08-0 |
| 20260803_fix_fator_x_db_references.sql | PASS |  REPLACE_FUNCTION: zapp.fn_constraints_reference_pipeline replaced prior def — restore old def from git history; REPLACE_FUNCTION: zapp.fn_snapshot_constraints_reference replaced prior def — restore old def from git history; CONTROL/NOOP: DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_views WHE |
| lgpd_deploy.sql | MANUAL | no structural DDL — DATA TRUNCATE zapp._lgpd_b64 — down = inverse data op (manual); DATA INSERT INTO zapp._lgpd_b64 VALUES (0,
'aW1wb3J0IHsgY3JlYXRlWmFwcEFkbWluQ2xpZW50IH0gZnJvbSAnLi4vX3NoY — down = inverse data op (manu MANUAL: DATA TRUNCATE zapp._lgpd_b64 — down = inverse data op (manual); MANUAL: DATA INSERT INTO zapp._lgpd_b64 VALUES (0,
'aW1wb3J0IHsgY3JlYXRlWmFwcEFkbWluQ2xpZW50IH0gZnJvbSAnLi4vX3NoY — down = inverse data op (manual); MANUAL: DATA COPY (SELECT decode((SELECT data FROM zapp._lgpd_b64 WHERE id=0),  |
