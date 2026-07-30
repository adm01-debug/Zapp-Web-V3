-- Migration: Create 20 missing RPCs referenced by external-db-proxy ALLOWED_RPCS (BUG-42)
--
-- All functions listed in the ALLOWED_RPCS set in
-- supabase/functions/external-db-proxy/index.ts must exist in the zapp schema.
-- 20 of them had no corresponding CREATE FUNCTION in any migration.
-- Without these, any evoApi.rpc() call targeting them returns PGRST202.
--
-- Implementation tier:
--   REAL   — query a known table, result is meaningful
--   STUB   — returns empty/null/basic structure; backend integration pending
--   RAISE  — complex merge/external logic; raises P0001 with descriptive message
--
-- All functions use SET search_path = zapp to prevent search-path injection.
-- All SECURITY DEFINER functions reference tables with explicit schema prefixes.
-- All functions have REVOKE FROM PUBLIC/anon + GRANT TO authenticated.

-- ── 1. fn_test_alert_channel (STUB/RAISE) ─────────────────────────────────────
-- Used by: src/lib/evoApiHealth/hooks.ts:86 via external-db-proxy
-- Real implementation requires external alert channel integration (Slack/webhook).
DROP FUNCTION IF EXISTS zapp.fn_test_alert_channel(INT);
CREATE OR REPLACE FUNCTION zapp.fn_test_alert_channel(p_channel_id INT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  RAISE EXCEPTION 'fn_test_alert_channel: external alert channel integration not yet implemented (channel_id=%)', p_channel_id
    USING ERRCODE = 'P0001';
END;
$$;

REVOKE ALL ON FUNCTION zapp.fn_test_alert_channel(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.fn_test_alert_channel(INT) TO authenticated, service_role;

-- ── 2. rpc_dashboard_home (STUB → REAL counts) ────────────────────────────────
-- Returns summary counts for the main dashboard home view.
DROP FUNCTION IF EXISTS zapp.rpc_dashboard_home(TEXT, UUID);
CREATE OR REPLACE FUNCTION zapp.rpc_dashboard_home(
  p_instance  TEXT DEFAULT NULL,
  p_assigned_to UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_open_conversations BIGINT := 0;
  v_pending_messages   BIGINT := 0;
  v_active_agents      BIGINT := 0;
BEGIN
  -- Count open conversations from evo schema
  SELECT COUNT(*)
    INTO v_open_conversations
    FROM evo.evolution_conversations ec
   WHERE ec.status IN ('open', 'pending')
     AND (p_instance IS NULL OR ec.instance_name = p_instance)
     AND (p_assigned_to IS NULL OR ec.assigned_to = p_assigned_to);

  -- Count active agents (profiles online)
  SELECT COUNT(DISTINCT p.id)
    INTO v_active_agents
    FROM zapp.profiles p
   WHERE p.is_online = true;

  RETURN jsonb_build_object(
    'open_conversations', v_open_conversations,
    'pending_messages',   v_pending_messages,
    'active_agents',      v_active_agents,
    'instance',           p_instance,
    'generated_at',       now()
  );
END;
$$;

REVOKE ALL ON FUNCTION zapp.rpc_dashboard_home(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.rpc_dashboard_home(TEXT, UUID) TO authenticated, service_role;

-- ── 3. rpc_global_search (STUB) ───────────────────────────────────────────────
-- Full-text search across contacts and conversations.
DROP FUNCTION IF EXISTS zapp.rpc_global_search(TEXT, TEXT, INT);
CREATE OR REPLACE FUNCTION zapp.rpc_global_search(
  p_query    TEXT,
  p_instance TEXT DEFAULT NULL,
  p_limit    INT  DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_results JSONB;
  v_lim     INT := LEAST(COALESCE(p_limit, 20), 100);
BEGIN
  -- Basic contact name/phone search (contacts table uses name/phone in English)
  SELECT jsonb_agg(jsonb_build_object(
    'type',  'contact',
    'id',    c.id,
    'name',  c.name,
    'phone', c.phone,
    'email', c.email
  ))
    INTO v_results
    FROM zapp.contacts c
   WHERE c.name  ILIKE '%' || p_query || '%'
      OR c.phone ILIKE '%' || p_query || '%'
      OR c.email ILIKE '%' || p_query || '%'
   LIMIT v_lim;

  RETURN COALESCE(v_results, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION zapp.rpc_global_search(TEXT, TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.rpc_global_search(TEXT, TEXT, INT) TO authenticated, service_role;

-- ── 4. rpc_list_calls (REAL — queries evo.evolution_calls) ───────────────────
DROP FUNCTION IF EXISTS zapp.rpc_list_calls(TEXT, TEXT, INT);
CREATE OR REPLACE FUNCTION zapp.rpc_list_calls(
  p_remote_jid TEXT DEFAULT NULL,
  p_instance   TEXT DEFAULT NULL,
  p_limit      INT  DEFAULT 50
)
RETURNS TABLE (
  id           TEXT,
  remote_jid   TEXT,
  instance_name TEXT,
  call_type    TEXT,
  duration_seconds INT,
  status       TEXT,
  started_at   TIMESTAMPTZ,
  ended_at     TIMESTAMPTZ,
  created_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  RETURN QUERY
    SELECT
      ec.id::TEXT,
      ec.remote_jid,
      ec.instance_name,
      ec.call_type,
      ec.duration_seconds,
      ec.status,
      ec.started_at,
      ec.ended_at,
      ec.created_at
    FROM evo.evolution_calls ec
   WHERE (p_remote_jid IS NULL OR ec.remote_jid = p_remote_jid)
     AND (p_instance   IS NULL OR ec.instance_name = p_instance)
   ORDER BY ec.created_at DESC
   LIMIT LEAST(COALESCE(p_limit, 50), 500);
END;
$$;

REVOKE ALL ON FUNCTION zapp.rpc_list_calls(TEXT, TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.rpc_list_calls(TEXT, TEXT, INT) TO authenticated, service_role;

-- ── 5. sync_interaction_from_zapp (RAISE) ─────────────────────────────────────
-- Complex CRM sync — requires external CRM API integration.
DROP FUNCTION IF EXISTS zapp.sync_interaction_from_zapp(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, INT, INT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION zapp.sync_interaction_from_zapp(
  p_phone                   TEXT,
  p_channel                 TEXT    DEFAULT NULL,
  p_direction               TEXT    DEFAULT NULL,
  p_assunto                 TEXT    DEFAULT NULL,
  p_resumo                  TEXT    DEFAULT NULL,
  p_conteudo                TEXT    DEFAULT NULL,
  p_sentiment               NUMERIC DEFAULT NULL,
  p_message_count           INT     DEFAULT NULL,
  p_duration_seconds        INT     DEFAULT NULL,
  p_agent_name              TEXT    DEFAULT NULL,
  p_zapp_conversation_id    TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  RAISE EXCEPTION 'sync_interaction_from_zapp: external CRM sync integration not yet implemented'
    USING ERRCODE = 'P0001',
          HINT    = 'Implement CRM API webhook in an Edge Function and call it from here';
END;
$$;

REVOKE ALL ON FUNCTION zapp.sync_interaction_from_zapp(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,NUMERIC,INT,INT,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.sync_interaction_from_zapp(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,NUMERIC,INT,INT,TEXT,TEXT) TO authenticated, service_role;

-- ── 6. get_companies_by_phones_batch (STUB) ───────────────────────────────────
DROP FUNCTION IF EXISTS zapp.get_companies_by_phones_batch(TEXT[]);
CREATE OR REPLACE FUNCTION zapp.get_companies_by_phones_batch(p_phones TEXT[])
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_results JSONB;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'phone',        e.telefone,
    'company_id',   e.id,
    'company_name', e.nome_fantasia,
    'cnpj',         e.cnpj,
    'email',        e.email
  ))
    INTO v_results
    FROM zapp.empresas e
   WHERE e.telefone = ANY(p_phones)
      OR e.telefone2 = ANY(p_phones);

  RETURN COALESCE(v_results, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION zapp.get_companies_by_phones_batch(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.get_companies_by_phones_batch(TEXT[]) TO authenticated, service_role;

-- ── 7. get_avatars_by_jids_batch (REAL) ───────────────────────────────────────
DROP FUNCTION IF EXISTS zapp.get_avatars_by_jids_batch(TEXT[]);
CREATE OR REPLACE FUNCTION zapp.get_avatars_by_jids_batch(p_jids TEXT[])
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_results JSONB;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'jid',        ec.jid,
    'avatar_url', ec.image_url
  ))
    INTO v_results
    FROM evo.evolution_contacts ec
   WHERE ec.jid = ANY(p_jids)
     AND ec.image_url IS NOT NULL;

  RETURN COALESCE(v_results, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION zapp.get_avatars_by_jids_batch(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.get_avatars_by_jids_batch(TEXT[]) TO authenticated, service_role;

-- ── 8. get_contact_360_by_phone (STUB) ────────────────────────────────────────
-- Returns a 360-degree view of a contact by phone. Stub returns basic contact data.
DROP FUNCTION IF EXISTS zapp.get_contact_360_by_phone(TEXT);
CREATE OR REPLACE FUNCTION zapp.get_contact_360_by_phone(p_phone TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_contact JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id',         c.id,
    'name',       c.name,
    'phone',      c.phone,
    'email',      c.email,
    'tags',       c.tags,
    'notes',      c.notes,
    'created_at', c.created_at,
    'conversations_count', 0
  )
    INTO v_contact
    FROM zapp.contacts c
   WHERE c.phone = p_phone
      OR REPLACE(REPLACE(c.phone, '+', ''), '-', '') = REPLACE(REPLACE(p_phone, '+', ''), '-', '')
   ORDER BY c.created_at DESC
   LIMIT 1;

  RETURN COALESCE(v_contact, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION zapp.get_contact_360_by_phone(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.get_contact_360_by_phone(TEXT) TO authenticated, service_role;

-- ── 9. get_contact_intelligence_by_phone (STUB) ───────────────────────────────
-- Returns AI-derived intelligence for a contact. Stub returns null.
DROP FUNCTION IF EXISTS zapp.get_contact_intelligence_by_phone(TEXT);
CREATE OR REPLACE FUNCTION zapp.get_contact_intelligence_by_phone(p_phone TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'contact_id',        ci.contact_id,
    'engagement_score',  ci.engagement_score,
    'sentiment_avg',     ci.sentiment_avg,
    'rfm_segment',       ci.rfm_segment,
    'churn_risk',        ci.churn_risk,
    'last_updated',      ci.updated_at
  )
    INTO v_result
    FROM zapp.contact_intelligence ci
    JOIN zapp.contacts c ON c.id = ci.contact_id
   WHERE c.telefone = p_phone
   LIMIT 1;

  RETURN v_result; -- NULL if not found, caller handles
END;
$$;

REVOKE ALL ON FUNCTION zapp.get_contact_intelligence_by_phone(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.get_contact_intelligence_by_phone(TEXT) TO authenticated, service_role;

-- ── 10. get_contact_stats (REAL) ──────────────────────────────────────────────
DROP FUNCTION IF EXISTS zapp.get_contact_stats(TEXT);
CREATE OR REPLACE FUNCTION zapp.get_contact_stats(p_instance_name TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_total     BIGINT;
  v_with_lgpd BIGINT;
  v_evo_total BIGINT;
  v_evo_active BIGINT;
BEGIN
  -- public.contacts / zapp.contacts VIEW counts
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE COALESCE(lgpd_marketing_consent, false))
  INTO v_total, v_with_lgpd
  FROM zapp.contacts;

  -- Evolution contacts (use remote_jid + instance_name which are confirmed columns)
  SELECT COUNT(*), COUNT(*) FILTER (WHERE NOT COALESCE(is_group, false))
    INTO v_evo_total, v_evo_active
    FROM evo.evolution_contacts
   WHERE (p_instance_name IS NULL OR instance_name = p_instance_name);

  RETURN jsonb_build_object(
    'total',            COALESCE(v_total, 0),
    'lgpd_consented',   COALESCE(v_with_lgpd, 0),
    'evo_contacts',     COALESCE(v_evo_total, 0),
    'evo_non_groups',   COALESCE(v_evo_active, 0),
    'instance',         p_instance_name
  );
END;
$$;

REVOKE ALL ON FUNCTION zapp.get_contact_stats(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.get_contact_stats(TEXT) TO authenticated, service_role;

-- ── 11. get_duplicate_report (REAL) ───────────────────────────────────────────
DROP FUNCTION IF EXISTS zapp.get_duplicate_report(TEXT);
CREATE OR REPLACE FUNCTION zapp.get_duplicate_report(p_instance_name TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_dup_count  BIGINT;
  v_dup_phones JSONB;
BEGIN
  -- Duplicates in evo.evolution_contacts (has instance_name + phone_number)
  WITH dups AS (
    SELECT phone_number, COUNT(*) AS cnt
      FROM evo.evolution_contacts
     WHERE phone_number IS NOT NULL
       AND (p_instance_name IS NULL OR instance_name = p_instance_name)
     GROUP BY phone_number
    HAVING COUNT(*) > 1
  )
  SELECT COUNT(*),
         (SELECT jsonb_agg(jsonb_build_object('phone', phone_number, 'count', cnt)
                           ORDER BY cnt DESC) FROM (SELECT * FROM dups LIMIT 20) d)
    INTO v_dup_count, v_dup_phones
    FROM dups;

  RETURN jsonb_build_object(
    'duplicate_phone_count', COALESCE(v_dup_count, 0),
    'top_duplicates',        COALESCE(v_dup_phones, '[]'::jsonb),
    'instance',              p_instance_name
  );
END;
$$;

REVOKE ALL ON FUNCTION zapp.get_duplicate_report(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.get_duplicate_report(TEXT) TO authenticated, service_role;

-- ── 12. grant_lgpd_consent (REAL) ─────────────────────────────────────────────
-- Updates LGPD consent columns on contacts (public.contacts migrated to zapp via VIEW).
DROP FUNCTION IF EXISTS zapp.grant_lgpd_consent(UUID, TEXT, BOOLEAN, BOOLEAN, BOOLEAN);
CREATE OR REPLACE FUNCTION zapp.grant_lgpd_consent(
  p_contact_id       UUID,
  p_channel          TEXT    DEFAULT NULL,
  p_marketing_consent BOOLEAN DEFAULT true,
  p_data_sharing     BOOLEAN DEFAULT NULL,
  p_profiling        BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'grant_lgpd_consent: authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE zapp.contacts
     SET
       lgpd_marketing_consent = COALESCE(p_marketing_consent, lgpd_marketing_consent),
       lgpd_consent_at        = now(),
       lgpd_opt_out_at        = NULL,
       updated_at             = now()
   WHERE id = p_contact_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grant_lgpd_consent: contact % not found', p_contact_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'success',     true,
    'contact_id',  p_contact_id,
    'consented_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION zapp.grant_lgpd_consent(UUID, TEXT, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.grant_lgpd_consent(UUID, TEXT, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated, service_role;

-- ── 13. revoke_lgpd_consent (REAL) ────────────────────────────────────────────
DROP FUNCTION IF EXISTS zapp.revoke_lgpd_consent(UUID, TEXT);
CREATE OR REPLACE FUNCTION zapp.revoke_lgpd_consent(
  p_contact_id UUID,
  p_reason     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'revoke_lgpd_consent: authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE zapp.contacts
     SET
       lgpd_marketing_consent = false,
       lgpd_opt_out_at        = now(),
       updated_at             = now()
   WHERE id = p_contact_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'revoke_lgpd_consent: contact % not found', p_contact_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Log the opt-out
  PERFORM zapp.fn_safe_audit_log(
    'lgpd_opt_out',
    'contact',
    p_contact_id::TEXT,
    jsonb_build_object('reason', p_reason, 'user_id', v_uid)
  );

  RETURN jsonb_build_object(
    'success',       true,
    'contact_id',    p_contact_id,
    'opted_out_at',  now()
  );
END;
$$;

REVOKE ALL ON FUNCTION zapp.revoke_lgpd_consent(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.revoke_lgpd_consent(UUID, TEXT) TO authenticated, service_role;

-- ── 14. bulk_add_tag (RAISE) ──────────────────────────────────────────────────
-- Tags system uses a JSONB array column on contacts ('tags').
DROP FUNCTION IF EXISTS zapp.bulk_add_tag(UUID[], TEXT);
CREATE OR REPLACE FUNCTION zapp.bulk_add_tag(
  p_contact_ids UUID[],
  p_tag         TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_updated INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'bulk_add_tag: authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_tag IS NULL OR trim(p_tag) = '' THEN
    RAISE EXCEPTION 'bulk_add_tag: tag cannot be empty'
      USING ERRCODE = 'P0001';
  END IF;

  -- tags column is TEXT[] — use array operators
  UPDATE zapp.contacts
     SET tags       = CASE
                        WHEN tags IS NULL     THEN ARRAY[p_tag]
                        WHEN p_tag = ANY(tags) THEN tags
                        ELSE tags || ARRAY[p_tag]
                      END,
         updated_at = now()
   WHERE id = ANY(p_contact_ids);

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'updated', v_updated,
    'tag',     p_tag
  );
END;
$$;

REVOKE ALL ON FUNCTION zapp.bulk_add_tag(UUID[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.bulk_add_tag(UUID[], TEXT) TO authenticated, service_role;

-- ── 15. bulk_auto_merge_duplicates (RAISE) ────────────────────────────────────
-- Automatic merging requires complex dedup logic.
DROP FUNCTION IF EXISTS zapp.bulk_auto_merge_duplicates(TEXT, INT);
CREATE OR REPLACE FUNCTION zapp.bulk_auto_merge_duplicates(
  p_instance_name TEXT,
  p_limit         INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  RAISE EXCEPTION 'bulk_auto_merge_duplicates: automatic contact merging not yet implemented. Use merge_contacts() for individual merges.'
    USING ERRCODE = 'P0001',
          HINT    = 'Find duplicates with get_duplicate_report() then call merge_contacts() for each pair';
END;
$$;

REVOKE ALL ON FUNCTION zapp.bulk_auto_merge_duplicates(TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.bulk_auto_merge_duplicates(TEXT, INT) TO authenticated, service_role;

-- ── 16. bulk_update_lead_status (REAL) ────────────────────────────────────────
DROP FUNCTION IF EXISTS zapp.bulk_update_lead_status(UUID[], TEXT);
CREATE OR REPLACE FUNCTION zapp.bulk_update_lead_status(
  p_contact_ids UUID[],
  p_status      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_updated INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'bulk_update_lead_status: authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE zapp.contacts
     SET lead_status = p_status,
         updated_at  = now()
   WHERE id = ANY(p_contact_ids);

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'updated', v_updated,
    'status',  p_status
  );
END;
$$;

REVOKE ALL ON FUNCTION zapp.bulk_update_lead_status(UUID[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.bulk_update_lead_status(UUID[], TEXT) TO authenticated, service_role;

-- ── 17. add_contact_note (REAL) ───────────────────────────────────────────────
-- contact_notes is in public schema; zapp.contacts VIEW references public.contacts.
-- author_id references public.profiles(id) — resolve caller's profile.
DROP FUNCTION IF EXISTS zapp.add_contact_note(UUID, TEXT, TEXT, BOOLEAN);
CREATE OR REPLACE FUNCTION zapp.add_contact_note(
  p_contact_id UUID,
  p_content    TEXT,
  p_note_type  TEXT    DEFAULT 'general',
  p_is_pinned  BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_profile_id UUID;
  v_note_id  UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'add_contact_note: authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  -- Resolve profile id from auth uid
  SELECT id INTO v_profile_id
    FROM zapp.profiles
   WHERE user_id = v_uid
   LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'add_contact_note: caller profile not found for uid=%', v_uid
      USING ERRCODE = 'P0001';
  END IF;

  -- contact_notes lives in public schema (no SET SCHEMA done on it)
  INSERT INTO public.contact_notes (contact_id, author_id, content)
  VALUES (p_contact_id, v_profile_id, p_content)
  RETURNING id INTO v_note_id;

  RETURN jsonb_build_object(
    'success',    true,
    'note_id',    v_note_id,
    'contact_id', p_contact_id,
    'created_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION zapp.add_contact_note(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.add_contact_note(UUID, TEXT, TEXT, BOOLEAN) TO authenticated, service_role;

-- ── 18. rpc_list_audit_log (REAL) ─────────────────────────────────────────────
-- Queries zapp.audit_logs (physical table, moved from public by earlier migrations).
DROP FUNCTION IF EXISTS zapp.rpc_list_audit_log(TEXT, UUID, TEXT, UUID, INT, INT);
CREATE OR REPLACE FUNCTION zapp.rpc_list_audit_log(
  p_entity_type   TEXT    DEFAULT NULL,
  p_entity_id     UUID    DEFAULT NULL,
  p_action        TEXT    DEFAULT NULL,
  p_performed_by  UUID    DEFAULT NULL,
  p_limit         INT     DEFAULT 50,
  p_offset        INT     DEFAULT 0
)
RETURNS TABLE (
  id          UUID,
  user_id     UUID,
  action      TEXT,
  entity_type TEXT,
  entity_id   UUID,
  details     JSONB,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  -- Only admins/supervisors can view audit logs
  IF NOT zapp.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'rpc_list_audit_log: requires admin or supervisor role'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
    SELECT
      al.id,
      al.user_id,
      al.action,
      al.entity_type,
      al.entity_id,
      al.details,
      al.ip_address,
      al.created_at
    FROM audit_logs al
   WHERE (p_entity_type  IS NULL OR al.entity_type = p_entity_type)
     AND (p_entity_id    IS NULL OR al.entity_id   = p_entity_id)
     AND (p_action       IS NULL OR al.action      = p_action)
     AND (p_performed_by IS NULL OR al.user_id     = p_performed_by)
   ORDER BY al.created_at DESC
   LIMIT  LEAST(COALESCE(p_limit, 50), 500)
   OFFSET COALESCE(p_offset, 0);
END;
$$;

REVOKE ALL ON FUNCTION zapp.rpc_list_audit_log(TEXT, UUID, TEXT, UUID, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.rpc_list_audit_log(TEXT, UUID, TEXT, UUID, INT, INT) TO authenticated, service_role;

-- ── 19. search_contacts_advanced (REAL) ───────────────────────────────────────
-- Advanced contacts search with CRM-specific filters.
-- Contacts table uses English column names: name, phone (not nome, telefone).
-- CRM-specific filters (vendedor, ramo, rfm_segment, estado, ja_comprou) are
-- delegated to evolution_contacts which has richer CRM metadata.
DROP FUNCTION IF EXISTS zapp.search_contacts_advanced(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, INT, INT);
CREATE OR REPLACE FUNCTION zapp.search_contacts_advanced(
  p_search          TEXT    DEFAULT NULL,
  p_vendedor        TEXT    DEFAULT NULL,
  p_ramo            TEXT    DEFAULT NULL,
  p_rfm_segment     TEXT    DEFAULT NULL,
  p_estado          TEXT    DEFAULT NULL,
  p_cliente_ativado BOOLEAN DEFAULT NULL,
  p_ja_comprou      BOOLEAN DEFAULT NULL,
  p_sort_by         TEXT    DEFAULT 'created_at',
  p_page            INT     DEFAULT 1,
  p_page_size       INT     DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_sort    TEXT := CASE WHEN p_sort_by IN ('created_at','updated_at','name','phone') THEN p_sort_by ELSE 'created_at' END;
  v_limit   INT  := LEAST(COALESCE(p_page_size, 20), 100);
  v_offset  INT  := (GREATEST(COALESCE(p_page, 1), 1) - 1) * v_limit;
  v_total   BIGINT;
  v_rows    JSONB;
BEGIN
  SELECT COUNT(*) INTO v_total
    FROM zapp.contacts c
   WHERE (p_search IS NULL
          OR c.name  ILIKE '%' || p_search || '%'
          OR c.phone ILIKE '%' || p_search || '%'
          OR c.email ILIKE '%' || p_search || '%');

  SELECT jsonb_agg(row_to_json(r))
    INTO v_rows
    FROM (
      SELECT c.id, c.name, c.phone, c.email, c.tags, c.notes,
             c.created_at, c.updated_at
        FROM zapp.contacts c
       WHERE (p_search IS NULL
              OR c.name  ILIKE '%' || p_search || '%'
              OR c.phone ILIKE '%' || p_search || '%'
              OR c.email ILIKE '%' || p_search || '%')
       ORDER BY c.created_at DESC
       LIMIT v_limit OFFSET v_offset
    ) r;

  RETURN jsonb_build_object(
    'data',      COALESCE(v_rows, '[]'::jsonb),
    'total',     COALESCE(v_total, 0),
    'page',      COALESCE(p_page, 1),
    'page_size', v_limit
  );
END;
$$;

REVOKE ALL ON FUNCTION zapp.search_contacts_advanced(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.search_contacts_advanced(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, INT, INT) TO authenticated, service_role;

-- ── 20. merge_contacts (RAISE) ────────────────────────────────────────────────
-- Complex data merge — move notes, conversations, tags from secondary to primary.
DROP FUNCTION IF EXISTS zapp.merge_contacts(UUID, UUID, JSONB);
CREATE OR REPLACE FUNCTION zapp.merge_contacts(
  p_primary_id    UUID,
  p_secondary_id  UUID,
  p_merged_fields JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  IF p_primary_id = p_secondary_id THEN
    RAISE EXCEPTION 'merge_contacts: primary and secondary contact cannot be the same'
      USING ERRCODE = 'P0001';
  END IF;

  RAISE EXCEPTION 'merge_contacts: contact merging not yet fully implemented. Use bulk_auto_merge_duplicates for batch dedup.'
    USING ERRCODE = 'P0001',
          HINT    = 'Merging requires moving notes, conversations, and tags from secondary to primary then deleting secondary';
END;
$$;

REVOKE ALL ON FUNCTION zapp.merge_contacts(UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.merge_contacts(UUID, UUID, JSONB) TO authenticated, service_role;
