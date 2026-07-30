-- =============================================================================
-- MIGRATION: post_test_suite_dI
-- Data: 2026-07-03
-- Branch: fix/post-test-bugfixes
-- PR: (novo)
--
-- BUGS DETECTADOS EM BATERIA EXAUSTIVA DE TESTES (Suites A-J)
-- Ambos aplicados em producao antes do commit. Migration e idempotente.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- BUG-3 (Suite D): messages_update_trigger
-- PROBLEMA: funcao referenciava campos que NAO EXISTEM na VIEW public.messages
--   NEW.is_starred, NEW.is_important, NEW.follow_up_at, NEW.follow_up_done,
--   NEW.category, NEW.sentiment, NEW.tags, NEW.notes
--   public.messages possui 45 colunas — nenhuma desses campos esta incluida.
-- IMPACTO: QUALQUER UPDATE via public.messages (ex: SET is_read=true) falhava
--   com ERROR: record "new" has no field "is_starred"
-- SOLUCAO: trigger so acessa campos que EXISTEM na VIEW:
--   is_read, status, content
--   Os demais sao escritos via:
--     public.rpc_toggle_message_star(uuid, bool)     -- SECDEF, evo.*
--     public.rpc_toggle_message_important(uuid, bool) -- SECDEF, evo.*
--     public.rpc_schedule_follow_up(uuid, tstz, bool) -- SECDEF, evo.*
--     public.mark_follow_up_done(uuid)                -- SECDEF, evo.*
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.messages_update_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, evo
AS $$
BEGIN
  -- ATENCAO: so referenciar colunas que EXISTEM na VIEW public.messages.
  -- Verificar com: SELECT column_name FROM information_schema.columns
  --   WHERE table_schema='public' AND table_name='messages';
  UPDATE evo.evolution_messages
  SET
    is_read    = COALESCE(NEW.is_read, OLD.is_read),
    status     = CASE WHEN NEW.status IS DISTINCT FROM OLD.status
                      THEN NEW.status ELSE status END,
    content    = CASE WHEN NEW.content IS DISTINCT FROM OLD.content
                      THEN NEW.content ELSE content END,
    updated_at = now()
  WHERE id = OLD.id;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- BUG-4 (Suite I): write RPCs com p_instance DEFAULT 'wpp2' (instancia LEGADA)
-- PROBLEMA: 4 funcoes de escrita defaultavam para 'wpp2'.
--   Chamadas sem p_instance explicito enviavam dados para instancia errada.
-- SOLUCAO: p_instance DEFAULT 'wpp_pink_test' (instancia ATIVA 2026-07-03)
--   + evo.* schema explicito nas funcoes que usavam auto-updatable view.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. rpc_insert_message
CREATE OR REPLACE FUNCTION public.rpc_insert_message(
  p_remote_jid   text,
  p_content      text,
  p_message_type text    DEFAULT 'text',
  p_message_id   text    DEFAULT NULL,
  p_from_me      boolean DEFAULT true,
  p_direction    text    DEFAULT 'outbound',
  p_instance     text    DEFAULT 'wpp_pink_test'  -- era 'wpp2'
)
RETURNS evo.evolution_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, evo, zapp, monitoring
AS $$
DECLARE
  v_contact_id uuid;
  v_row        evo.evolution_messages;
BEGIN
  SELECT id INTO v_contact_id
  FROM evo.evolution_contacts
  WHERE remote_jid = p_remote_jid AND instance_name = p_instance
  LIMIT 1;

  INSERT INTO evo.evolution_messages (
    message_id, remote_jid, from_me, direction, message_type,
    content, instance_name, contact_id, status, created_at
  ) VALUES (
    p_message_id, p_remote_jid, p_from_me, p_direction, p_message_type,
    p_content, p_instance, v_contact_id,
    CASE WHEN p_from_me THEN 'sent' ELSE 'received' END,
    now()
  ) RETURNING * INTO v_row;

  UPDATE evo.evolution_contacts
  SET last_message_at = now(),
      total_messages  = COALESCE(total_messages, 0) + 1
  WHERE id = v_contact_id;

  RETURN v_row;
END;
$$;

