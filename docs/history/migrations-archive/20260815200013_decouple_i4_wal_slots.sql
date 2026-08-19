-- =============================================================================
-- Decouple I4 — ops.fn_check_wal_slots → vault n8n_warroom_alert_webhook
-- URL hardcoded → vault via ops.fn_get_vault_secret (fallback = literal atual).
-- Idempotente — CREATE OR REPLACE. Data: 2026-08-15.
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.fn_check_wal_slots()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ops'
AS $function$
DECLARE r record; v_state ops.wal_alert_state; v_acao text := ''; v_url text;
BEGIN
  v_url := COALESCE(ops.fn_get_vault_secret('n8n_warroom_alert_webhook'), 'https://n8n.atomicabr.com.br/webhook/warroom-alert');
  FOR r IN
    SELECT slot_name,
           coalesce((pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)/1024/1024)::int, 0) AS mb
    FROM pg_replication_slots
  LOOP
    SELECT * INTO v_state FROM ops.wal_alert_state WHERE slot_name = r.slot_name;
    IF NOT FOUND THEN
      INSERT INTO ops.wal_alert_state(slot_name, last_mb) VALUES (r.slot_name, r.mb)
      RETURNING * INTO v_state;
    END IF;

    IF r.mb > 512 AND NOT v_state.alerting THEN
      UPDATE ops.wal_alert_state SET alerting=true, last_mb=r.mb, alerted_at=now(), updated_at=now() WHERE slot_name=r.slot_name;
      PERFORM net.http_post(
        url := v_url,
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := jsonb_build_object('service','wal-slot-monitor','event','critical',
          'detail', format('Replication slot %s retendo %s MB de WAL (limite 512MB). Risco de disco cheio. Verificar consumidor (cainophile/realtime).', r.slot_name, r.mb)),
        timeout_milliseconds := 10000);
      v_acao := v_acao || format('[ALERTA %s=%sMB]', r.slot_name, r.mb);
    ELSIF r.mb < 256 AND v_state.alerting THEN
      UPDATE ops.wal_alert_state SET alerting=false, last_mb=r.mb, resolved_at=now(), updated_at=now() WHERE slot_name=r.slot_name;
      PERFORM net.http_post(
        url := v_url,
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := jsonb_build_object('service','wal-slot-monitor','event','recovery',
          'detail', format('Slot %s normalizado: %s MB retidos.', r.slot_name, r.mb)),
        timeout_milliseconds := 10000);
      v_acao := v_acao || format('[RESOLVIDO %s=%sMB]', r.slot_name, r.mb);
    ELSE
      UPDATE ops.wal_alert_state SET last_mb=r.mb, updated_at=now() WHERE slot_name=r.slot_name;
    END IF;
  END LOOP;
  RETURN coalesce(nullif(v_acao,''),'sem mudanca de estado');
END $function$

