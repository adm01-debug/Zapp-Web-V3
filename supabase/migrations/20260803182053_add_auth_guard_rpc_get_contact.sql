-- Migration: Add auth.uid() guard to rpc_get_contact (2 overloads)
-- Date: 2026-08-03
-- Fix: SECDEF functions exposed to authenticated without auth check
-- Risk: Medium — frontend uses these as fallback (useFallbackContact, v237Fallbacks)
-- Rollback: Run the REVOKE + DROP + CREATE at bottom of this file

BEGIN;

-- ============================================================
-- Overload 1: rpc_get_contact(p_contact_id uuid) — PLPGSQL
-- Returns: contact + deals + recent_messages + tasks
-- Before: No auth check — any authenticated user could dump any contact
-- After:  Requires auth.uid() — blocks anonymous/unauthenticated access
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_get_contact(p_contact_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Guard: require authenticated user (edge functions use service_role, bypass this)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

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

-- Re-grant EXECUTE to authenticated (REVOKED by CREATE OR REPLACE)
GRANT EXECUTE ON FUNCTION public.rpc_get_contact(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_contact(uuid) TO service_role;

-- ============================================================
-- Overload 2: rpc_get_contact(p_remote_jid text, p_instance text) — SQL→PLPGSQL
-- Returns: contact row (SETOF evolution_contacts)
-- Before: Plain SQL SELECT, no auth check
-- After:  PLPGSQL with auth.uid() guard + RETURN QUERY
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_get_contact(p_remote_jid text, p_instance text DEFAULT NULL)
RETURNS SETOF evo.evolution_contacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Guard: require authenticated user
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
    SELECT * FROM evo.evolution_contacts
    WHERE remote_jid = p_remote_jid
      AND (p_instance IS NULL OR instance_name = p_instance)
      AND deleted_at IS NULL
    ORDER BY updated_at DESC
    LIMIT 1;
END;
$$;

-- Re-grant EXECUTE
GRANT EXECUTE ON FUNCTION public.rpc_get_contact(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_contact(text, text) TO service_role;

COMMIT;

-- ============================================================
-- ROLLBACK (run in transaction if needed to revert)
-- ============================================================
/*
BEGIN;
  -- Overload 1: revert to no-guard version
  CREATE OR REPLACE FUNCTION public.rpc_get_contact(p_contact_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
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
  GRANT EXECUTE ON FUNCTION public.rpc_get_contact(uuid) TO authenticated, service_role;

  -- Overload 2: revert to SQL version
  DROP FUNCTION IF EXISTS public.rpc_get_contact(text, text);
  CREATE OR REPLACE FUNCTION public.rpc_get_contact(p_remote_jid text, p_instance text)
  RETURNS SETOF evo.evolution_contacts
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = ''
  AS $$
    SELECT * FROM evo.evolution_contacts
    WHERE remote_jid=p_remote_jid
      AND (p_instance IS NULL OR instance_name=p_instance)
      AND deleted_at IS NULL
    ORDER BY updated_at DESC
    LIMIT 1;
  $$;
  GRANT EXECUTE ON FUNCTION public.rpc_get_contact(text, text) TO authenticated, service_role;
COMMIT;
*/
