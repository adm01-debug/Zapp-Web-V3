-- Lote 9 Fase A (2026-08-16): boundaries de escrita + triggers cruzados zerados + drops de código morto
-- Replay-convergente: aplicado em prod via supabase_db_query em 2026-08-16 00:06 BRT.
-- Efeito: I1 18->11, triggers cruzados zapp<-evo 13->0, I2 mantido 0.
-- Novos contratos: zapp.rpc_boundary_resolve_alert, evo.rpc_boundary_enqueue_media_download, evo.rpc_boundary_ledger_insert.
-- Drops (0 chamadores verificados em prosrc+cron+app+edge+n8n, lição E50):
--   evo.pr_link_msgs_to_conversations, evo.increment_snapshot_version()/(text),
--   3 triggers snapshot em zapp.evolution_contacts (mecanismo sem leitores; state tables preservadas),
--   evo.fn_set_updated_at (trigger repontado para zapp.fn_set_updated_at homônima).

CREATE OR REPLACE FUNCTION zapp.rpc_boundary_resolve_alert(p_alert_type text, p_resolved_by text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'zapp','pg_catalog'
AS $function$
DECLARE v_n integer;
BEGIN
  UPDATE zapp.evolution_alerts SET resolved_at=now(), resolved_by=p_resolved_by
  WHERE alert_type=p_alert_type AND resolved_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;
REVOKE ALL ON FUNCTION zapp.rpc_boundary_resolve_alert(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_boundary_resolve_alert(text,text) TO service_role;

CREATE OR REPLACE FUNCTION evo.rpc_boundary_enqueue_media_download(
  p_message_id text, p_message_uuid uuid, p_remote_jid text, p_instance_name text,
  p_media_type text, p_media_key text, p_direct_path text, p_mimetype text, p_priority integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'evo','pg_catalog'
AS $function$
  INSERT INTO evo.media_download_queue
    (message_id, message_uuid, remote_jid, instance_name, media_type, media_key, direct_path, mimetype, priority, status)
  VALUES (p_message_id, p_message_uuid, p_remote_jid, p_instance_name, p_media_type, p_media_key, p_direct_path, p_mimetype, p_priority, 'pending')
  ON CONFLICT (message_id) DO NOTHING;
$function$;
REVOKE ALL ON FUNCTION evo.rpc_boundary_enqueue_media_download(text,uuid,text,text,text,text,text,text,integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION evo.rpc_boundary_ledger_insert(
  p_instance_name text, p_event_type text, p_message_id text, p_remote_jid text,
  p_message_type text, p_from_me boolean, p_outcome text, p_media_key_seen boolean)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'evo','pg_catalog'
AS $function$
  INSERT INTO evo.ingest_ledger (instance_name, event_type, message_id, remote_jid, message_type, from_me, outcome, media_key_seen)
  VALUES (p_instance_name, p_event_type, p_message_id, p_remote_jid, p_message_type, p_from_me, p_outcome, p_media_key_seen);
$function$;
REVOKE ALL ON FUNCTION evo.rpc_boundary_ledger_insert(text,text,text,text,text,boolean,text,boolean) FROM PUBLIC;

CREATE OR REPLACE FUNCTION evo.fn_auto_apply_lid_mappings()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'evo','ops','pg_catalog'
AS $function$
DECLARE
  v_phonejid_count INT;
  v_pipeline_ok    BOOLEAN;
  v_result         jsonb;
BEGIN
  SELECT contacts_with_phonejid::int INTO v_phonejid_count FROM evo.v_lid_health_scorecard;
  IF v_phonejid_count = 0 THEN
    RETURN jsonb_build_object('action','no_op','reason','V04 não chegou ainda','contacts_with_phonejid',0);
  END IF;
  SELECT pipeline_status = 'HEALTHY' INTO v_pipeline_ok FROM evo.v_production_scorecard;
  IF NOT v_pipeline_ok THEN
    RETURN jsonb_build_object('action','skipped','reason','Pipeline não HEALTHY — aguardar normalização');
  END IF;
  IF EXISTS (SELECT 1 FROM ops.upgrade_execution_log
             WHERE step='auto_apply_lid_mappings' AND status='success'
             AND executed_at > now() - interval '30 minutes') THEN
    RETURN jsonb_build_object('action','skipped','reason','Cooldown 30min ativo');
  END IF;
  v_result := evo.fn_apply_lid_mappings(p_dry_run := false, p_batch := 10000);
  INSERT INTO ops.upgrade_execution_log (step, status, details, executed_by)
  VALUES ('auto_apply_lid_mappings','success',jsonb_build_object('trigger','V04_arrived','contacts_phonejid',v_phonejid_count,'result',v_result),'fn_auto_apply_lid_mappings');
  PERFORM zapp.rpc_boundary_raise_alert('v04_auto_apply_executed','medium','[V04] Auto-apply executado!',
    'fn_apply_lid_mappings rodou automaticamente após detecção de V04. Verificar resultados.',
    jsonb_build_object('contacts_phonejid',v_phonejid_count,'result',v_result,'ts',now()), interval '0');
  RETURN jsonb_build_object('action','applied','contacts_phonejid',v_phonejid_count,'result',v_result);
END;
$function$;

CREATE OR REPLACE FUNCTION evo.fn_check_socket_flapping()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'evo','ops','pg_catalog'
AS $function$
DECLARE
  v_flaps_30m  bigint;
  v_flaps_5m   bigint;
  v_last_state text;
  v_severity   text;
  v_alert_key  text := 'socket_flapping_wpp2';
  v_last_sent  timestamptz;
  v_result     jsonb;
BEGIN
  SELECT COUNT(*) INTO v_flaps_30m FROM evo.evolution_connection_history
  WHERE instance_name='wpp2' AND created_at>=now()-INTERVAL '30 minutes'
    AND state='connecting' AND previous_state IN ('connected','open');

  SELECT COUNT(*) INTO v_flaps_5m FROM evo.evolution_connection_history
  WHERE instance_name='wpp2' AND created_at>=now()-INTERVAL '5 minutes'
    AND state='connecting' AND previous_state IN ('connected','open');

  SELECT state INTO v_last_state FROM evo.evolution_connection_history
  WHERE instance_name='wpp2' ORDER BY created_at DESC LIMIT 1;

  v_result := jsonb_build_object(
    'flaps_30m', v_flaps_30m, 'flaps_5m', v_flaps_5m,
    'last_state', COALESCE(v_last_state,'unknown'), 'checked_at', now());

  IF v_flaps_30m < 5 THEN
    RETURN v_result || jsonb_build_object('action','SKIP','reason','below_threshold');
  END IF;

  IF v_flaps_5m>=10 THEN v_severity:='critical';
  ELSIF v_flaps_30m>=15 THEN v_severity:='high';
  ELSE v_severity:='medium'; END IF;

  SELECT last_sent_at INTO v_last_sent FROM evo.evolution_alert_cooldown WHERE alert_key=v_alert_key;
  IF v_last_sent IS NOT NULL AND v_last_sent > now()-INTERVAL '30 minutes' THEN
    RETURN v_result || jsonb_build_object('action','SUPPRESSED_COOLDOWN');
  END IF;

  PERFORM zapp.rpc_boundary_raise_alert('socket_flapping', v_severity,
    format('[WPP2] Socket flapando: %s em 30min (%s em 5min)',v_flaps_30m,v_flaps_5m),
    format('wpp2: %s transicoes em 30min. ultimo estado: %s',v_flaps_30m,v_last_state),
    v_result, interval '0');

  INSERT INTO evo.evolution_alert_cooldown
    (alert_key,last_severity,last_severity_rank,last_sent_at,updated_at,consecutive_count,cooldown_minutes)
  VALUES(v_alert_key,v_severity,
    CASE v_severity WHEN 'critical' THEN 3 WHEN 'high' THEN 2 ELSE 1 END,
    now(),now(),1,30)
  ON CONFLICT(alert_key) DO UPDATE
    SET last_severity=EXCLUDED.last_severity,
        last_severity_rank=EXCLUDED.last_severity_rank,
        last_sent_at=EXCLUDED.last_sent_at,
        updated_at=EXCLUDED.updated_at,
        consecutive_count=evo.evolution_alert_cooldown.consecutive_count+1,
        cooldown_minutes=30;

  RETURN v_result || jsonb_build_object('action','ALERTED','severity',v_severity);
END;
$function$;

CREATE OR REPLACE FUNCTION evo.fn_lid_convergence_snapshot()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'evo','pg_catalog'
AS $function$
DECLARE
  v_cur  record;
  v_prev record;
  v_delta bigint;
  v_trend text;
BEGIN
  SELECT * INTO v_cur FROM evo.v_lid_convergence_status;

  SELECT fake_jids_real_users INTO v_prev
  FROM evo.lid_convergence_history
  ORDER BY captured_at DESC
  LIMIT 1;

  v_delta := v_cur.fake_jids_real_users - COALESCE(v_prev.fake_jids_real_users, v_cur.fake_jids_real_users);
  v_trend := CASE
    WHEN v_delta > 0 THEN 'GROWING'
    WHEN v_delta < 0 THEN 'SHRINKING'
    ELSE 'STABLE'
  END;

  INSERT INTO evo.lid_convergence_history (
    captured_at, lid_total, snet_total, fake_jids,
    fake_jids_canary, fake_jids_real_users,
    map_size, map_real_entries, map_bootstrap_invalid,
    lid_contacts, contacts_with_phonejid,
    delta_fake_jids, trend
  ) VALUES (
    now(),
    v_cur.lid_total, v_cur.snet_total, v_cur.fake_jids,
    v_cur.fake_jids_canary, v_cur.fake_jids_real_users,
    v_cur.map_size, v_cur.map_real_entries, v_cur.map_bootstrap_invalid,
    v_cur.lid_contacts, v_cur.contacts_with_phonejid,
    v_delta, v_trend
  );

  IF v_trend = 'GROWING' AND v_delta > 10 THEN
    PERFORM zapp.rpc_boundary_raise_alert('lid_fake_jid_regression','high',
      format('LID REGRESSÃO: fake_jids_real_users cresceu +%s', v_delta),
      format('fake_jids_real_users subiu de %s para %s (+%s). Verificar fn_normalize_remote_jid.',
             v_prev.fake_jids_real_users, v_cur.fake_jids_real_users, v_delta),
      jsonb_build_object('delta', v_delta, 'prev', v_prev.fake_jids_real_users,
                         'curr', v_cur.fake_jids_real_users, 'ts', now()),
      interval '2 hours');
  END IF;

  RETURN jsonb_build_object(
    'fake_jids_real_users', v_cur.fake_jids_real_users,
    'delta', v_delta, 'trend', v_trend,
    'map_real_entries', v_cur.map_real_entries,
    'ts', now()
  );
END $function$;

CREATE OR REPLACE FUNCTION evo.fn_lid_upgrade_alert_check()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'evo','ops','pg_catalog'
AS $function$
DECLARE
  v_real         int;
  v_backfill_ok  boolean;
  v_dedup_ok     boolean;
BEGIN
  SELECT map_real_entries::int INTO v_real FROM evo.v_lid_convergence_status;
  IF v_real = 0 THEN RETURN; END IF;
  SELECT EXISTS(
    SELECT 1 FROM ops.upgrade_execution_log
    WHERE step='backfill' AND status='success'
  ) INTO v_backfill_ok;
  SELECT EXISTS(
    SELECT 1 FROM ops.upgrade_execution_log
    WHERE step='dedup' AND status='success'
  ) INTO v_dedup_ok;
  IF v_backfill_ok AND v_dedup_ok THEN
    PERFORM zapp.rpc_boundary_resolve_alert('lid_upgrade_2_4x_detected',
      'fn_lid_upgrade_alert_check:backfill+dedup_complete_s20_fix');
    RETURN;
  END IF;
  PERFORM zapp.rpc_boundary_raise_alert('lid_upgrade_2_4x_detected','medium', NULL,
    format('[LID] Evolution 2.4.x detectado! map_real_entries=%s. AÇÃO: SELECT evo.fn_apply_lid_mappings(p_dry_run:=true)', v_real),
    jsonb_build_object(
      'map_real_entries', v_real,
      'backfill_done', v_backfill_ok,
      'dedup_done', v_dedup_ok,
      'next_step_1', 'SELECT evo.fn_apply_lid_mappings(p_dry_run:=true)',
      'next_step_2', 'SELECT evo.fn_apply_lid_mappings(p_dry_run:=false, p_batch:=10000)',
      'next_step_3', 'SELECT evo.fn_prepare_lid_dedup(p_dry_run:=false)'
    ),
    interval '100 years');
END;
$function$;

CREATE OR REPLACE FUNCTION evo.fn_retention_webhook_partitions(p_dry_run boolean DEFAULT true, p_retain_months integer DEFAULT 3)
 RETURNS TABLE(partition_name text, size_pretty text, row_count bigint, action text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'evo','public','pg_catalog'
AS $function$
DECLARE
  r RECORD; v_cutoff DATE; v_part_date DATE; v_suffix TEXT; v_rows BIGINT;
BEGIN
  v_cutoff := date_trunc('month', now()) - (p_retain_months||' months')::interval;
  FOR r IN
    SELECT c.relname AS pname, pg_total_relation_size(c.oid) AS sz
    FROM pg_inherits i
    JOIN pg_class c ON c.oid=i.inhrelid JOIN pg_class p ON p.oid=i.inhparent
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE p.relname='evolution_webhook_events_v2' AND n.nspname='evo' AND c.relname ~ '_\d{4}_\d{2}$'
  LOOP
    v_suffix := substring(r.pname FROM '_(\d{4}_\d{2})$');
    v_part_date := to_date(replace(v_suffix,'_','-')||'-01','YYYY-MM-DD');
    IF v_part_date < v_cutoff THEN
      EXECUTE format('SELECT count(*) FROM evo.%I', r.pname) INTO v_rows;
      partition_name := r.pname; size_pretty := pg_size_pretty(r.sz); row_count := v_rows;
      IF p_dry_run THEN
        action := format('DRY_RUN: %s (data %s < cutoff %s)', r.pname, v_part_date, v_cutoff);
      ELSE
        EXECUTE format('ALTER TABLE evo.evolution_webhook_events_v2 DETACH PARTITION evo.%I CONCURRENTLY', r.pname);
        EXECUTE format('DROP TABLE evo.%I', r.pname);
        action := 'DETACHED_AND_DROPPED';
        PERFORM zapp.rpc_boundary_raise_alert('retention_drop','info',
          format('Partição %s removida', r.pname),
          format('Liberado: %s. Política: %s meses.', size_pretty, p_retain_months),
          jsonb_build_object('partition', r.pname, 'size_pretty', size_pretty),
          interval '0');
      END IF;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$function$;

ALTER FUNCTION evo.fn_auto_enqueue_media_download() SET SCHEMA zapp;
CREATE OR REPLACE FUNCTION zapp.fn_auto_enqueue_media_download()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'zapp','pg_catalog'
AS $function$
DECLARE v_media_key text; v_direct_path text; v_mimetype text; v_msg_subkey text; v_needs_download boolean;
BEGIN
  v_msg_subkey := CASE WHEN NEW.message_type IN ('image','imageMessage') THEN 'imageMessage'
    WHEN NEW.message_type IN ('video','videoMessage') THEN 'videoMessage'
    WHEN NEW.message_type IN ('ptvMessage') THEN 'ptvMessage'
    WHEN NEW.message_type IN ('audio','ptt','audioMessage') THEN 'audioMessage'
    WHEN NEW.message_type IN ('document','documentMessage') THEN 'documentMessage'
    WHEN NEW.message_type IN ('sticker','stickerMessage') THEN 'stickerMessage'
    ELSE NULL END;
  IF v_msg_subkey IS NULL THEN RETURN NEW; END IF;
  v_needs_download := (NEW.media_url IS NULL OR NEW.media_url='' OR NEW.media_url LIKE '%kong%' OR NEW.media_url LIKE '%mmg.whatsapp.net%' OR NEW.media_url LIKE '%.enc%');
  IF NOT v_needs_download THEN RETURN NEW; END IF;
  IF NEW.media_meta IS NOT NULL AND NEW.media_meta->>'mediaKey' IS NOT NULL THEN
    v_media_key := NEW.media_meta->>'mediaKey'; v_direct_path := NEW.media_meta->>'directPath'; v_mimetype := NEW.media_meta->>'mimetype';
  ELSIF NEW.ingest_meta IS NOT NULL AND NEW.ingest_meta->>'mediaKey' IS NOT NULL THEN
    v_media_key := NEW.ingest_meta->>'mediaKey'; v_direct_path := NEW.ingest_meta->>'directPath'; v_mimetype := NEW.ingest_meta->>'mimetype';
  ELSIF NEW.raw_data IS NOT NULL AND NEW.raw_data::text LIKE '%mediaKey%' THEN
    v_media_key := NEW.raw_data->'message'->v_msg_subkey->>'mediaKey'; v_direct_path := NEW.raw_data->'message'->v_msg_subkey->>'directPath'; v_mimetype := NEW.raw_data->'message'->v_msg_subkey->>'mimetype';
  END IF;
  IF NEW.message_id IS NOT NULL THEN
    PERFORM evo.rpc_boundary_enqueue_media_download(
      NEW.message_id, NEW.id, NEW.remote_jid, NEW.instance_name, NEW.message_type,
      v_media_key, v_direct_path, v_mimetype,
      CASE WHEN v_media_key IS NOT NULL THEN 10 ELSE 5 END);
  END IF;
  RETURN NEW;
END;
$function$;

ALTER FUNCTION evo.fn_ledger_from_insert() SET SCHEMA zapp;
CREATE OR REPLACE FUNCTION zapp.fn_ledger_from_insert()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'zapp','pg_catalog'
AS $function$
BEGIN
  BEGIN
    PERFORM evo.rpc_boundary_ledger_insert(
      NEW.instance_name, 'messages.upsert', NEW.message_id, NEW.remote_jid,
      NEW.message_type, NEW.from_me, 'inserted', (NEW.ingest_meta->>'mediaKey') IS NOT NULL);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- fire-and-forget: nunca bloqueia a ingestão
  END;
  RETURN NEW;
END;
$function$;

ALTER FUNCTION evo.fn_block_internal_media_url() SET SCHEMA zapp;
ALTER FUNCTION zapp.fn_block_internal_media_url() SET search_path TO 'zapp','pg_catalog';
ALTER FUNCTION evo.fn_enforce_direction() SET SCHEMA zapp;
ALTER FUNCTION zapp.fn_enforce_direction() SET search_path TO 'zapp','pg_catalog';

DROP TRIGGER trg_evolution_groups_updated_at ON zapp.evolution_groups;
CREATE TRIGGER trg_evolution_groups_updated_at BEFORE UPDATE ON zapp.evolution_groups
FOR EACH ROW EXECUTE FUNCTION zapp.fn_set_updated_at();
DROP FUNCTION evo.fn_set_updated_at();

DROP TRIGGER trigger_snapshot_version_update ON zapp.evolution_contacts;
DROP TRIGGER trigger_snapshot_version_delete ON zapp.evolution_contacts;
DROP TRIGGER trigger_snapshot_version_insert ON zapp.evolution_contacts;
DROP FUNCTION evo.increment_snapshot_version();
DROP FUNCTION evo.increment_snapshot_version(text);

DROP PROCEDURE evo.pr_link_msgs_to_conversations(integer);

DO $guard$
DECLARE v_bad int; v_trg int;
BEGIN
  SELECT count(*) INTO v_bad FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='evo' AND p.proname IN ('fn_auto_apply_lid_mappings','fn_check_socket_flapping','fn_lid_convergence_snapshot','fn_lid_upgrade_alert_check','fn_retention_webhook_partitions')
    AND regexp_replace(p.prosrc,'zapp\.rpc_boundary_[a-z_]+','','g') ~* '\mzapp\.';
  IF v_bad>0 THEN RAISE EXCEPTION 'swap incompleto: % fns evo ainda citam zapp', v_bad; END IF;

  SELECT count(*) INTO v_bad FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='zapp' AND p.proname IN ('fn_auto_enqueue_media_download','fn_ledger_from_insert','fn_block_internal_media_url','fn_enforce_direction')
    AND regexp_replace(p.prosrc,'evo\.(rpc_boundary_[a-z_]+)','','g') ~* '\mevo\.';
  IF v_bad>0 THEN RAISE EXCEPTION 'trigger fns zapp citam evo fora do boundary: %', v_bad; END IF;

  SELECT count(*) INTO v_trg FROM pg_trigger t
  JOIN pg_class tc ON tc.oid=t.tgrelid JOIN pg_namespace tn ON tn.oid=tc.relnamespace
  JOIN pg_proc fp ON fp.oid=t.tgfoid JOIN pg_namespace fn2 ON fn2.oid=fp.pronamespace
  WHERE NOT t.tgisinternal AND tn.nspname='zapp' AND fn2.nspname='evo';
  IF v_trg>0 THEN RAISE EXCEPTION 'ainda ha % triggers cruzados zapp<-evo', v_trg; END IF;
END $guard$;
