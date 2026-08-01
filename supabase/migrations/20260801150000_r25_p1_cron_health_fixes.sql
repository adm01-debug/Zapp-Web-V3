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
<<<<<<< Updated upstream
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
=======
--      archive tinha 41 colunas, a fonte 48. Alinhada abaixo + job reescrito
--      com lista explícita de colunas (C1 R25: SELECT * é posicional).
--   3) job 100 analytics-log-retention (1 falha/dia):
--      public.dblink(text,text) não existe — extensão dblink instalada no
--      schema zapp. Fix + REVOKE PUBLIC + validação p_days (S1 R25).
--   4) jobs 226-229 disk-*-prune (1 falha/dia cada):
--      VACUUM dentro de comando multi-statement do pg_cron = proibido em
--      transação. Removido do cron (autovacuum cobre).
-- Reexecutável (B3/B4 R25): cron.unschedule por nome removido (schedule é
-- upsert); DROP CONSTRAINT IF EXISTS.
-- ============================================================================

-- 1) CHECK constraint do instance_registry aceita estados legítimos da Evolution
ALTER TABLE zapp.instance_registry DROP CONSTRAINT IF EXISTS instance_registry_status_check;
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
-- 3) fn_analytics_log_retention: public.dblink → zapp.dblink (schema real da extensão)
=======
-- 2c) [C1 R25] job 88 reescrito com lista EXPLÍCITA de colunas (SELECT * era
-- posicional — a archive pode divergir em ordem/attnum por colunas dropadas).
CREATE OR REPLACE FUNCTION zapp.fn_archive_old_wpp2_messages(p_months_old integer DEFAULT 12, p_batch_size integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo'
AS $function$
DECLARE
  v_safe_months    INT := GREATEST(p_months_old, 12);
  v_cutoff         TIMESTAMPTZ := date_trunc('month', now()) - (v_safe_months || ' months')::interval;
  v_already_in_arc INT; v_newly_archived INT; v_deleted INT;
BEGIN
  SELECT count(*) INTO v_already_in_arc
  FROM (SELECT id,instance_name FROM evo.evolution_messages_wpp2 WHERE created_at < v_cutoff ORDER BY created_at ASC LIMIT p_batch_size) b
  WHERE EXISTS(SELECT 1 FROM evo.evolution_messages_wpp2_archive a WHERE a.id=b.id AND a.instance_name=b.instance_name);

  WITH batch AS (SELECT * FROM evo.evolution_messages_wpp2 WHERE created_at < v_cutoff ORDER BY created_at ASC LIMIT p_batch_size)
  INSERT INTO evo.evolution_messages_wpp2_archive
    (id, message_id, remote_jid, from_me, message_type, content, media_url,
     media_mimetype, quoted_message_id, is_starred, is_important, category,
     sentiment, tags, notes, follow_up_at, follow_up_done, payload, created_at,
     contact_id, conversation_id, direction, status, status_at, caption,
     media_filename, media_size, sent_by_bot, template_name, instance_name,
     push_name, media_type, raw_data, deleted_at, edited_at, updated_at,
     media_meta, audio_meme_id, sticker_id, link_preview, is_read, reply_to_id,
     media_bucket, media_path, media_sha256, media_status, transcription_status,
     transcription)
  SELECT id, message_id, remote_jid, from_me, message_type, content, media_url,
     media_mimetype, quoted_message_id, is_starred, is_important, category,
     sentiment, tags, notes, follow_up_at, follow_up_done, payload, created_at,
     contact_id, conversation_id, direction, status, status_at, caption,
     media_filename, media_size, sent_by_bot, template_name, instance_name,
     push_name, media_type, raw_data, deleted_at, edited_at, updated_at,
     media_meta, audio_meme_id, sticker_id, link_preview, is_read, reply_to_id,
     media_bucket, media_path, media_sha256, media_status, transcription_status,
     transcription
  FROM batch
  ON CONFLICT (id,instance_name) DO NOTHING;
  GET DIAGNOSTICS v_newly_archived = ROW_COUNT;

  WITH td AS (SELECT m.id,m.instance_name FROM evo.evolution_messages_wpp2 m WHERE m.created_at < v_cutoff ORDER BY m.created_at ASC LIMIT p_batch_size)
  DELETE FROM evo.evolution_messages_wpp2 WHERE (id,instance_name) IN (
    SELECT t.id,t.instance_name FROM td t WHERE EXISTS(SELECT 1 FROM evo.evolution_messages_wpp2_archive a WHERE a.id=t.id AND a.instance_name=t.instance_name)
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'newly_archived',v_newly_archived,'already_in_archive',v_already_in_arc,
    'total_moved',v_newly_archived+v_already_in_arc,'deleted_from_source',v_deleted,
    'cutoff_date',v_cutoff,'months_old_requested',p_months_old,
    'months_old_applied',v_safe_months,'batch_size',p_batch_size,'ts',now()
  );
END; $function$;

-- 3) fn_analytics_log_retention: public.dblink → zapp.dblink + p_days validado
--    + sem EXECUTE para PUBLIC/anon/authenticated (S1 R25)
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
=======
  IF p_days IS NULL OR p_days < 1 THEN
    RAISE EXCEPTION 'fn_analytics_log_retention: p_days invalido: %', p_days;
  END IF;
