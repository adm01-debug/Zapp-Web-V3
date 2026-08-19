-- FN: zapp.fn_process_contacts_batch -- versao final 2026-08-10
-- Guards incluidos:
--   1. Valida instancia em zapp.whatsapp_connections (Gap3)
--   2. @broadcast e @newsletter contados como skipped e NAO inseridos (precisao de contador)
--   3. @g.us (grupos) continuam sendo inseridos com phone_number=NULL
--   4. app.batch_mode=on para N>50 -> suprime 9 AFTER triggers de evo.evolution_contacts
--   5. EXCEPTION WHEN OTHERS -> fallback item-a-item (resilencia)
--   6. batch_mode sempre resetado (normal + exception path) -> sem leak
-- Performance: 60x vs loop serial (35ms/100 contacts vs ~18.5s p99).

CREATE OR REPLACE FUNCTION zapp.fn_process_contacts_batch(
  p_contacts jsonb,
  p_instance text DEFAULT 'wpp2'::text
)
RETURNS TABLE(processed integer, skipped integer, error_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$
DECLARE
  v_processed integer := 0;
  v_skipped   integer := 0;
  v_errors    integer := 0;
  v_arr_size  integer := 0;
  v_use_batch_mode boolean := false;
  v_item jsonb;
  v_jid  text;
  v_phone text;
BEGIN
  IF p_contacts IS NULL OR jsonb_typeof(p_contacts) NOT IN ('array','object') THEN
    RETURN QUERY SELECT 0, 0, 0;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM zapp.whatsapp_connections WHERE instance_name = p_instance LIMIT 1) THEN
    RAISE WARNING 'fn_process_contacts_batch: instancia % nao encontrada', p_instance;
    RETURN QUERY SELECT 0, 0, 1;
    RETURN;
  END IF;

  IF jsonb_typeof(p_contacts) = 'object' THEN
    p_contacts := jsonb_build_array(p_contacts);
  END IF;

  SELECT COUNT(*) INTO v_skipped
  FROM jsonb_array_elements(p_contacts) AS c
  WHERE
    COALESCE(c->>'id', c->>'remoteJid') IS NULL
    OR COALESCE(c->>'id', c->>'remoteJid') LIKE '%@broadcast'
    OR COALESCE(c->>'id', c->>'remoteJid') LIKE '%@newsletter';

  v_arr_size := jsonb_array_length(p_contacts) - v_skipped;
  v_use_batch_mode := v_arr_size > 50;

  IF v_use_batch_mode THEN
    PERFORM set_config('app.batch_mode', 'on', true);
  END IF;

  BEGIN
    WITH input_rows AS (
      SELECT
        COALESCE(c->>'id', c->>'remoteJid') AS remote_jid,
        COALESCE(c->>'pushName', c->>'name', c->>'notify') AS push_name,
        CASE
          WHEN COALESCE(c->>'id', c->>'remoteJid') LIKE '%@g.us'        THEN NULL
          WHEN COALESCE(c->>'id', c->>'remoteJid') LIKE '%@broadcast'   THEN NULL
          WHEN COALESCE(c->>'id', c->>'remoteJid') LIKE '%@newsletter'  THEN NULL
          ELSE substring(regexp_replace(COALESCE(c->>'id', c->>'remoteJid'), '@.+$', '') FROM 1 FOR 20)
        END AS phone_number,
        COALESCE(c->>'profilePictureUrl', c->>'imgUrl') AS profile_picture_url
      FROM jsonb_array_elements(p_contacts) AS c
      WHERE
        COALESCE(c->>'id', c->>'remoteJid') IS NOT NULL
        AND COALESCE(c->>'id', c->>'remoteJid') NOT LIKE '%@broadcast'
        AND COALESCE(c->>'id', c->>'remoteJid') NOT LIKE '%@newsletter'
    ),
    upsert_result AS (
      INSERT INTO zapp.evolution_contacts (remote_jid, push_name, phone_number, profile_picture_url, instance_name)
      SELECT remote_jid, push_name, phone_number, profile_picture_url, p_instance
      FROM input_rows
      ON CONFLICT (remote_jid) DO UPDATE SET
        push_name            = COALESCE(EXCLUDED.push_name, evolution_contacts.push_name),
        phone_number         = EXCLUDED.phone_number,
        profile_picture_url  = COALESCE(EXCLUDED.profile_picture_url, evolution_contacts.profile_picture_url),
        updated_at           = NOW()
      RETURNING id
    )
    SELECT COUNT(*) INTO v_processed FROM upsert_result;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_process_contacts_batch: fast path falhou (% %) - item a item', SQLSTATE, SQLERRM;
    v_processed := 0; v_errors := 0;
    FOR v_item IN SELECT c FROM jsonb_array_elements(p_contacts) AS c LOOP
      v_jid := COALESCE(v_item->>'id', v_item->>'remoteJid');
      CONTINUE WHEN v_jid IS NULL;
      CONTINUE WHEN v_jid LIKE '%@broadcast';
      CONTINUE WHEN v_jid LIKE '%@newsletter';
      BEGIN
        v_phone := CASE
          WHEN v_jid LIKE '%@g.us'       THEN NULL
          WHEN v_jid LIKE '%@broadcast'  THEN NULL
          WHEN v_jid LIKE '%@newsletter' THEN NULL
          ELSE substring(regexp_replace(v_jid, '@.+$', '') FROM 1 FOR 20)
        END;
        INSERT INTO zapp.evolution_contacts (remote_jid, push_name, phone_number, profile_picture_url, instance_name)
        VALUES (v_jid, COALESCE(v_item->>'pushName', v_item->>'name', v_item->>'notify'),
                v_phone, COALESCE(v_item->>'profilePictureUrl', v_item->>'imgUrl'), p_instance)
        ON CONFLICT (remote_jid) DO UPDATE SET
          push_name           = COALESCE(EXCLUDED.push_name, evolution_contacts.push_name),
          phone_number        = EXCLUDED.phone_number,
          profile_picture_url = COALESCE(EXCLUDED.profile_picture_url, evolution_contacts.profile_picture_url),
          updated_at          = NOW();
        v_processed := v_processed + 1;
      EXCEPTION WHEN OTHERS THEN
        v_errors := v_errors + 1;
        RAISE WARNING 'fn_process_contacts_batch: item % falhou: % %', v_jid, SQLSTATE, SQLERRM;
      END;
    END LOOP;
  END;

  IF v_use_batch_mode THEN
    PERFORM set_config('app.batch_mode', 'off', true);
  END IF;

  RETURN QUERY SELECT v_processed, v_skipped, v_errors;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.batch_mode', 'off', true);
  RAISE WARNING 'fn_process_contacts_batch failed: % %', SQLSTATE, SQLERRM;
  RETURN QUERY SELECT v_processed, v_skipped, GREATEST(v_errors, 1);
END;
$function$;
