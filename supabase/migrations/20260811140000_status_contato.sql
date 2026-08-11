-- ============================================================================
-- 20260811140000_status_contato.sql
-- Frente B — STATUS DE CONTATO (presença online/última vez, stories viewed,
-- IsOnWhatsApp) — aplicado em produção 2026-08-11
-- ----------------------------------------------------------------------------
-- 100% ADDITIVE. Nada foi dropado.
--   1. evolution_contacts: presence_status, last_seen_at, last_presence_at,
--      is_on_whatsapp, whatsapp_checked_at (ADD COLUMN IF NOT EXISTS)
--   2. evo.fn_touch_contact_presence (throttle 60s anti hot-row) + RPC zapp
--   3. evo.fn_mark_status_viewed (stories viewed_by_us/viewed_at) + RPC zapp
--   4. evo.evolution_whatsapp_check_queue (fila de checagem IsOnWhatsApp) + RLS
--   5. evo.fn_check_whatsapp_numbers (lote 50, via API; PENDÊNCIA auth 401 —
--      mesma pendência da chave da Evolution API registrada na frente de grupos)
-- Handler: handlePresenceUpdate agora persiste presença via RPC (após broadcast).
-- ============================================================================

ALTER TABLE evo.evolution_contacts
    ADD COLUMN IF NOT EXISTS presence_status text,
    ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
    ADD COLUMN IF NOT EXISTS last_presence_at timestamptz;