>>>>>>> Stashed changes
  FOR v_tbl IN
    SELECT t.relname
    FROM zapp.dblink(
      v_conn::text,
      ($q$SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='_analytics' AND c.relkind='r'
           AND c.relname ~ '^log_events_[0-9a-f_]{36}$'$q$)::text
    ) AS t(relname text)
  LOOP
<<<<<<< Updated upstream
    -- allowlist estrita: apenas _analytics.log_events_<uuid-com-underscores>
=======
>>>>>>> Stashed changes
    v_deleted := zapp.dblink_exec(v_conn::text, format(
      $fmt$DELETE FROM _analytics.%I WHERE "timestamp" < (now() at time zone 'utc') - interval '%s days'$fmt$,
      v_tbl, p_days));
    v_result := v_result || jsonb_build_object('table', v_tbl, 'result', v_deleted);
  END LOOP;
  RETURN jsonb_build_object('retention_days', p_days, 'executed_at', now(), 'tables', v_result);
END $function$;

<<<<<<< Updated upstream
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
=======
REVOKE ALL ON FUNCTION ops.fn_analytics_log_retention(integer) FROM PUBLIC, anon, authenticated;

-- 4) Remove VACUUM dos comandos de cron (proibido em transação pg_cron).
--    cron.schedule com o mesmo jobname é upsert — não precisa unschedule (B3).
SELECT cron.schedule('disk-log-prune-daily', '0 3 * * *',
  $$DELETE FROM ops.host_disk_log WHERE checked_at < now() - interval '30 days';$$);
SELECT cron.schedule('disk-hires-prune-daily', '15 3 * * *',
  $$SELECT ops.prune_disk_hires();$$);
SELECT cron.schedule('disk-baseline-prune-weekly', '30 3 * * 0',
  $$SELECT ops.prune_disk_baseline();$$);
>>>>>>> Stashed changes
SELECT cron.schedule('disk-events-prune-weekly', '45 3 * * 0',
  $$DELETE FROM ops.disk_event_log WHERE ts < now() - interval '90 days';$$);

-- Validação (comentários):
--   SELECT status, count(*) FROM zapp.whatsapp_connections GROUP BY status; -- qr_pending ok
--   SELECT count(*) FROM information_schema.columns
--     WHERE table_schema='evo' AND table_name='evolution_messages_wpp2_archive'; -- 48
--   SELECT count(*) FROM cron.job_run_details WHERE status='failed'
--     AND start_time > now() - interval '1 hour'; -- 0
<<<<<<< Updated upstream
=======
--   SELECT has_function_privilege('PUBLIC','ops.fn_analytics_log_retention(integer)','EXECUTE'); -- false
>>>>>>> Stashed changes
