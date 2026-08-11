-- ============================================================================
-- 20260811130000_grupos.sql
-- Frente A — GRUPOS WhatsApp (Evolution) — aplicado em produção 2026-08-11
-- ----------------------------------------------------------------------------
-- Conteúdo (100% ADDITIVE; nada foi dropado):
--   1. evo.evolution_groups (catálogo canônico) + RLS + policies + índices + trigger
--   2. evo.fn_resolve_contact_id_by_jid / evo.fn_upsert_group_participants
--      / evo.fn_upsert_group_from_event (SECURITY DEFINER, search_path fixo)
--   3. zapp.zapp_upsert_group_from_event / zapp.zapp_upsert_group_participants
--      (RPCs chamadas pela edge fn evolution-webhook)
--   4. View zapp.evolution_groups (security_invoker) p/ o app
--   5. Índice único whatsapp_groups_connection_group_key (onConflict do handler)
--   6. evo.fn_sync_groups_from_api (backfill via fetchAllGroups) + cron 464
--      (diário 04:10) — pendência: auth da API retorna 401 com a chave atual
--      de evolution_instance_credentials; corrigir chave/token p/ ativar.
-- Rollback: ver seção no final do arquivo (não executar em prod).
-- ============================================================================

CREATE TABLE IF NOT EXISTS evo.evolution_groups (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    whatsapp_connection_id  uuid,
    group_id                text NOT NULL,
    name                    text,
    description             text,
    participant_count       integer NOT NULL DEFAULT 0,
    avatar_url              text,
    instance_name           text NOT NULL DEFAULT 'wpp2',
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT evolution_groups_connection_group_key UNIQUE (whatsapp_connection_id, group_id)
);

COMMENT ON TABLE evo.evolution_groups IS
    'Catálogo canônico de grupos WhatsApp (Evolution API). Populado por edge functions via zapp.zapp_upsert_group_from_event.';

ALTER TABLE evo.evolution_groups ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'evo' AND tablename = 'evolution_groups' AND policyname = 'service_full_access'
    ) THEN
        CREATE POLICY "service_full_access" ON evo.evolution_groups
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'evo' AND tablename = 'evolution_groups' AND policyname = 'auth_read_evolution_groups'
    ) THEN
        CREATE POLICY "auth_read_evolution_groups" ON evo.evolution_groups
            FOR SELECT TO authenticated
            USING (EXISTS (SELECT 1 FROM zapp.workspace_members WHERE workspace_members.user_id = auth.uid()));
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON evo.evolution_groups TO service_role;
GRANT SELECT ON evo.evolution_groups TO authenticated;

CREATE INDEX IF NOT EXISTS evolution_groups_connection_idx ON evo.evolution_groups (whatsapp_connection_id);
CREATE INDEX IF NOT EXISTS evolution_groups_instance_idx ON evo.evolution_groups (instance_name);
CREATE INDEX IF NOT EXISTS evolution_groups_name_trgm_idx ON evo.evolution_groups USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS evolution_group_participants_active_idx ON evo.evolution_group_participants (group_id) WHERE is_active;

CREATE OR REPLACE FUNCTION evo.fn_set_updated_at() RETURNS trigger
LANGUAGE plpgsql
SET search_path = evo, public
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_evolution_groups_updated_at'
          AND tgrelid = 'evo.evolution_groups'::regclass
    ) THEN
        CREATE TRIGGER trg_evolution_groups_updated_at
            BEFORE UPDATE ON evo.evolution_groups
            FOR EACH ROW EXECUTE FUNCTION evo.fn_set_updated_at();
    END IF;
END $$;

