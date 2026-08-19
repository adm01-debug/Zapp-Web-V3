-- ============================================================================
-- REPLAY CONVERGENTE — Lote 9 Fase C (aplicada em prod 2026-08-16 07:35-07:37
-- BRT, transacao unica com guard + fix T09 em seguida). Convencao no 250008.
-- Efeito: I1 8->4 (cluster LID inteiro sai da contagem). I2 mantido 0.
--
-- Desenho: fn_apply_lid_mappings tinha 3 callers evo + cron 483 (DO block) —
-- move-la para zapp criaria I1 novo em cada caller. Solucao: o corpo virou
-- zapp.rpc_boundary_apply_lid_mappings (escreve 4 tabelas zapp = servico do
-- zapp; le o mapa via public.evo_lid_phone_map) e evo.fn_apply_lid_mappings
-- virou thin wrapper whitelisted. Callers e cron intactos (zero churn).
--
-- Suites/report ficam em evo (escrevem evo.lid_phone_map/e2e_probe_results em
-- testes); refs zapp viram boundaries (normalize_send_jid, system_health_score)
-- ou views public. INCIDENTE corrigido na sessao: public.contact_intelligence
-- NAO e espelho fiel de zapp.contact_intelligence (a coluna phone vem de
-- zapp.contacts via LEFT JOIN) — o T09 da regression passou a medir outra coisa
-- e falhou com 7127. Fix: view espelho public.zapp_contact_intelligence
-- (SELECT * 1:1) e T09 repontado. Regression voltou a 16/17 (unico FAIL = T12
-- score 9, pre-existente desde 04h, nao relacionado ao lote).
-- ============================================================================

-- C0. View espelho fiel para o T09 (padrao public.zapp_* ja existente)
CREATE OR REPLACE VIEW public.zapp_contact_intelligence WITH (security_invoker = on) AS
  SELECT * FROM zapp.contact_intelligence;
GRANT SELECT ON public.zapp_contact_intelligence TO service_role;

