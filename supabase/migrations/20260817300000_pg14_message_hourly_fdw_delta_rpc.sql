-- 20260817300000_pg14_message_hourly_fdw_delta_rpc
-- (ex-versao invalida "20260817E25" no schema_migrations; normalizada em
-- 2026-08-18 para timestamp valido - registro no banco ja atualizado.)
-- Espelho DB-as-source (reconstruido do estado vivo). Delta horario de
-- mensagens do Postgres 14 legado (Evolution) via postgres_fdw:
--  * foreign table evo.pg14_message_hourly -> server evolution_postgres
--    (host=postgres dbname=evolution; o objeto remoto public.pg14_message_hourly
--    vive no pg14 e fica fora deste repo)
--  * ops.rpc_reconcile_snapshot v5: acrescenta delta_1h (src via FDW vs mirror)
--    ao snapshot de reconciliacao; caller: watchdog reconcile-ops (role
--    evo_reconciler)
-- Idempotente.

CREATE FOREIGN TABLE IF NOT EXISTS evo.pg14_message_hourly (
  hour timestamptz,
  cnt bigint
) SERVER evolution_postgres
  OPTIONS (schema_name 'public', table_name 'pg14_message_hourly');

CREATE OR REPLACE FUNCTION ops.rpc_reconcile_snapshot(p_src_msg bigint, p_src_contacts bigint, p_src_chats bigint, p_missing_nonlid bigint, p_missing_lid bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ops', 'pg_catalog'
AS $function$
DECLARE
  v_mir_msg bigint; v_mir_contact bigint; v_mir_conv bigint; v_gap numeric;
  v_pct_msg numeric; v_status text := 'healthy'; v_erros text := '';
  v_src_1h bigint; v_mir_1h bigint; v_delta_1h bigint;
BEGIN
  SELECT count(*) INTO v_mir_msg FROM zapp.evolution_messages_wpp2;
  SELECT count(*) INTO v_mir_contact FROM zapp.evolution_contacts WHERE instance_name='wpp2';
  SELECT count(*) INTO v_mir_conv FROM zapp.evolution_conversations WHERE instance_name='wpp2';
  SELECT COALESCE(ROUND(EXTRACT(EPOCH FROM (now()-max(created_at)))/60),999) INTO v_gap FROM zapp.evolution_messages_wpp2;
  v_pct_msg := CASE WHEN p_src_msg>0 THEN round(abs(v_mir_msg-p_src_msg)*100.0/p_src_msg,2) ELSE 0 END;
  SELECT COALESCE(SUM(cnt),0) INTO v_src_1h FROM evo.pg14_message_hourly WHERE hour >= date_trunc('hour', now());
  SELECT count(*) INTO v_mir_1h FROM zapp.evolution_messages_wpp2 WHERE created_at >= date_trunc('hour', now());
  v_delta_1h := abs(v_src_1h - v_mir_1h);
  IF v_pct_msg > 20 THEN v_status:='degraded_sender'; v_erros:='delta_msg='||v_pct_msg||'pct'; END IF;
  IF p_missing_nonlid > 10 THEN v_status:='degraded_sender'; v_erros:=COALESCE(NULLIF(v_erros,'')||' | ','')||'missing_nonlid='||p_missing_nonlid; END IF;
  IF v_gap > 60 THEN v_status:='degraded_sender'; v_erros:=COALESCE(NULLIF(v_erros,'')||' | ','')||'gap='||v_gap||'min'; END IF;
  IF v_delta_1h > 40 THEN v_status:='degraded_sender'; v_erros:=COALESCE(NULLIF(v_erros,'')||' | ','')||'delta_1h='||v_delta_1h; END IF;
  INSERT INTO zapp.evo_reconcile_contact_snapshot(instance_name,src_contacts,mir_contacts,status,notes)
  VALUES('wpp2',p_src_contacts,v_mir_contact,v_status,
    format('v5 cobertura: missing_nonlid=%s missing_lid=%s | msg src=%s mir=%s (%s pct) | gap=%smin | chats=%s | delta_1h=%s',
      p_missing_nonlid,p_missing_lid,p_src_msg,v_mir_msg,v_pct_msg,v_gap,p_src_chats,v_delta_1h));
  RETURN jsonb_build_object('status',v_status,'erros',NULLIF(v_erros,''),'mir_msg',v_mir_msg,'mir_contacts',v_mir_contact,'mir_conv',v_mir_conv,'gap_min',v_gap,'pct_msg',v_pct_msg,'missing_nonlid',p_missing_nonlid,'missing_lid',p_missing_lid,'delta_1h',v_delta_1h);
END $function$;

REVOKE ALL ON FUNCTION ops.rpc_reconcile_snapshot(bigint,bigint,bigint,bigint,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.rpc_reconcile_snapshot(bigint,bigint,bigint,bigint,bigint) TO evo_reconciler;
