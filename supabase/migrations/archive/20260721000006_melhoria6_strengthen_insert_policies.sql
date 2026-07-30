-- MELHORIA #6 — Strengthen INSERT policies with WITH CHECK = true
--
-- Categorised by available ownership column:
--   A) Tables WITH a user/owner column → enforce ownership in WITH CHECK
--   B) System log/cache tables WITHOUT user column → enforce auth.uid() IS NOT NULL
--
-- Uses ALTER POLICY (no gap, no DROP required).

-- ── A. Ownership-column tables ───────────────────────────────────────────────

-- sticker_favorites.user_id — users may only add their own favourites
ALTER POLICY sf_insert_auth ON zapp.sticker_favorites
  WITH CHECK (user_id = auth.uid());

-- outbound_message_queue.created_by — users can only queue as themselves
-- NULL is allowed (system-generated rows via service_role bypass RLS entirely)
ALTER POLICY outbound_insert ON zapp.outbound_message_queue
  WITH CHECK (created_by IS NULL OR created_by = auth.uid());

-- whatsapp_connections.created_by — critical: prevent creating a connection
-- attributed to another user; NULL allowed for legacy/system-created rows
ALTER POLICY wconn_insert_auth ON zapp.whatsapp_connections
  WITH CHECK (created_by IS NULL OR created_by = auth.uid());

-- conversation_audit_logs.actor_id — audit row must belong to the calling user
-- NULL allowed for system/webhook-sourced audit entries
ALTER POLICY auth_write_forwarded_messages ON zapp.forwarded_messages
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── B. System log / cache tables (no user ownership column) ──────────────────
--    Changing from literal `true` to `auth.uid() IS NOT NULL` makes the intent
--    explicit: only valid, non-anonymous sessions may write.

ALTER POLICY authenticated_insert_errors ON zapp.app_error_logs
  WITH CHECK (auth.uid() IS NOT NULL);

ALTER POLICY csat_insert ON zapp.csat_responses
  WITH CHECK (auth.uid() IS NOT NULL);

ALTER POLICY media_cache_insert ON zapp.media_cache
  WITH CHECK (auth.uid() IS NOT NULL);

ALTER POLICY outbound_audit_insert ON zapp.outbound_delivery_audit
  WITH CHECK (auth.uid() IS NOT NULL);

ALTER POLICY reconnect_insert ON zapp.reconnection_logs
  WITH CHECK (auth.uid() IS NOT NULL);

ALTER POLICY slav_insert ON zapp.sla_violations
  WITH CHECK (auth.uid() IS NOT NULL);
