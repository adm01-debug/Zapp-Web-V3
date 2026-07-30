-- =============================================================================
-- MIGRATION: critical_10_steps_fix
-- Data: 2026-07-03
-- Autor: Senior Dev / PhD DB Analysis
-- Branch: fix/critical-10-steps-perfection
--
-- RESUMO DAS CORREÇÕES:
--   1. RPCs multi-instância: NULL = todas as instâncias (não mais hardcode wpp2)
--   2. Triggers INSTEAD OF com evo.* explícito (não mais resolvendo para VIEWs)
--   3. SECURITY DEFINER em get_contact_conversations e get_contact_notes
--   4. View public.contacts: CTE para workspace_id + DISTINCT ON para connection_id
--   5. Toggle star/important/follow-up via RPCs SECDEF (não dbFrom em VIEW)
--   6. rpc_get_contact overloads com schema evo.* explícito
--   7. messages_update_trigger: usa evo.evolution_messages (não VIEW)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RPCs multi-instância (NULL = todas as instâncias)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_list_conversations(
  p_instance text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_assigned_to text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS SETOF evo.evolution_conversations
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, evo
AS $$
  SELECT * FROM evo.evolution_conversations
  WHERE (p_instance IS NULL OR instance_name = p_instance)
    AND (p_status IS NULL OR status = p_status)
    AND (p_assigned_to IS NULL OR assigned_to = p_assigned_to)
  ORDER BY last_message_at DESC NULLS LAST
  LIMIT p_limit
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.rpc_list_contacts(
  p_instance text DEFAULT NULL,
  p_lead_status text DEFAULT NULL,
  p_assigned_to text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS SETOF evo.evolution_contacts
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, evo
AS $$
  SELECT * FROM evo.evolution_contacts
  WHERE deleted_at IS NULL
    AND (p_instance IS NULL OR instance_name = p_instance)
    AND (p_lead_status IS NULL OR lead_status = p_lead_status)
    AND (p_assigned_to IS NULL OR assigned_to = p_assigned_to)
    AND (
      p_search IS NULL
      OR full_name ILIKE '%' || p_search || '%'
      OR push_name ILIKE '%' || p_search || '%'
      OR phone_number ILIKE '%' || p_search || '%'
      OR remote_jid ILIKE '%' || p_search || '%'
    )
  ORDER BY last_message_at DESC NULLS LAST
  LIMIT p_limit
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.rpc_list_messages_lite(
  p_remote_jid text,
  p_instance text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_before_date timestamp with time zone DEFAULT NULL
)
RETURNS SETOF evo.evolution_messages
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, evo
AS $$
  SELECT * FROM evo.evolution_messages
  WHERE remote_jid = p_remote_jid
    AND (p_instance IS NULL OR instance_name = p_instance)
    AND deleted_at IS NULL
    AND (p_before_date IS NULL OR created_at < p_before_date)
  ORDER BY created_at DESC
  LIMIT p_limit
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.rpc_list_messages(
  p_remote_jid text,
  p_instance text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_before_date timestamp with time zone DEFAULT NULL
)
RETURNS SETOF evo.evolution_messages
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, evo
AS $$
  SELECT * FROM evo.evolution_messages
  WHERE remote_jid = p_remote_jid
    AND (p_instance IS NULL OR instance_name = p_instance)
    AND deleted_at IS NULL
    AND (p_before_date IS NULL OR created_at < p_before_date)
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;

-- -----------------------------------------------------------------------------
-- 2. RPCs de toggle (SECURITY DEFINER, escrevem em evo.* diretamente)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_toggle_message_star(
  p_message_id uuid, p_value boolean
)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = public, evo
AS $$
  UPDATE evo.evolution_messages
  SET is_starred = p_value, updated_at = now()
  WHERE id = p_message_id;
$$;

CREATE OR REPLACE FUNCTION public.rpc_toggle_message_important(
  p_message_id uuid, p_value boolean
)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = public, evo
AS $$
  UPDATE evo.evolution_messages
  SET is_important = p_value, updated_at = now()
  WHERE id = p_message_id;
$$;

CREATE OR REPLACE FUNCTION public.rpc_schedule_follow_up(
  p_message_id uuid,
  p_follow_up_at timestamptz,
  p_follow_up_done boolean DEFAULT false
)
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = public, evo
AS $$
  UPDATE evo.evolution_messages
  SET follow_up_at = p_follow_up_at,
      follow_up_done = p_follow_up_done,
      updated_at = now()
  WHERE id = p_message_id;
$$;

-- -----------------------------------------------------------------------------
-- 3. SECURITY DEFINER em get_contact_conversations e get_contact_notes
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_contact_conversations(uuid, integer);
CREATE FUNCTION public.get_contact_conversations(
  p_contact_id uuid, p_limit integer DEFAULT 30
)
RETURNS SETOF evo.evolution_conversations
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, evo, zapp
AS $$
  SELECT * FROM evo.evolution_conversations
  WHERE contact_id = p_contact_id
  ORDER BY last_message_at DESC NULLS LAST
  LIMIT COALESCE(p_limit, 30);
$$;

DROP FUNCTION IF EXISTS public.get_contact_notes(uuid, integer);
CREATE FUNCTION public.get_contact_notes(
  p_contact_id uuid, p_limit integer DEFAULT 30
)
RETURNS TABLE(id uuid, content text, author_id uuid, name text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, evo, zapp
AS $$
  SELECT n.id, n.content, n.author_id, p.name, n.created_at
  FROM zapp.contact_notes n
  LEFT JOIN public.profiles p ON p.id = n.author_id
  WHERE n.contact_id = p_contact_id
  ORDER BY n.created_at DESC
  LIMIT COALESCE(p_limit, 30);
$$;

-- -----------------------------------------------------------------------------
-- 4. View public.contacts — CTE materialized (elimina N+1) + DISTINCT ON
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.contacts AS
WITH
  ws AS MATERIALIZED (
    SELECT id AS workspace_id FROM public.workspaces ORDER BY created_at LIMIT 1
  ),
  wc_map AS MATERIALIZED (
    SELECT DISTINCT ON (instance_name)
      id AS connection_id, instance_name
    FROM public.whatsapp_connections
    WHERE is_active = true
    ORDER BY instance_name, last_connected_at DESC NULLS LAST, created_at DESC
  )
SELECT
  ec.id,
  COALESCE(ec.full_name, ec.push_name, 'Sem nome'::character varying)       AS name,
  COALESCE(ec.phone_number, split_part(ec.remote_jid::text,'@',1)::varchar) AS phone,
  ec.email, ec.profile_picture_url AS avatar_url,
  COALESCE(ec.lead_status,'open'::varchar) AS status,
  ec.assigned_to, NULL::uuid AS queue_id,
  wm.connection_id AS whatsapp_connection_id,
  ec.last_message_at, ec.first_contact_at AS first_message_at,
  COALESCE(ec.message_count,0) AS unread_count,
  false AS is_blocked, false AS is_favorite,
  NULL::text AS cpf, ec.company,
  ec.role_title AS "position",
  NULL::text AS address, NULL::text AS city, NULL::text AS state,
  'BR'::text AS country, ec.notes,
  ec.lead_source AS source, ec.remote_jid AS external_id,
  ec.raw_data AS metadata, ec.created_at, ec.updated_at,
  ec.remote_jid, ec.push_name, ec.instance_name,
  ec.lead_score, ec.total_purchases, ec.whatsapp_labels, ec.tags,
  ec.push_name::text AS nickname, NULL::text AS surname,
  ec.role_title::text AS job_title,
  COALESCE(ec.lead_status,'open'::varchar)::text AS contact_type,
  'normal'::text AS ai_priority, 'neutral'::text AS ai_sentiment,
  'whatsapp'::text AS channel_type, NULL::uuid AS channel_connection_id,
  NULL::text AS group_category, 0 AS risk_score,
  ec.lead_source::text AS lead_origin,
  CASE
    WHEN ec.lgpd_consent_at IS NOT NULL AND ec.lgpd_opt_out_at IS NULL THEN 'granted'
    WHEN ec.lgpd_opt_out_at IS NOT NULL THEN 'opt_out'
    ELSE 'unknown'
  END AS consent_status,
  ec.deleted_at,
  'whatsapp'::text AS channel,
  ec.last_message_at AS last_seen_at,
  ws.workspace_id
FROM evo.evolution_contacts ec
LEFT JOIN wc_map wm ON wm.instance_name = ec.instance_name::text
CROSS JOIN ws
WHERE ec.deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- 5. Triggers de contacts — schema evo.* explícito
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_contacts_view_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, evo, zapp
AS $$
BEGIN
  UPDATE evo.evolution_contacts
  SET full_name=COALESCE(NEW.name,full_name), phone_number=COALESCE(NEW.phone,phone_number),
      email=COALESCE(NEW.email,email), profile_picture_url=COALESCE(NEW.avatar_url,profile_picture_url),
      lead_status=COALESCE(NEW.status,lead_status), assigned_to=NEW.assigned_to,
      company=COALESCE(NEW.company,company), role_title=COALESCE(NEW.position,role_title),
      notes=COALESCE(NEW.notes,notes), lead_source=COALESCE(NEW.source,lead_source),
      tags=COALESCE(NEW.tags,tags), deleted_at=NEW.deleted_at, updated_at=now()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_contacts_view_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, evo, zapp
AS $$
BEGIN
  UPDATE evo.evolution_contacts SET deleted_at=now(), updated_at=now() WHERE id=OLD.id;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_contacts_view_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, evo, zapp
AS $$
DECLARE v_new_id uuid;
BEGIN
  INSERT INTO evo.evolution_contacts (
    id, full_name, phone_number, email, profile_picture_url,
    lead_status, assigned_to, company, role_title, notes,
    lead_source, instance_name, remote_jid, push_name, tags, created_at
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()), NEW.name, NEW.phone, NEW.email, NEW.avatar_url,
    COALESCE(NEW.status,'open'), NEW.assigned_to, NEW.company, NEW.position, NEW.notes,
    NEW.source, COALESCE(NEW.instance_name,'wpp_pink_test'),
    COALESCE(NEW.external_id, NEW.remote_jid, NEW.phone||'@s.whatsapp.net'),
    NEW.push_name, NEW.tags, COALESCE(NEW.created_at, now())
  ) RETURNING id INTO v_new_id;
  NEW.id := v_new_id;
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Trigger public.messages UPDATE — todos os campos + schema evo.*
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.messages_update_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, evo
AS $$
BEGIN
  UPDATE evo.evolution_messages
  SET
    is_read      = COALESCE(NEW.is_read, OLD.is_read),
    status       = CASE WHEN NEW.status IS DISTINCT FROM OLD.status THEN NEW.status ELSE status END,
    is_starred   = COALESCE(NEW.is_starred, OLD.is_starred),
    is_important = COALESCE(NEW.is_important, OLD.is_important),
    follow_up_at = NEW.follow_up_at,
    follow_up_done = COALESCE(NEW.follow_up_done, OLD.follow_up_done),
    category     = COALESCE(NEW.category, OLD.category),
    sentiment    = COALESCE(NEW.sentiment, OLD.sentiment),
    tags         = COALESCE(NEW.tags, OLD.tags),
    notes        = NEW.notes,
    content      = CASE WHEN NEW.content IS DISTINCT FROM OLD.content THEN NEW.content ELSE content END,
    updated_at   = now()
  WHERE id = OLD.id;
  RETURN NEW;
END;
$$;

-- Trigger INSTEAD OF DELETE em public.messages
CREATE OR REPLACE FUNCTION public.messages_instead_of_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, evo
AS $$
BEGIN
  UPDATE evo.evolution_messages SET deleted_at=now(), updated_at=now() WHERE id=OLD.id;
  RETURN OLD;
END;
$$;

-- Recriar o trigger DELETE se não existir
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='messages_instead_of_delete_tg'
      AND tgrelid='public.messages'::regclass
  ) THEN
    CREATE TRIGGER messages_instead_of_delete_tg
      INSTEAD OF DELETE ON public.messages
      FOR EACH ROW EXECUTE FUNCTION public.messages_instead_of_delete();
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 7. rpc_get_contact — schema evo.* explícito em ambas overloads
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.rpc_get_contact(uuid);
CREATE FUNCTION public.rpc_get_contact(p_contact_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, evo
AS $$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'contact', to_jsonb(c.*),
    'deals', COALESCE((SELECT jsonb_agg(to_jsonb(d.*)) FROM evo.evolution_deals d WHERE d.contact_id=c.id),'[]'),
    'recent_messages', COALESCE((SELECT jsonb_agg(to_jsonb(m.*)) FROM (SELECT * FROM evo.evolution_messages WHERE contact_id=c.id ORDER BY created_at DESC LIMIT 20) m),'[]'),
    'tasks', COALESCE((SELECT jsonb_agg(to_jsonb(t.*)) FROM evo.evolution_tasks t WHERE t.contact_id=c.id AND t.status IN ('pending','in_progress')),'[]')
  ) INTO v_result
  FROM evo.evolution_contacts c WHERE c.id=p_contact_id;
  RETURN v_result;
END;
$$;

DROP FUNCTION IF EXISTS public.rpc_get_contact(text, text);
CREATE FUNCTION public.rpc_get_contact(
  p_remote_jid text, p_instance text DEFAULT NULL
)
RETURNS SETOF evo.evolution_contacts
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, evo
AS $$
  SELECT * FROM evo.evolution_contacts
  WHERE remote_jid=p_remote_jid
    AND (p_instance IS NULL OR instance_name=p_instance)
    AND deleted_at IS NULL
  ORDER BY updated_at DESC
  LIMIT 1;
$$;

-- =============================================================================
-- FIM DA MIGRATION
-- Verificação: SELECT COUNT(*) FROM public.rpc_list_conversations(NULL, NULL, NULL, 99999);
-- Esperado: 12485 (todas instâncias)
-- =============================================================================
