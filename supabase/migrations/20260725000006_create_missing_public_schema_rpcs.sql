-- Migration: Create zapp schema wrappers for RPCs that exist only in public (BUG-44)
--
-- Problem: 15 functions called by edge functions via createZappAdminClient()
-- (db: { schema: "zapp" }) exist only in the public schema.
-- PostgREST returns PGRST202 at runtime because it routes RPC calls to the
-- schema specified in the client's db.schema configuration.
--
-- Approach: Create thin SECURITY DEFINER wrappers in zapp that delegate to the
-- authoritative public.* implementations. Exception: fn_edge_get_evolution_credentials
-- which does not exist in ANY migration and is created here from scratch.
--
-- All functions:
--   - SECURITY DEFINER
--   - SET search_path = zapp (prevents search_path injection)
--   - REVOKE EXECUTE FROM PUBLIC, anon
--   - GRANT only to the roles that need them
--
-- Edge function callers (via createZappAdminClient):
--   instance-pause, webauthn, voice-changer, queue-rebalance, ticket-router,
--   evolution-webhook (_shared), gmail-health, auto-escalate-sla,
--   evolution-credentials, rate-limiter (_shared)

-- ── 1. is_instance_paused ─────────────────────────────────────────────────────
-- Caller: _shared/instance-pause.ts → isInstancePaused()
-- Source: public.is_instance_paused(text) → boolean  (20260423161210)
CREATE OR REPLACE FUNCTION zapp.is_instance_paused(p_instance text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  RETURN public.is_instance_paused(p_instance);
END;
$$;

REVOKE ALL ON FUNCTION zapp.is_instance_paused(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.is_instance_paused(text) TO authenticated, service_role;

-- ── 2. pause_instance ────────────────────────────────────────────────────────
-- Caller: instance-pause-control edge function / admin UI
-- Source: public.pause_instance(text, text, integer, integer) → uuid  (20260423161210)
CREATE OR REPLACE FUNCTION zapp.pause_instance(
  p_instance      text,
  p_reason        text,
  p_minutes       integer DEFAULT 15,
  p_trigger_count integer DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  RETURN public.pause_instance(p_instance, p_reason, p_minutes, p_trigger_count);
END;
$$;

REVOKE ALL ON FUNCTION zapp.pause_instance(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.pause_instance(text, text, integer, integer) TO authenticated;

-- ── 3. unpause_instance ──────────────────────────────────────────────────────
-- Source: public.unpause_instance(text) → integer  (20260423161210)
CREATE OR REPLACE FUNCTION zapp.unpause_instance(p_instance text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  RETURN public.unpause_instance(p_instance);
END;
$$;

REVOKE ALL ON FUNCTION zapp.unpause_instance(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.unpause_instance(text) TO authenticated;

-- ── 4. auto_pause_instance_on_auth_spike ─────────────────────────────────────
-- Caller: _shared/instance-pause.ts → recordAuthFailureAndMaybePause()
-- Source: public.auto_pause_instance_on_auth_spike(text, text, integer, integer) → uuid  (20260423161210)
CREATE OR REPLACE FUNCTION zapp.auto_pause_instance_on_auth_spike(
  p_instance      text,
  p_reason        text,
  p_trigger_count integer,
  p_minutes       integer DEFAULT 15
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  RETURN public.auto_pause_instance_on_auth_spike(p_instance, p_reason, p_trigger_count, p_minutes);
END;
$$;

REVOKE ALL ON FUNCTION zapp.auto_pause_instance_on_auth_spike(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.auto_pause_instance_on_auth_spike(text, text, integer, integer) TO service_role;

-- ── 5. mark_pause_investigated ───────────────────────────────────────────────
-- Source: public.mark_pause_investigated(uuid, text) → public.instance_processing_pauses  (20260423162100)
-- Returns JSONB here to avoid cross-schema composite-type dependency; response
-- is semantically identical from the perspective of the PostgREST JSON body.
CREATE OR REPLACE FUNCTION zapp.mark_pause_investigated(
  p_pause_id uuid,
  p_notes    text DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT to_jsonb(public.mark_pause_investigated(p_pause_id, p_notes))
    INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION zapp.mark_pause_investigated(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.mark_pause_investigated(uuid, text) TO authenticated;

-- ── 6. rpc_check_and_trigger_gmail_revalidation ──────────────────────────────
-- Caller: gmail-health edge function
-- Source: public.rpc_check_and_trigger_gmail_revalidation() → JSONB  (20260502191743)
CREATE OR REPLACE FUNCTION zapp.rpc_check_and_trigger_gmail_revalidation()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  RETURN public.rpc_check_and_trigger_gmail_revalidation();
END;
$$;

REVOKE ALL ON FUNCTION zapp.rpc_check_and_trigger_gmail_revalidation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.rpc_check_and_trigger_gmail_revalidation() TO authenticated, service_role;

-- ── 7. claim_next_voice_task ─────────────────────────────────────────────────
-- Caller: voice-changer edge function
-- Source: public.claim_next_voice_task(uuid) → uuid  (20260506110249)
CREATE OR REPLACE FUNCTION zapp.claim_next_voice_task(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  RETURN public.claim_next_voice_task(p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION zapp.claim_next_voice_task(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.claim_next_voice_task(uuid) TO authenticated, service_role;

-- ── 8. fn_resolve_agent_for_routing ─────────────────────────────────────────
-- Caller: queue-rebalance, ticket-router edge functions
-- Source: public.fn_resolve_agent_for_routing(uuid, uuid, uuid) → JSONB  (20260425175820)
CREATE OR REPLACE FUNCTION zapp.fn_resolve_agent_for_routing(
  p_contact_id            uuid,
  p_channel_connection_id uuid DEFAULT NULL,
  p_queue_id              uuid DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  RETURN public.fn_resolve_agent_for_routing(p_contact_id, p_channel_connection_id, p_queue_id);
END;
$$;

REVOKE ALL ON FUNCTION zapp.fn_resolve_agent_for_routing(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.fn_resolve_agent_for_routing(uuid, uuid, uuid) TO authenticated, service_role;

-- ── 9. fn_register_sticky_assignment ─────────────────────────────────────────
-- Caller: queue-rebalance, ticket-router edge functions
-- Source: public.fn_register_sticky_assignment(uuid, uuid, uuid, uuid) → uuid  (20260425175820)
CREATE OR REPLACE FUNCTION zapp.fn_register_sticky_assignment(
  p_contact_id            uuid,
  p_agent_profile_id      uuid,
  p_channel_connection_id uuid DEFAULT NULL,
  p_queue_id              uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  RETURN public.fn_register_sticky_assignment(
    p_contact_id, p_agent_profile_id, p_channel_connection_id, p_queue_id
  );
END;
$$;

REVOKE ALL ON FUNCTION zapp.fn_register_sticky_assignment(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.fn_register_sticky_assignment(uuid, uuid, uuid, uuid) TO authenticated, service_role;

-- ── 10. fn_apply_connection_update ────────────────────────────────────────────
-- Caller: _shared/evolution-webhook-handlers.ts → handleConnectionUpdate()
-- Source: public.fn_apply_connection_update(jsonb) → jsonb  (20260705011018)
CREATE OR REPLACE FUNCTION zapp.fn_apply_connection_update(p_event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  RETURN public.fn_apply_connection_update(p_event);
END;
$$;

REVOKE ALL ON FUNCTION zapp.fn_apply_connection_update(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.fn_apply_connection_update(jsonb) TO authenticated, service_role;

-- ── 11. increment_webhook_rate_limit ──────────────────────────────────────────
-- Caller: _shared/rate-limiter.ts → checkRateLimit()
-- Source: public.increment_webhook_rate_limit(text,text,timestamptz,int,int)
--         → TABLE(current_count bigint, is_allowed boolean, window_expired boolean)
--         (20260712000006)
CREATE OR REPLACE FUNCTION zapp.increment_webhook_rate_limit(
  p_instance_id    text,
  p_event_type     text,
  p_window_start   timestamptz,
  p_limit          int,
  p_window_seconds int DEFAULT 60
)
RETURNS TABLE(current_count bigint, is_allowed boolean, window_expired boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  RETURN QUERY
    SELECT r.current_count, r.is_allowed, r.window_expired
    FROM public.increment_webhook_rate_limit(
      p_instance_id, p_event_type, p_window_start, p_limit, p_window_seconds
    ) r;
END;
$$;

REVOKE ALL ON FUNCTION zapp.increment_webhook_rate_limit(text, text, timestamptz, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.increment_webhook_rate_limit(text, text, timestamptz, int, int)
  TO authenticated, service_role;

-- ── 12. fn_auto_escalate_sla ─────────────────────────────────────────────────
-- Caller: auto-escalate-sla edge function (cron)
-- Source: public.fn_auto_escalate_sla() → void  (20260506132819)
CREATE OR REPLACE FUNCTION zapp.fn_auto_escalate_sla()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  PERFORM public.fn_auto_escalate_sla();
END;
$$;

REVOKE ALL ON FUNCTION zapp.fn_auto_escalate_sla() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.fn_auto_escalate_sla() TO service_role;

-- ── 13. cleanup_expired_challenges ────────────────────────────────────────────
-- Caller: webauthn edge function / cron cleanup
-- Source: public.cleanup_expired_challenges() → void  (20251231124607)
CREATE OR REPLACE FUNCTION zapp.cleanup_expired_challenges()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  PERFORM public.cleanup_expired_challenges();
END;
$$;

REVOKE ALL ON FUNCTION zapp.cleanup_expired_challenges() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.cleanup_expired_challenges() TO service_role;

-- ── 14. fn_insert_idempotency_failure_audit ───────────────────────────────────
-- Caller: _shared/evolution-helpers.ts → unmarkEventProcessed() (audit trail)
-- Source: public.fn_insert_idempotency_failure_audit(text,text,text,text,text) → boolean
--         (20260712000010)
CREATE OR REPLACE FUNCTION zapp.fn_insert_idempotency_failure_audit(
  p_event_id      text,
  p_instance      text,
  p_event_type    text,
  p_error_code    text,
  p_error_message text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  RETURN public.fn_insert_idempotency_failure_audit(
    p_event_id, p_instance, p_event_type, p_error_code, p_error_message
  );
END;
$$;

REVOKE ALL ON FUNCTION zapp.fn_insert_idempotency_failure_audit(text, text, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.fn_insert_idempotency_failure_audit(text, text, text, text, text)
  TO authenticated, service_role;

-- ── 15. fn_edge_get_evolution_credentials ─────────────────────────────────────
-- Caller: evolution-credentials edge function (line 63)
-- Status: GROUP C — does not exist in ANY migration; created here from scratch.
--
-- Returns credentials for a given WhatsApp instance. The api_key column is
-- restricted from the authenticated role at column level (20260716210100) so
-- this SECURITY DEFINER function is the only safe read path from the edge layer.
-- GRANT is service_role only — evolution-credentials already enforces
-- admin/supervisor role before calling the RPC (defense in depth).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'fn_edge_get_evolution_credentials'
      AND n.nspname = 'zapp'
  ) THEN
    RAISE NOTICE 'zapp.fn_edge_get_evolution_credentials already exists — skipping';
  ELSE
    EXECUTE $ddl$
      CREATE FUNCTION zapp.fn_edge_get_evolution_credentials(p_instance text)
      RETURNS TABLE (
        instance_name    text,
        api_key          text,
        api_url          text,
        health_status    text,
        last_health_check timestamptz,
        is_active        boolean
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = zapp
      AS $fn$
      BEGIN
        RETURN QUERY
          SELECT
            wc.instance_name::text,
            wc.api_key::text,
            wc.api_url::text,
            wc.health_status::text,
            wc.last_health_check,
            wc.is_active
          FROM zapp.whatsapp_connections wc
          WHERE wc.instance_name = p_instance
            AND wc.is_active = true
          ORDER BY wc.created_at DESC
          LIMIT 1;
      END;
      $fn$
    $ddl$;
    RAISE NOTICE 'created zapp.fn_edge_get_evolution_credentials';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION zapp.fn_edge_get_evolution_credentials(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION zapp.fn_edge_get_evolution_credentials(text) TO service_role;
