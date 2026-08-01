-- ============================================================================
-- R25 P1-4 — cron_health: corrige os jobs em falha (7 falhas/1h → 0)
-- ----------------------------------------------------------------------------
-- Causas raiz (medidas ao vivo em 2026-08-01 15:00 UTC):
--   1) job 96 sync-instance-registry-status (40 falhas/24h):
--      fn_sync_instance_registry_status() copia wc.status='qr_pending' para
--      instance_registry.status, mas o CHECK instance_registry_status_check
--      não inclui 'qr_pending' (nem 'connecting'/'reconnecting').
--   2) job 88 archive-old-wpp2-messages (1 falha/dia):
--      INSERT INTO evolution_messages_wpp2_archive SELECT * FROM wpp2 — a
--      archive tem 41 colunas, a fonte 48 (faltam reply_to_id, media_bucket,
--      media_path, media_sha256, media_status, transcription_status,
--      transcription).
--   3) job 100 analytics-log-retention (1 falha/dia):
--      public.dblink(text,text) não existe — extensão dblink instalada no
--      schema zapp (Regra CR3: qualificar com schema correto).
--   4) jobs 226-229 disk-*-prune (1 falha/dia cada):
--      VACUUM dentro de comando multi-statement do pg_cron = proibido em
--      transação. Removido do cron (autovacuum cobre).
-- ============================================================================

-- 1) CHECK constraint do instance_registry aceita estados legítimos da Evolution
ALTER TABLE zapp.instance_registry DROP CONSTRAINT instance_registry_status_check;
ALTER TABLE zapp.instance_registry ADD CONSTRAINT instance_registry_status_check
  CHECK (status = ANY (ARRAY['active','inactive','connected','connecting',
    'disconnected','qr_pending','reconnecting','degraded','archived',
    'not_provisioned']));

-- 2) Alinha evolution_messages_wpp2_archive com a fonte (48 colunas)
ALTER TABLE evo.evolution_messages_wpp2_archive
  ADD COLUMN IF NOT EXISTS reply_to_id uuid,
  ADD COLUMN IF NOT EXISTS media_bucket text,
  ADD COLUMN IF NOT EXISTS media_path text,
  ADD COLUMN IF NOT EXISTS media_sha256 text,
  ADD COLUMN IF NOT EXISTS media_status text,
  ADD COLUMN IF NOT EXISTS transcription_status text,
  ADD COLUMN IF NOT EXISTS transcription text;

-- 2b) [achado R25] archive tinha RLS=ON sem policy (deny-all até service_role)
-- → health score security_acl rls_zero_policy=1. Adiciona policy padrão do schema evo.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname='evo' AND tablename='evolution_messages_wpp2_archive'
                   AND policyname='service_role_all') THEN
    CREATE POLICY service_role_all ON evo.evolution_messages_wpp2_archive
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 3) fn_analytics_log_retention: public.dblink → zapp.dblink (schema real da extensão)
CREATE OR REPLACE FUNCTION ops.fn_analytics_log_retention(p_days integer DEFAULT 14)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ops', 'pg_catalog'
AS $function$
DECLARE
  v_conn text := 'host=/var/run/postgresql dbname=_supabase user=postgres';
  v_tbl  text;
  v_result jsonb := '[]'::jsonb;
  v_deleted text;
BEGIN
  FOR v_tbl IN
    SELECT t.relname
    FROM zapp.dblink(
      v_conn::text,
      ($q$SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='_analytics' AND c.relkind='r'
           AND c.relname ~ '^log_events_[0-9a-f_]{36}$'$q$)::text
    ) AS t(relname text)
  LOOP
    -- allowlist estrita: apenas _analytics.log_events_<uuid-com-underscores>
    v_deleted := zapp.dblink_exec(v_conn::text, format(
      $fmt$DELETE FROM _analytics.%I WHERE "timestamp" < (now() at time zone 'utc') - interval '%s days'$fmt$,
      v_tbl, p_days));
    v_result := v_result || jsonb_build_object('table', v_tbl, 'result', v_deleted);
  END LOOP;
  RETURN jsonb_build_object('retention_days', p_days, 'executed_at', now(), 'tables', v_result);
END $function$;

-- 4) Remove VACUUM dos comandos de cron (proibido em transação pg_cron)
SELECT cron.unschedule('disk-log-prune-daily');
SELECT cron.schedule('disk-log-prune-daily', '0 3 * * *',
  $$DELETE FROM ops.host_disk_log WHERE checked_at < now() - interval '30 days';$$);
SELECT cron.unschedule('disk-hires-prune-daily');
SELECT cron.schedule('disk-hires-prune-daily', '15 3 * * *',
  $$SELECT ops.prune_disk_hires();$$);
SELECT cron.unschedule('disk-baseline-prune-weekly');
SELECT cron.schedule('disk-baseline-prune-weekly', '30 3 * * 0',
  $$SELECT ops.prune_disk_baseline();$$);
SELECT cron.unschedule('disk-events-prune-weekly');
SELECT cron.schedule('disk-events-prune-weekly', '45 3 * * 0',
  $$DELETE FROM ops.disk_event_log WHERE ts < now() - interval '90 days';$$);

-- Validação (comentários):
--   SELECT status, count(*) FROM zapp.whatsapp_connections GROUP BY status; -- qr_pending ok
--   SELECT count(*) FROM information_schema.columns
--     WHERE table_schema='evo' AND table_name='evolution_messages_wpp2_archive'; -- 48
--   SELECT count(*) FROM cron.job_run_details WHERE status='failed'
--     AND start_time > now() - interval '1 hour'; -- 0