-- C1. Boundary: normalizacao de JID (servico zapp exposto ao evo)
CREATE OR REPLACE FUNCTION zapp.rpc_boundary_normalize_send_jid(p_jid text, p_instance text DEFAULT 'wpp2')
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'zapp', 'pg_catalog'
AS $fn$ SELECT zapp.fn_normalize_send_jid(p_jid, p_instance) $fn$;
REVOKE ALL ON FUNCTION zapp.rpc_boundary_normalize_send_jid(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_boundary_normalize_send_jid(text,text) TO service_role;

-- C2. Boundary: health score do sistema zapp
CREATE OR REPLACE FUNCTION zapp.rpc_boundary_system_health_score()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path TO 'zapp', 'pg_catalog'
AS $fn$ SELECT zapp.fn_system_health_score() $fn$;
REVOKE ALL ON FUNCTION zapp.rpc_boundary_system_health_score() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_boundary_system_health_score() TO service_role;

-- C3. Boundary: aplicar LID mappings (corpo integral do antigo evo.fn_apply_lid_mappings,
-- com evo.lid_phone_map -> public.evo_lid_phone_map em todas as 9 ocorrencias)
CREATE OR REPLACE FUNCTION zapp.rpc_boundary_apply_lid_mappings(p_dry_run boolean DEFAULT true, p_batch integer DEFAULT 10000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE
  v_convs_fixed      INT := 0;
  v_msgs_fixed       INT := 0;
  v_contacts_fixed   INT := 0;
  v_fake_fixed       INT := 0;
  v_noop_entries     INT := 0;
BEGIN
  SELECT count(*) INTO v_noop_entries
  FROM public.evo_lid_phone_map
  WHERE confidence IN ('none', 'bootstrap_invalid');

  IF NOT p_dry_run THEN
    WITH mappings AS (
      SELECT lid_jid, phone_number || '@s.whatsapp.net' AS phone_jid
      FROM public.evo_lid_phone_map
      WHERE phone_number IS NOT NULL
        AND confidence IN ('high', 'medium', 'low')
        AND phone_number <> split_part(lid_jid, '@', 1)
    )
    UPDATE zapp.evolution_conversations_wpp2 c
    SET remote_jid = m.phone_jid
    FROM mappings m
    WHERE c.remote_jid = m.lid_jid
      AND c.remote_jid LIKE '%@lid'
      AND NOT EXISTS (
        SELECT 1 FROM zapp.evolution_conversations_wpp2 c2
        WHERE c2.remote_jid = m.phone_jid AND c2.instance_name = c.instance_name
      );
    GET DIAGNOSTICS v_convs_fixed = ROW_COUNT;

    WITH mappings AS (
      SELECT lid_jid, phone_number || '@s.whatsapp.net' AS phone_jid
      FROM public.evo_lid_phone_map
      WHERE phone_number IS NOT NULL
        AND confidence IN ('high', 'medium', 'low')
        AND phone_number <> split_part(lid_jid, '@', 1)
      LIMIT p_batch
    )
    UPDATE zapp.evolution_messages m
    SET remote_jid = mp.phone_jid, updated_at = now()
    FROM mappings mp
    WHERE m.remote_jid = mp.lid_jid
      AND m.remote_jid LIKE '%@lid';
    GET DIAGNOSTICS v_msgs_fixed = ROW_COUNT;

    UPDATE zapp.evolution_contacts c
    SET phone_number = m.phone_number, updated_at = now()
    FROM public.evo_lid_phone_map m
    WHERE c.remote_jid = m.lid_jid
      AND m.phone_number IS NOT NULL
      AND m.confidence IN ('high', 'medium', 'low')
      AND m.phone_number <> split_part(m.lid_jid, '@', 1)
      AND (c.phone_number IS NULL
           OR c.phone_number = split_part(c.remote_jid, '@', 1));
    GET DIAGNOSTICS v_contacts_fixed = ROW_COUNT;

    WITH fake_mappings AS (
      SELECT
        split_part(lm.lid_jid, '@', 1) || '@s.whatsapp.net' AS fake_jid,
        lm.phone_number || '@s.whatsapp.net' AS real_jid
      FROM public.evo_lid_phone_map lm
      WHERE lm.phone_number IS NOT NULL
        AND lm.confidence IN ('high', 'medium', 'low')
        AND lm.phone_number <> split_part(lm.lid_jid, '@', 1)
      LIMIT p_batch
    )
    UPDATE zapp.evolution_messages_wpp2 m
    SET remote_jid = fm.real_jid
    FROM fake_mappings fm
    WHERE m.remote_jid = fm.fake_jid
      AND m.remote_jid ~ '^[0-9]{14,}@s\.whatsapp\.net$';
    GET DIAGNOSTICS v_fake_fixed = ROW_COUNT;

  ELSE
    SELECT count(*) INTO v_convs_fixed
    FROM zapp.evolution_conversations_wpp2 c
    JOIN public.evo_lid_phone_map m ON c.remote_jid = m.lid_jid
    WHERE c.remote_jid LIKE '%@lid'
      AND m.phone_number IS NOT NULL
      AND m.confidence IN ('high', 'medium', 'low')
      AND m.phone_number <> split_part(m.lid_jid, '@', 1)
      AND NOT EXISTS (
        SELECT 1 FROM zapp.evolution_conversations_wpp2 c2
        WHERE c2.remote_jid = m.phone_number || '@s.whatsapp.net'
          AND c2.instance_name = c.instance_name
      );

    SELECT count(*) INTO v_msgs_fixed
    FROM zapp.evolution_messages msg
    JOIN public.evo_lid_phone_map mp ON msg.remote_jid = mp.lid_jid
    WHERE msg.remote_jid LIKE '%@lid'
      AND mp.phone_number IS NOT NULL
      AND mp.confidence IN ('high', 'medium', 'low')
      AND mp.phone_number <> split_part(mp.lid_jid, '@', 1);

    SELECT count(*) INTO v_fake_fixed
    FROM zapp.evolution_messages_wpp2 m
    JOIN public.evo_lid_phone_map lm ON
      m.remote_jid = split_part(lm.lid_jid, '@', 1) || '@s.whatsapp.net'
    WHERE m.remote_jid ~ '^[0-9]{14,}@s\.whatsapp\.net$'
      AND lm.phone_number IS NOT NULL
      AND lm.confidence IN ('high', 'medium', 'low')
      AND lm.phone_number <> split_part(lm.lid_jid, '@', 1);
  END IF;

  RETURN jsonb_build_object(
    'dry_run',             p_dry_run,
    'convs_would_fix',     v_convs_fixed,
    'msgs_would_fix',      v_msgs_fixed,
    'contacts_would_fix',  v_contacts_fixed,
    'fake_jids_would_fix', v_fake_fixed,
    'map_total',           (SELECT count(*) FROM public.evo_lid_phone_map),
    'map_real_phone',      (SELECT count(*) FROM public.evo_lid_phone_map
                            WHERE phone_number IS NOT NULL
                              AND confidence IN ('high','medium','low')
                              AND phone_number <> split_part(lid_jid,'@',1)),
    'map_invalid_noop',    v_noop_entries,
    'note',                'v2 — inclui correção de fake @s.whatsapp.net JIDs (passo 4)',
    'ts',                  now()
  );
END
$function$;
REVOKE ALL ON FUNCTION zapp.rpc_boundary_apply_lid_mappings(boolean,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_boundary_apply_lid_mappings(boolean,integer) TO service_role;

-- C4. evo.fn_apply_lid_mappings vira thin wrapper (callers evo + cron 483 intactos)
CREATE OR REPLACE FUNCTION evo.fn_apply_lid_mappings(p_dry_run boolean DEFAULT true, p_batch integer DEFAULT 10000)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER
SET search_path TO 'evo', 'pg_catalog'
AS $fn$ SELECT zapp.rpc_boundary_apply_lid_mappings(p_dry_run, p_batch) $fn$;

-- C5. passive_lid_accumulator: Fonte 1 le public.evolution_contacts (view backcompat fiel -> zapp)
CREATE OR REPLACE FUNCTION evo.fn_passive_lid_accumulator(p_lookback_hours integer DEFAULT 24)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
DECLARE
  v_inserted INT := 0;
  v_n1 INT := 0; v_n2 INT := 0; v_n3 INT := 0;
BEGIN
  -- Fonte 1: evolution_contacts com raw_data.phoneJid (sinal real Baileys)
  -- LOTE9-C 2026-08-16: leitura via public.evolution_contacts (view backcompat -> zapp)
  INSERT INTO evo.lid_phone_map (lid_jid, instance_name, phone_jid, phone_number, confidence, source, raw_signal)
  SELECT DISTINCT
    c.remote_jid,
    c.instance_name,
    (c.raw_data->>'phoneJid'),
    replace((c.raw_data->>'phoneJid'), '@s.whatsapp.net', ''),
    'high', 'contacts_raw_data', c.raw_data
  FROM public.evolution_contacts c
  WHERE c.remote_jid LIKE '%@lid'
    AND c.raw_data ? 'phoneJid'
    AND (c.raw_data->>'phoneJid') LIKE '%@s.whatsapp.net'
    AND c.updated_at > now() - (p_lookback_hours || ' hours')::INTERVAL
  ON CONFLICT (lid_jid, instance_name) DO UPDATE SET
    phone_jid    = EXCLUDED.phone_jid,
    phone_number = EXCLUDED.phone_number,
    confidence   = 'high',
    source       = EXCLUDED.source,
    raw_signal   = EXCLUDED.raw_signal,
    updated_at   = now()
  WHERE lid_phone_map.phone_number IS NULL
     OR lid_phone_map.confidence IN ('none', 'bootstrap_invalid');
  GET DIAGNOSTICS v_n1 = ROW_COUNT;

  -- Fonte 2: evolution_webhook_events_v2 contacts.upsert com phoneJid
  INSERT INTO evo.lid_phone_map (lid_jid, instance_name, phone_jid, phone_number, confidence, source, raw_signal)
  SELECT DISTINCT
    payload->>'remoteJid',
    COALESCE(payload->>'instanceName', instance_name, 'wpp2'),
    payload->>'phoneJid',
    replace(COALESCE(payload->>'phoneJid',''), '@s.whatsapp.net', ''),
    'high', 'webhook_contacts_upsert', payload
  FROM evo.evolution_webhook_events_v2
  WHERE event_type IN ('contacts.upsert','CONTACTS_UPSERT')
    AND (payload->>'remoteJid') LIKE '%@lid'
    AND (payload->>'phoneJid') LIKE '%@s.whatsapp.net'
    AND replace(COALESCE(payload->>'phoneJid',''), '@s.whatsapp.net', '')
        <> split_part(payload->>'remoteJid', '@', 1)
    AND created_at > now() - (p_lookback_hours || ' hours')::INTERVAL
  ON CONFLICT (lid_jid, instance_name) DO UPDATE SET
    phone_jid    = EXCLUDED.phone_jid,
    phone_number = EXCLUDED.phone_number,
    confidence   = 'high',
    source       = 'webhook_contacts_upsert',
    updated_at   = now()
  WHERE lid_phone_map.confidence IN ('none', 'bootstrap_invalid')
     OR lid_phone_map.phone_number IS NULL;
  GET DIAGNOSTICS v_n2 = ROW_COUNT;

  -- Fonte 3: participantes de grupos com participantAlt (novo Baileys 7.x)
  INSERT INTO evo.lid_phone_map (lid_jid, instance_name, phone_jid, phone_number, confidence, source, raw_signal)
  SELECT DISTINCT
    participant_lid,
    COALESCE(payload->>'instanceName', 'wpp2'),
    participant_pn,
    replace(participant_pn, '@s.whatsapp.net', ''),
    'high', 'webhook_group_participants_alt', payload
  FROM evo.evolution_webhook_events_v2,
  LATERAL (
    SELECT
      jsonb_array_elements_text(payload->'participants') AS participant_lid,
      jsonb_array_elements_text(payload->'participantsAlt') AS participant_pn
  ) p
  WHERE event_type IN ('group-participants.update','GROUP_PARTICIPANTS_UPDATE')
    AND payload ? 'participantsAlt'
    AND participant_lid LIKE '%@lid'
    AND participant_pn LIKE '%@s.whatsapp.net'
    AND replace(participant_pn, '@s.whatsapp.net', '') <> split_part(participant_lid, '@', 1)
    AND created_at > now() - (p_lookback_hours || ' hours')::INTERVAL
  ON CONFLICT (lid_jid, instance_name) DO UPDATE SET
    phone_jid    = EXCLUDED.phone_jid,
    phone_number = EXCLUDED.phone_number,
    confidence   = 'high',
    source       = EXCLUDED.source,
    updated_at   = now()
  WHERE lid_phone_map.confidence IN ('none', 'bootstrap_invalid')
     OR lid_phone_map.phone_number IS NULL;
  GET DIAGNOSTICS v_n3 = ROW_COUNT;

  v_inserted := v_n1 + v_n2 + v_n3;

  RETURN jsonb_build_object(
    'inserted_or_updated',       v_inserted,
    'from_contacts_raw_data',    v_n1,
    'from_webhook_events',       v_n2,
    'from_group_participants',   v_n3,
    'map_total',                 (SELECT count(*) FROM evo.lid_phone_map),
    'map_real_entries',          (SELECT count(*) FROM evo.lid_phone_map WHERE confidence IN ('high','medium','low') AND phone_number <> split_part(lid_jid,'@',1)),
    'map_bootstrap_invalid',     (SELECT count(*) FROM evo.lid_phone_map WHERE confidence = 'bootstrap_invalid'),
    'lookback_hours',            p_lookback_hours,
    'ts',                        now()
  );
END $function$;

-- C6/C7/C8: suites e report — corpos extensos, identicos ao aplicado em prod.
-- NOTA DE FIDELIDADE: os corpos abaixo de fn_lid_normalizer_test_suite,
-- fn_lid_regression_suite e fn_lid_health_report sao o estado de producao
-- pos-fase-C (regression ja com T09 -> public.zapp_contact_intelligence).

-- C6. Suite de normalizacao (fica em evo; usa boundary zapp.rpc_boundary_normalize_send_jid)
CREATE OR REPLACE FUNCTION evo.fn_lid_normalizer_test_suite()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
DECLARE
  v_passed  int := 0;
  v_failed  int := 0;
  v_tests   jsonb := '[]'::jsonb;
  v_r       text;
  v_confidence text;
  v_fake_current bigint;
  v_fake_baseline bigint := 44000;
BEGIN
  BEGIN v_r := zapp.rpc_boundary_normalize_send_jid('5511987654321@s.whatsapp.net'); IF v_r='5511987654321@s.whatsapp.net' THEN v_passed:=v_passed+1; v_tests:=v_tests||'{"test":"T01_snet_passthrough","status":"PASS"}'::jsonb; ELSE v_failed:=v_failed+1; v_tests:=v_tests||jsonb_build_object('test','T01_snet_passthrough','status','FAIL','got',v_r); END IF; END;
  BEGIN v_r := zapp.rpc_boundary_normalize_send_jid('120363411037444361@g.us'); IF v_r='120363411037444361@g.us' THEN v_passed:=v_passed+1; v_tests:=v_tests||'{"test":"T02_group_passthrough","status":"PASS"}'::jsonb; ELSE v_failed:=v_failed+1; v_tests:=v_tests||jsonb_build_object('test','T02_group_passthrough','status','FAIL','got',v_r); END IF; END;
  BEGIN v_r := zapp.rpc_boundary_normalize_send_jid('999888777666555@lid'); v_failed:=v_failed+1; v_tests:=v_tests||'{"test":"T03_lid_no_map_exception","status":"FAIL","got":"no_exception"}'::jsonb; EXCEPTION WHEN OTHERS THEN v_passed:=v_passed+1; v_tests:=v_tests||jsonb_build_object('test','T03_lid_no_map_exception','status','PASS','got','exception:'||left(SQLERRM,50)); END;
  BEGIN INSERT INTO evo.lid_phone_map (lid_jid,instance_name,phone_number,phone_jid,confidence,source) VALUES ('100000000000001@lid','test-suite-t04','100000000000001','100000000000001@s.whatsapp.net','high','test_suite_s4_t04') ON CONFLICT (lid_jid,instance_name) DO UPDATE SET confidence=EXCLUDED.confidence,source=EXCLUDED.source RETURNING confidence INTO v_confidence; IF v_confidence='bootstrap_invalid' THEN v_passed:=v_passed+1; v_tests:=v_tests||'{"test":"T04_guard_lid_lid_blocked","status":"PASS"}'::jsonb; ELSE v_failed:=v_failed+1; v_tests:=v_tests||jsonb_build_object('test','T04_guard_lid_lid_blocked','status','FAIL','got',v_confidence,'expected','bootstrap_invalid'); END IF; DELETE FROM evo.lid_phone_map WHERE lid_jid='100000000000001@lid' AND instance_name='test-suite-t04'; DELETE FROM evo.contact_identity WHERE lid_jid='100000000000001@lid' AND instance_name='test-suite-t04'; END;
  BEGIN INSERT INTO evo.lid_phone_map (lid_jid,instance_name,phone_number,phone_jid,confidence,source) VALUES ('test-t05@lid','test-suite-t05','5511999990001','5511999990001@s.whatsapp.net','medium','test_suite_s4_t05') ON CONFLICT (lid_jid,instance_name) DO UPDATE SET confidence=EXCLUDED.confidence,source=EXCLUDED.source RETURNING confidence INTO v_confidence; IF v_confidence='medium' THEN v_passed:=v_passed+1; v_tests:=v_tests||'{"test":"T05_guard_real_phone_ok","status":"PASS"}'::jsonb; ELSE v_failed:=v_failed+1; v_tests:=v_tests||jsonb_build_object('test','T05_guard_real_phone_ok','status','FAIL','got',v_confidence,'expected','medium'); END IF; DELETE FROM evo.lid_phone_map WHERE lid_jid='test-t05@lid' AND instance_name='test-suite-t05'; DELETE FROM evo.contact_identity WHERE instance_name='test-suite-t05' AND source LIKE 'test_suite_s4%'; END;
  SELECT count(*)::text INTO v_r FROM evo.contact_identity WHERE instance_name='wpp2'; IF v_r::int>=12000 THEN v_passed:=v_passed+1; v_tests:=v_tests||jsonb_build_object('test','T06_contact_identity_populated','status','PASS','got',v_r||' rows (wpp2)'); ELSE v_failed:=v_failed+1; v_tests:=v_tests||jsonb_build_object('test','T06_contact_identity_populated','status','FAIL','got',v_r,'expected','>=12000'); END IF;
  SELECT trend INTO v_r FROM evo.lid_convergence_history ORDER BY captured_at DESC LIMIT 1; IF v_r IN ('STABLE','SHRINKING') THEN v_passed:=v_passed+1; v_tests:=v_tests||jsonb_build_object('test','T07_trend_not_growing','status','PASS','got',v_r); ELSE v_failed:=v_failed+1; v_tests:=v_tests||jsonb_build_object('test','T07_trend_not_growing','status','FAIL','got',v_r,'expected','STABLE or SHRINKING'); END IF;
  SELECT fake_jids_real_users INTO v_fake_current FROM evo.v_lid_convergence_status; IF v_fake_current<=v_fake_baseline THEN v_passed:=v_passed+1; v_tests:=v_tests||jsonb_build_object('test','T08_fake_jids_not_growing','status','PASS','got',v_fake_current,'baseline_max',v_fake_baseline,'note','backfill s16 reduziu 43666→36171'); ELSE v_failed:=v_failed+1; v_tests:=v_tests||jsonb_build_object('test','T08_fake_jids_not_growing','status','FAIL','got',v_fake_current,'expected','<='||v_fake_baseline,'note','fake_jids crescendo!'); END IF;
  SELECT status INTO v_r FROM cron.job_run_details WHERE jobid=429 ORDER BY runid DESC LIMIT 1; IF v_r='succeeded' THEN v_passed:=v_passed+1; v_tests:=v_tests||'{"test":"T09_canary_ok","status":"PASS"}'::jsonb; ELSE v_failed:=v_failed+1; v_tests:=v_tests||jsonb_build_object('test','T09_canary_ok','status','FAIL','got',v_r,'expected','succeeded'); END IF;
  SELECT completeness_score::text INTO v_r FROM evo.v_production_scorecard; IF v_r::int>=9 THEN v_passed:=v_passed+1; v_tests:=v_tests||jsonb_build_object('test','T10_scorecard_ok','status','PASS','got',v_r,'note','>=9 aceito'); ELSE v_failed:=v_failed+1; v_tests:=v_tests||jsonb_build_object('test','T10_scorecard_ok','status','FAIL','got',v_r,'expected','>=9'); END IF;
  BEGIN v_r:=zapp.rpc_boundary_normalize_send_jid('+5511987654321@s.whatsapp.net'); IF v_r='5511987654321@s.whatsapp.net' THEN v_passed:=v_passed+1; v_tests:=v_tests||'{"test":"T11a_plus_prefix_stripped","status":"PASS"}'::jsonb; ELSE v_failed:=v_failed+1; v_tests:=v_tests||jsonb_build_object('test','T11a_plus_prefix_stripped','status','FAIL','got',v_r); END IF; END;
  BEGIN v_r:=zapp.rpc_boundary_normalize_send_jid('5511987654321:42@s.whatsapp.net'); IF v_r='5511987654321@s.whatsapp.net' THEN v_passed:=v_passed+1; v_tests:=v_tests||'{"test":"T11b_device_suffix_stripped","status":"PASS"}'::jsonb; ELSE v_failed:=v_failed+1; v_tests:=v_tests||jsonb_build_object('test','T11b_device_suffix_stripped','status','FAIL','got',v_r); END IF; END;
  BEGIN v_r:=zapp.rpc_boundary_normalize_send_jid('+5511987654321:42@s.whatsapp.net'); IF v_r='5511987654321@s.whatsapp.net' THEN v_passed:=v_passed+1; v_tests:=v_tests||'{"test":"T11c_plus_and_device_stripped","status":"PASS"}'::jsonb; ELSE v_failed:=v_failed+1; v_tests:=v_tests||jsonb_build_object('test','T11c_plus_and_device_stripped','status','FAIL','got',v_r); END IF; END;
  BEGIN v_r:=zapp.rpc_boundary_normalize_send_jid('status@broadcast'); IF v_r='status@broadcast' THEN v_passed:=v_passed+1; v_tests:=v_tests||'{"test":"T11d_broadcast_passthrough","status":"PASS"}'::jsonb; ELSE v_failed:=v_failed+1; v_tests:=v_tests||jsonb_build_object('test','T11d_broadcast_passthrough','status','FAIL','got',v_r); END IF; END;
  BEGIN v_r:=zapp.rpc_boundary_normalize_send_jid('5511987654321@c.us'); IF v_r='5511987654321@c.us' THEN v_passed:=v_passed+1; v_tests:=v_tests||'{"test":"T11e_cus_legacy_passthrough","status":"PASS"}'::jsonb; ELSE v_failed:=v_failed+1; v_tests:=v_tests||jsonb_build_object('test','T11e_cus_legacy_passthrough','status','FAIL','got',v_r,'expected','5511987654321@c.us','note','@c.us e formato legado valido — deve pass-through'); END IF; END;
  BEGIN v_r:=zapp.rpc_boundary_normalize_send_jid('5511987654321:5@c.us'); IF v_r='5511987654321@c.us' THEN v_passed:=v_passed+1; v_tests:=v_tests||'{"test":"T11f_cus_device_stripped","status":"PASS"}'::jsonb; ELSE v_failed:=v_failed+1; v_tests:=v_tests||jsonb_build_object('test','T11f_cus_device_stripped','status','FAIL','got',v_r,'expected','5511987654321@c.us'); END IF; END;
  INSERT INTO evo.e2e_probe_results (probed_at,resultado,notes,wpp2_state,wal_lag_mb) SELECT now(), CASE WHEN v_failed=0 THEN 'LID_ALL_PASS' ELSE 'LID_FAIL_'||v_failed END, format('fn_lid_normalizer_test_suite_s24v2_t11f: %s/%s passed',v_passed,v_passed+v_failed), (SELECT state FROM evo.evolution_connection_history WHERE instance_name='wpp2' ORDER BY created_at DESC LIMIT 1), (SELECT COALESCE(round(pg_wal_lsn_diff(pg_current_wal_lsn(),restart_lsn)/1024.0/1024,1),0) FROM pg_replication_slots WHERE slot_name LIKE 'cainophile%' AND active=true LIMIT 1);
  RETURN jsonb_build_object('passed',v_passed,'failed',v_failed,'total',v_passed+v_failed,'result',CASE WHEN v_failed=0 THEN 'ALL_PASS' ELSE 'SOME_FAIL' END,'tests',v_tests);
END;
$function$;

-- C7. Regression suite v5 (19 tests; T09 repontado p/ public.zapp_contact_intelligence,
-- T16a-d exercitam o boundary zapp.rpc_boundary_normalize_send_jid)
CREATE OR REPLACE FUNCTION evo.fn_lid_regression_suite()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
DECLARE
  v_ok int := 0; v_fail int := 0; v_tests jsonb := '[]'::jsonb; v_val text;
BEGIN
  SELECT COUNT(*)::text INTO v_val FROM evo.contact_identity;
  IF v_val::int >= 12000 THEN v_ok := v_ok+1; v_tests := v_tests || jsonb_build_object('test','T01_contact_identity_populated','status','PASS','got',v_val); ELSE v_fail := v_fail+1; v_tests := v_tests || jsonb_build_object('test','T01_contact_identity_populated','status','FAIL','got',v_val,'expected','>=12000'); END IF;
  SELECT COUNT(*)::text INTO v_val FROM evo.lid_phone_map;
  IF v_val::int > 0 THEN v_ok := v_ok+1; v_tests := v_tests || jsonb_build_object('test','T02_lid_phone_map_populated','status','PASS','got',v_val); ELSE v_fail := v_fail+1; v_tests := v_tests || jsonb_build_object('test','T02_lid_phone_map_populated','status','FAIL'); END IF;
  SELECT fake_jid_trend INTO v_val FROM evo.v_lid_health_scorecard;
  IF v_val IN ('STABLE','SHRINKING') THEN v_ok := v_ok+1; v_tests := v_tests || jsonb_build_object('test','T03_fake_jids_not_growing','status','PASS','got',v_val); ELSE v_fail := v_fail+1; v_tests := v_tests || jsonb_build_object('test','T03_fake_jids_not_growing','status','FAIL','got',v_val,'expected','STABLE or SHRINKING'); END IF;
  SELECT contacts_lid_phone_contaminated INTO v_val FROM evo.v_lid_health_scorecard;
  IF v_val::int = 0 THEN v_ok := v_ok+1; v_tests := v_tests || jsonb_build_object('test','T04_no_lid_contamination','status','PASS'); ELSE v_fail := v_fail+1; v_tests := v_tests || jsonb_build_object('test','T04_no_lid_contamination','status','FAIL','got',v_val); END IF;
  BEGIN PERFORM evo.fn_resolve_identity('5511999990001@s.whatsapp.net','wpp2'); v_ok := v_ok+1; v_tests := v_tests || jsonb_build_object('test','T05_resolve_identity_snet','status','PASS'); EXCEPTION WHEN OTHERS THEN v_fail := v_fail+1; v_tests := v_tests || jsonb_build_object('test','T05_resolve_identity_snet','status','FAIL','got',SQLERRM); END;
  BEGIN PERFORM evo.fn_resolve_identity('120363411037444361@g.us','wpp2'); v_ok := v_ok+1; v_tests := v_tests || jsonb_build_object('test','T06_resolve_identity_group','status','PASS'); EXCEPTION WHEN OTHERS THEN v_fail := v_fail+1; v_tests := v_tests || jsonb_build_object('test','T06_resolve_identity_group','status','FAIL','got',SQLERRM); END;
  SELECT COUNT(*)::text INTO v_val FROM evo.lid_phone_map WHERE confidence<>'bootstrap_invalid' AND phone_number IS NOT NULL AND phone_number=split_part(lid_jid,'@',1);
  IF v_val::int=0 THEN v_ok := v_ok+1; v_tests := v_tests || jsonb_build_object('test','T07_guard_no_lid_as_phone_in_map','status','PASS'); ELSE v_fail := v_fail+1; v_tests := v_tests || jsonb_build_object('test','T07_guard_no_lid_as_phone_in_map','status','FAIL','got',v_val||' invalid entries'); END IF;
  SELECT COUNT(*)::text INTO v_val FROM public.evolution_contacts WHERE instance_name='wpp2' AND phone_number IS NOT NULL AND length(phone_number)>13 AND phone_number~'^[0-9]+$' AND deleted_at IS NULL;
  IF v_val::int=0 THEN v_ok := v_ok+1; v_tests := v_tests || jsonb_build_object('test','T08_no_lid_as_phone_number','status','PASS'); ELSE v_fail := v_fail+1; v_tests := v_tests || jsonb_build_object('test','T08_no_lid_as_phone_number','status','FAIL','got',v_val||' contacts with LID phone_number'); END IF;
  SELECT COUNT(*)::text INTO v_val FROM public.zapp_contact_intelligence WHERE phone~'^[0-9]{14,}' AND phone NOT LIKE '%@%';
  IF v_val::int=0 THEN v_ok := v_ok+1; v_tests := v_tests || jsonb_build_object('test','T09_ci_no_lid_phone','status','PASS'); ELSE v_fail := v_fail+1; v_tests := v_tests || jsonb_build_object('test','T09_ci_no_lid_phone','status','FAIL','got',v_val); END IF;
  SELECT COUNT(*)::text INTO v_val FROM cron.job WHERE jobname ILIKE '%lid%' AND active=true;
  IF v_val::int>=7 THEN v_ok := v_ok+1; v_tests := v_tests || jsonb_build_object('test','T10_lid_crons_active','status','PASS','got',v_val); ELSE v_fail := v_fail+1; v_tests := v_tests || jsonb_build_object('test','T10_lid_crons_active','status','FAIL','got',v_val); END IF;
  SELECT COUNT(*)::text INTO v_val FROM pg_trigger WHERE tgname IN ('trg_guard_lid_phone_map','trg_sync_contact_identity') AND tgenabled='O';
  IF v_val::int=2 THEN v_ok := v_ok+1; v_tests := v_tests || jsonb_build_object('test','T11_lid_triggers_enabled','status','PASS'); ELSE v_fail := v_fail+1; v_tests := v_tests || jsonb_build_object('test','T11_lid_triggers_enabled','status','FAIL','got',v_val||'/2'); END IF;
  SELECT completeness_score::text INTO v_val FROM evo.v_production_scorecard;
  IF v_val!='10' THEN PERFORM pg_sleep(10); SELECT completeness_score::text INTO v_val FROM evo.v_production_scorecard; END IF;
  IF v_val='10' THEN v_ok := v_ok+1; v_tests := v_tests || jsonb_build_object('test','T12_scorecard_10_10','status','PASS','note','retry-resiliente v4'); ELSE v_fail := v_fail+1; v_tests := v_tests || jsonb_build_object('test','T12_scorecard_10_10','status','FAIL','got',v_val,'note','score abaixo de 10 por >10s'); END IF;
  SELECT COUNT(*)::text INTO v_val FROM evo.lid_phone_map WHERE confidence='high' AND source IN ('contacts_raw_data','webhook_contacts_upsert','api_fetchContacts') AND phone_number IS NOT NULL AND phone_number<>split_part(lid_jid,'@',1);
  IF v_val::int>0 THEN v_ok := v_ok+1; v_tests := v_tests || jsonb_build_object('test','T13_real_lid_mappings','status','PASS','got',v_val||' mappings'); ELSE v_tests := v_tests || jsonb_build_object('test','T13_real_lid_mappings','status','PENDING','note','Aguardando phoneJid orgânico Baileys 7.x'); END IF;
  SELECT COUNT(*)::text INTO v_val FROM evo.contact_identity WHERE lid_jid IS NOT NULL AND instance_name='wpp2' AND source NOT LIKE 'test_suite_%';
  IF v_val::int>0 THEN v_ok := v_ok+1; v_tests := v_tests || jsonb_build_object('test','T14_ci_lid_populated','status','PASS','got',v_val); ELSE v_tests := v_tests || jsonb_build_object('test','T14_ci_lid_populated','status','PENDING','note','Aguardando Evolution 2.4.x'); END IF;
  SELECT lid_coverage_pct::text INTO v_val FROM evo.v_lid_health_scorecard;
  IF v_val::float>=90 THEN v_ok := v_ok+1; v_tests := v_tests || jsonb_build_object('test','T15_lid_coverage_target','status','PASS','got',v_val||'%'); ELSE v_tests := v_tests || jsonb_build_object('test','T15_lid_coverage_target','status','PENDING','got',v_val||'% (meta: >=90%)'); END IF;

  BEGIN
    v_val := zapp.rpc_boundary_normalize_send_jid('+5511987654321@s.whatsapp.net');
    IF v_val = '5511987654321@s.whatsapp.net' THEN
      v_ok := v_ok+1; v_tests := v_tests || jsonb_build_object('test','T16a_normalize_plus_prefix','status','PASS');
    ELSE v_fail := v_fail+1; v_tests := v_tests || jsonb_build_object('test','T16a_normalize_plus_prefix','status','FAIL','got',v_val,'expected','5511987654321@s.whatsapp.net'); END IF;
  EXCEPTION WHEN OTHERS THEN v_fail := v_fail+1; v_tests := v_tests || jsonb_build_object('test','T16a_normalize_plus_prefix','status','FAIL','got','exception:'||SQLERRM); END;

  BEGIN
    v_val := zapp.rpc_boundary_normalize_send_jid('5511987654321:42@s.whatsapp.net');
    IF v_val = '5511987654321@s.whatsapp.net' THEN
      v_ok := v_ok+1; v_tests := v_tests || jsonb_build_object('test','T16b_normalize_device_suffix','status','PASS');
    ELSE v_fail := v_fail+1; v_tests := v_tests || jsonb_build_object('test','T16b_normalize_device_suffix','status','FAIL','got',v_val,'expected','5511987654321@s.whatsapp.net'); END IF;
  EXCEPTION WHEN OTHERS THEN v_fail := v_fail+1; v_tests := v_tests || jsonb_build_object('test','T16b_normalize_device_suffix','status','FAIL','got','exception:'||SQLERRM); END;

  BEGIN
    v_val := zapp.rpc_boundary_normalize_send_jid('+5511987654321:42@s.whatsapp.net');
    IF v_val = '5511987654321@s.whatsapp.net' THEN
      v_ok := v_ok+1; v_tests := v_tests || jsonb_build_object('test','T16c_normalize_plus_and_device','status','PASS');
    ELSE v_fail := v_fail+1; v_tests := v_tests || jsonb_build_object('test','T16c_normalize_plus_and_device','status','FAIL','got',v_val,'expected','5511987654321@s.whatsapp.net'); END IF;
  EXCEPTION WHEN OTHERS THEN v_fail := v_fail+1; v_tests := v_tests || jsonb_build_object('test','T16c_normalize_plus_and_device','status','FAIL','got','exception:'||SQLERRM); END;

  BEGIN
    v_val := zapp.rpc_boundary_normalize_send_jid('status@broadcast');
    IF v_val = 'status@broadcast' THEN
      v_ok := v_ok+1; v_tests := v_tests || jsonb_build_object('test','T16d_normalize_broadcast','status','PASS');
    ELSE v_fail := v_fail+1; v_tests := v_tests || jsonb_build_object('test','T16d_normalize_broadcast','status','FAIL','got',v_val,'expected','status@broadcast'); END IF;
  EXCEPTION WHEN OTHERS THEN v_fail := v_fail+1; v_tests := v_tests || jsonb_build_object('test','T16d_normalize_broadcast','status','FAIL','got','exception:'||SQLERRM); END;

  INSERT INTO evo.e2e_probe_results (probed_at,resultado,notes,wpp2_state,wal_lag_mb)
  SELECT now(),
    CASE WHEN v_fail=0 THEN 'LID_ALL_PASS' ELSE 'LID_FAIL_'||v_fail END,
    format('regression_v5_19tests_t16_normalize: %s/%s pass',v_ok,v_ok+v_fail),
    (SELECT state FROM evo.evolution_connection_history WHERE instance_name='wpp2' ORDER BY created_at DESC LIMIT 1),
    (SELECT COALESCE(round(pg_wal_lsn_diff(pg_current_wal_lsn(),restart_lsn)/1024.0/1024,1),0)
     FROM pg_replication_slots WHERE slot_name LIKE 'cainophile%' LIMIT 1);

  RETURN jsonb_build_object(
    'run_at',now(),
    'status',CASE WHEN v_fail=0 THEN 'GREEN' ELSE 'RED' END,
    'tests_run',jsonb_array_length(v_tests),
    'tests_pass',v_ok,
    'tests_fail',v_fail,
    'pass_rate',CASE WHEN (v_ok+v_fail)=0 THEN 100 ELSE round(v_ok::numeric*100.0/(v_ok+v_fail),1) END,
    'failures',COALESCE((SELECT jsonb_agg(t) FROM jsonb_array_elements(v_tests) t WHERE t->>'status'='FAIL'),'[]'::jsonb),
    'pending_post_upgrade',COALESCE((SELECT jsonb_agg(t->>'test') FROM jsonb_array_elements(v_tests) t WHERE t->>'status'='PENDING'),'[]'::jsonb)
  );
END;
$function$;

-- C8. Health report (usa boundary zapp.rpc_boundary_system_health_score p/ infra_score)
CREATE OR REPLACE FUNCTION evo.fn_lid_health_report()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'ops', 'pg_catalog'
AS $function$
DECLARE v_r jsonb;
BEGIN
  SELECT jsonb_build_object(
    'report_at',       now(),
    'period',          '7 days',
    'system', jsonb_build_object(
      'pipeline_status', ps.pipeline_status,
      'completeness',    ps.completeness_score,
      'open_alerts',     ps.open_alerts,
      'infra_score',     (SELECT zapp.rpc_boundary_system_health_score()->>'score'),
      'wpp2_state',      (SELECT state FROM evo.evolution_connection_history WHERE instance_name='wpp2' ORDER BY created_at DESC LIMIT 1)
    ),
    'lid', jsonb_build_object(
      'health_score',          ls.lid_health_score,
      'status',                ls.lid_status,
      'fake_jids_historical',  ls.fake_jids_historical,
      'map_real_entries',      ls.map_real_entries,
      'lid_coverage_pct',      ls.lid_coverage_pct,
      'lid_contacts_wpp2',     ls.lid_contacts_wpp2,
      'contact_identity_pn',   ls.contact_identity_pn,
      'contact_identity_lid',  ls.contact_identity_lid,
      'contamination',         ls.contacts_lid_phone_contaminated,
      'trend',                 ls.fake_jid_trend
    ),
    'steps', jsonb_build_object(
      'done',  sp.steps_done,
      'total', sp.steps_total,
      'pct',   round(100.0 * sp.steps_done / sp.steps_total, 1),
      'blocker', CASE WHEN sp.steps_done < 50 THEN 'Evolution API 2.4.x upgrade (etapas 24,25,27,28 + Fase 1)' ELSE 'COMPLETED' END
    ),
    'upgrade', jsonb_build_object(
      'status',             'check_removed_e50',
      'checks_ok',          NULL,
      'rollback_image',     'sha256:ed066617b536860837bb9a58deb66e5f9e31d0399c2b3c2209c933da9405e6b2',
      'version_index',      '13371912',
      'snapshots_ready',    3
    ),
    'regression', jsonb_build_object(
      'suite_12', (evo.fn_lid_regression_suite()->> 'status'),
      'suite_10', (evo.fn_lid_normalizer_test_suite()->>'result'),
      'pending_post_upgrade', ARRAY['T13_real_lid_mappings','T14_ci_lid_populated','T15_lid_coverage_target']
    ),
    'crons', (
      SELECT jsonb_agg(jsonb_build_object(
        'name', j.jobname, 'schedule', j.schedule, 'active', j.active,
        'last_status', (SELECT status FROM cron.job_run_details WHERE jobid=j.jobid ORDER BY runid DESC LIMIT 1)
      ))
      FROM cron.job j WHERE j.jobname ILIKE '%lid%'
    ),
    'indexes', jsonb_build_object(
      'trgm_gin', (SELECT pg_size_pretty(pg_relation_size(c.oid)) FROM pg_class c JOIN pg_namespace nsx ON nsx.oid=c.relnamespace WHERE nsx.nspname='zapp' AND c.relname='idx_ec_remote_jid_trgm'),
      'lid_phone_map_pk', (SELECT pg_size_pretty(pg_relation_size('evo.lid_phone_map_pkey'::regclass))),
      'contact_identity_lid', (SELECT pg_size_pretty(pg_relation_size('evo.idx_contact_identity_lid'::regclass)))
    ),
    'weekly', (SELECT row_to_json(m) FROM evo.v_lid_weekly_metrics m LIMIT 1)
  ) INTO v_r
  FROM evo.v_production_scorecard ps, evo.v_lid_health_scorecard ls, evo.v_50_steps_progress sp;
  RETURN v_r;
END;
$function$;

-- Fim da 250024. Estado replay-convergente com prod pos-fase-C + fix T09.
