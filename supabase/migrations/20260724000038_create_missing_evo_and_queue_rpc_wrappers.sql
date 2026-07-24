-- Migration: create zapp wrappers for RPCs that return cross-schema composite types
-- or are only accessible from public schema.
-- All RPCs returning evo.* composite types must return JSONB to avoid
-- cross-schema type dependency errors.

-- ---------------------------------------------------------------------------
-- 1. rpc_insert_message
--    Caller: src/features/inbox/hooks/useMessageSender.ts
--    Wraps public.rpc_insert_message which returns evo.evolution_messages
--    Returns JSONB to avoid cross-schema composite type dependency.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_insert_message(
  p_remote_jid   TEXT,
  p_content      TEXT,
  p_message_type TEXT      DEFAULT 'text',
  p_message_id   TEXT      DEFAULT NULL,
  p_from_me      BOOLEAN   DEFAULT true,
  p_direction    TEXT      DEFAULT 'outbound',
  p_instance     TEXT      DEFAULT 'wpp_pink_test'
) RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT to_jsonb(public.rpc_insert_message(
    p_remote_jid, p_content, p_message_type,
    p_message_id, p_from_me, p_direction, p_instance
  ));
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_insert_message(TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_insert_message(TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. rpc_upsert_contact
--    Caller: src/hooks/useContactsSearch.ts (via supabase.rpc)
--    Wraps public.rpc_upsert_contact which returns evo.evolution_contacts
--    Returns JSONB to avoid cross-schema composite type dependency.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_upsert_contact(
  p_remote_jid   TEXT,
  p_instance     TEXT      DEFAULT 'wpp_pink_test',
  p_push_name    TEXT      DEFAULT NULL,
  p_full_name    TEXT      DEFAULT NULL,
  p_phone_number TEXT      DEFAULT NULL,
  p_email        TEXT      DEFAULT NULL,
  p_company      TEXT      DEFAULT NULL,
  p_role_title   TEXT      DEFAULT NULL,
  p_lead_status  TEXT      DEFAULT NULL,
  p_lead_source  TEXT      DEFAULT NULL,
  p_lead_score   INTEGER   DEFAULT NULL,
  p_assigned_to  TEXT      DEFAULT NULL,
  p_tags         TEXT[]    DEFAULT NULL,
  p_notes        TEXT      DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT to_jsonb(public.rpc_upsert_contact(
    p_remote_jid, p_instance, p_push_name, p_full_name,
    p_phone_number, p_email, p_company, p_role_title,
    p_lead_status, p_lead_source, p_lead_score,
    p_assigned_to, p_tags, p_notes
  ));
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_upsert_contact(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT[], TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_upsert_contact(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT[], TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. rpc_list_messages
--    Caller: src/features/inbox/hooks/useMessages.ts
--    Wraps public.rpc_list_messages which returns SETOF evo.evolution_messages
--    Returns JSONB array to avoid cross-schema composite type dependency.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_list_messages(
  p_remote_jid  TEXT,
  p_instance    TEXT      DEFAULT NULL,
  p_limit       INTEGER   DEFAULT 50,
  p_before_date TIMESTAMPTZ DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT COALESCE(
    (SELECT jsonb_agg(to_jsonb(r.*))
     FROM public.rpc_list_messages(p_remote_jid, p_instance, p_limit, p_before_date) r),
    '[]'::jsonb
  );
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_list_messages(TEXT, TEXT, INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_list_messages(TEXT, TEXT, INTEGER, TIMESTAMPTZ) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. rpc_list_messages_lite
--    Caller: src/features/inbox/hooks/useMessages.ts (lightweight variant)
--    Wraps public.rpc_list_messages_lite which returns SETOF evo.evolution_messages
--    Returns JSONB array to avoid cross-schema composite type dependency.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_list_messages_lite(
  p_remote_jid  TEXT,
  p_instance    TEXT      DEFAULT NULL,
  p_limit       INTEGER   DEFAULT 50,
  p_offset      INTEGER   DEFAULT 0,
  p_before_date TIMESTAMPTZ DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT COALESCE(
    (SELECT jsonb_agg(to_jsonb(r.*))
     FROM public.rpc_list_messages_lite(p_remote_jid, p_instance, p_limit, p_offset, p_before_date) r),
    '[]'::jsonb
  );
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_list_messages_lite(TEXT, TEXT, INTEGER, INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_list_messages_lite(TEXT, TEXT, INTEGER, INTEGER, TIMESTAMPTZ) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. rpc_queue_sla_panel
--    Caller: src/hooks/useQueueManagement.ts:342
--    Returns TABLE — columns match the TEXT overload in migration 20260425190713
--    Public function already has supervisor role guard; wrapper delegates directly.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_queue_sla_panel(
  p_skill_name   TEXT DEFAULT NULL,
  p_channel_type TEXT DEFAULT NULL,
  p_sla_status   TEXT DEFAULT NULL
) RETURNS TABLE (
  queue_id                UUID,
  queue_name              TEXT,
  color                   TEXT,
  sla_priority            TEXT,
  routing_weight          INTEGER,
  auto_rebalance_enabled  BOOLEAN,
  max_wait_time_minutes   INTEGER,
  active_agents           BIGINT,
  waiting_count           BIGINT,
  in_progress_count       BIGINT,
  breached_count          BIGINT,
  at_risk_count           BIGINT,
  oldest_wait_minutes     NUMERIC,
  last_routed_at          TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT * FROM public.rpc_queue_sla_panel(p_skill_name, p_channel_type, p_sla_status);
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_queue_sla_panel(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_queue_sla_panel(TEXT, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. rpc_queue_rebalance_candidates
--    Caller: src/hooks/useQueueManagement.ts:386
--    Public function already has supervisor role guard; wrapper delegates directly.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_queue_rebalance_candidates(
  p_limit INTEGER DEFAULT 50
) RETURNS TABLE (
  contact_id      UUID,
  queue_id        UUID,
  reason          TEXT,
  waiting_minutes NUMERIC,
  sla_priority    TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT * FROM public.rpc_queue_rebalance_candidates(p_limit);
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_queue_rebalance_candidates(INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_queue_rebalance_candidates(INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. rpc_log_search_event
--    Caller: src/hooks/useSearchManagement.ts (via supabase.rpc)
--    Logs search events for analytics — no sensitive data, any authenticated user.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_log_search_event(
  p_query        TEXT,
  p_results      TEXT[]  DEFAULT '{}',
  p_result_count INTEGER DEFAULT 0,
  p_found        BOOLEAN DEFAULT true
) RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT public.rpc_log_search_event(p_query, p_results, p_result_count, p_found);
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_log_search_event(TEXT, TEXT[], INTEGER, BOOLEAN) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_log_search_event(TEXT, TEXT[], INTEGER, BOOLEAN) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. rpc_record_search_click
--    Caller: src/features/inbox/components/GlobalSearch.tsx:143
--    Records which search results users click for relevance tuning.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_record_search_click(
  p_query       TEXT,
  p_result_id   TEXT,
  p_result_type TEXT
) RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT public.rpc_record_search_click(p_query, p_result_id, p_result_type);
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_record_search_click(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_record_search_click(TEXT, TEXT, TEXT) TO authenticated;
