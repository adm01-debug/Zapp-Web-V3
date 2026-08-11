-- ============================================================================
-- 20260811203000_grupos_admin_phone.sql
-- Frente A2 — GRUPOS: admins + telefone dos participantes (100% ADDITIVE)
-- ----------------------------------------------------------------------------
-- Contexto (auditoria 2026-08-11): o fetchAllGroups da Evolution 2.3.7 retorna
-- participantes como { id: "@lid", phoneNumber: "@s.whatsapp.net", admin: "admin"|null }.
-- O pipeline antigo descartava `admin` (100% role='member' em produção) e
-- `phoneNumber` (86,8% dos participantes sem contact_id, pois JIDs @lid não
-- resolvem por telefone).
--
-- Conteúdo:
--   1. evo.evolution_group_participants.phone_jid (nova coluna, opcional)
--   2. evo.fn_upsert_group_participants: novo parâmetro p_phones text[] DEFAULT NULL
--      (alinhado por índice com p_participants) — grava phone_jid e resolve o
--      contact_id por telefone quando o JID (@lid) não resolve.
--   3. evo.fn_upsert_group_from_event: repassa p_phones (DEFAULT NULL).
--   4. zapp.zapp_upsert_group_from_event / zapp.zapp_upsert_group_participants:
--      repassam p_phones.
-- Uso: a edge evolution-group-sync (PR hermes-grupos-admins-phones) envia
-- p_phones e promove admins via zapp_upsert_group_participants(p_action='promote').
-- Rollback (não executar em prod sem análise):
--   ALTER TABLE evo.evolution_group_participants DROP COLUMN IF EXISTS phone_jid;
--   (funções: CREATE OR REPLACE com a assinatura anterior — ver git history)
-- ============================================================================

-- 1) Coluna opcional phone_jid (telefone real do participante, quando a API devolve)
ALTER TABLE evo.evolution_group_participants
    ADD COLUMN IF NOT EXISTS phone_jid text;

COMMENT ON COLUMN evo.evolution_group_participants.phone_jid IS
    'Telefone real (@s.whatsapp.net) do participante, quando a Evolution API o retorna (fetchAllGroups 2.3.7). Ajuda a resolver contact_id quando o participant_jid é @lid.';

-- 2) fn_upsert_group_participants com p_phones
CREATE OR REPLACE FUNCTION evo.fn_upsert_group_participants(
    p_group_id     uuid,
    p_participants text[],
    p_action       text DEFAULT 'add',
    p_instance     text DEFAULT 'wpp2',
    p_phones       text[] DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public
AS $$
DECLARE
    v_count   integer := 0;
    v_jid     text;
    v_phone   text;
    v_contact uuid;
BEGIN
    IF p_group_id IS NULL OR p_participants IS NULL OR cardinality(p_participants) = 0 THEN
        RETURN 0;
    END IF;
    IF p_action = 'add' THEN
        FOR i IN 1 .. array_length(p_participants, 1) LOOP
            v_jid := p_participants[i];
            IF v_jid IS NULL OR btrim(v_jid) = '' THEN
                CONTINUE;
            END IF;
            v_phone := NULLIF(btrim(COALESCE(p_phones[i], '')), '');
            -- Resolve por JID (@lid/@s.whatsapp.net) primeiro; fallback por telefone
            -- quando o JID não casa (LIDs não são telefones).
            v_contact := evo.fn_resolve_contact_id_by_jid(v_jid);
            IF v_contact IS NULL AND v_phone IS NOT NULL THEN
                v_contact := evo.fn_resolve_contact_id_by_jid(v_phone);
            END IF;
            INSERT INTO evo.evolution_group_participants
                (group_id, participant_jid, contact_id, phone_jid, role, joined_at, left_at, is_active)
            VALUES
                (p_group_id, v_jid, v_contact, v_phone, 'member', now(), NULL, true)
            ON CONFLICT (group_id, participant_jid) DO UPDATE
                SET is_active = true,
                    left_at   = NULL,
                    phone_jid = COALESCE(EXCLUDED.phone_jid, evo.evolution_group_participants.phone_jid),
                    contact_id = COALESCE(evo.evolution_group_participants.contact_id, EXCLUDED.contact_id);
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

-- 3) fn_upsert_group_from_event repassa p_phones
CREATE OR REPLACE FUNCTION evo.fn_upsert_group_from_event(
    p_connection_id uuid,
    p_group_id      text,
    p_name          text,
    p_desc          text DEFAULT NULL,
    p_participants  text[] DEFAULT NULL,
    p_instance      text DEFAULT 'wpp2',
    p_phones        text[] DEFAULT NULL
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
        PERFORM evo.fn_upsert_group_participants(v_group_uuid, p_participants, 'add', p_instance, p_phones);
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

-- 4) RPCs zapp repassam p_phones
CREATE OR REPLACE FUNCTION zapp.zapp_upsert_group_from_event(
    p_connection_id uuid,
    p_group_id      text,
    p_name          text DEFAULT NULL,
    p_desc          text DEFAULT NULL,
    p_participants  text[] DEFAULT NULL,
    p_instance      text DEFAULT 'wpp2',
    p_phones        text[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'zapp', 'evo', 'public'
AS $function$
    SELECT evo.fn_upsert_group_from_event(p_connection_id, p_group_id, p_name, p_desc, p_participants, p_instance, p_phones);
$function$;

CREATE OR REPLACE FUNCTION zapp.zapp_upsert_group_participants(
    p_group_id     uuid,
    p_participants text[],
    p_action       text DEFAULT 'add',
    p_instance     text DEFAULT 'wpp2',
    p_phones       text[] DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'zapp', 'evo', 'public'
AS $function$
    SELECT evo.fn_upsert_group_participants(p_group_id, p_participants, p_action, p_instance, p_phones);
$function$;
