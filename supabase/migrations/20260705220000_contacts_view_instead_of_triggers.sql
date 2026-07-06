-- =============================================================================
-- 2026-07-05 | Auditoria Evolution/espelhamento — Fix estrutural do mirror
-- =============================================================================
-- CONTEXTO: public.contacts virou VIEW (~21/06, reconciliacao de schema) sem
-- INSTEAD OF triggers => INSERT/UPDATE do webhook handler falhava com 0A000
-- ("cannot insert into view") e o handler retornava silenciosamente =>
-- 2 semanas de mensagens nao espelhadas. Este arquivo:
--   1) Cria INSTEAD OF INSERT/UPDATE/DELETE em public.contacts -> evo.evolution_contacts
--   2) fn_normalize_send_jid: guard @lid (bug Evolution 2.3.7; fix so na 2.4.0-rc2)
--   3) Monitor de WAL slots com histerese (>512MB alerta, <256MB resolve) -> warroom
-- Validacao: 460 cenarios adversariais + round-trip SQL + E2E via consumer.
-- IMPORTANTE: ja aplicado no self-hosted em 2026-07-05 22:0x UTC (idempotente).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_contacts_view_insert_handler()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','evo','zapp'
AS $fn$
DECLARE
  v_id uuid;
  v_instance text;
BEGIN
  v_instance := NULLIF(NEW.instance_name,'');
  IF v_instance IS NULL AND NEW.whatsapp_connection_id IS NOT NULL THEN
    SELECT wc.instance_name INTO v_instance
    FROM public.whatsapp_connections wc WHERE wc.id = NEW.whatsapp_connection_id;
  END IF;

  INSERT INTO evo.evolution_contacts (
    id, remote_jid, phone_number, push_name, profile_picture_url, full_name,
    email, company, role_title, lead_status, lead_source, lead_score,
    whatsapp_labels, tags, assigned_to, queue_id, notes, instance_name,
    raw_data, total_purchases, last_message_at, created_at, updated_at
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()),
    COALESCE(NULLIF(NEW.remote_jid,''), NULLIF(NEW.external_id,''), NEW.phone || '@s.whatsapp.net'),
    NEW.phone,
    COALESCE(NEW.push_name, NEW.nickname),
    NEW.avatar_url,
    NEW.name,
    NEW.email, NEW.company,
    COALESCE(NEW."position", NEW.job_title),
    COALESCE(NEW.status, 'open'),
    NEW.source,
    COALESCE(NEW.lead_score, 0),
    NEW.whatsapp_labels, NEW.tags, NEW.assigned_to, NEW.queue_id, NEW.notes,
    COALESCE(v_instance, 'wpp2'),
    NEW.metadata,
    COALESCE(NEW.total_purchases, 0),
    NEW.last_message_at,
    COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now())
  ) RETURNING id INTO v_id;

  NEW.id := v_id;
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.fn_contacts_view_update_handler()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','evo','zapp'
AS $fn$
DECLARE v_instance text;
BEGIN
  IF NEW.whatsapp_connection_id IS DISTINCT FROM OLD.whatsapp_connection_id AND NEW.whatsapp_connection_id IS NOT NULL THEN
    SELECT wc.instance_name INTO v_instance
    FROM public.whatsapp_connections wc WHERE wc.id = NEW.whatsapp_connection_id;
  END IF;

  UPDATE evo.evolution_contacts ec SET
    full_name           = CASE WHEN NEW.name IS DISTINCT FROM OLD.name THEN NEW.name ELSE ec.full_name END,
    phone_number        = CASE WHEN NEW.phone IS DISTINCT FROM OLD.phone THEN NEW.phone ELSE ec.phone_number END,
    email               = CASE WHEN NEW.email IS DISTINCT FROM OLD.email THEN NEW.email ELSE ec.email END,
    profile_picture_url = CASE WHEN NEW.avatar_url IS DISTINCT FROM OLD.avatar_url THEN NEW.avatar_url ELSE ec.profile_picture_url END,
    lead_status         = CASE WHEN NEW.status IS DISTINCT FROM OLD.status THEN NEW.status ELSE ec.lead_status END,
    assigned_to         = CASE WHEN NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN NEW.assigned_to ELSE ec.assigned_to END,
    queue_id            = CASE WHEN NEW.queue_id IS DISTINCT FROM OLD.queue_id THEN NEW.queue_id ELSE ec.queue_id END,
    company             = CASE WHEN NEW.company IS DISTINCT FROM OLD.company THEN NEW.company ELSE ec.company END,
    notes               = CASE WHEN NEW.notes IS DISTINCT FROM OLD.notes THEN NEW.notes ELSE ec.notes END,
    tags                = CASE WHEN NEW.tags IS DISTINCT FROM OLD.tags THEN NEW.tags ELSE ec.tags END,
    whatsapp_labels     = CASE WHEN NEW.whatsapp_labels IS DISTINCT FROM OLD.whatsapp_labels THEN NEW.whatsapp_labels ELSE ec.whatsapp_labels END,
    lead_score          = CASE WHEN NEW.lead_score IS DISTINCT FROM OLD.lead_score THEN NEW.lead_score ELSE ec.lead_score END,
    last_message_at     = CASE WHEN NEW.last_message_at IS DISTINCT FROM OLD.last_message_at THEN NEW.last_message_at ELSE ec.last_message_at END,
    instance_name       = COALESCE(v_instance, ec.instance_name),
    raw_data            = CASE WHEN NEW.metadata IS DISTINCT FROM OLD.metadata THEN NEW.metadata ELSE ec.raw_data END,
    updated_at          = COALESCE(NEW.updated_at, now())
  WHERE ec.id = OLD.id;
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.fn_contacts_view_delete_handler()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','evo','zapp'
AS $fn$
BEGIN
  DELETE FROM evo.evolution_contacts WHERE id = OLD.id;
  RETURN OLD;