-- 2. rpc_upsert_contact
CREATE OR REPLACE FUNCTION public.rpc_upsert_contact(
  p_remote_jid   text,
  p_instance     text    DEFAULT 'wpp_pink_test',  -- era 'wpp2'
  p_push_name    text    DEFAULT NULL,
  p_full_name    text    DEFAULT NULL,
  p_phone_number text    DEFAULT NULL,
  p_email        text    DEFAULT NULL,
  p_company      text    DEFAULT NULL,
  p_role_title   text    DEFAULT NULL,
  p_lead_status  text    DEFAULT NULL,
  p_lead_source  text    DEFAULT NULL,
  p_lead_score   integer DEFAULT NULL,
  p_assigned_to  text    DEFAULT NULL,
  p_tags         text[]  DEFAULT NULL,
  p_notes        text    DEFAULT NULL
)
RETURNS evo.evolution_contacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, evo, zapp, monitoring
AS $$
DECLARE v_row evo.evolution_contacts;
BEGIN
  INSERT INTO evo.evolution_contacts (
    remote_jid, instance_name, push_name, full_name, phone_number,
    email, company, role_title, lead_status, lead_source, lead_score,
    assigned_to, tags, notes, created_at, updated_at
  ) VALUES (
    p_remote_jid, p_instance, p_push_name, p_full_name, p_phone_number,
    p_email, p_company, p_role_title, COALESCE(p_lead_status, 'new'),
    p_lead_source, COALESCE(p_lead_score, 0), p_assigned_to, p_tags,
    p_notes, now(), now()
  )
  ON CONFLICT (remote_jid) DO UPDATE SET
    push_name     = COALESCE(EXCLUDED.push_name,     evolution_contacts.push_name),
    full_name     = COALESCE(EXCLUDED.full_name,     evolution_contacts.full_name),
    phone_number  = COALESCE(EXCLUDED.phone_number,  evolution_contacts.phone_number),
    email         = COALESCE(EXCLUDED.email,         evolution_contacts.email),
    company       = COALESCE(EXCLUDED.company,       evolution_contacts.company),
    lead_status   = COALESCE(EXCLUDED.lead_status,   evolution_contacts.lead_status),
    lead_score    = COALESCE(EXCLUDED.lead_score,    evolution_contacts.lead_score),
    assigned_to   = COALESCE(EXCLUDED.assigned_to,   evolution_contacts.assigned_to),
    tags          = COALESCE(EXCLUDED.tags,          evolution_contacts.tags),
    notes         = COALESCE(EXCLUDED.notes,         evolution_contacts.notes),
    deleted_at    = NULL,
    updated_at    = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- 3. rpc_delete_contact
CREATE OR REPLACE FUNCTION public.rpc_delete_contact(
  p_remote_jid   text,
  p_instance     text DEFAULT 'wpp_pink_test',  -- era 'wpp2'
  p_performed_by text DEFAULT 'frontend'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, evo, zapp, monitoring
AS $$
DECLARE v_affected int;
BEGIN
  UPDATE evo.evolution_contacts  -- schema explicito
  SET deleted_at = now(),
      updated_at = now()
  WHERE remote_jid    = p_remote_jid
    AND instance_name = p_instance
    AND deleted_at    IS NULL;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected > 0;
END;
$$;

-- 4. send_message_v2
CREATE OR REPLACE FUNCTION public.send_message_v2(
  p_remote_jid     text,
  p_content        text,
  p_message_type   text DEFAULT 'text',
  p_media_url      text DEFAULT NULL,
  p_media_mimetype text DEFAULT NULL,
  p_instance       text DEFAULT 'wpp_pink_test'  -- era 'wpp2'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, evo, zapp, monitoring
AS $$
DECLARE
  v_contact_id  uuid;
  v_queue_id    uuid;
  v_conn_status text;
BEGIN
  IF p_remote_jid IS NULL
  OR (COALESCE(LENGTH(TRIM(p_content)), 0) = 0 AND p_media_url IS NULL) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'remote_jid e content/media sao obrigatorios'
    );
  END IF;

  SELECT id INTO v_contact_id
  FROM evo.evolution_contacts
  WHERE remote_jid    = p_remote_jid
    AND instance_name = p_instance
    AND deleted_at    IS NULL
  LIMIT 1;

  SELECT status INTO v_conn_status
  FROM public.whatsapp_connections
  WHERE instance_name = p_instance;

  INSERT INTO zapp.outbound_message_queue (
    remote_jid, instance_name, message_type, content,
    media_url, media_mime_type, status, contact_id, created_by, metadata
  ) VALUES (
    p_remote_jid, p_instance, COALESCE(p_message_type, 'text'), p_content,
    p_media_url, p_media_mimetype, 'pending', v_contact_id, auth.uid(),
    jsonb_build_object(
      'source',                    'send_message_v2',
      'connection_status_at_enqueue', v_conn_status
    )
  ) RETURNING id INTO v_queue_id;

  RETURN jsonb_build_object(
    'success',         true,
    'message',         CASE WHEN v_conn_status = 'connected'
                         THEN 'Mensagem enfileirada para envio'
                         ELSE FORMAT(
                           'Mensagem enfileirada; instancia %s esta %s - sera enviada ao reconectar',
                           p_instance, COALESCE(v_conn_status, 'desconhecida')
                         )
                       END,
    'queue_id',        v_queue_id,
    'instance_status', v_conn_status
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACAO POS-APLICACAO
-- Executar apos aplicar a migration:
--
-- 1. Sem RPCs com default wpp2:
--   SELECT proname FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--     AND proname IN ('rpc_insert_message','rpc_upsert_contact',
--                     'rpc_delete_contact','send_message_v2')
--     AND pg_get_function_arguments(oid) LIKE '%wpp2%';
--   ESPERADO: 0 linhas
--
-- 2. messages_update_trigger sem is_starred:
--   SELECT prosrc LIKE '%NEW.is_starred%' AS has_bug
--   FROM pg_proc WHERE proname='messages_update_trigger'
--     AND pronamespace='public'::regnamespace;
--   ESPERADO: false
--
-- 3. UPDATE via VIEW funciona:
--   UPDATE public.messages SET is_read = true
--   WHERE id = (SELECT id FROM evo.evolution_messages LIMIT 1);
--   ESPERADO: sem erro
-- ─────────────────────────────────────────────────────────────────────────────
