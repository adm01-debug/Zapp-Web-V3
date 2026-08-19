
-- FIX: corpos reais nos wrappers zapp_* (fns evo alvo morreram no E50)
-- Rota sem violacao: logica em zapp (tabelas zapp.evolution_groups fisicas + bridge view contacts);
-- lookup LID via evo.rpc_boundary_resolve_lid_phone (padrao rpc_boundary_* ja allowlisted no I2).

CREATE OR REPLACE FUNCTION evo.rpc_boundary_resolve_lid_phone(p_lid text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = evo, pg_catalog, pg_temp
AS $c$ SELECT phone_number FROM evo.lid_phone_map WHERE lid_jid = btrim(p_lid) LIMIT 1 $c$;
REVOKE ALL ON FUNCTION evo.rpc_boundary_resolve_lid_phone(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION zapp.zapp_touch_contact_presence(p_remote_jid text, p_presence text, p_instance text DEFAULT 'wpp2')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = zapp, pg_catalog, pg_temp
AS $function$
DECLARE v_updated int; v_phone text;
BEGIN
  IF p_remote_jid IS NULL OR btrim(p_remote_jid) = '' THEN RETURN false; END IF;
  v_phone := evo.rpc_boundary_resolve_lid_phone(p_remote_jid);
  UPDATE zapp.evolution_contacts
  SET presence_status = COALESCE(NULLIF(btrim(p_presence), ''), presence_status),
      last_presence_at = now(),
      last_seen_at = CASE WHEN lower(COALESCE(btrim(p_presence), '')) IN ('available','online') THEN now() ELSE last_seen_at END,
      updated_at = now()
  WHERE instance_name = p_instance AND deleted_at IS NULL
    AND (remote_jid = btrim(p_remote_jid) OR (v_phone IS NOT NULL AND v_phone <> '' AND phone_number = v_phone))
    AND (presence_status IS DISTINCT FROM COALESCE(NULLIF(btrim(p_presence), ''), presence_status)
         OR last_presence_at IS NULL OR last_presence_at < now() - interval '60 seconds');
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$function$;

CREATE OR REPLACE FUNCTION zapp.zapp_upsert_group_from_event(p_connection_id uuid, p_group_id text, p_name text DEFAULT NULL, p_desc text DEFAULT NULL, p_participants text[] DEFAULT NULL, p_instance text DEFAULT 'wpp2', p_phones text[] DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = zapp, pg_catalog, pg_temp
AS $function$
DECLARE v_group_uuid uuid;
BEGIN
  IF p_group_id IS NULL OR btrim(p_group_id) = '' THEN RETURN NULL; END IF;
  INSERT INTO zapp.evolution_groups AS eg
    (whatsapp_connection_id, group_id, name, description, participant_count, avatar_url, instance_name, updated_at)
  VALUES
    (p_connection_id, p_group_id, COALESCE(NULLIF(btrim(p_name),''), p_group_id),
     NULLIF(btrim(COALESCE(p_desc,'')), ''), 0, NULL, COALESCE(NULLIF(btrim(p_instance),''), 'wpp2'), now())
  ON CONFLICT (whatsapp_connection_id, group_id) DO UPDATE
    SET name=COALESCE(NULLIF(btrim(EXCLUDED.name),''), eg.name),
        description=COALESCE(EXCLUDED.description, eg.description),
        instance_name=COALESCE(EXCLUDED.instance_name, eg.instance_name),
        updated_at=now()
  RETURNING id INTO v_group_uuid;
  IF p_participants IS NOT NULL AND cardinality(p_participants) > 0 THEN
    PERFORM evo.fn_upsert_group_participants(v_group_uuid, p_participants, 'add', p_instance, p_phones);
  ELSE
    UPDATE zapp.evolution_groups
      SET participant_count=(SELECT count(*) FROM zapp.evolution_group_participants WHERE group_id=v_group_uuid AND is_active),
          updated_at=now()
    WHERE id=v_group_uuid;
  END IF;
  RETURN v_group_uuid;
END; $function$;

CREATE OR REPLACE FUNCTION zapp.zapp_upsert_group_participants(p_group_id uuid, p_participants text[], p_action text DEFAULT 'add', p_instance text DEFAULT 'wpp2', p_phones text[] DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = zapp, pg_catalog, pg_temp
AS $function$
DECLARE v_count integer := 0;
BEGIN
  IF p_group_id IS NULL OR p_participants IS NULL OR cardinality(p_participants) = 0 THEN RETURN 0; END IF;
  IF p_action = 'add' THEN
    INSERT INTO zapp.evolution_group_participants
      (group_id, participant_jid, contact_id, phone_jid, role, joined_at, left_at, is_active)
    SELECT p_group_id, t.jid,
           COALESCE(evo.fn_resolve_contact_id_by_jid(t.jid), CASE WHEN t.phone <> '' THEN evo.fn_resolve_contact_id_by_jid(t.phone) END),
           NULLIF(t.phone, ''), 'member', now(), NULL, true
    FROM (SELECT p_participants[i] AS jid, COALESCE(p_phones[i], '') AS phone FROM generate_subscripts(p_participants, 1) AS i) t
    WHERE btrim(t.jid) <> ''
    ON CONFLICT (group_id, participant_jid) DO UPDATE
      SET is_active=true, left_at=NULL,
          phone_jid=COALESCE(EXCLUDED.phone_jid, zapp.evolution_group_participants.phone_jid),
          contact_id=COALESCE(zapp.evolution_group_participants.contact_id, EXCLUDED.contact_id);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF p_action = 'remove' THEN
    UPDATE zapp.evolution_group_participants SET left_at=now(), is_active=false WHERE group_id=p_group_id AND participant_jid=ANY(p_participants) AND is_active;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF p_action = 'promote' THEN
    UPDATE zapp.evolution_group_participants SET role='admin' WHERE group_id=p_group_id AND participant_jid=ANY(p_participants);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF p_action = 'demote' THEN
    UPDATE zapp.evolution_group_participants SET role='member' WHERE group_id=p_group_id AND participant_jid=ANY(p_participants);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;
  UPDATE zapp.evolution_groups SET participant_count=(SELECT count(*) FROM zapp.evolution_group_participants WHERE group_id=p_group_id AND is_active), updated_at=now() WHERE id=p_group_id;
  RETURN v_count;
END; $function$;

-- cron repontar: fn moveu para zapp
DO $do$
DECLARE v_id bigint;
BEGIN
  SELECT jobid INTO v_id FROM cron.job WHERE jobname='repontar-filhas-graveyard';
  IF v_id IS NOT NULL THEN
    PERFORM cron.alter_job(v_id, command := 'SELECT zapp.fn_repontar_filhas_graveyard(false)');
  END IF;
END $do$;

CREATE OR REPLACE FUNCTION zapp.fn_resolve_contact_id_by_jid(p_jid text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = zapp, pg_catalog, pg_temp
AS $function$
  SELECT c.id
    FROM zapp.evolution_contacts c
   WHERE c.deleted_at IS NULL
     AND (
           -- 1. Match exato por remote_jid (índice unique)
           lower(c.remote_jid) = lower(p_jid)
        -- 2. Match EXATO por phone_number (índice) — p_jid "55...@s.whatsapp.net" ou "55..."
        OR c.phone_number = split_part(p_jid, '@', 1)
        -- 3. Fallback: phone com formatação arbitrária (guard LID-as-phone 14+ dígitos)
        OR (
             regexp_replace(lower(c.phone_number), '[^0-9]', '', 'g')
               = regexp_replace(lower(split_part(p_jid, '@', 1)), '[^0-9]', '', 'g')
           AND length(regexp_replace(c.phone_number, '[^0-9]', '', 'g')) <= 13
           )
     )
   ORDER BY
     CASE
       WHEN lower(c.remote_jid) = lower(p_jid) THEN 1
       WHEN c.phone_number = split_part(p_jid, '@', 1) THEN 2
       ELSE 3
     END,
     c.updated_at DESC NULLS LAST
   LIMIT 1
$function$;
REVOKE ALL ON FUNCTION zapp.fn_resolve_contact_id_by_jid(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION zapp.zapp_upsert_group_from_event(p_connection_id uuid, p_group_id text, p_name text DEFAULT NULL, p_desc text DEFAULT NULL, p_participants text[] DEFAULT NULL, p_instance text DEFAULT 'wpp2', p_phones text[] DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = zapp, pg_catalog, pg_temp
AS $function$
DECLARE v_group_uuid uuid;
BEGIN
  IF p_group_id IS NULL OR btrim(p_group_id) = '' THEN RETURN NULL; END IF;
  INSERT INTO zapp.evolution_groups AS eg
    (whatsapp_connection_id, group_id, name, description, participant_count, avatar_url, instance_name, updated_at)
  VALUES
    (p_connection_id, p_group_id, COALESCE(NULLIF(btrim(p_name),''), p_group_id),
     NULLIF(btrim(COALESCE(p_desc,'')), ''), 0, NULL, COALESCE(NULLIF(btrim(p_instance),''), 'wpp2'), now())
  ON CONFLICT (whatsapp_connection_id, group_id) DO UPDATE
    SET name=COALESCE(NULLIF(btrim(EXCLUDED.name),''), eg.name),
        description=COALESCE(EXCLUDED.description, eg.description),
        instance_name=COALESCE(EXCLUDED.instance_name, eg.instance_name),
        updated_at=now()
  RETURNING id INTO v_group_uuid;
  IF p_participants IS NOT NULL AND cardinality(p_participants) > 0 THEN
    PERFORM zapp.zapp_upsert_group_participants(v_group_uuid, p_participants, 'add', p_instance, p_phones);
  ELSE
    UPDATE zapp.evolution_groups
      SET participant_count=(SELECT count(*) FROM zapp.evolution_group_participants WHERE group_id=v_group_uuid AND is_active),
          updated_at=now()
    WHERE id=v_group_uuid;
  END IF;
  RETURN v_group_uuid;
END; $function$;

CREATE OR REPLACE FUNCTION zapp.zapp_upsert_group_participants(p_group_id uuid, p_participants text[], p_action text DEFAULT 'add', p_instance text DEFAULT 'wpp2', p_phones text[] DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = zapp, pg_catalog, pg_temp
AS $function$
DECLARE v_count integer := 0;
BEGIN
  IF p_group_id IS NULL OR p_participants IS NULL OR cardinality(p_participants) = 0 THEN RETURN 0; END IF;
  IF p_action = 'add' THEN
    INSERT INTO zapp.evolution_group_participants
      (group_id, participant_jid, contact_id, phone_jid, role, joined_at, left_at, is_active)
    SELECT p_group_id, t.jid,
           COALESCE(zapp.fn_resolve_contact_id_by_jid(t.jid), CASE WHEN t.phone <> '' THEN zapp.fn_resolve_contact_id_by_jid(t.phone) END),
           NULLIF(t.phone, ''), 'member', now(), NULL, true
    FROM (SELECT p_participants[i] AS jid, COALESCE(p_phones[i], '') AS phone FROM generate_subscripts(p_participants, 1) AS i) t
    WHERE btrim(t.jid) <> ''
    ON CONFLICT (group_id, participant_jid) DO UPDATE
      SET is_active=true, left_at=NULL,
          phone_jid=COALESCE(EXCLUDED.phone_jid, zapp.evolution_group_participants.phone_jid),
          contact_id=COALESCE(zapp.evolution_group_participants.contact_id, EXCLUDED.contact_id);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF p_action = 'remove' THEN
    UPDATE zapp.evolution_group_participants SET left_at=now(), is_active=false WHERE group_id=p_group_id AND participant_jid=ANY(p_participants) AND is_active;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF p_action = 'promote' THEN
    UPDATE zapp.evolution_group_participants SET role='admin' WHERE group_id=p_group_id AND participant_jid=ANY(p_participants);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSIF p_action = 'demote' THEN
    UPDATE zapp.evolution_group_participants SET role='member' WHERE group_id=p_group_id AND participant_jid=ANY(p_participants);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;
  UPDATE zapp.evolution_groups SET participant_count=(SELECT count(*) FROM zapp.evolution_group_participants WHERE group_id=p_group_id AND is_active), updated_at=now() WHERE id=p_group_id;
  RETURN v_count;
END; $function$;

CREATE OR REPLACE FUNCTION zapp.fn_resolve_contact_id_by_jid(p_jid text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = zapp, pg_catalog, pg_temp
AS $function$
  SELECT c.id
    FROM zapp.evolution_contacts c
   WHERE c.deleted_at IS NULL
     AND (
           -- 1. Match exato por remote_jid (índice unique)
           lower(c.remote_jid) = lower(p_jid)
        -- 2. Match EXATO por phone_number (índice) — p_jid "55...@s.whatsapp.net" ou "55..."
        OR c.phone_number = split_part(p_jid, '@', 1)
        -- 3. Fallback: phone com formatação arbitrária (guard LID-as-phone 14+ dígitos)
        OR ( regexp_replace(lower(split_part(p_jid,'@',1)),'[^0-9]','','g') <> '' AND regexp_replace(lower(c.phone_number), '[^0-9]', '', 'g')
               = regexp_replace(lower(split_part(p_jid, '@', 1)), '[^0-9]', '', 'g')
           AND length(regexp_replace(c.phone_number, '[^0-9]', '', 'g')) <= 13
           )
     )
   ORDER BY
     CASE
       WHEN lower(c.remote_jid) = lower(p_jid) THEN 1
       WHEN c.phone_number = split_part(p_jid, '@', 1) THEN 2
       ELSE 3
     END,
     c.updated_at DESC NULLS LAST
   LIMIT 1
$function$;

-- Auditoria 10 agentes r2 (2026-08-16): E50 dropou fns com callers vivos (regex nao pegava chamadas qualificadas).
-- Path quente quebrado desde 15/08 ~20h: presenca (webhook-handlers) e sync grupos (evolution-group-sync).
-- Restauracao SEM I1/I2: logica nos wrappers zapp.* + lookup LID via evo.rpc_boundary_resolve_lid_phone (allowlisted).
-- Ordem dos CREATE importa: ultimas definicoes prevalecem. Bug latente do resolve corrigido (jid sem digitos).
-- Cron repontar-filhas-graveyard repontado evo->zapp. Mortos-quebrados reportados, nao dropados:
-- zapp_mark_status_viewed, evo.fn_burnin_monitor, zapp.fn_score_v2_pipeline.