END $fn$;

DROP TRIGGER IF EXISTS trg_contacts_view_insert ON public.contacts;
DROP TRIGGER IF EXISTS trg_contacts_view_update ON public.contacts;
DROP TRIGGER IF EXISTS trg_contacts_view_delete ON public.contacts;

CREATE TRIGGER trg_contacts_view_insert INSTEAD OF INSERT ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.fn_contacts_view_insert_handler();
CREATE TRIGGER trg_contacts_view_update INSTEAD OF UPDATE ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.fn_contacts_view_update_handler();
CREATE TRIGGER trg_contacts_view_delete INSTEAD OF DELETE ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.fn_contacts_view_delete_handler();

-- ============ Guard @lid (Evolution 2.3.7) ============
CREATE OR REPLACE FUNCTION public.fn_normalize_send_jid(p_jid text, p_instance text DEFAULT 'wpp2')
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','evo'
AS $fn$
DECLARE v_jid text; v_phone text;
BEGIN
  v_jid := btrim(coalesce(p_jid,''));
  IF v_jid = '' THEN
    RAISE EXCEPTION 'fn_normalize_send_jid: jid vazio/nulo' USING ERRCODE='22023';
  END IF;
  IF lower(v_jid) ~ '^[0-9]+@lid$' THEN
    SELECT ec.phone_number INTO v_phone
    FROM evo.evolution_contacts ec
    WHERE lower(ec.remote_jid) = lower(v_jid)
      AND ec.instance_name = p_instance
      AND ec.phone_number ~ '^[0-9]+$'
    ORDER BY ec.updated_at DESC LIMIT 1;
    IF v_phone IS NULL THEN
      RAISE EXCEPTION 'fn_normalize_send_jid: JID @lid % sem phone_number mapeado (instancia %) — envio bloqueado (bug 2.3.7)', v_jid, p_instance USING ERRCODE='22023';
    END IF;
    RETURN v_phone || '@s.whatsapp.net';
  END IF;
  IF v_jid ~ '^[0-9]+@(s\.whatsapp\.net|g\.us|c\.us)$' OR v_jid = 'status@broadcast' THEN
    RETURN v_jid;
  END IF;
  RAISE EXCEPTION 'fn_normalize_send_jid: JID malformado: %', v_jid USING ERRCODE='22023';
END $fn$;

COMMENT ON FUNCTION public.fn_normalize_send_jid IS 'Guard @lid p/ Evolution 2.3.7 (bug envio @lid, fix so em 2.4.0-rc2). Validada em 100 cenarios adversariais 2026-07-05.';

-- ============ Monitor WAL slots com histerese ============
CREATE TABLE IF NOT EXISTS ops.wal_alert_state (
  slot_name text PRIMARY KEY,
  alerting boolean NOT NULL DEFAULT false,
  last_mb integer,
  alerted_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION ops.fn_check_wal_slots()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'ops','public'
AS $fn$
DECLARE r record; v_state ops.wal_alert_state; v_acao text := ''; v_url text := 'https://n8n.atomicabr.com.br/webhook/warroom-alert';
BEGIN
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
          'detail', format('Replication slot %s retendo %s MB de WAL (limite 512MB). Risco de disco cheio. Verificar consumidor.', r.slot_name, r.mb)),
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
END $fn$;

-- Agendamento (idempotente)
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='wal-slot-monitor') THEN
    PERFORM cron.unschedule('wal-slot-monitor');
  END IF;
  PERFORM cron.schedule('wal-slot-monitor', '*/15 * * * *', 'SELECT ops.fn_check_wal_slots()');
END $do$;

COMMIT;