CREATE OR REPLACE FUNCTION evo.fn_resolve_contact_id_by_jid(p_jid text)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = evo, public
AS $$
    SELECT c.id
      FROM evo.evolution_contacts c
     WHERE c.deleted_at IS NULL
       AND (
             lower(c.remote_jid) = lower(p_jid)
          OR regexp_replace(lower(c.remote_jid), '[^0-9]', '', 'g')
             = regexp_replace(lower(p_jid), '[^0-9]', '', 'g')
          OR regexp_replace(lower(c.phone_number), '[^0-9]', '', 'g')
             = regexp_replace(lower(split_part(p_jid, '@', 1)), '[^0-9]', '', 'g')
       )
     ORDER BY c.updated_at DESC NULLS LAST
     LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION evo.fn_upsert_group_participants(
    p_group_id     uuid,
    p_participants text[],
    p_action       text DEFAULT 'add',
    p_instance     text DEFAULT 'wpp2'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public
AS $$
DECLARE
    v_count integer := 0;
    v_jid   text;
BEGIN
    IF p_group_id IS NULL OR p_participants IS NULL OR cardinality(p_participants) = 0 THEN
        RETURN 0;
    END IF;
    IF p_action = 'add' THEN
        FOREACH v_jid IN ARRAY p_participants
        LOOP
            IF v_jid IS NULL OR btrim(v_jid) = '' THEN
                CONTINUE;
            END IF;
            INSERT INTO evo.evolution_group_participants
                (group_id, participant_jid, contact_id, role, joined_at, left_at, is_active)
            VALUES
                (p_group_id, v_jid, evo.fn_resolve_contact_id_by_jid(v_jid), 'member', now(), NULL, true)
            ON CONFLICT (group_id, participant_jid) DO UPDATE
                SET is_active = true, left_at = NULL;
            v_count := v_count + 1;
        END LOOP;
    ELSIF p_action = 'remove' THEN
        UPDATE evo.evolution_group_participants
           SET left_at = now(), is_active = false
         WHERE group_id = p_group_id
           AND participant_jid = ANY (p_participants)
           AND is_active;
        GET DIAGNOSTICS v_count = ROW_COUNT;
    ELSIF p_action = 'promote' THEN
        UPDATE evo.evolution_group_participants SET role = 'admin'
         WHERE group_id = p_group_id AND participant_jid = ANY (p_participants);
        GET DIAGNOSTICS v_count = ROW_COUNT;
    ELSIF p_action = 'demote' THEN
        UPDATE evo.evolution_group_participants SET role = 'member'
         WHERE group_id = p_group_id AND participant_jid = ANY (p_participants);
        GET DIAGNOSTICS v_count = ROW_COUNT;
    ELSE
        RAISE NOTICE 'fn_upsert_group_participants: ação desconhecida "%" (add|remove|promote|demote)', p_action;
    END IF;
    UPDATE evo.evolution_groups
       SET participant_count = (
             SELECT count(*) FROM evo.evolution_group_participants
              WHERE group_id = p_group_id AND is_active
           ),
           updated_at = now()
     WHERE id = p_group_id;
    RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION evo.fn_upsert_group_from_event(
    p_connection_id uuid,
    p_group_id      text,
    p_name          text,
    p_desc          text DEFAULT NULL,
    p_participants  text[] DEFAULT NULL,
    p_instance      text DEFAULT 'wpp2'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public
AS $$
DECLARE
    v_group_uuid uuid;
BEGIN
    IF p_group_id IS NULL OR btrim(p_group_id) = '' THEN
        RETURN NULL;
    END IF;
    INSERT INTO evo.evolution_groups AS eg
        (whatsapp_connection_id, group_id, name, description, participant_count,
         avatar_url, instance_name, updated_at)
    VALUES
        (p_connection_id, p_group_id,
         COALESCE(NULLIF(btrim(p_name), ''), p_group_id),
         NULLIF(btrim(COALESCE(p_desc, '')), ''),
         0, NULL,
         COALESCE(NULLIF(btrim(p_instance), ''), 'wpp2'),
         now())
    ON CONFLICT (whatsapp_connection_id, group_id) DO UPDATE
        SET name          = COALESCE(NULLIF(btrim(EXCLUDED.name), ''), eg.name),
            description   = COALESCE(EXCLUDED.description, eg.description),
            instance_name = COALESCE(EXCLUDED.instance_name, eg.instance_name),
            updated_at    = now()
    RETURNING id INTO v_group_uuid;
    IF p_participants IS NOT NULL AND cardinality(p_participants) > 0 THEN
        PERFORM evo.fn_upsert_group_participants(v_group_uuid, p_participants, 'add', p_instance);
    ELSE
        UPDATE evo.evolution_groups
           SET participant_count = (
                 SELECT count(*) FROM evo.evolution_group_participants
                  WHERE group_id = v_group_uuid AND is_active
               ),
               updated_at = now()
         WHERE id = v_group_uuid;
    END IF;
    RETURN v_group_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION zapp.zapp_upsert_group_from_event(
    p_connection_id uuid,
    p_group_id      text,
    p_name          text DEFAULT NULL,
    p_desc          text DEFAULT NULL,
    p_participants  text[] DEFAULT NULL,
    p_instance      text DEFAULT 'wpp2'
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp, evo, public
AS $$
    SELECT evo.fn_upsert_group_from_event(p_connection_id, p_group_id, p_name, p_desc, p_participants, p_instance);
$$;

CREATE OR REPLACE FUNCTION zapp.zapp_upsert_group_participants(
    p_group_id     uuid,
    p_participants text[],
    p_action       text DEFAULT 'add',
    p_instance     text DEFAULT 'wpp2'
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp, evo, public
AS $$
    SELECT evo.fn_upsert_group_participants(p_group_id, p_participants, p_action, p_instance);
$$;

REVOKE ALL ON FUNCTION evo.fn_resolve_contact_id_by_jid(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evo.fn_resolve_contact_id_by_jid(text) TO service_role;
REVOKE ALL ON FUNCTION evo.fn_upsert_group_participants(uuid, text[], text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evo.fn_upsert_group_participants(uuid, text[], text, text) TO service_role;
REVOKE ALL ON FUNCTION evo.fn_upsert_group_from_event(uuid, text, text, text, text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evo.fn_upsert_group_from_event(uuid, text, text, text, text[], text) TO service_role;
REVOKE ALL ON FUNCTION zapp.zapp_upsert_group_from_event(uuid, text, text, text, text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.zapp_upsert_group_from_event(uuid, text, text, text, text[], text) TO service_role;
REVOKE ALL ON FUNCTION zapp.zapp_upsert_group_participants(uuid, text[], text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.zapp_upsert_group_participants(uuid, text[], text, text) TO service_role;

CREATE OR REPLACE VIEW zapp.evolution_groups
WITH (security_invoker = on)
AS
SELECT id, whatsapp_connection_id, group_id, name, description,
       participant_count, avatar_url, instance_name, created_at, updated_at
  FROM evo.evolution_groups;

GRANT SELECT ON zapp.evolution_groups TO service_role;
GRANT SELECT ON zapp.evolution_groups TO authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_groups_connection_group_key
    ON zapp.whatsapp_groups (whatsapp_connection_id, group_id);

-- ----------------------------------------------------------------------------
-- Backfill diário de grupos via API (fetchAllGroups)
-- Aplicado: função + cron 464 (04:10 diário). PENDÊNCIA: auth da API (401 com
-- a chave atual) — ajustar a chave em evo.evolution_instance_credentials ou o
-- header quando o token correto for identificado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION evo.fn_sync_groups_from_api(p_instance text DEFAULT 'wpp2', p_timeout_s int DEFAULT 12)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, zapp, net, public
AS $$
DECLARE
    v_cred record; v_conn record; v_req bigint; v_resp record;
    v_body jsonb; v_g jsonb; v_participants text[]; v_gid text; v_name text; v_desc text;
    v_upserted int := 0; v_errors int := 0; v_err text; v_i int;
BEGIN
    SELECT api_url, api_key INTO v_cred FROM evo.evolution_instance_credentials
     WHERE instance_name = p_instance LIMIT 1;
    IF v_cred.api_url IS NULL OR v_cred.api_key IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'credenciais_ausentes');
    END IF;
    SELECT id INTO v_conn FROM zapp.whatsapp_connections
     WHERE instance_name = p_instance ORDER BY updated_at DESC LIMIT 1;
    IF v_conn.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'conexao_nao_encontrada');
    END IF;
    SELECT net.http_get(rtrim(v_cred.api_url, '/') || '/group/fetchAllGroups/' || p_instance,
                        jsonb_build_object('apikey', v_cred.api_key)) INTO v_req;
    v_i := 0;
    LOOP
        v_i := v_i + 1;
        SELECT id, status_code, content, timed_out INTO v_resp FROM net._http_response WHERE id = v_req;
        EXIT WHEN v_resp.id IS NOT NULL OR v_i >= p_timeout_s;
        PERFORM pg_sleep(1);
    END LOOP;
    IF v_resp.id IS NULL OR v_resp.timed_out THEN
        RETURN jsonb_build_object('ok', false, 'error', 'timeout_http', 'request_id', v_req);
    END IF;
    IF v_resp.status_code <> 200 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'http_' || v_resp.status_code, 'body_prefix', left(COALESCE(v_resp.content, ''), 200));
    END IF;
    v_body := v_resp.content::jsonb;
    IF jsonb_typeof(v_body) <> 'array' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'resposta_invalida', 'body_prefix', left(v_resp.content, 200));
    END IF;
    FOR v_g IN SELECT * FROM jsonb_array_elements(v_body) LOOP
        BEGIN
            v_gid := COALESCE(v_g ->> 'id', v_g ->> 'remoteJid', v_g ->> 'jid');
            IF v_gid IS NULL OR v_gid = '' THEN CONTINUE; END IF;
            v_name := COALESCE(v_g ->> 'subject', v_g ->> 'name');
            v_desc := COALESCE(v_g ->> 'desc', v_g ->> 'description');
            v_participants := ARRAY(SELECT jsonb_array_elements_text(
                CASE WHEN jsonb_typeof(v_g -> 'participants') = 'array' THEN v_g -> 'participants' ELSE '[]'::jsonb END));
            PERFORM evo.fn_upsert_group_from_event(v_conn.id, v_gid, v_name, v_desc, v_participants, p_instance);
            v_upserted := v_upserted + 1;
        EXCEPTION WHEN OTHERS THEN
            v_errors := v_errors + 1; v_err := SQLERRM;
        END;
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'instancia', p_instance,
        'grupos_upsertados', v_upserted, 'erros', v_errors, 'ultimo_erro', v_err, 'executado_em', now());
END;
$$;

REVOKE ALL ON FUNCTION evo.fn_sync_groups_from_api(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION evo.fn_sync_groups_from_api(text, int) TO service_role;

-- Cron criado em produção com jobid 464 ('sync-groups-daily', '10 4 * * *')
-- SELECT cron.schedule('sync-groups-daily', '10 4 * * *', $$SELECT evo.fn_sync_groups_from_api()$$);

-- ============================================================================
-- Rollback (documentado — NÃO executar em prod sem avaliação):
--   DROP VIEW zapp.evolution_groups;
--   DROP FUNCTION zapp.zapp_upsert_group_participants(uuid, text[], text, text);
--   DROP FUNCTION zapp.zapp_upsert_group_from_event(uuid, text, text, text, text[], text);
--   DROP FUNCTION evo.fn_upsert_group_from_event(uuid, text, text, text, text[], text);
--   DROP FUNCTION evo.fn_upsert_group_participants(uuid, text[], text, text);
--   DROP FUNCTION evo.fn_resolve_contact_id_by_jid(text);
--   DROP FUNCTION evo.fn_sync_groups_from_api(text, int);
--   DROP TRIGGER trg_evolution_groups_updated_at ON evo.evolution_groups;
--   DROP FUNCTION evo.fn_set_updated_at();
--   DROP INDEX evo.evolution_groups_name_trgm_idx;
--   DROP INDEX evo.evolution_groups_instance_idx;
--   DROP INDEX evo.evolution_groups_connection_idx;
--   DROP INDEX evo.evolution_group_participants_active_idx;
--   DROP INDEX zapp.whatsapp_groups_connection_group_key;
--   DROP TABLE evo.evolution_groups;
--   (cron: SELECT cron.unschedule(464);)
-- ============================================================================