CREATE OR REPLACE FUNCTION evo.fn_touch_contact_presence(
    p_remote_jid text,
    p_presence   text,
    p_instance   text DEFAULT 'wpp2'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, zapp, public
AS $$
DECLARE
    v_updated int;
BEGIN
    IF p_remote_jid IS NULL OR btrim(p_remote_jid) = '' THEN
        RETURN false;
    END IF;
    UPDATE evo.evolution_contacts
       SET presence_status  = COALESCE(NULLIF(btrim(p_presence), ''), presence_status),
           last_presence_at = now(),
           last_seen_at     = CASE WHEN lower(COALESCE(p_presence, '')) IN ('available', 'online')
                                   THEN now() ELSE last_seen_at END,
           updated_at       = now()
     WHERE remote_jid = p_remote_jid
       AND instance_name = p_instance
       AND deleted_at IS NULL
       AND (presence_status IS DISTINCT FROM COALESCE(NULLIF(btrim(p_presence), ''), presence_status)
            OR last_presence_at IS NULL
            OR last_presence_at < now() - interval '60 seconds');
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
END;
$$;

CREATE OR REPLACE FUNCTION zapp.zapp_touch_contact_presence(
    p_remote_jid text,
    p_presence   text,
    p_instance   text DEFAULT 'wpp2'
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp, evo, public
AS $$
    SELECT evo.fn_touch_contact_presence(p_remote_jid, p_presence, p_instance);
$$;

REVOKE ALL ON FUNCTION evo.fn_touch_contact_presence(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evo.fn_touch_contact_presence(text, text, text) TO service_role;
REVOKE ALL ON FUNCTION zapp.zapp_touch_contact_presence(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.zapp_touch_contact_presence(text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION evo.fn_mark_status_viewed(
    p_message_id text,
    p_instance   text DEFAULT 'wpp2'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public
AS $$
DECLARE
    v_updated int;
BEGIN
    UPDATE evo.evolution_whatsapp_status
       SET viewed_by_us = true,
           viewed_at    = now()
     WHERE message_id = p_message_id
       AND instance_name = p_instance
       AND viewed_by_us IS NOT TRUE;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
END;
$$;

CREATE OR REPLACE FUNCTION zapp.zapp_mark_status_viewed(
    p_message_id text,
    p_instance   text DEFAULT 'wpp2'
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp, evo, public
AS $$
    SELECT evo.fn_mark_status_viewed(p_message_id, p_instance);
$$;

REVOKE ALL ON FUNCTION evo.fn_mark_status_viewed(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evo.fn_mark_status_viewed(text, text) TO service_role;
REVOKE ALL ON FUNCTION zapp.zapp_mark_status_viewed(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.zapp_mark_status_viewed(text, text) TO service_role;

ALTER TABLE evo.evolution_contacts
    ADD COLUMN IF NOT EXISTS is_on_whatsapp boolean,
    ADD COLUMN IF NOT EXISTS whatsapp_checked_at timestamptz;

CREATE TABLE IF NOT EXISTS evo.evolution_whatsapp_check_queue (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    remote_jid    text NOT NULL,
    instance_name text NOT NULL DEFAULT 'wpp2',
    status        text NOT NULL DEFAULT 'pending',
    checked_at    timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE evo.evolution_whatsapp_check_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'evo' AND tablename = 'evolution_whatsapp_check_queue' AND policyname = 'service_full_access'
    ) THEN
        CREATE POLICY "service_full_access" ON evo.evolution_whatsapp_check_queue
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON evo.evolution_whatsapp_check_queue TO service_role;
CREATE INDEX IF NOT EXISTS evo_wcq_pending_idx ON evo.evolution_whatsapp_check_queue (status, created_at);

CREATE OR REPLACE FUNCTION evo.fn_check_whatsapp_numbers(p_batch int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, zapp, net, public
AS $$
DECLARE
    v_cred record; v_req bigint; v_resp record; v_items text[]; v_jid text;
    v_done int := 0; v_err text; v_i int;
BEGIN
    SELECT api_url, api_key INTO v_cred FROM evo.evolution_instance_credentials
     WHERE instance_name = 'wpp2' LIMIT 1;
    IF v_cred.api_url IS NULL OR v_cred.api_key IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'credenciais_ausentes');
    END IF;
    SELECT ARRAY(SELECT remote_jid FROM evo.evolution_whatsapp_check_queue
                  WHERE status = 'pending' ORDER BY created_at ASC LIMIT p_batch) INTO v_items;
    IF v_items IS NULL OR cardinality(v_items) = 0 THEN
        RETURN jsonb_build_object('ok', true, 'processados', 0, 'fila_vazia', true);
    END IF;
    SELECT net.http_post(rtrim(v_cred.api_url, '/') || '/chat/whatsappNumbers/wpp2',
                         jsonb_build_object('numbers', v_items),
                         jsonb_build_object('apikey', v_cred.api_key)) INTO v_req;
    v_i := 0;
    LOOP
        v_i := v_i + 1;
        SELECT id, status_code, content, timed_out INTO v_resp FROM net._http_response WHERE id = v_req;
        EXIT WHEN v_resp.id IS NOT NULL OR v_i >= 12;
        PERFORM pg_sleep(1);
    END LOOP;
    IF v_resp.id IS NULL OR v_resp.timed_out THEN
        RETURN jsonb_build_object('ok', false, 'error', 'timeout_http', 'request_id', v_req);
    END IF;
    IF v_resp.status_code <> 200 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'http_' || v_resp.status_code,
            'pendentes_na_fila', cardinality(v_items), 'body_prefix', left(COALESCE(v_resp.content, ''), 200));
    END IF;
    BEGIN
        FOR v_jid IN SELECT unnest(v_items) LOOP
            UPDATE evo.evolution_whatsapp_check_queue SET status = 'done', checked_at = now()
             WHERE remote_jid = v_jid;
            v_done := v_done + 1;
        END LOOP;
        UPDATE evo.evolution_contacts c
           SET is_on_whatsapp = true, whatsapp_checked_at = now()
         WHERE c.remote_jid = ANY (v_items) AND c.is_on_whatsapp IS NOT TRUE;
    EXCEPTION WHEN OTHERS THEN
        v_err := SQLERRM;
    END;
    RETURN jsonb_build_object('ok', true, 'processados', v_done, 'erro_parcial', v_err);
END;
$$;

REVOKE ALL ON FUNCTION evo.fn_check_whatsapp_numbers(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evo.fn_check_whatsapp_numbers(int) TO service_role;

-- ============================================================================
-- Rollback (documentado — NÃO executar em prod sem avaliação):
--   DROP FUNCTION evo.fn_check_whatsapp_numbers(int);
--   DROP TABLE evo.evolution_whatsapp_check_queue;
--   ALTER TABLE evo.evolution_contacts DROP COLUMN IF EXISTS whatsapp_checked_at,
--     DROP COLUMN IF EXISTS is_on_whatsapp;
--   DROP FUNCTION zapp.zapp_mark_status_viewed(text, text);
--   DROP FUNCTION evo.fn_mark_status_viewed(text, text);
--   DROP FUNCTION zapp.zapp_touch_contact_presence(text, text, text);
--   DROP FUNCTION evo.fn_touch_contact_presence(text, text, text);
--   ALTER TABLE evo.evolution_contacts DROP COLUMN IF EXISTS last_presence_at,
--     DROP COLUMN IF EXISTS last_seen_at, DROP COLUMN IF EXISTS presence_status;
-- ============================================================================
