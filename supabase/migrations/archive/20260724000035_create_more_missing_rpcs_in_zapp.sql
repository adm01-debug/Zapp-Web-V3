-- Migration: create zapp wrappers for 17 more RPCs that only exist in public schema
-- All callers use safeClient.rpc() or supabase.rpc() which sends Accept-Profile: zapp,
-- causing PostgREST to resolve against the zapp schema cache only.
-- Without these wrappers every call returns PGRST202 "could not find function in schema cache".

-- ---------------------------------------------------------------------------
-- 1. fn_list_audio_memes_for_user
--    Caller: src/hooks/useAudioManagement.ts:58
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.fn_list_audio_memes_for_user(
  p_category       TEXT    DEFAULT NULL,
  p_only_favorites BOOLEAN DEFAULT false,
  p_search         TEXT    DEFAULT NULL
) RETURNS TABLE(
  id               UUID,
  name             TEXT,
  audio_url        TEXT,
  category         TEXT,
  duration_seconds NUMERIC,
  use_count        INTEGER,
  is_favorite      BOOLEAN,
  created_at       TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT * FROM public.fn_list_audio_memes_for_user(p_category, p_only_favorites, p_search);
$$;

REVOKE EXECUTE ON FUNCTION zapp.fn_list_audio_memes_for_user(TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_list_audio_memes_for_user(TEXT, BOOLEAN, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. fn_list_audio_meme_categories
--    Referenced in types.ts; may be called via safeClient.rpc()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.fn_list_audio_meme_categories()
RETURNS TABLE(category TEXT, total BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT * FROM public.fn_list_audio_meme_categories();
$$;

REVOKE EXECUTE ON FUNCTION zapp.fn_list_audio_meme_categories() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_list_audio_meme_categories() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. fn_toggle_user_meme_favorite
--    Caller: src/hooks/useAudioManagement.ts (via safeClient)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.fn_toggle_user_meme_favorite(
  p_meme_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT public.fn_toggle_user_meme_favorite(p_meme_id);
$$;

REVOKE EXECUTE ON FUNCTION zapp.fn_toggle_user_meme_favorite(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_toggle_user_meme_favorite(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. fn_increment_meme_use
--    Caller: src/hooks/useAudioManagement.ts (via safeClient)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.fn_increment_meme_use(
  p_meme_id UUID
) RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT public.fn_increment_meme_use(p_meme_id);
$$;

REVOKE EXECUTE ON FUNCTION zapp.fn_increment_meme_use(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_increment_meme_use(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. fn_log_reconnection_attempt
--    Caller: src/hooks/useEvolutionAutoReconnect.ts:186
--    Returns UUID (the inserted reconnection_logs.id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.fn_log_reconnection_attempt(
  p_connection_id  UUID    DEFAULT NULL,
  p_instance_name  TEXT    DEFAULT NULL,
  p_status         TEXT    DEFAULT 'attempting',
  p_error_message  TEXT    DEFAULT NULL,
  p_attempt_number INTEGER DEFAULT 1,
  p_qr_generated   BOOLEAN DEFAULT false,
  p_metadata       JSONB   DEFAULT NULL
) RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT public.fn_log_reconnection_attempt(
    p_connection_id, p_instance_name, p_status, p_error_message,
    p_attempt_number, p_qr_generated, p_metadata
  );
$$;

REVOKE EXECUTE ON FUNCTION zapp.fn_log_reconnection_attempt(UUID, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_log_reconnection_attempt(UUID, TEXT, TEXT, TEXT, INTEGER, BOOLEAN, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. rpc_evolution_fallback_stats
--    Caller: src/hooks/useEvolutionFallbackStats.ts:43
--    Returns JSONB with window_hours, total, by_action[], by_reason[], recent[]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_evolution_fallback_stats(
  p_hours INTEGER DEFAULT 24
) RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT public.rpc_evolution_fallback_stats(p_hours);
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_evolution_fallback_stats(INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_evolution_fallback_stats(INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. rpc_provider_panel
--    Caller: src/hooks/useProviderPanel.ts:56
--    Returns TABLE — public.provider_type enum replaced with TEXT to avoid
--    cross-schema composite type dependency.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_provider_panel()
RETURNS TABLE (
  provider_id           UUID,
  name                  TEXT,
  provider_type         TEXT,
  base_url              TEXT,
  is_active             BOOLEAN,
  priority              INTEGER,
  status                TEXT,
  last_ping_at          TIMESTAMPTZ,
  last_ping_latency_ms  INTEGER,
  last_error            TEXT,
  open_sessions         BIGINT,
  events_24h            BIGINT,
  errors_24h            BIGINT,
  routes_primary        BIGINT,
  routes_fallback       BIGINT,
  routes_active         BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT
    provider_id,
    name,
    provider_type::TEXT,
    base_url,
    is_active,
    priority,
    status,
    last_ping_at,
    last_ping_latency_ms,
    last_error,
    open_sessions,
    events_24h,
    errors_24h,
    routes_primary,
    routes_fallback,
    routes_active
  FROM public.rpc_provider_panel();
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_provider_panel() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_provider_panel() TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. rpc_provider_session_timeline
--    Caller: src/hooks/useProviderPanel.ts:57
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_provider_session_timeline(
  p_provider_id UUID    DEFAULT NULL,
  p_session_id  UUID    DEFAULT NULL,
  p_limit       INTEGER DEFAULT 100
) RETURNS TABLE (
  log_id       UUID,
  session_id   UUID,
  provider_id  UUID,
  provider_name TEXT,
  level        TEXT,
  event        TEXT,
  message      TEXT,
  latency_ms   INTEGER,
  created_at   TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT * FROM public.rpc_provider_session_timeline(p_provider_id, p_session_id, p_limit);
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_provider_session_timeline(UUID, UUID, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_provider_session_timeline(UUID, UUID, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. get_own_email_accounts
--    Caller: src/features/admin/components/GmailWebhookMonitor.tsx:34
--    No public.* base function exists — this is a direct query stub.
--    Reads from email_app.email_accounts filtered by auth.uid().
--    Fields consumed by caller: id, email_address, is_active, sync_status,
--    last_sync_at, last_error, created_at (history_id added client-side).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.get_own_email_accounts()
RETURNS TABLE (
  id             UUID,
  email_address  TEXT,
  is_active      BOOLEAN,
  sync_status    TEXT,
  last_sync_at   TIMESTAMPTZ,
  last_error     TEXT,
  created_at     TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ea.id,
    ea.email_address,
    COALESCE(ea.is_active, true)           AS is_active,
    NULL::TEXT                             AS sync_status,
    NULL::TIMESTAMPTZ                      AS last_sync_at,
    NULL::TEXT                             AS last_error,
    ea.created_at
  FROM email_app.email_accounts ea
  WHERE ea.user_id = auth.uid()
  ORDER BY ea.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.get_own_email_accounts() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.get_own_email_accounts() TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. rpc_email_archive_thread
--     Caller: src/features/admin/hooks/useAdminManagement.ts (email mgmt)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_email_archive_thread(
  p_thread_id UUID,
  p_archived  BOOLEAN DEFAULT true
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  PERFORM public.rpc_email_archive_thread(p_thread_id, p_archived);
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_email_archive_thread(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_email_archive_thread(UUID, BOOLEAN) TO authenticated;

-- ---------------------------------------------------------------------------
-- 11. rpc_email_assign_thread
--     Caller: email thread management hooks
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_email_assign_thread(
  p_thread_id   UUID,
  p_agent_id    TEXT DEFAULT NULL,
  p_assigned_by TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  PERFORM public.rpc_email_assign_thread(p_thread_id, p_agent_id, p_assigned_by);
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_email_assign_thread(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_email_assign_thread(UUID, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 12. rpc_email_search_threads
--     Caller: email search hooks
--     Returns JSONB
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_email_search_threads(
  p_query      TEXT    DEFAULT NULL,
  p_account_id UUID    DEFAULT NULL,
  p_status     TEXT    DEFAULT NULL,
  p_label_id   TEXT    DEFAULT NULL,
  p_limit      INTEGER DEFAULT 20,
  p_offset     INTEGER DEFAULT 0
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  RETURN public.rpc_email_search_threads(
    p_query, p_account_id, p_status, p_label_id, p_limit, p_offset
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_email_search_threads(TEXT, UUID, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_email_search_threads(TEXT, UUID, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- 13. rpc_email_star_thread
--     Caller: email thread management
--     Returns JSONB
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_email_star_thread(
  p_thread_id TEXT,
  p_starred   BOOLEAN DEFAULT true
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  RETURN public.rpc_email_star_thread(p_thread_id, p_starred);
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_email_star_thread(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_email_star_thread(TEXT, BOOLEAN) TO authenticated;

-- ---------------------------------------------------------------------------
-- 14. rpc_email_mark_thread_read
--     Caller: src/integrations/supabase/safeClient.ts (referenced in callers)
--     Returns JSONB
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_email_mark_thread_read(
  p_thread_id TEXT,
  p_read      BOOLEAN
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  RETURN public.rpc_email_mark_thread_read(p_thread_id, p_read);
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_email_mark_thread_read(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_email_mark_thread_read(TEXT, BOOLEAN) TO authenticated;

-- ---------------------------------------------------------------------------
-- 15. rpc_email_token_status
--     Caller: src/integrations/supabase/safeClient.ts
--     Returns JSONB
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_email_token_status()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  RETURN public.rpc_email_token_status();
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_email_token_status() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_email_token_status() TO authenticated;

-- ---------------------------------------------------------------------------
-- 16. rpc_migrate_whatsapp_integration
--     Caller: src/hooks/useIntegrationManagement.ts (whatsapp migration)
--     Returns JSONB
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_migrate_whatsapp_integration()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  IF NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'Admin or supervisor role required' USING ERRCODE = 'P0001';
  END IF;
  RETURN public.rpc_migrate_whatsapp_integration();
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_migrate_whatsapp_integration() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_migrate_whatsapp_integration() TO authenticated;

-- ---------------------------------------------------------------------------
-- 17. rpc_reactivate_service_channel
--     Caller: src/features/admin/hooks/useAdminManagement.ts:559
--     Original returns public.service_channels (cross-schema composite).
--     Wrapper returns JSONB to avoid composite type dependency.
--     Caller only checks for error, never reads returned data.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_reactivate_service_channel(
  p_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  RETURN to_jsonb(public.rpc_reactivate_service_channel(p_id));
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_reactivate_service_channel(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_reactivate_service_channel(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 18. rpc_upsert_service_channel
--     Caller: src/features/admin/hooks/useAdminManagement.ts:499
--     Original returns public.service_channels (cross-schema composite).
--     Wrapper returns JSONB. Caller only checks for error.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_upsert_service_channel(
  p_id                     UUID    DEFAULT NULL,
  p_name                   TEXT    DEFAULT NULL,
  p_display_name           TEXT    DEFAULT NULL,
  p_channel_type           TEXT    DEFAULT 'whatsapp',
  p_whatsapp_connection_id UUID    DEFAULT NULL,
  p_default_queue_id       UUID    DEFAULT NULL,
  p_routing_mode           TEXT    DEFAULT 'manual',
  p_sticky_enabled         BOOLEAN DEFAULT false,
  p_sticky_ttl_hours       INTEGER DEFAULT 24,
  p_is_default             BOOLEAN DEFAULT false,
  p_description            TEXT    DEFAULT NULL,
  p_icon                   TEXT    DEFAULT NULL,
  p_color                  TEXT    DEFAULT '#3B82F6'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  IF NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'Admin or supervisor role required' USING ERRCODE = 'P0001';
  END IF;
  RETURN to_jsonb(public.rpc_upsert_service_channel(
    p_id, p_name, p_display_name, p_channel_type,
    p_whatsapp_connection_id, p_default_queue_id,
    p_routing_mode, p_sticky_enabled, p_sticky_ttl_hours,
    p_is_default, p_description, p_icon, p_color
  ));
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_upsert_service_channel(UUID, TEXT, TEXT, TEXT, UUID, UUID, TEXT, BOOLEAN, INTEGER, BOOLEAN, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_upsert_service_channel(UUID, TEXT, TEXT, TEXT, UUID, UUID, TEXT, BOOLEAN, INTEGER, BOOLEAN, TEXT, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 19. rpc_set_whatsapp_mode
--     Caller: src/hooks/useIntegrationManagement.ts
--     Returns TEXT
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_set_whatsapp_mode(
  p_mode TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  IF NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'Admin or supervisor role required' USING ERRCODE = 'P0001';
  END IF;
  RETURN public.rpc_set_whatsapp_mode(p_mode);
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_set_whatsapp_mode(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_set_whatsapp_mode(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 20. record_voice_telemetry
--     Caller: src/features/inbox/components/VoiceChanger.tsx:185,194
--     p_status passed as TEXT (avoids public.voice_conversion_status enum
--     cross-schema dependency); PostgreSQL will cast TEXT → enum in the
--     public.* delegate.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.record_voice_telemetry(
  p_queue_id     UUID,
  p_duration_ms  INTEGER,
  p_status       TEXT,
  p_error_type   TEXT DEFAULT NULL,
  p_error_detail TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  PERFORM public.record_voice_telemetry(
    p_queue_id,
    p_duration_ms,
    p_status::public.voice_conversion_status,
    p_error_type,
    p_error_detail
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.record_voice_telemetry(UUID, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.record_voice_telemetry(UUID, INTEGER, TEXT, TEXT, TEXT) TO authenticated;
